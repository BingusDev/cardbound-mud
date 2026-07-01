import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { adminWorldView } from "../src/adminWorld.js";
import { CharacterConfig } from "../src/characterConfig.js";
import { Game } from "../src/game.js";
import { Store } from "../src/store.js";
import type { PlayerRecord, QuestDefinition, QuestTrigger } from "../src/types.js";
import { World } from "../src/world.js";

function testGame(t: TestContext, name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cardbound-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const characterConfig = CharacterConfig.load();
  const world = World.load();
  const store = new Store(characterConfig, path.join(dir, "cardbound.sqlite"));
  store.initializeRoomItems(world.rooms.values());
  store.initializeDoors(world.doors.values());
  const game = new Game(world, store, characterConfig);
  const player = store.findOrCreatePlayer(`Tester ${name}`, world.defaultSpawnRoomId(), false);
  return { game, player, store, world, dir };
}

test("world loads and builder validation is clean", () => {
  const world = World.load();
  const validation = adminWorldView().validation;

  assert.equal(world.rooms.size, 22);
  assert.equal(world.quests.size, 6);
  assert.equal(world.items.size, 20);
  assert.equal(world.npcs.size, 33);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
});

test("quest pickup items are gated until their quest has started", (t) => {
  const { game, player } = testGame(t, "quest-gate");

  game.runCommand(player, "north", []);
  const blocked = game.runCommand(player, "take the sleeve key", []);

  assert.match(blocked.lines.join("\n"), /Starter Deck Panic has not begun yet/i);
  assert.match(blocked.lines.join("\n"), /ask Marshal Echo about key/i);
  assert.equal(player.inventory.includes("sleeve-key"), false);
});

test("quest doors are gated until their quest has started", (t) => {
  const { game, player, store } = testGame(t, "door-gate");
  player.inventory.push("sleeve-key");
  player.roomId = "mall-gate";
  store.savePlayer(player);

  const blocked = game.runCommand(player, "use sleeve key", []);

  assert.match(blocked.lines.join("\n"), /Starter Deck Panic has not begun yet/i);
  assert.match(blocked.lines.join("\n"), /ask Marshal Echo about key/i);
});

test("future quest items point to prerequisites instead of unusable starts", (t) => {
  const { game, player, store, world } = testGame(t, "future-gate");

  movePlayerToItem(player, store, world, "prism-shard");
  const blocked = game.runCommand(player, "take prism shard", []);

  assert.match(blocked.lines.join("\n"), /Mana Leak Mayhem is tied to later work/i);
  assert.match(blocked.lines.join("\n"), /Park Roundup/i);
});

test("look shows available quest starts in the current room", (t) => {
  const { game, player } = testGame(t, "quest-hints");

  const look = game.runCommand(player, "look", []);

  assert.match(look.lines.join("\n"), /Work to begin here:/);
  assert.match(look.lines.join("\n"), /Starter Deck Panic/);
  assert.match(look.lines.join("\n"), /Ask Marshal Echo about key/);
});

test("starting Starter Deck Panic permits the key and records progress", (t) => {
  const { game, player, store } = testGame(t, "brass-key");

  const start = game.runCommand(player, "ask Marshal Echo about key", []);
  assert.match(start.lines.join("\n"), /Quest started: Starter Deck Panic/i);

  game.runCommand(player, "north", []);
  const take = game.runCommand(player, "take the sleeve key", []);

  assert.match(take.lines.join("\n"), /You take the sleeve key/i);
  assert.equal(player.inventory.includes("sleeve-key"), true);
  assert.deepEqual(store.getQuestRecord(player.id, "starter-deck-panic")?.completedSteps.includes("take-sleeve-key"), true);
});

test("taking one item copy does not schedule a respawn while another spawned copy remains", (t) => {
  const { game, player, store } = testGame(t, "duplicate-item-take");

  player.roomId = "binder-square";
  store.savePlayer(player);
  store.setRoomItems("binder-square", ["foil-snack", "foil-snack"]);
  store.setRoomItemRespawns("binder-square", {});

  const take = game.runCommand(player, "take foil snack", []);

  assert.match(take.lines.join("\n"), /You take the foil snack/i);
  assert.deepEqual(store.getRoomItems("binder-square"), ["foil-snack"]);
  assert.deepEqual(store.getRoomItemRespawns("binder-square"), {});
});

