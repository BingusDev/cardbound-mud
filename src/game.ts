import type {
  Direction,
  EquipmentSlot,
  ExitDefinition,
  ExitView,
  ItemDefinition,
  ItemRarity,
  MerchantDefinition,
  NpcDefinition,
  PlayerPresence,
  PlayerRecord,
  PlayerStats,
  PlayerView,
  QuestDefinition,
  QuestTrigger,
  RoomView
} from "./types.js";
import { CharacterConfig } from "./characterConfig.js";
import { CombatSystem } from "./combatSystem.js";
import { formatSeconds, matches, matchesNpc } from "./gameUtils.js";
import { QuestSystem } from "./questSystem.js";
import { Store } from "./store.js";
import { roomItemSpawns, World } from "./world.js";

const directionAliases: Record<string, Direction> = {
  n: "north",
  north: "north",
  e: "east",
  east: "east",
  s: "south",
  south: "south",
  w: "west",
  west: "west",
  u: "up",
  up: "up",
  d: "down",
  down: "down"
};

interface CommandResult {
  lines: string[];
  roomEcho?: string;
}

type PlayerPresenceProvider = PlayerPresence[] | (() => PlayerPresence[]);

interface BinderBonus {
  maxHp: number;
  maxMana: number;
}

interface BinderMilestone {
  count: number;
  name: string;
  description: string;
  bonus: BinderBonus;
}

interface BinderCardInfo {
  id: string;
  name: string;
  page: string;
  rarity: "common" | "uncommon" | "rare" | "showcase";
  flavor: string;
}

const binderMilestones: BinderMilestone[] = [
  { count: 1, name: "First Pull", description: "+1 max Energy", bonus: { maxHp: 0, maxMana: 1 } },
  { count: 3, name: "Starter Deck", description: "+1 max HP", bonus: { maxHp: 1, maxMana: 0 } },
  { count: 6, name: "Side Deck Tech", description: "+1 max Energy", bonus: { maxHp: 0, maxMana: 1 } },
  { count: 10, name: "Master Set", description: "+2 max HP", bonus: { maxHp: 2, maxMana: 0 } },
  { count: 13, name: "Secret Rare Chase", description: "+1 max HP and +1 max Energy", bonus: { maxHp: 1, maxMana: 1 } }
];

const binderPageOrder = [
  "Duel Monsters Page",
  "Pokemon Page",
  "Magic Page",
  "Gundam Page",
  "One Piece Page",
  "Prize Page",
  "Arcade Page",
  "Union Arena Page",
  "Event Page",
  "Finale Page",
  "Cardbound City Page"
];

const binderPageTitles: Record<string, string> = {
  "Duel Monsters Page": "Duel Monsters Ace",
  "Pokemon Page": "Pokemon Ranger Pal",
  "Magic Page": "Five-Color Planeswalker",
  "Gundam Page": "White Base Mechanic",
  "One Piece Page": "Straw Hat Captain",
  "Prize Page": "Prize Ticket Clipper",
  "Arcade Page": "Arcade Page Legend",
  "Union Arena Page": "Union Arena Wrangler",
  "Event Page": "Secret Rare Hunter",
  "Finale Page": "Final Trigger Finisher",
  "Cardbound City Page": "Cardbound Archivist"
};

export class Game {
  private readonly combat: CombatSystem;
  private readonly quests: QuestSystem;

  constructor(
    private readonly world: World,
    private readonly store: Store,
    private readonly characterConfig: CharacterConfig
  ) {
    this.quests = new QuestSystem(world, store, characterConfig);
    this.combat = new CombatSystem(
      world,
      store,
      characterConfig,
      (player) => this.effectiveStats(player),
      (player, npc) => [
        ...this.quests.applyTrigger(player, { type: "defeat", npcId: npc.id }),
        ...this.quests.applyTrigger(player, { type: "binderCards", count: player.binderCards.length })
      ],
      (player, npc) => this.blockedQuestNpcReason(player, npc.id)
    );
  }

  login(name: string, adminCode?: string, species?: PlayerRecord["species"], job?: PlayerRecord["job"]) {
    return this.store.findOrCreatePlayer(name, this.world.defaultSpawnRoomId(), Boolean(adminCode), species, job);
  }

  createCharacter(accountId: number, name: string, adminCode?: string, species?: PlayerRecord["species"], job?: PlayerRecord["job"]) {
    return this.store.createPlayerForAccount(accountId, name, this.world.defaultSpawnRoomId(), Boolean(adminCode), species, job);
  }

  selectCharacter(accountId: number, characterId: number) {
    return this.store.getPlayerForAccount(accountId, characterId);
  }

  runCommand(player: PlayerRecord, input: string, playersInRoom: PlayerPresenceProvider): CommandResult {
    this.reconcileDerivedVitals(player);
    const trimmedInput = input.trim();
    const emoteInput = trimmedInput.match(/^\/me(?:\s+(.+))?$/i);
    if (emoteInput) return this.emote(player, emoteInput[1] ?? "");

    const [verbRaw, ...rest] = trimmedInput.split(/\s+/);
    const verb = verbRaw?.toLowerCase();
    const rawArg = rest.join(" ");
    const arg = cleanCommandQuery(rawArg);
    const deathLines = this.combat.resolveDeath(player, Date.now());
    if (deathLines.length) return { lines: deathLines };

    if (this.combat.isDead(player)) {
      return { lines: [`You are inside the Life Point safety field between scenes. You will return in ${formatSeconds((player.deadUntil ?? Date.now()) - Date.now())}.`] };
    }

    if (!verb) return { lines: ["Type a command first."] };
    if (verb === "rest" || verb === "recover" || verb === "recharge") return { lines: this.combat.startResting(player) };

    const interruptedRestLines = this.combat.stopResting(player);
    const respond = (result: CommandResult): CommandResult => ({
      ...result,
      lines: [...interruptedRestLines, ...result.lines, ...this.awardBinderPageTitles(player)]
    });

    if (verb in directionAliases || verb === "go") {
      if (this.combat.isInCombat(player)) return respond({ lines: ["You are in a duel. Use run if you want to disengage."] });
      const direction = verb === "go" ? directionAliases[arg] : directionAliases[verb];
      if (!direction) return respond({ lines: ["Go where? Try north, east, south, or west."] });
      const exit = this.world.resolveExit(player.roomId, direction);
      if (!exit || exit.hidden) return respond({ lines: ["You cannot travel that way."] });
      const blocked = this.blockedExitReason(player, exit);
      if (blocked) return respond({ lines: [blocked] });
      player.roomId = exit.to;
      this.combat.updateSanctuary(player);
      this.store.savePlayer(player);
      const questLines = this.quests.applyTrigger(player, { type: "enterRoom", roomId: player.roomId });
      const engageLines = this.combat.autoEngage(player);
      return respond({ lines: [`You travel ${direction}.`, ...questLines, ...this.look(player, resolvePlayersInRoom(playersInRoom)), ...engageLines] });
    }

    if (verb === "look" || verb === "l") {
      if (arg) return respond({ lines: this.lookAt(player, arg, resolvePlayersInRoom(playersInRoom)) });
      return respond({ lines: this.look(player, resolvePlayersInRoom(playersInRoom)) });
    }

    if (verb === "inventory" || verb === "inv" || verb === "i") {
      return respond({ lines: this.inventory(player, arg === "full" || arg === "all" || arg === "details") });
    }

    if (verb === "quests") {
      return respond({ lines: this.quests.list(player) });
    }

    if (verb === "quest") {
      return respond({ lines: this.quests.detail(player, arg) });
    }

    if (verb === "attack" || verb === "fight" || verb === "kill" || verb === "strike" || verb === "duel" || verb === "challenge") {
      return respond({ lines: this.combat.attack(player, arg) });
    }

    if (verb === "flee" || verb === "run" || verb === "break" || verb === "retreat" || verb === "escape") {
      return respond({ lines: this.combat.flee(player) });
    }

    if (verb === "brace" || verb === "block") {
      return respond({ lines: this.combat.brace(player) });
    }

    if (verb === "combat" || verb === "status") {
      return respond({ lines: this.combat.status(player) });
    }

    const skill = this.combat.findPlayerSkill(player, input);
    if (skill) {
      return respond({ lines: this.combat.useSkill(player, skill) });
    }

    if (verb === "profile" || verb === "score") {
      return respond({ lines: this.profile(player) });
    }

    if (verb === "mechanic" || verb === "rotation") {
      return respond({ lines: this.classMechanic(player) });
    }

    if (verb === "binder" || verb === "cards" || verb === "collection" || verb === "deck" || verb === "pokedex") {
      return respond({ lines: this.binder(player, arg) });
    }

    if (verb === "describe" || verb === "description") {
      return respond({ lines: this.describeSelf(player, rawArg) });
    }

    if (verb === "who") {
      return respond({ lines: this.who(player, resolvePlayersInRoom(playersInRoom)) });
    }

    if (verb === "take" || verb === "get") {
      return respond({ lines: this.take(player, arg) });
    }

    if (verb === "drop") {
      return respond({ lines: this.drop(player, arg) });
    }

    if (verb === "use") {
      return respond({ lines: this.useItem(player, arg) });
    }

    if (verb === "shop" || verb === "wares") {
      return respond({ lines: this.shop(player, arg) });
    }

    if (verb === "buy") {
      return respond({ lines: this.buy(player, arg) });
    }

    if (verb === "sell") {
      return respond({ lines: this.sell(player, arg) });
    }

    if (verb === "equip" || verb === "wear") {
      return respond({ lines: this.equip(player, arg) });
    }

    if (verb === "unequip" || verb === "remove") {
      return respond({ lines: this.unequip(player, arg) });
    }

    if (verb === "talk") {
      return respond({ lines: this.talk(player, arg) });
    }

    if (verb === "ask") {
      return respond({ lines: this.ask(player, rawArg) });
    }

    if (verb === "open" || verb === "unlock") {
      return respond({ lines: this.useDoor(player, verb, arg) });
    }

    if (verb === "say") {
      return respond({ lines: [`You say, "${rest.join(" ")}"`], roomEcho: `${player.name} says, "${rest.join(" ")}"` });
    }

    if (verb === "me") {
      return respond(this.emote(player, rest.join(" ")));
    }

    if (verb === "help") {
      return respond({
        lines: [
          "Commands: look, look <npc|item|player>, north/east/south/west, go <direction>, say <message>, /me <action>, me <action>, inventory, inventory full, take <item>, drop <item>, use <item>, equip <item>, unequip <slot>, shop, buy <item>, sell <item>, talk <npc>, ask <npc> about <topic>, help.",
          "Character: profile, score, mechanic/rotation, binder/cards/deck/pokedex, describe me <description>, who.",
          "Quests: quests, quest <name>.",
          "Combat: attack/duel <npc>, brace/block, run/flee, combat/status, recover/rest.",
          "Doors: open <direction|door>, unlock <direction|door>.",
          player.isAdmin ? "Admin: your account can use the Cardbound Builder at /admin.html." : ""
        ].filter(Boolean)
      });
    }

    return respond({ lines: [`Unknown command '${verb}'. Type help for options.`] });
  }