test("starting a quest retro-credits already satisfied steps", (t) => {
  const { game, player, store } = testGame(t, "retro-credit");

  player.inventory.push("sleeve-key");
  store.savePlayer(player);
  store.setDoorState({ playerId: player.id, doorId: "sleeve-turnstile", isLocked: false, isOpen: true });

  const start = game.runCommand(player, "ask Marshal Echo about key", []);
  const completed = store.getQuestRecord(player.id, "starter-deck-panic")?.completedSteps ?? [];

  assert.match(start.lines.join("\n"), /Quest started: Starter Deck Panic/i);
  assert.equal(completed.includes("take-sleeve-key"), true);
  assert.equal(completed.includes("unlock-sleeve-turnstile"), true);
  assert.equal(completed.includes("open-sleeve-turnstile"), true);
  assert.equal(completed.includes("reach-main-concourse"), false);
});

test("use key opens a matching nearby quest door after the quest is active", (t) => {
  const { game, player, store } = testGame(t, "use-key");

  game.runCommand(player, "ask Marshal Echo about key", []);
  game.runCommand(player, "north", []);
  game.runCommand(player, "take sleeve key", []);
  player.roomId = "mall-gate";
  store.savePlayer(player);

  const used = game.runCommand(player, "use sleeve key", []);
  const door = World.load().door("sleeve-turnstile");
  const state = store.getDoorState(player.id, door);

  assert.match(used.lines.join("\n"), /unlock and open sleeve turnstile/i);
  assert.equal(state.isLocked, false);
  assert.equal(state.isOpen, true);
});

test("all quests can complete in sequence", (t) => {
  const { game, player, store, world } = testGame(t, "quest-chain");
  const questIds = [
    "starter-deck-panic",
    "citywide-signal",
    "park-roundup",
    "mana-leak-mayhem",
    "frame-bay-havoc",
    "crossover-calamity"
  ];

  for (const questId of questIds) {
    const quest = world.quests.get(questId);
    assert.ok(quest, `Missing quest ${questId}`);
    runQuestTrigger(game, player, store, world, quest.startsOn);

    for (const step of quest.steps) {
      if (store.getQuestRecord(player.id, quest.id)?.completedSteps.includes(step.id)) continue;
      runQuestTrigger(game, player, store, world, step.trigger);
    }

    const record = store.getQuestRecord(player.id, quest.id);
    assert.equal(record?.status, "completed", `${quest.name} should complete`);
    assert.deepEqual(record?.completedSteps.sort(), quest.steps.map((step) => step.id).sort(), `${quest.name} should record every step`);
  }
});

test("say and emote commands produce room echoes", (t) => {
  const { game, player } = testGame(t, "roleplay");

  const say = game.runCommand(player, "say Hello there", []);
  const emote = game.runCommand(player, "/me waves", []);

  assert.deepEqual(say.lines, ['You say, "Hello there"']);
  assert.equal(say.roomEcho, `${player.name} says, "Hello there"`);
  assert.deepEqual(emote.lines, ["You wave."]);
  assert.equal(emote.roomEcho, `${player.name} waves.`);
});

test("players can set descriptions and inspect each other", (t) => {
  const { game, player, store } = testGame(t, "roleplay-look");
  const other = store.findOrCreatePlayer("Road Friend", player.roomId, false);
  other.description = "A bright-eyed traveler with a mud-stained cloak.";
  store.savePlayer(other);

  const describe = game.runCommand(player, "describe me A careful duelist with a backpack.", []);
  const look = game.runCommand(player, "look Road Friend", [
    {
      name: other.name,
      speciesName: "Cardbound",
      jobName: "Duel Architect",
      titles: [],
      description: other.description
    }
  ]);
  const who = game.runCommand(player, "who", [
    {
      name: other.name,
      speciesName: "Cardbound",
      jobName: "Duel Architect",
      titles: [],
      description: other.description
    }
  ]);

  assert.match(describe.lines.join("\n"), /Your description is set/);
  assert.equal(player.description, "A careful duelist with a backpack.");
  assert.match(look.lines.join("\n"), /bright-eyed traveler/);
  assert.match(who.lines.join("\n"), /Road Friend/);
});