  private emote(player: PlayerRecord, action: string): CommandResult {
    const cleaned = action.trim();
    if (!cleaned) return { lines: ["Emote what? Try: /me bows politely."] };
    const normalized = cleaned.endsWith(".") || cleaned.endsWith("!") || cleaned.endsWith("?") ? cleaned : `${cleaned}.`;
    const selfAction = firstPersonEmote(normalized);
    return {
      lines: [`You ${selfAction}`],
      roomEcho: `${player.name} ${normalized}`
    };
  }

  view(player: PlayerRecord, playersHere: PlayerPresence[]): PlayerView {
    this.reconcileDerivedVitals(player);
    const room = this.world.room(player.roomId);
    return {
      name: player.name,
      species: player.species,
      speciesName: this.characterConfig.speciesName(player.species),
      job: player.job,
      jobName: this.characterConfig.jobName(player.job),
      stats: this.effectiveStats(player),
      statDefinitions: this.characterConfig.stats,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      xp: player.xp,
      xpForNextLevel: this.characterConfig.xpForNextLevel(player.level),
      level: player.level,
      tickets: player.tickets,
      binderCards: player.binderCards,
      titles: player.titles,
      flags: player.flags,
      sanctuaryRoomId: player.sanctuaryRoomId,
      deadUntil: player.deadUntil,
      room: this.roomView(player),
      zone: this.world.zone(room.zoneId),
      areaMap: this.areaMapView(player),
      inventory: this.inventoryItems(player),
      equipment: Object.fromEntries(this.equipmentItems(player)),
      combat: this.combat.view(player),
      classMechanic: this.combat.mechanicInfo(player),
      jobSkills: this.unlockedSkills(player),
      lockedJobSkills: this.lockedSkills(player),
      quests: this.quests.views(player),
      progressionHint: this.storyProgressionHint(player),
      playersHere,
      isAdmin: player.isAdmin
    };
  }

  private areaMapView(player: PlayerRecord) {
    const currentRoom = this.world.room(player.roomId);
    const zone = this.world.zone(currentRoom.zoneId);
    const rooms = [...this.world.rooms.values()].filter((room) => room.zoneId === currentRoom.zoneId && room.coords.z === currentRoom.coords.z);
    const bounds = rooms.reduce(
      (range, room) => ({
        minX: Math.min(range.minX, room.coords.x),
        maxX: Math.max(range.maxX, room.coords.x),
        minY: Math.min(range.minY, room.coords.y),
        maxY: Math.max(range.maxY, room.coords.y)
      }),
      { minX: currentRoom.coords.x, maxX: currentRoom.coords.x, minY: currentRoom.coords.y, maxY: currentRoom.coords.y }
    );
    const roomIds = new Set(rooms.map((room) => room.id));
    const availableQuestStarts = this.availableQuestStarts(player);

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      layer: currentRoom.coords.z,
      bounds,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        coords: room.coords,
        tags: room.tags,
        map: room.map,
        current: room.id === currentRoom.id,
        availableQuests: availableQuestStarts.get(room.id) ?? [],
        exits: this.world
          .visibleExits(room.id)
          .map(([direction, exit]) => {
            const view = this.exitView(player, exit);
            return {
              direction,
              to: exit.to,
              roomName: view.roomName,
              blocked: !view.isOpen || view.isLocked || Boolean(view.requiredItemId && !player.inventory.includes(view.requiredItemId)),
              offMap: !roomIds.has(exit.to)
            };
          })
      }))
    };
  }

  private availableQuestStarts(player: PlayerRecord) {
    const activeQuestIds = new Set(this.quests.views(player).map((quest) => quest.id));
    const startsByRoom = new Map<string, Array<{ id: string; name: string; startHint: string }>>();

    for (const quest of this.world.quests.values()) {
      if (activeQuestIds.has(quest.id)) continue;
      if (!this.questPrerequisitesMet(player, quest.prerequisites ?? [])) continue;
      if (quest.startsOn.type !== "ask" && quest.startsOn.type !== "talk") continue;
      if (!quest.startsOn.npcId) continue;

      const room = [...this.world.rooms.values()].find((candidate) => candidate.npcs.includes(quest.startsOn.npcId ?? ""));
      const npc = this.world.npcs.get(quest.startsOn.npcId);
      if (!room || !npc) continue;

      const topic = quest.startsOn.type === "ask" && quest.startsOn.topic ? ` about ${quest.startsOn.topic}` : "";
      const startHint = quest.startsOn.type === "ask" ? `Ask ${npc.name}${topic}` : `Talk to ${npc.name}`;
      const entries = startsByRoom.get(room.id) ?? [];
      entries.push({ id: quest.id, name: quest.name, startHint });
      startsByRoom.set(room.id, entries);
    }

    return startsByRoom;
  }

  private storyProgressionHint(player: PlayerRecord) {
    const questViews = this.quests.views(player);
    if (questViews.some((quest) => quest.status !== "completed")) return undefined;
    const recordedQuestIds = new Set(questViews.map((quest) => quest.id));

    for (const quest of this.world.quests.values()) {
      if (recordedQuestIds.has(quest.id)) continue;
      const structuralPrerequisites = (quest.prerequisites ?? []).filter((prerequisite) => prerequisite.type !== "binderCards" && prerequisite.type !== "level");
      if (!this.questPrerequisitesMet(player, structuralPrerequisites)) continue;
      const levelGate = (quest.prerequisites ?? [])
        .filter((prerequisite) => prerequisite.type === "level")
        .reduce((highest, prerequisite) => Math.max(highest, prerequisite.level), 0);
      const collectionGate = (quest.prerequisites ?? [])
        .filter((prerequisite) => prerequisite.type === "binderCards")
        .reduce((highest, prerequisite) => Math.max(highest, prerequisite.count), 0);
      const requirements: string[] = [];
      const actions: string[] = [];
      if (levelGate > player.level) {
        const targetXp = this.characterConfig.xpForLevel(levelGate);
        const remainingXp = Math.max(0, targetXp - player.xp);
        requirements.push(`level ${levelGate} (${player.xp}/${targetXp} XP)`);
        actions.push(`earn ${remainingXp} more XP`);
      }
      if (collectionGate > player.binderCards.length) {
        const remainingCards = collectionGate - player.binderCards.length;
        requirements.push(`${collectionGate} unique Collection cards (${player.binderCards.length}/${collectionGate})`);
        actions.push(`defeat ${remainingCards} unlogged runaway${remainingCards === 1 ? "" : "s"}`);
      }
      if (requirements.length) {
        const action = actions.join(" and ");
        return `Next story gate: ${quest.name} requires ${requirements.join(" and ")}. ${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
      }
      const startHint = this.questStartCommand(quest);
      return `Next story assignment ready: ${quest.name}.${startHint ? ` Try: ${startHint}.` : ""}`;
    }

    if (questViews.length === this.world.quests.size && questViews.every((quest) => quest.status === "completed")) {
      return "Current story chapter complete. Keep collecting and preparing for the next district.";
    }
    return undefined;
  }

  private questPrerequisitesMet(player: PlayerRecord, prerequisites: QuestDefinition["prerequisites"]) {
    for (const prerequisite of prerequisites ?? []) {
      if (prerequisite.type === "level" && player.level < prerequisite.level) return false;
      if (prerequisite.type === "flag" && !player.flags.includes(prerequisite.flag)) return false;
      if (prerequisite.type === "item" && !player.inventory.includes(prerequisite.itemId)) return false;
      if (prerequisite.type === "quest" && this.store.getQuestRecord(player.id, prerequisite.questId)?.status !== "completed") return false;
      if (prerequisite.type === "binderCards" && player.binderCards.length < prerequisite.count) return false;
    }
    return true;
  }

  tickItems() {
    const lines: Array<{ roomId: string; line: string }> = [];
    const now = Date.now();
    for (const room of this.world.rooms.values()) {
      const respawns = this.store.getRoomItemRespawns(room.id);
      const itemIds = this.store.getRoomItems(room.id);
      let changed = false;
      for (const [itemId, times] of Object.entries(respawns)) {
        const spawn = roomItemSpawns(room).find((candidate) => candidate.itemId === itemId);
        if (!spawn) {
          delete respawns[itemId];
          changed = true;
          continue;
        }
        const ready = times.filter((time) => time <= now);
        if (!ready.length) continue;
        const currentCount = itemIds.filter((id) => id === itemId).length;
        const allowed = Math.max(0, spawn.quantity - currentCount);
        const returning = ready.slice(0, allowed);
        const waiting = times.filter((time) => time > now);
        itemIds.push(...returning.map(() => itemId));
        respawns[itemId] = waiting;
        const item = this.world.items.get(itemId);
        if (item && returning.length) lines.push({ roomId: room.id, line: `${item.name} catches the light as it returns to the room.` });
        changed = true;
      }
      if (changed) {
        this.store.setRoomItems(room.id, itemIds);
        this.store.setRoomItemRespawns(room.id, cleanRespawns(respawns));
      }
    }
    return lines;
  }

  look(player: PlayerRecord, playersInRoom: PlayerPresence[]) {
    const room = this.world.room(player.roomId);
    const items = this.roomItems(room.id);
    const npcs = this.combat.activeRoomNpcs(room.id);
    const exits = this.world.visibleExits(room.id).map(([direction, exit]) => this.exitLabel(player, direction, exit));
    const questStarts = this.availableQuestStarts(player).get(room.id) ?? [];
    return [
      `${room.name}`,
      this.world.zone(room.zoneId).name,
      room.description,
      exits.length ? `Exits: ${exits.join(", ")}.` : "There are no obvious exits.",
      questStarts.length ? `Work to begin here: ${questStarts.map((quest) => `${quest.name} (${quest.startHint})`).join("; ")}.` : "",
      items.length ? `You notice: ${items.map((item) => item.name).join(", ")}.` : "",
      npcs.length ? `Nearby: ${npcs.map((npc) => npcRoomLabel(npc)).join(", ")}.` : "",
      playersInRoom.length ? `Also here: ${playersInRoom.map((presence) => playerPresenceLabel(presence)).join(", ")}.` : ""
    ].filter(Boolean);
  }

  private roomView(player: PlayerRecord): RoomView {
    const roomId = player.roomId;
    const room = this.world.room(roomId);
    const minimap: RoomView["minimap"] = {
      here: { id: room.id, name: room.name }
    };
    const exits: RoomView["exits"] = {};
    for (const [direction, exit] of this.world.visibleExits(room.id)) {
      const view = this.exitView(player, exit);
      exits[direction] = view;
      if (["north", "east", "south", "west"].includes(direction)) {
        minimap[direction] = { id: exit.to, name: view.roomName, blocked: !view.isOpen || view.isLocked };
      }
    }

    return {
      id: room.id,
      zoneId: room.zoneId,
      name: room.name,
      description: room.description,
      tags: room.tags,
      map: room.map,
      exits,
      minimap,
      items: this.roomItems(room.id),
      npcs: this.combat.activeRoomNpcs(room.id)
    };
  }

  private inventoryItems(player: PlayerRecord) {
    return player.inventory.map((id) => this.world.items.get(id)).filter((item): item is ItemDefinition => Boolean(item));
  }

  private inventory(player: PlayerRecord, full = false) {
    const items = this.inventoryItems(player);
    const equipment = this.equipmentItems(player);
    if (!full) {
      return [
        items.length ? `You carry: ${items.map((item) => item.name).join(", ")}.` : "You are carrying nothing.",
        equipment.length ? `Equipped: ${equipment.map(([slot, item]) => `${slot}: ${item.name}`).join(", ")}.` : "Equipped: nothing.",
        items.length || equipment.length ? "Use inventory full for item descriptions." : ""
      ].filter(Boolean);
    }

    return [
      items.length ? "You carry:" : "You are carrying nothing.",
      ...items.map((item) => `- ${item.name}: ${this.itemSummary(item, player)}`),
      equipment.length ? "Equipped:" : "Equipped: nothing.",
      ...equipment.map(([slot, item]) => `- ${slot}: ${item.name}: ${this.itemSummary(item)}`)
    ];
  }

  private equipmentItems(player: PlayerRecord) {
    return Object.entries(player.equipment)
      .map(([slot, itemId]) => [slot as EquipmentSlot, itemId ? this.world.items.get(itemId) : undefined] as const)
      .filter((entry): entry is [EquipmentSlot, ItemDefinition] => Boolean(entry[1]));
  }

  private take(player: PlayerRecord, query: string) {
    const room = this.world.room(player.roomId);
    const itemIds = this.store.getRoomItems(room.id);
    const item = this.findRoomItem(itemIds, query);
    if (!item) return ["You do not see that here."];
    const blocked = this.blockedQuestPickupReason(player, item);
    if (blocked) return [blocked];
    this.store.setRoomItems(room.id, removeOne(itemIds, item.id));
    this.scheduleItemRespawn(room.id, item.id);
    player.inventory.push(item.id);
    this.store.savePlayer(player);
    return [`You take the ${item.name}.`, ...this.quests.applyTrigger(player, { type: "take", itemId: item.id })];
  }

  private blockedQuestPickupReason(player: PlayerRecord, item: ItemDefinition) {
    const quests = this.questsForStepTrigger({ type: "take", itemId: item.id });
    if (!quests.length) return undefined;
    if (quests.some((quest) => this.store.getQuestRecord(player.id, quest.id))) return undefined;

    return this.questGateMessage(player, quests, `taking ${item.name}`);
  }

  private drop(player: PlayerRecord, query: string) {
    const item = this.findInventoryItem(player, query);
    if (!item) return ["You are not carrying that."];
    for (const [slot, itemId] of Object.entries(player.equipment)) {
      if (itemId === item.id) delete player.equipment[slot as EquipmentSlot];
    }
    player.inventory = player.inventory.filter((id) => id !== item.id);
    const itemIds = this.store.getRoomItems(player.roomId);
    this.store.setRoomItems(player.roomId, [...itemIds, item.id]);
    this.reconcileItemRespawn(player.roomId, item.id);
    this.store.savePlayer(player);
    return [`You drop the ${item.name}.`];
  }

  private useItem(player: PlayerRecord, query: string) {
    const item = this.findInventoryItem(player, query);
    if (!item) return ["You are not carrying that."];
    const keyedDoorLines = this.useKeyOnNearbyDoor(player, item);
    if (keyedDoorLines) return keyedDoorLines;
    if (item.type === "equipment") return this.equip(player, query);
    if (item.type !== "consumable" || !item.consumable) return [`You cannot use ${item.name} that way.`];

    const hp = item.consumable.hp ?? 0;
    const mana = item.consumable.mana ?? 0;
    if (hp <= 0 && mana <= 0) return [`${item.name} has no usable effect yet.`];

    const beforeHp = player.hp;
    const beforeMana = player.mana;
    player.hp = Math.min(player.maxHp, player.hp + hp);
    player.mana = Math.min(player.maxMana, player.mana + mana);
    const healed = player.hp - beforeHp;
    const restored = player.mana - beforeMana;
    if (healed <= 0 && restored <= 0) return [`You do not need ${item.name} right now.`];
    player.inventory = removeOne(player.inventory, item.id);
    this.store.savePlayer(player);
    return [`You use ${item.name}.`, healed ? `Recovered ${healed} HP.` : "", restored ? `Recovered ${restored} Energy.` : ""].filter(Boolean);
  }

  private useKeyOnNearbyDoor(player: PlayerRecord, item: ItemDefinition) {
    const match = this.findDoorExitForKey(player.roomId, item.id);
    if (!match) return undefined;

    const door = this.world.door(match.exit.doorId);
    const blocked = this.blockedQuestDoorReason(player, door.id);
    if (blocked) return [blocked];
    const state = this.store.getDoorState(player.id, door);
    const unlockQuestLines = this.quests.applyTrigger(player, { type: "unlockDoor", doorId: door.id });

    if (!state.isLocked && state.isOpen) {
      return [`${door.name} is already unlocked and open.`, ...unlockQuestLines];
    }

    this.store.setDoorState({ ...state, isLocked: false, isOpen: true });
    const openQuestLines = this.quests.applyTrigger(player, { type: "openDoor", doorId: door.id });
    if (!state.isLocked) return [`You use ${item.name} to open ${door.name}.`, ...unlockQuestLines, ...openQuestLines];
    return [`You use ${item.name} to unlock and open ${door.name}.`, ...unlockQuestLines, ...openQuestLines];
  }

  private blockedQuestDoorReason(player: PlayerRecord, doorId: string) {
    const quests = this.questsForStepTrigger({ type: "unlockDoor", doorId }).concat(this.questsForStepTrigger({ type: "openDoor", doorId }));
    if (!quests.length) return undefined;
    if (quests.some((quest) => this.store.getQuestRecord(player.id, quest.id))) return undefined;
    return this.questGateMessage(player, quests, "using that door");
  }

  private blockedQuestNpcReason(player: PlayerRecord, npcId: string) {
    const quests = this.questsForStepTrigger({ type: "defeat", npcId });
    if (!quests.length) return undefined;
    if (quests.some((quest) => this.store.getQuestRecord(player.id, quest.id))) return undefined;
    const npc = this.world.npcs.get(npcId);
    return this.questGateMessage(player, quests, `challenging ${npc?.name ?? "that story opponent"}`);
  }

  private questGateMessage(player: PlayerRecord, quests: QuestDefinition[], action: string) {
    const available = quests.filter((quest) => this.questPrerequisitesMet(player, quest.prerequisites ?? []));
    const quest = available[0] ?? quests[0];
    const hint = quest ? this.questStartCommand(quest) : undefined;
    if (!available.length && quest) {
      const prerequisites = this.unmetQuestPrerequisiteLabels(player, quest);
      return `${quest.name} is tied to later work. Before ${action}, continue ${prerequisites.length ? prerequisites.join(", ") : "your current quests"} first.`;
    }
    if (quest && hint) return `${quest.name} has not begun yet. Before ${action}, try: ${hint}.`;
    return `${formatQuestList(quests)} has not begun yet. Talk to nearby folk before ${action}.`;
  }

  private unmetQuestPrerequisiteLabels(player: PlayerRecord, quest: QuestDefinition) {
    return (quest.prerequisites ?? [])
      .map((prerequisite) => {
        if (prerequisite.type === "quest" && this.store.getQuestRecord(player.id, prerequisite.questId)?.status !== "completed") {
          return this.world.quests.get(prerequisite.questId)?.name ?? prerequisite.questId;
        }
        if (prerequisite.type === "level" && player.level < prerequisite.level) {
          const targetXp = this.characterConfig.xpForLevel(prerequisite.level);
          return `reaching level ${prerequisite.level} (${player.xp}/${targetXp} XP; ${Math.max(0, targetXp - player.xp)} remaining)`;
        }
        if (prerequisite.type === "item" && !player.inventory.includes(prerequisite.itemId)) return `finding ${this.world.items.get(prerequisite.itemId)?.name ?? prerequisite.itemId}`;
        if (prerequisite.type === "flag" && !player.flags.includes(prerequisite.flag)) return "the needed story step";
        if (prerequisite.type === "binderCards" && player.binderCards.length < prerequisite.count) {
          return `logging ${prerequisite.count} unique Collection cards (${player.binderCards.length}/${prerequisite.count}; ${prerequisite.count - player.binderCards.length} remaining)`;
        }
        return undefined;
      })
      .filter((label): label is string => Boolean(label));
  }

  private questStartCommand(quest: QuestDefinition) {
    if (quest.startsOn.type === "ask" && quest.startsOn.npcId && quest.startsOn.topic) {
      const npc = this.world.npcs.get(quest.startsOn.npcId);
      if (npc) return `ask ${npc.name} about ${quest.startsOn.topic}`;
    }
    if (quest.startsOn.type === "talk" && quest.startsOn.npcId) {
      const npc = this.world.npcs.get(quest.startsOn.npcId);
      if (npc) return `talk ${npc.name}`;
    }
    return undefined;
  }

  private shop(player: PlayerRecord, query: string) {
    const merchantMatch = this.findMerchant(player.roomId, query);
    if (!merchantMatch) return ["No merchant here is offering wares."];
    const wares = merchantMatch.merchant.items
      .map((itemId) => this.world.items.get(itemId))
      .filter((item): item is ItemDefinition => Boolean(item));
    if (!wares.length) return [`${merchantMatch.npc.name} has no wares for sale right now.`];
    return [
      `${merchantMatch.npc.name}'s wares:`,
      ...wares.map((item) => `${item.name} - ${this.buyPrice(item, merchantMatch.merchant)} Prize Tickets. ${item.description}`),
      merchantMatch.merchant.buys ? `They will buy carried items for about ${Math.round(merchantMatch.merchant.markdown * 100)}% value.` : ""
    ].filter(Boolean);
  }

  private buy(player: PlayerRecord, query: string) {
    const { itemQuery, merchantQuery } = splitTradeQuery(query, "from");
    if (!itemQuery) return ["Buy what? Try: buy Potion snack cake."];
    const merchantMatch = this.findMerchant(player.roomId, merchantQuery);
    if (!merchantMatch) return ["No merchant here is selling that."];
    const item = merchantMatch.merchant.items.map((itemId) => this.world.items.get(itemId)).find((candidate) => candidate && matches(candidate, itemQuery));
    if (!item) return [`${merchantMatch.npc.name} is not selling that.`];
    const price = this.buyPrice(item, merchantMatch.merchant);
    if (player.tickets < price) return [`${item.name} costs ${price} Prize Tickets. You have ${player.tickets}.`];
    player.tickets -= price;
    player.inventory.push(item.id);
    this.store.savePlayer(player);
    return [`You buy ${item.name} from ${merchantMatch.npc.name} for ${price} Prize Tickets.`];
  }

  private sell(player: PlayerRecord, query: string) {
    const { itemQuery, merchantQuery } = splitTradeQuery(query, "to");
    if (!itemQuery) return ["Sell what? Try: sell Potion snack cake."];
    const merchantMatch = this.findMerchant(player.roomId, merchantQuery);
    if (!merchantMatch) return ["No merchant here is buying goods."];
    if (!merchantMatch.merchant.buys) return [`${merchantMatch.npc.name} is not buying goods right now.`];
    const item = this.findInventoryItem(player, itemQuery);
    if (!item) return ["You are not carrying that."];
    const price = this.sellPrice(item, merchantMatch.merchant);
    for (const [slot, itemId] of Object.entries(player.equipment)) {
      if (itemId === item.id) delete player.equipment[slot as EquipmentSlot];
    }
    player.inventory = removeOne(player.inventory, item.id);
    player.tickets += price;
    this.store.savePlayer(player);
    return [`You sell ${item.name} to ${merchantMatch.npc.name} for ${price} Prize Tickets.`];
  }

  private equip(player: PlayerRecord, query: string) {
    const item = this.findInventoryItem(player, query);
    if (!item) return ["You are not carrying that."];
    if (item.type !== "equipment" || !item.equipment) return [`${item.name} is not equipment.`];

    const slot = item.equipment.slot;
    const previous = player.equipment[slot] ? this.world.items.get(player.equipment[slot]) : undefined;
    if (previous?.id === item.id) return [`${item.name} is already equipped in your ${slot} slot.`];

    player.equipment[slot] = item.id;
    this.reconcileDerivedVitals(player);
    this.store.savePlayer(player);
    return previous
      ? [`You replace ${previous.name} with ${item.name} in your ${slot} slot.`, ...this.equipmentComparisonLines(item, previous)]
      : [`You equip ${item.name} in your ${slot} slot.`, ...this.equipmentComparisonLines(item)];
  }

  private unequip(player: PlayerRecord, query: string) {
    const normalized = query.trim().toLowerCase();
    const slot = (["trinket", "head", "body", "feet"] as EquipmentSlot[]).find((candidate) => candidate === normalized);
    if (slot) {
      const item = player.equipment[slot] ? this.world.items.get(player.equipment[slot]) : undefined;
      if (!item) return [`Nothing is equipped in your ${slot} slot.`];
      delete player.equipment[slot];
      this.reconcileDerivedVitals(player);
      this.store.savePlayer(player);
      return [`You unequip ${item.name}.`];
    }

    const item = this.equipmentItems(player).find(([, equipped]) => matches(equipped, query));
    if (!item) return ["You do not have that equipped."];
    delete player.equipment[item[0]];
    this.reconcileDerivedVitals(player);
    this.store.savePlayer(player);
    return [`You unequip ${item[1].name}.`];
  }

  private roomItems(roomId: string) {
    return this.world.itemsForIds(this.store.getRoomItems(roomId));
  }

  private scheduleItemRespawn(roomId: string, itemId: string) {
    const room = this.world.room(roomId);
    const spawn = roomItemSpawns(room).find((candidate) => candidate.itemId === itemId && candidate.respawnSeconds && candidate.respawnSeconds > 0);
    if (!spawn) return;
    const respawnSeconds = spawn.respawnSeconds ?? 0;

    const itemIds = this.store.getRoomItems(roomId);
    const respawns = this.store.getRoomItemRespawns(roomId);
    const scheduled = respawns[itemId] ?? [];
    const currentCount = itemIds.filter((id) => id === itemId).length + scheduled.length;
    if (currentCount >= spawn.quantity) return;
    respawns[itemId] = [...scheduled, Date.now() + respawnSeconds * 1000];
    this.store.setRoomItemRespawns(roomId, cleanRespawns(respawns));
  }

  private reconcileItemRespawn(roomId: string, itemId: string) {
    const room = this.world.room(roomId);
    const spawn = roomItemSpawns(room).find((candidate) => candidate.itemId === itemId);
    if (!spawn) return;
    const itemIds = this.store.getRoomItems(roomId);
    const respawns = this.store.getRoomItemRespawns(roomId);
    const scheduled = respawns[itemId] ?? [];
    const allowedScheduled = Math.max(0, spawn.quantity - itemIds.filter((id) => id === itemId).length);
    if (scheduled.length <= allowedScheduled) return;
    respawns[itemId] = scheduled.slice(0, allowedScheduled);
    this.store.setRoomItemRespawns(roomId, cleanRespawns(respawns));
  }

  private lookAt(player: PlayerRecord, query: string, playersInRoom: PlayerPresence[]) {
    const npc = this.findNpcInRoom(player.roomId, query);
    if (npc) {
      const card = binderCardInfo(this.world, npc.id);
      return [
        npc.name,
        `Type: ${npc.species}.`,
        npc.description,
        npc.disposition !== "friendly"
          ? `Collection Binder: ${player.binderCards.includes(npc.id) ? "collected" : "not collected"} (${card.page}, ${card.rarity}).`
          : "",
        npcDispositionLine(npc)
      ].filter(Boolean);
    }

    const item = this.roomItems(player.roomId).find((candidate) => matches(candidate, query));
    if (item) return [item.name, this.itemSummary(item, player)];

    const carried = this.findInventoryItem(player, query) ?? this.equipmentItems(player).find(([, equipped]) => matches(equipped, query))?.[1];
    if (carried) return [carried.name, this.itemSummary(carried, player)];

    const playerPresence = playersInRoom.find((presence) => cleanCommandQuery(presence.name) === cleanCommandQuery(query));
    if (playerPresence) {
      return [
        playerPresence.name,
        playerPresence.jobName,
        playerPresence.titles.length ? `Titles: ${playerPresence.titles.join(", ")}.` : "",
        playerPresence.description || `${playerPresence.name} has not set a description yet.`,
        "Try say <message> or /me <action> to roleplay with them."
      ].filter(Boolean);
    }

    if (cleanCommandQuery(player.name) === cleanCommandQuery(query) || cleanCommandQuery(query) === "me") {
      return [
        player.name,
        this.characterConfig.jobName(player.job),
        player.titles.length ? `Titles: ${player.titles.join(", ")}.` : "",
        player.description || "You have not set a description yet. Try: describe me <what others see>."
      ].filter(Boolean);
    }

    return ["You do not see that here."];
  }

  private talk(player: PlayerRecord, query: string) {
    const npc = this.findNpcInRoom(player.roomId, query);
    if (!npc) return ["You do not see them here."];
    const topics = Object.entries(npc.dialogue.topics)
      .filter(([, topic]) => this.dialogueTopicAvailable(player, topic))
      .map(([key, topic]) => topic.prompt ?? key);
    return [
      ...this.quests.applyTrigger(player, { type: "talk", npcId: npc.id }),
      `${npc.name}:`,
      ...npc.dialogue.greeting.map((line) => `"${line}"`),
      topics.length ? `You can ask ${npc.name} about: ${topics.join(", ")}.` : ""
    ].filter(Boolean);
  }

  private ask(player: PlayerRecord, input: string) {
    const match = normalizeAskInput(input, this.combat.activeRoomNpcs(player.roomId).map((npc) => npc.name));
    if (!match) return ["Ask whom about what? Try: ask Marshal Echo about key."];

    const npc = this.findNpcInRoom(player.roomId, match.npc);
    if (!npc) return ["You do not see them here."];

    const requestedTopic = cleanCommandQuery(match.topic);
    const topic = Object.entries(npc.dialogue.topics).find(([key, value]) => {
      if (!this.dialogueTopicAvailable(player, value)) return false;
      const phrases = [key, value.prompt, ...value.aliases]
        .filter((phrase): phrase is string => Boolean(phrase))
        .map(cleanCommandQuery);
      return phrases.some((phrase) => phrase === requestedTopic || phrase.includes(requestedTopic) || requestedTopic.includes(phrase));
    });

    if (!topic) {
      const topics = Object.entries(npc.dialogue.topics)
        .filter(([, value]) => this.dialogueTopicAvailable(player, value))
        .map(([key, value]) => value.prompt ?? key);
      return [`${npc.name} checks their notes, uncertain what you mean. Try asking about: ${topics.join(", ")}.`];
    }

    const gatedQuest = [...this.world.quests.values()].find((quest) => {
      if (this.store.getQuestRecord(player.id, quest.id)) return false;
      return quest.startsOn.type === "ask"
        && quest.startsOn.npcId === npc.id
        && quest.startsOn.topic === topic[0]
        && !this.questPrerequisitesMet(player, quest.prerequisites ?? []);
    });
    if (gatedQuest) return [`${npc.name}:`, this.questGateMessage(player, [gatedQuest], "starting that assignment")];

    const flagLines: string[] = [];
    if (topic[1].setsFlag && !player.flags.includes(topic[1].setsFlag)) {
      player.flags.push(topic[1].setsFlag);
      this.store.savePlayer(player);
      flagLines.push(`Flag set: ${topic[1].setsFlag}.`);
    }

    return [
      ...this.quests.applyTrigger(player, { type: "ask", npcId: npc.id, topic: topic[0] }),
      `${npc.name}:`,
      ...topic[1].response.map((line) => `"${line}"`),
      ...this.classDialogueResponse(player, topic[1]),
      ...flagLines
    ];
  }

  private classDialogueResponse(player: PlayerRecord, topic: { classResponses?: Record<string, string[]> }) {
    return (topic.classResponses?.[player.job] ?? []).map((line) => `"${line}"`);
  }

  private dialogueTopicAvailable(player: PlayerRecord, topic: { requiresFlag?: string }) {
    return !topic.requiresFlag || player.flags.includes(topic.requiresFlag);
  }

  private describeSelf(player: PlayerRecord, input: string) {
    const description = input.trim().replace(/^me\s+/i, "").trim();
    if (!description) {
      return [
        player.description ? `Your description: ${player.description}` : "You have not set a description yet.",
        "Set one with: describe me <what others see>."
      ];
    }

    if (/^(?:clear|reset|none)$/i.test(description)) {
      player.description = "";
      this.store.savePlayer(player);
      return ["Your description has been cleared."];
    }

    if (description.length > 240) return ["Keep your description to 240 characters or fewer."];
    player.description = description;
    this.store.savePlayer(player);
    return ["Your description is set.", `Others will see: ${player.description}`];
  }

  private who(player: PlayerRecord, playersInRoom: PlayerPresence[]) {
    return [
      "Here now:",
      `- ${playerPresenceLabel({
        name: player.name,
        speciesName: this.characterConfig.speciesName(player.species),
        jobName: this.characterConfig.jobName(player.job),
        titles: player.titles,
        description: player.description
      })} (you)`,
      ...playersInRoom.map((presence) => `- ${playerPresenceLabel(presence)}`)
    ];
  }

  private findNpcInRoom(roomId: string, query: string) {
    return this.combat.findNpcInRoom(roomId, query);
  }

  tickCombat(players: PlayerRecord[], now = Date.now()) {
    return this.combat.tick(players, now);
  }

  private blockedExitReason(player: PlayerRecord, exit: ExitDefinition) {
    if (exit.requiredItemId && !player.inventory.includes(exit.requiredItemId)) {
      const item = this.world.items.get(exit.requiredItemId);
      return exit.blockedMessage ?? `You need ${item?.name ?? "something else"} before you can travel that way.`;
    }

    if (!exit.doorId) return undefined;
    const door = this.world.door(exit.doorId);
    const state = this.store.getDoorState(player.id, door);
    if (state.isLocked) return `${door.name} is locked.`;
    if (!state.isOpen) return `${door.name} is closed.`;
    return undefined;
  }

  private useDoor(player: PlayerRecord, action: "open" | "unlock", query: string) {
    const match = this.findDoorExit(player.roomId, query);
    if (!match) return ["You do not see that door from here."];
    const door = this.world.door(match.exit.doorId);
    const blocked = action === "unlock" || door.keyItemId ? this.blockedQuestDoorReason(player, door.id) : undefined;
    if (blocked) return [blocked];
    const state = this.store.getDoorState(player.id, door);

    if (action === "unlock" && door.keyItemId && !player.inventory.includes(door.keyItemId)) {
      const key = this.world.items.get(door.keyItemId);
      return [`You need ${key?.name ?? "the right key"} for ${door.name}.`];
    }

    if (action === "open") {
      if (state.isLocked) return [`${door.name} is locked.`];
      if (state.isOpen) return [`${door.name} is already open.`, ...this.quests.applyTrigger(player, { type: "openDoor", doorId: door.id })];
      this.store.setDoorState({ ...state, isOpen: true });
      return [`You open ${door.name}.`, ...this.quests.applyTrigger(player, { type: "openDoor", doorId: door.id })];
    }

    const unlockQuestLines = this.quests.applyTrigger(player, { type: "unlockDoor", doorId: door.id });
    if (!state.isLocked && state.isOpen) return [`${door.name} is already unlocked and open.`, ...unlockQuestLines];

    this.store.setDoorState({ ...state, isLocked: false, isOpen: true });
    const openQuestLines = this.quests.applyTrigger(player, { type: "openDoor", doorId: door.id });
    if (!state.isLocked) return [`${door.name} is already unlocked, so you open it.`, ...unlockQuestLines, ...openQuestLines];
    return [`You unlock and open ${door.name}.`, ...unlockQuestLines, ...openQuestLines];
  }

  private findDoorExit(roomId: string, query: string) {
    const normalized = cleanCommandQuery(query);
    const direction = directionAliases[normalized];
    const candidates = this.world.visibleExits(roomId);
    const match = candidates.find(([candidateDirection, exit]) => {
      if (!exit.doorId) return false;
      const door = this.world.door(exit.doorId);
      return (
        candidateDirection === direction ||
        door.id.toLowerCase() === normalized ||
        door.name.toLowerCase() === normalized ||
        door.name.toLowerCase().includes(normalized)
      );
    });
    return match ? { direction: match[0], exit: match[1] as ExitDefinition & { doorId: string } } : undefined;
  }

  private findDoorExitForKey(roomId: string, itemId: string) {
    const match = this.world.visibleExits(roomId).find(([, exit]) => {
      if (!exit.doorId) return false;
      const door = this.world.door(exit.doorId);
      return door.keyItemId === itemId || exit.requiredItemId === itemId;
    });
    return match ? { direction: match[0], exit: match[1] as ExitDefinition & { doorId: string } } : undefined;
  }

  private questsForStepTrigger(trigger: QuestTrigger) {
    return [...this.world.quests.values()].filter((quest) => {
      return quest.steps.some((step) => triggerMatchesStep(step.trigger, trigger));
    });
  }

  private exitView(player: PlayerRecord, exit: ExitDefinition): ExitView {
    const destination = this.world.room(exit.to);
    if (!exit.doorId) {
      return {
        to: exit.to,
        roomName: destination.name,
        label: exit.label,
        isOpen: true,
        isLocked: false,
        requiredItemId: exit.requiredItemId,
        hidden: Boolean(exit.hidden)
      };
    }

    const door = this.world.door(exit.doorId);
    const state = this.store.getDoorState(player.id, door);
    return {
      to: exit.to,
      roomName: destination.name,
      label: exit.label,
      doorName: door.name,
      isOpen: state.isOpen,
      isLocked: state.isLocked,
      requiredItemId: exit.requiredItemId,
      hidden: Boolean(exit.hidden)
    };
  }

  private exitLabel(player: PlayerRecord, direction: Direction, exit: ExitDefinition) {
    const view = this.exitView(player, exit);
    const detail = view.doorName ? ` (${view.doorName}, ${view.isLocked ? "locked" : view.isOpen ? "open" : "closed"})` : "";
    return `${direction}${detail}`;
  }

  private findRoomItem(itemIds: string[], query: string) {
    return itemIds.map((id) => this.world.items.get(id)).find((item) => item && matches(item, query));
  }

  private profile(player: PlayerRecord) {
    const stats = this.effectiveStats(player);
    return [
      `${player.name}`,
      this.characterConfig.jobName(player.job),
      `Level ${player.level} | XP ${player.xp}/${this.characterConfig.xpForNextLevel(player.level)} | ${player.tickets} Prize Tickets`,
      `Collection cards: ${player.binderCards.length} (${binderProgressSummary(player.binderCards.length)}).`,
      `Stats: ${this.characterConfig.stats.map((stat) => `${stat.name} ${stats[stat.id] ?? 0}`).join(", ")}.`,
      this.equipmentItems(player).length ? `Equipped: ${this.equipmentItems(player).map(([slot, item]) => `${slot}: ${item.name}`).join(", ")}.` : "Equipped: nothing.",
      player.titles.length ? `Titles: ${player.titles.join(", ")}.` : "Titles: none yet.",
      player.flags.length ? `Flags: ${player.flags.join(", ")}.` : "Flags: none yet."
    ];
  }

  private classMechanic(player: PlayerRecord) {
    const job = this.characterConfig.jobDefinition(player.job);
    const mechanic = job.mechanic;
    if (!mechanic) return [`${job.name} does not have a signature combat mechanic yet.`];
    const unlocked = job.skills.filter((skill) => skill.level <= player.level);
    const builders = unlocked.filter((skill) => (skill.mechanicGain ?? 0) > 0).map((skill) => `${skill.name} +${skill.mechanicGain}`);
    const spenders = unlocked
      .filter((skill) => (skill.mechanicCost ?? 0) > 0 || skill.mechanicSpendAll)
      .map((skill) => `${skill.name} ${skill.mechanicSpendAll ? `spends all (needs ${Math.max(1, skill.mechanicCost ?? 0)})` : `-${skill.mechanicCost}`}`);
    const passives = unlocked.filter((skill) => skill.passive).map((skill) => `${skill.name}: ${skill.description}`);
    const mechanicInfo = this.combat.mechanicInfo(player);
    const nextUnlock = job.skills
      .filter((skill) => skill.level > player.level)
      .sort((left, right) => left.level - right.level)[0];
    const stackBonuses = mechanicInfo
      ? [
          mechanicInfo.damagePerStack ? `+${mechanicInfo.damagePerStack} damage` : "",
          mechanicInfo.healingPerStack ? `+${mechanicInfo.healingPerStack} healing` : "",
          mechanicInfo.guardPerStack ? `+${mechanicInfo.guardPerStack} guard` : ""
        ].filter(Boolean)
      : [];
    const advancedRules = mechanicInfo
      ? [
          mechanicInfo.startStacks ? `Start each duel with ${mechanicInfo.startStacks}.` : "",
          mechanicInfo.energyPerStackSpent ? `Spending restores ${mechanicInfo.energyPerStackSpent} Energy per stack.` : "",
          mechanicInfo.healingPerStackSpent ? `Spending restores ${mechanicInfo.healingPerStackSpent} HP per stack.` : "",
          mechanicInfo.retainStacksOnSpendAll ? `Spend-all techniques retain up to ${mechanicInfo.retainStacksOnSpendAll}, while always consuming at least one.` : ""
        ].filter(Boolean)
      : [];
    return [
      `${job.name} mechanic: ${mechanic.name} (${mechanicInfo?.stacks ?? 0}/${mechanicInfo?.maxStacks ?? mechanic.maxStacks}).`,
      mechanic.description,
      `Build: ${[mechanicInfo?.basicAttackGain ? `basic attack +${mechanicInfo.basicAttackGain}` : "", ...builders].filter(Boolean).join(", ")}.`,
      stackBonuses.length ? `Each stack currently grants ${stackBonuses.join(", ")}.` : "",
      spenders.length ? `Spend: ${spenders.join(", ")}.` : "Spend: your first payoff unlocks at a later level.",
      ...advancedRules,
      ...passives.map((passive) => `Passive: ${passive}`),
      nextUnlock ? `Next class unlock: ${nextUnlock.name} at level ${nextUnlock.level}.` : "All current class techniques unlocked."
    ].filter(Boolean);
  }

  private binder(player: PlayerRecord, query = "") {
    const cards = player.binderCards.map((cardId) => binderCardInfo(this.world, cardId));
    const groupedCards = groupBinderCards(cards);
    const pageProgress = binderPageProgress(this.world, player);
    const selectedPage = query ? resolveBinderPage(query, pageProgress) : undefined;
    if (query && !selectedPage) {
      return [`No collection page matches '${query}'. Try: ${pageProgress.map((page) => page.page).join(", ")}.`];
    }
    const storyHint = this.storyProgressionHint(player);
    const lines = [
      `Collection cards (${cards.length}): ${binderProgressSummary(cards.length)}.`,
      ...(storyHint ? [storyHint] : []),
      "Milestones:",
      ...binderMilestoneLines(cards.length),
      "Page chase:",
      ...pageProgress.filter((page) => !selectedPage || page.page === selectedPage).map((page) => {
        const title = binderPageTitles[page.page] ?? `${page.page} Archivist`;
        const state = page.complete ? `complete, title ${title}` : `${page.collected}/${page.total}`;
        return `- ${page.page}: ${state}.`;
      })
    ];

    if (!cards.length) {
      return [...lines, "Pages: empty.", "Defeat runaway card monsters to log their prints."];
    }

    lines.push("Pages:");
    for (const [page, pageCards] of groupedCards.filter(([page]) => !selectedPage || page === selectedPage)) {
      lines.push(`${page}:`);
      for (const card of pageCards) {
        lines.push(`- ${card.name} [${card.rarity}] - ${card.flavor}`);
      }
    }
    return lines;
  }

  private findInventoryItem(player: PlayerRecord, query: string) {
    return this.inventoryItems(player).find((item) => matches(item, query));
  }

  private itemSummary(item: ItemDefinition, player?: PlayerRecord) {
    const details: string[] = [item.description];
    if (item.rarity) details.push(`Rarity: ${rarityLabel(item.rarity)}.`);
    if (item.type) details.push(`Type: ${item.type}.`);
    if (Number.isFinite(item.value)) details.push(`Value: ${item.value} Prize Tickets.`);
    if (item.equipment) details.push(`Slot: ${item.equipment.slot}.`);
    const bonuses = this.statBonusLabels(item.equipment?.statBonuses ?? {});
    if (bonuses.length) details.push(`Bonuses: ${bonuses.join(", ")}.`);
    if (player && item.equipment) details.push(...this.equipmentComparisonLines(item, this.equippedItemForSlot(player, item.equipment.slot)));
    const consumable = [];
    if (item.consumable?.hp) consumable.push(`${item.consumable.hp} HP`);
    if (item.consumable?.mana) consumable.push(`${item.consumable.mana} Energy`);
    if (consumable.length) details.push(`Restores: ${consumable.join(", ")}.`);
    return details.join(" ");
  }

  private equippedItemForSlot(player: PlayerRecord, slot: EquipmentSlot) {
    const itemId = player.equipment[slot];
    return itemId ? this.world.items.get(itemId) : undefined;
  }

  private equipmentComparisonLines(item: ItemDefinition, previous?: ItemDefinition) {
    if (!item.equipment) return [];
    if (previous?.id === item.id) return [`Currently equipped in your ${item.equipment.slot} slot.`];
    const newBonuses = this.statBonusLabels(item.equipment.statBonuses);
    const oldBonuses = previous?.equipment ? this.statBonusLabels(previous.equipment.statBonuses) : [];
    const lines = [
      `Equipped ${item.equipment.slot}: ${previous ? `${previous.name} (${oldBonuses.join(", ") || "no bonuses"})` : "nothing"}.`,
      `New item: ${item.name} (${newBonuses.join(", ") || "no bonuses"}).`
    ];
    const delta = this.statDeltaLabels(previous?.equipment?.statBonuses ?? {}, item.equipment.statBonuses);
    if (delta.length) lines.push(`Change: ${delta.join(", ")}.`);
    return lines;
  }

  private statBonusLabels(bonuses: Partial<PlayerStats>) {
    return Object.entries(bonuses)
      .filter((entry): entry is [string, number] => Boolean(entry[1]))
      .map(([stat, value]) => `${value > 0 ? "+" : ""}${value} ${this.characterConfig.statName(stat)}`);
  }

  private statDeltaLabels(previous: Partial<PlayerStats>, next: Partial<PlayerStats>) {
    const statIds = new Set([...Object.keys(previous), ...Object.keys(next)]);
    return [...statIds]
      .map((statId) => {
        const delta = (next[statId] ?? 0) - (previous[statId] ?? 0);
        return delta ? `${delta > 0 ? "+" : ""}${delta} ${this.characterConfig.statName(statId)}` : undefined;
      })
      .filter((label): label is string => Boolean(label));
  }

  private findMerchant(roomId: string, query: string) {
    const npcs = this.combat.activeRoomNpcs(roomId);
    const merchantNpcs = npcs.filter((npc) => npc.merchant);
    const npc = query ? merchantNpcs.find((candidate) => matchesNpc(candidate, query)) : merchantNpcs[0];
    return npc?.merchant ? { npc, merchant: npc.merchant } : undefined;
  }

  private buyPrice(item: ItemDefinition, merchant: MerchantDefinition) {
    return Math.max(1, Math.ceil((item.value ?? 1) * merchant.markup));
  }

  private sellPrice(item: ItemDefinition, merchant: MerchantDefinition) {
    return Math.max(1, Math.floor((item.value ?? 1) * merchant.markdown));
  }

  private unlockedSkills(player: PlayerRecord) {
    return this.characterConfig.jobDefinition(player.job).skills.filter((skill) => skill.level <= player.level);
  }

  private lockedSkills(player: PlayerRecord) {
    return this.characterConfig.jobDefinition(player.job).skills.filter((skill) => skill.level > player.level);
  }

  private effectiveStats(player: PlayerRecord): PlayerStats {
    const stats = this.characterConfig.leveledStats(player.stats, player.species, player.job, player.level);
    for (const [, item] of this.equipmentItems(player)) {
      for (const [stat, bonus] of Object.entries(item.equipment?.statBonuses ?? {})) {
        stats[stat] = (stats[stat] ?? 0) + (bonus ?? 0);
      }
    }
    return stats;
  }

  private reconcileDerivedVitals(player: PlayerRecord) {
    const stats = this.effectiveStats(player);
    const binderBonus = binderBonusesForCount(player.binderCards.length);
    const nextMaxHp = this.characterConfig.maxHpForStats(stats) + binderBonus.maxHp;
    const nextMaxMana = this.characterConfig.maxManaForStats(stats) + binderBonus.maxMana;
    if (player.maxHp === nextMaxHp && player.maxMana === nextMaxMana && player.hp <= nextMaxHp && player.mana <= nextMaxMana) return;
    player.maxHp = nextMaxHp;
    player.maxMana = nextMaxMana;
    player.hp = Math.min(player.hp, player.maxHp);
    player.mana = Math.min(player.mana, player.maxMana);
    this.store.savePlayer(player);
  }

  private awardBinderPageTitles(player: PlayerRecord) {
    const lines: string[] = [];
    for (const page of binderPageProgress(this.world, player)) {
      if (!page.complete) continue;
      const title = binderPageTitles[page.page] ?? `${page.page} Archivist`;
      if (player.titles.includes(title)) continue;
      player.titles.push(title);
      lines.push(`Collection page complete: ${page.page}. Title earned: ${title}.`);
    }
    if (lines.length) this.store.savePlayer(player);
    return lines;
  }
}