test("room listings include inspectable player labels", (t) => {
  const { game, player } = testGame(t, "room-presence");

  const look = game.runCommand(player, "look", [
    {
      name: "Road Friend",
      speciesName: "Cardbound",
      jobName: "Duel Architect",
      titles: ["Sleeve Runner"],
      description: "A traveler."
    }
  ]);

  assert.match(look.lines.join("\n"), /Also here: Road Friend \(Duel Architect - Sleeve Runner\)/);
});

test("inventory full includes item descriptions", (t) => {
  const { game, player } = testGame(t, "inventory");

  game.runCommand(player, "north", []);
  game.runCommand(player, "take duel disk holster", []);
  const inventory = game.runCommand(player, "inventory full", []);

  assert.match(inventory.lines.join("\n"), /duel disk holster:/);
  assert.match(inventory.lines.join("\n"), /Type: equipment/i);
});

test("cardbound combat verbs strike, break, and recover are accepted", (t) => {
  const { game, player, store, world } = testGame(t, "combat-verbs");

  movePlayerToNpc(player, store, world, "rogue-topdeck");
  const strike = game.runCommand(player, "strike rogue topdeck", []);
  assert.match(strike.lines.join("\n"), /You engage Rogue Topdeck|You strike Rogue Topdeck/i);

  const brokeAway = game.runCommand(player, "break", []);
  assert.doesNotMatch(brokeAway.lines.join("\n"), /Unknown command/i);
  assert.match(game.runCommand(player, "combat", []).lines.join("\n"), /You are not in combat/i);

  player.hp = Math.max(1, player.maxHp - 3);
  store.savePlayer(player);
  const recover = game.runCommand(player, "recover", []);
  assert.match(recover.lines.join("\n"), /recover/i);
});

test("each level 1 class can open combat against an early monster", (t) => {
  const characterConfig = CharacterConfig.load();

  for (const job of characterConfig.jobs) {
    const { game, player, store, world } = testGame(t, `class-combat-${job.id}`);
    player.job = job.id;
    player.stats = characterConfig.statsForSpecies(player.species);
    player.maxHp = characterConfig.maxHpForStats(player.stats);
    player.hp = player.maxHp;
    player.maxMana = characterConfig.maxManaForStats(player.stats);
    player.mana = player.maxMana;
    movePlayerToNpc(player, store, world, "rogue-topdeck");
    store.savePlayer(player);

    const result = game.runCommand(player, "strike rogue topdeck", []);
    assert.match(result.lines.join("\n"), /You engage Rogue Topdeck/i, `${job.name} should be able to start combat`);
    assert.ok(player.hp > 0, `${job.name} should survive opening combat`);
    assert.ok(player.mana >= 0, `${job.name} charge should remain valid`);
  }
});