function splitTradeQuery(query: string, separator: "from" | "to") {
  const normalized = cleanCommandQuery(query);
  const pattern = new RegExp(`^(.+?)\\s+${separator}\\s+(.+)$`, "i");
  const match = normalized.match(pattern);
  return {
    itemQuery: cleanCommandQuery(match ? match[1] : normalized),
    merchantQuery: cleanCommandQuery(match ? match[2] : "")
  };
}

function resolvePlayersInRoom(provider: PlayerPresenceProvider) {
  return typeof provider === "function" ? provider() : provider;
}

function firstPersonEmote(action: string) {
  return action.replace(/^([A-Za-z]+)s(\b)/, "$1$2");
}

function npcRoomLabel(npc: NpcDefinition) {
  if (npc.disposition === "friendly") return `${npc.name} (friendly)`;
  if (npc.behavior?.autoEngage) return `${npc.name} (hostile, attacks on sight)`;
  if (npc.disposition === "hostile") return `${npc.name} (hostile)`;
  return `${npc.name} (runaway)`;
}

function npcDispositionLine(npc: NpcDefinition) {
  if (npc.disposition === "friendly") return "They do not seem like an enemy.";
  if (npc.behavior?.autoEngage) return "They are hostile and may attack on sight.";
  if (npc.disposition === "hostile") return "They are hostile and ready to fight.";
  return "They are a runaway card monster and can be challenged.";
}