test("defeated loose monsters are sleeved into the player binder", (t) => {
  const { game, player, store, world } = testGame(t, "binder-cards");

  movePlayerToNpc(player, store, world, "rogue-topdeck");
  player.stats = { ...player.stats, might: 99, grace: 99 };
  store.savePlayer(player);

  const lookBefore = game.runCommand(player, "look rogue topdeck", []);
  assert.match(lookBefore.lines.join("\n"), /Binder: not collected \(Duel Page, uncommon\)/i);

  const strike = game.runCommand(player, "strike rogue topdeck", []);
  assert.match(strike.lines.join("\n"), /Binder card added: Rogue Topdeck/i);
  assert.doesNotMatch(strike.lines.join("\n"), /Binder page complete: Duel Page/i);
  assert.equal(player.titles.includes("Duel Page Ace"), false);
  assert.deepEqual(player.binderCards, ["rogue-topdeck"]);

  movePlayerToNpc(player, store, world, "trapline-busker");
  const secondStrike = game.runCommand(player, "strike trapline busker", []);
  assert.match(secondStrike.lines.join("\n"), /Binder card added: Trapline Busker/i);
  assert.match(secondStrike.lines.join("\n"), /Binder page complete: Duel Page/i);
  assert.equal(player.titles.includes("Duel Page Ace"), true);

  const binder = game.runCommand(player, "binder", []);
  assert.match(binder.lines.join("\n"), /Binder cards \(2\): First Sleeve active; \+1 max charge/i);
  assert.match(binder.lines.join("\n"), /Duel Page:/i);
  assert.match(binder.lines.join("\n"), /Page chase:/i);
  assert.match(binder.lines.join("\n"), /Duel Page: complete, title Duel Page Ace/i);
  assert.match(binder.lines.join("\n"), /Rogue Topdeck/i);
  assert.match(binder.lines.join("\n"), /Page Starter \(locked at 3\)/i);

  const duelPage = game.runCommand(player, "binder duel", []);
  assert.match(duelPage.lines.join("\n"), /Duel Page:/i);
  assert.match(duelPage.lines.join("\n"), /Trapline Busker/i);
  assert.doesNotMatch(duelPage.lines.join("\n"), /Event Page:/i);
});

test("event variants announce their event binder chase", (t) => {
  const { game, player, store, world } = testGame(t, "event-binder");

  movePlayerToNpc(player, store, world, "holo-topdeck");
  player.stats = { ...player.stats, might: 99, grace: 99 };
  store.savePlayer(player);

  const strike = game.runCommand(player, "strike holo topdeck", []);
  assert.match(strike.lines.join("\n"), /Binder card added: Holo Topdeck/i);
  assert.match(strike.lines.join("\n"), /Event variant logged: Opening Night Foil/i);

  const eventPage = game.runCommand(player, "binder event", []);
  assert.match(eventPage.lines.join("\n"), /Event Page:/i);
  assert.match(eventPage.lines.join("\n"), /Holo Topdeck/i);
});

test("binder milestones increase derived vitals without changing base stats", (t) => {
  const { game, player, store } = testGame(t, "binder-bonuses");
  const baseMaxHp = player.maxHp;
  const baseMaxMana = player.maxMana;

  player.binderCards = ["rogue-topdeck", "snack-mimic", "coupon-knight"];
  store.savePlayer(player);

  const view = game.view(player, []);
  assert.equal(view.maxHp, baseMaxHp + 1);
  assert.equal(view.maxMana, baseMaxMana + 1);

  const profile = game.runCommand(player, "profile", []);
  assert.match(profile.lines.join("\n"), /First Sleeve, Page Starter active/i);
});

test("each zone has a fightable monster that can be sleeved", (t) => {
  const { game, player, store, world } = testGame(t, "zone-combat");
  const zonesWithCombat = new Set<string>();

  for (const zone of world.zones.values()) {
    const room = [...world.rooms.values()].find((candidate) => {
      if (candidate.zoneId !== zone.id) return false;
      return candidate.npcs.some((npcId) => {
        const npc = world.npcs.get(npcId);
        return npc && npc.disposition !== "friendly";
      });
    });
    assert.ok(room, `${zone.name} should have a fightable monster`);
    const npcId = room.npcs.find((candidate) => world.npcs.get(candidate)?.disposition !== "friendly");
    assert.ok(npcId, `${zone.name} should have a fightable NPC id`);
    const npc = world.npcs.get(npcId);
    assert.ok(npc, `${npcId} should exist`);

    player.roomId = room.id;
    player.stats = { ...player.stats, might: 99, grace: 99 };
    store.savePlayer(player);
    const result = game.runCommand(player, `strike ${npc.name}`, []);
    assert.match(result.lines.join("\n"), new RegExp(`Binder card added: ${escapeRegExp(npc.name)}`, "i"));
    zonesWithCombat.add(zone.id);
  }

  assert.equal(zonesWithCombat.size, world.zones.size);
});

function runQuestTrigger(game: Game, player: PlayerRecord, store: Store, world: World, trigger: QuestTrigger) {
  if (trigger.type === "ask" && trigger.npcId && trigger.topic) {
    movePlayerToNpc(player, store, world, trigger.npcId);
    const npc = world.npcs.get(trigger.npcId);
    assert.ok(npc, `Missing NPC ${trigger.npcId}`);
    const result = game.runCommand(player, `ask ${npc.name} about ${trigger.topic}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see them here|uncertain what you mean/i);
    return;
  }

  if (trigger.type === "talk" && trigger.npcId) {
    movePlayerToNpc(player, store, world, trigger.npcId);
    const npc = world.npcs.get(trigger.npcId);
    assert.ok(npc, `Missing NPC ${trigger.npcId}`);
    const result = game.runCommand(player, `talk ${npc.name}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see them here/i);
    return;
  }

  if (trigger.type === "take" && trigger.itemId) {
    movePlayerToItem(player, store, world, trigger.itemId);
    const item = world.items.get(trigger.itemId);
    assert.ok(item, `Missing item ${trigger.itemId}`);
    const result = game.runCommand(player, `take ${item.name}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see that here|has not begun yet/i);
    return;
  }

  if (trigger.type === "enterRoom" && trigger.roomId) {
    moveIntoRoom(game, player, store, world, trigger.roomId);
    return;
  }

  if ((trigger.type === "unlockDoor" || trigger.type === "openDoor") && trigger.doorId) {
    movePlayerToDoor(player, store, world, trigger.doorId);
    const door = world.door(trigger.doorId);
    const key = door.keyItemId ? world.items.get(door.keyItemId) : undefined;
    if (key && !player.inventory.includes(key.id)) player.inventory.push(key.id);
    store.savePlayer(player);
    const result = key ? game.runCommand(player, `use ${key.name}`, []) : game.runCommand(player, "open door", []);
    assert.doesNotMatch(result.lines.join("\n"), /has not begun yet|locked/i);
    return;
  }

  throw new Error(`Unsupported trigger ${JSON.stringify(trigger)}`);
}

function movePlayerToNpc(player: PlayerRecord, store: Store, world: World, npcId: string) {
  const room = [...world.rooms.values()].find((candidate) => candidate.npcs.includes(npcId));
  assert.ok(room, `NPC ${npcId} is not placed`);
  player.roomId = room.id;
  store.savePlayer(player);
}

function movePlayerToItem(player: PlayerRecord, store: Store, world: World, itemId: string) {
  const room = [...world.rooms.values()].find((candidate) => {
    return candidate.items.includes(itemId) || candidate.itemSpawns.some((spawn) => spawn.itemId === itemId);
  });
  assert.ok(room, `Item ${itemId} is not placed`);
  player.roomId = room.id;
  store.savePlayer(player);
}

function movePlayerToDoor(player: PlayerRecord, store: Store, world: World, doorId: string) {
  const room = [...world.rooms.values()].find((candidate) => Object.values(candidate.exits).some((exit) => exit?.doorId === doorId));
  assert.ok(room, `Door ${doorId} is not reachable`);
  player.roomId = room.id;
  store.savePlayer(player);
}

function moveIntoRoom(game: Game, player: PlayerRecord, store: Store, world: World, roomId: string) {
  const entry = [...world.rooms.values()]
    .flatMap((room) => Object.entries(room.exits).map(([direction, exit]) => ({ room, direction, exit })))
    .find(({ exit }) => exit?.to === roomId);
  assert.ok(entry, `No entrance found for ${roomId}`);
  player.roomId = entry.room.id;
  store.savePlayer(player);
  const result = game.runCommand(player, entry.direction, []);
  assert.doesNotMatch(result.lines.join("\n"), /cannot travel|locked|closed|need .+ before/i);
  assert.equal(player.roomId, roomId);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