function playerPresenceLabel(presence: PlayerPresence) {
  const title = presence.titles[0] ? ` - ${presence.titles[0]}` : "";
  return `${presence.name} (${presence.jobName}${title})`;
}

function triggerMatchesStep(expected: QuestTrigger, actual: QuestTrigger) {
  return (
    expected.type === actual.type &&
    (!actual.npcId || expected.npcId === actual.npcId) &&
    (!actual.topic || expected.topic?.toLowerCase() === actual.topic.toLowerCase()) &&
    (!actual.itemId || expected.itemId === actual.itemId) &&
    (!actual.roomId || expected.roomId === actual.roomId) &&
    (!actual.doorId || expected.doorId === actual.doorId)
  );
}

function formatQuestList(quests: QuestDefinition[]) {
  const names = [...new Set(quests.map((quest) => quest.name))];
  if (names.length <= 1) return names[0] ?? "the right quest";
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

function binderBonusesForCount(count: number): BinderBonus {
  return binderMilestones.reduce(
    (bonus, milestone) => {
      if (count < milestone.count) return bonus;
      return {
        maxHp: bonus.maxHp + milestone.bonus.maxHp,
        maxMana: bonus.maxMana + milestone.bonus.maxMana
      };
    },
    { maxHp: 0, maxMana: 0 }
  );
}

function binderProgressSummary(count: number) {
  const activeNames = binderMilestones.filter((milestone) => count >= milestone.count).map((milestone) => milestone.name);
  if (!activeNames.length) return "no milestone active yet";
  return `${activeNames.join(", ")} active; ${binderBonusText(binderBonusesForCount(count))}`;
}

function binderBonusText(bonus: BinderBonus) {
  const parts = [];
  if (bonus.maxHp) parts.push(`+${bonus.maxHp} max HP`);
  if (bonus.maxMana) parts.push(`+${bonus.maxMana} max Energy`);
  return parts.join(", ") || "no bonus";
}

function binderMilestoneLines(count: number) {
  return binderMilestones.map((milestone) => {
    const state = count >= milestone.count ? "active" : `locked at ${milestone.count}`;
    return `- ${milestone.name} (${state}): ${milestone.description}.`;
  });
}

function binderCardInfo(world: World, cardId: string): BinderCardInfo {
  const npc = world.npcs.get(cardId);
  if (!npc) {
    return {
      id: cardId,
      name: cardId,
      page: "Cardbound City Page",
      rarity: "common",
    flavor: "A mystery card print with a smudged nameplate."
    };
  }
  return {
    id: npc.id,
    name: npc.name,
    page: npc.card?.page || binderPageForNpc(npc),
    rarity: npc.card?.rarity ?? binderRarityForNpc(npc),
    flavor: npc.card?.flavor || firstSentence(npc.description)
  };
}

function groupBinderCards(cards: BinderCardInfo[]) {
  const pages = new Map<string, BinderCardInfo[]>();
  for (const card of cards) {
    pages.set(card.page, [...(pages.get(card.page) ?? []), card]);
  }
  return [...pages.entries()]
    .map(([page, pageCards]) => [page, pageCards.sort((a, b) => a.name.localeCompare(b.name))] as [string, BinderCardInfo[]])
    .sort(([pageA], [pageB]) => binderPageRank(pageA) - binderPageRank(pageB) || pageA.localeCompare(pageB));
}

function binderPageRank(page: string) {
  const rank = binderPageOrder.indexOf(page);
  return rank === -1 ? binderPageOrder.length : rank;
}

function binderPageForNpc(npc: NpcDefinition) {
  const text = `${npc.id} ${npc.name} ${npc.species} ${npc.description}`.toLowerCase();
  if (npc.card?.variant || npc.card?.event) return "Event Page";
  if (text.includes("finale") || text.includes("titan")) return "Finale Page";
  if (text.includes("duel") || text.includes("topdeck")) return "Duel Monsters Page";
  if (text.includes("pocket") || text.includes("companion") || text.includes("pokemon")) return "Pokemon Page";
  if (text.includes("mana") || text.includes("spell") || text.includes("forecast") || text.includes("weather") || text.includes("magic")) return "Magic Page";
  if (text.includes("frame") || text.includes("mecha") || text.includes("tutorial prop") || text.includes("gundam") || text.includes("gunpla")) return "Gundam Page";
  if (text.includes("captain") || text.includes("harbor") || text.includes("pier") || text.includes("rubber-band") || text.includes("straw hat")) return "One Piece Page";
  if (text.includes("coupon") || text.includes("snack") || text.includes("bulk rare")) return "Prize Page";
  if (text.includes("arcade") || text.includes("pixel")) return "Arcade Page";
  if (text.includes("crossover") || text.includes("rule collision") || text.includes("genre") || text.includes("union arena")) return "Union Arena Page";
  return "Cardbound City Page";
}

function binderRarityForNpc(npc: NpcDefinition): BinderCardInfo["rarity"] {
  const score = npc.hp + npc.combat.xp + npc.combat.tickets * 2;
  if (npc.id.includes("titan") || score >= 110) return "showcase";
  if (score >= 70) return "rare";
  if (score >= 40) return "uncommon";
  return "common";
}

function firstSentence(value: string) {
  const sentence = value.trim().match(/^[^.!?]+[.!?]/)?.[0];
  return sentence ?? value.trim();
}

function rarityLabel(rarity: ItemRarity) {
  return {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    boss: "Boss Drop",
    promo: "Promo"
  }[rarity];
}

function binderPageProgress(world: World, player: PlayerRecord) {
  const collected = new Set(player.binderCards);
  const pageTotals = new Map<string, { page: string; total: number; collected: number }>();
  for (const npc of world.npcs.values()) {
    if (npc.disposition === "friendly") continue;
    const card = binderCardInfo(world, npc.id);
    const progress = pageTotals.get(card.page) ?? { page: card.page, total: 0, collected: 0 };
    progress.total += 1;
    if (collected.has(npc.id)) progress.collected += 1;
    pageTotals.set(card.page, progress);
  }
  return [...pageTotals.values()]
    .map((page) => ({ ...page, complete: page.total > 0 && page.collected >= page.total }))
    .sort((pageA, pageB) => binderPageRank(pageA.page) - binderPageRank(pageB.page) || pageA.page.localeCompare(pageB.page));
}

function resolveBinderPage(query: string, pages: { page: string }[]) {
  const normalized = cleanCommandQuery(query).replace(/\s+page$/i, "");
  return pages.find((page) => {
    const pageName = cleanCommandQuery(page.page);
    const shortName = pageName.replace(/\s+page$/i, "");
    return pageName === normalized || shortName === normalized || pageName.includes(normalized);
  })?.page;
}

function cleanCommandQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(?:to|at|the|a|an|about)\s+/i, "")
    .replace(/\s+(?:to|at|the|a|an)$/i, "")
    .trim();
}

function normalizeAskInput(input: string, npcNames: string[]) {
  const cleaned = input.trim().replace(/^(?:to|at)\s+/i, "");
  let match = cleaned.match(/^(.+?)\s+about\s+(.+)$/i);
  if (match) return { npc: cleanCommandQuery(match[1]), topic: cleanCommandQuery(match[2]) };

  match = cleaned.match(/^about\s+(.+)$/i);
  if (match && npcNames.length === 1) return { npc: npcNames[0], topic: cleanCommandQuery(match[1]) };

  const normalized = cleanCommandQuery(cleaned);
  const npc = npcNames
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((name) => normalized === cleanCommandQuery(name) || normalized.startsWith(`${cleanCommandQuery(name)} `));
  if (!npc) return undefined;
  return { npc, topic: cleanCommandQuery(normalized.slice(cleanCommandQuery(npc).length)) };
}

function cleanRespawns(respawns: Record<string, number[]>) {
  return Object.fromEntries(Object.entries(respawns).filter(([, times]) => times.length));
}

function removeOne(values: string[], value: string) {
  const index = values.indexOf(value);
  if (index === -1) return values;
  return [...values.slice(0, index), ...values.slice(index + 1)];
}
