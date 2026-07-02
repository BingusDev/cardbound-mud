import { CharacterConfig } from "./characterConfig.js";
import { awardXp } from "./progressionSystem.js";
import { Store } from "./store.js";
import type { CombatView, DamageFormula, NpcDefinition, PlayerRecord, PlayerStats, SkillDefinition, SkillEffectDefinition } from "./types.js";
import { World } from "./world.js";
import { formatSeconds, matchesNpc, normalizeName, randomInt } from "./gameUtils.js";

interface CombatantState {
  hp: number;
  defeatedUntil?: number;
  despawnAt?: number;
}

interface CombatState {
  playerId: number;
  roomId: string;
  npcId: string;
  npcInstanceKey: string;
  nextPlayerAttackAt: number;
  nextNpcAttackAt: number;
}

interface GuardState {
  amount: number;
  charges: number;
}

interface RestState {
  nextManaAt: number;
  nextHpAt: number;
}

interface RollResult {
  amount: number;
  critical: boolean;
}

export interface CombatTickEvent {
  playerId?: number;
  roomId: string;
  lines: string[];
  roomLines?: string[];
  ended?: boolean;
}

export class CombatSystem {
  private readonly combats = new Map<number, CombatState>();
  private readonly npcStates = new Map<string, CombatantState>();
  private readonly nextPlayerRecoveryAt = new Map<number, number>();
  private readonly nextNpcSpawnAt = new Map<string, number>();
  private readonly playerGuards = new Map<number, GuardState>();
  private readonly resting = new Map<number, RestState>();

  constructor(
    private readonly world: World,
    private readonly store: Store,
    private readonly characterConfig: CharacterConfig,
    private readonly playerStats: (player: PlayerRecord) => PlayerStats = (player) => player.stats
  ) {}

  isInCombat(player: PlayerRecord) {
    return this.combats.has(player.id);
  }

  isResting(player: PlayerRecord) {
    return this.resting.has(player.id);
  }

  startResting(player: PlayerRecord, now = Date.now()) {
    if (this.isDead(player, now)) return ["You are inside the Life Point safety field between scenes. You cannot recover yet."];
    if (this.isInCombat(player)) return ["You cannot recover while a duel is active."];
    if (player.hp >= player.maxHp && player.mana >= player.maxMana) return ["You are already fully recovered."];

    const alreadyResting = this.resting.has(player.id);
    this.resting.set(player.id, {
      nextManaAt: now + this.restManaIntervalMs(player),
      nextHpAt: now + this.restHpIntervalMs(player)
    });

    if (alreadyResting) return ["You settle back into recovery."];
    if (this.isSanctuary(player.roomId)) return ["You settle near the checkpoint lights and recover."];
    return ["You take a breather and recover."];
  }

  stopResting(player: PlayerRecord) {
    if (!this.resting.delete(player.id)) return [];
    return ["You stop recovering."];
  }

  isDead(player: PlayerRecord, now = Date.now()) {
    return Boolean(player.deadUntil && player.deadUntil > now);
  }

  resolveDeath(player: PlayerRecord, now: number) {
    if (!player.deadUntil || player.deadUntil > now) return [];

    const sanctuary = this.world.rooms.has(player.sanctuaryRoomId) ? player.sanctuaryRoomId : this.world.defaultSpawnRoomId();
    player.deadUntil = undefined;
    player.roomId = sanctuary;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    this.store.savePlayer(player);
    const room = this.world.room(player.roomId);
    return [`The Life Point safety field sets you back at ${room.name}. You are shaken, but whole.`];
  }

  updateSanctuary(player: PlayerRecord) {
    const room = this.world.room(player.roomId);
    if (room.tags.includes("sanctuary") || room.tags.includes("checkpoint")) player.sanctuaryRoomId = room.id;
  }

  activeRoomNpcs(roomId: string) {
    const now = Date.now();
    return this.world.roomNpcs(this.world.room(roomId)).filter((npc) => {
      return this.activeNpcInstanceKeys(roomId, npc.id, now).length > 0;
    });
  }

  findNpcInRoom(roomId: string, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return undefined;
    return this.activeRoomNpcs(roomId).find((npc) => matchesNpc(npc, normalized));
  }

  tick(players: PlayerRecord[], now = Date.now()): CombatTickEvent[] {
    const playersById = new Map(players.map((player) => [player.id, player]));
    const events: CombatTickEvent[] = this.reconcileRoomNpcSpawns(players, now);
    events.push(...this.respawnNpcs(now));

    for (const player of players) {
      const lines = this.resolveDeath(player, now);
      if (lines.length) events.push({ playerId: player.id, roomId: player.roomId, lines, ended: true });
    }

    for (const [playerId, combat] of [...this.combats.entries()]) {
      const player = playersById.get(playerId);
      const npc = this.world.npcs.get(combat.npcId);
      if (!player || !npc) {
        this.combats.delete(playerId);
        this.nextPlayerRecoveryAt.delete(playerId);
        this.playerGuards.delete(playerId);
        if (player) this.resting.delete(player.id);
        continue;
      }

      const npcState = this.npcState(combat.roomId, combat.npcId, combat.npcInstanceKey);
      const lines: string[] = [];
      const roomLines: string[] = [];

      if (this.isDead(player, now)) {
        this.combats.delete(playerId);
        this.playerGuards.delete(playerId);
        this.resting.delete(playerId);
        continue;
      }

      if (player.roomId !== combat.roomId) {
        lines.push("You are no longer close enough to keep fighting.");
        this.combats.delete(playerId);
        this.nextPlayerRecoveryAt.set(playerId, now + this.recoveryIntervalMs());
        this.playerGuards.delete(playerId);
        this.resting.delete(playerId);
        events.push({ playerId, roomId: combat.roomId, lines, ended: true });
        continue;
      }

      if (npcState.defeatedUntil && npcState.defeatedUntil > now) {
        lines.push(`${npc.name} is already defeated.`);
        this.combats.delete(playerId);
        this.nextPlayerRecoveryAt.set(playerId, now + this.recoveryIntervalMs());
        this.playerGuards.delete(playerId);
        this.resting.delete(playerId);
        events.push({ playerId, roomId: combat.roomId, lines, ended: true });
        continue;
      }

      if (now >= combat.nextNpcAttackAt) {
        const { amount: incomingDamage, critical } = this.npcDamage(npc);
        const { damage, guardLine } = this.applyGuard(player, incomingDamage);
        player.hp = Math.max(0, player.hp - damage);
        if (guardLine) lines.push(guardLine);
        lines.push(`${npc.name}'s ${npc.combat.attackName} hits you for ${damage} damage.${critical ? " Critical!" : ""}`);
        roomLines.push(`${npc.name} catches ${player.name} with ${npc.combat.attackName}.`);
        combat.nextNpcAttackAt = now + this.attackCooldownMs(npc.stats.grace ?? 8);

        if (player.hp <= 0) {
          this.combats.delete(playerId);
          this.nextPlayerRecoveryAt.delete(playerId);
          this.playerGuards.delete(playerId);
          this.resting.delete(playerId);
          player.deadUntil = now + this.characterConfig.combat.deathRespawnSeconds * 1000;
          player.hp = 0;
          this.store.savePlayer(player);
          lines.push(`The Life Point safety field catches you before the knockout can stick. You will wake at your checkpoint in ${formatSeconds(this.characterConfig.combat.deathRespawnSeconds * 1000)}.`);
          roomLines.push(`${player.name} falls, then vanishes in a flash of Life Point light.`);
          events.push({ playerId, roomId: combat.roomId, lines, roomLines, ended: true });
          continue;
        }

        this.store.savePlayer(player);
      }

      if (lines.length) events.push({ playerId, roomId: combat.roomId, lines, roomLines });
    }

    events.push(...this.recoverPlayersOutsideCombat(players, now));
    events.push(...this.recoverRestingPlayers(players, now));
    return events;
  }

  attack(player: PlayerRecord, query: string) {
    this.resting.delete(player.id);
    const existingCombat = this.combats.get(player.id);
    if (existingCombat) {
      const npc = this.world.npcs.get(existingCombat.npcId);
      if (!npc) {
        this.combats.delete(player.id);
        return ["Your opponent is gone."];
      }
      if (query && !matchesNpc(npc, query)) return [`You are already fighting ${npc.name}.`];
      return this.performPlayerAttack(player, existingCombat, Date.now());
    }

    if (!query) return ["Attack what? Try attack <npc> or duel <npc>."];

    const npc = this.findNpcInRoom(player.roomId, query);
    if (!npc) return ["You do not see that target here."];
    if (npc.disposition === "friendly") return [`${npc.name} is not your enemy.`];

    const npcInstanceKey = this.availableNpcInstanceKey(player.roomId, npc.id, Date.now());
    if (!npcInstanceKey) return [`${npc.name} is already occupied. Give the room a moment to breathe.`];

    const npcState = this.npcState(player.roomId, npc.id, npcInstanceKey);
    if (npcState.defeatedUntil && npcState.defeatedUntil > Date.now()) return [`${npc.name} is not in any shape to fight right now.`];

    const now = Date.now();
    const combat = {
      playerId: player.id,
      roomId: player.roomId,
      npcId: npc.id,
      npcInstanceKey,
      nextPlayerAttackAt: now,
      nextNpcAttackAt: now + Math.floor(this.attackCooldownMs(npc.stats.grace ?? 8) / 2)
    };
    this.combats.set(player.id, combat);
    return [
      `You challenge ${npc.name} to a duel.`,
      `Your attack timing is ${formatSeconds(this.attackCooldownMs(this.playerStats(player).grace ?? 8))}; ${npc.name}'s is ${formatSeconds(this.attackCooldownMs(npc.stats.grace ?? 8))}.`,
      ...this.performPlayerAttack(player, combat, now)
    ];
  }

  autoEngage(player: PlayerRecord, now = Date.now()) {
    if (this.isInCombat(player) || this.isDead(player, now)) return [];
    const npc = this.activeRoomNpcs(player.roomId).find((candidate) => candidate.behavior?.autoEngage && candidate.disposition !== "friendly");
    if (!npc) return [];
    const npcInstanceKey = this.availableNpcInstanceKey(player.roomId, npc.id, now);
    if (!npcInstanceKey) return [];

    this.resting.delete(player.id);
    this.combats.set(player.id, {
      playerId: player.id,
      roomId: player.roomId,
      npcId: npc.id,
      npcInstanceKey,
      nextPlayerAttackAt: now,
      nextNpcAttackAt: now + Math.floor(this.attackCooldownMs(npc.stats.grace ?? 8) / 2)
    });
    return [`${npc.name} moves to block your path. You are in a duel.`];
  }

  useSkill(player: PlayerRecord, skill: SkillDefinition) {
    this.resting.delete(player.id);
    const combat = this.combats.get(player.id);
    if (skill.requiresCombat && !combat) return [`${skill.name} is a duel skill. Choose a target with attack <npc> first.`];
    if (!combat) return [`${skill.name} needs a target.`];
    const effects = skill.effects ?? (skill.effect ? [skill.effect] : []);
    if (!effects.length) return [`${skill.name} is still a training form.`];

    const now = Date.now();
    if (now < combat.nextPlayerAttackAt) return ["You're not done getting ready yet!"];
    if (player.mana < skill.manaCost) return [`You need ${skill.manaCost} Energy for ${skill.name}.`];

    const npc = this.world.npcs.get(combat.npcId);
    if (!npc) {
      this.combats.delete(player.id);
      return ["Your opponent is gone."];
    }

    const npcState = this.npcState(combat.roomId, combat.npcId, combat.npcInstanceKey, now);
    if (npcState.defeatedUntil && npcState.defeatedUntil > now) {
      this.combats.delete(player.id);
      return [`${npc.name} is already defeated.`];
    }

    player.mana = Math.max(0, player.mana - skill.manaCost);
    combat.nextPlayerAttackAt = now + skill.cooldownSeconds * 1000;
    const lines = this.applySkillEffects(player, combat, npc, npcState, effects, now);
    this.store.savePlayer(player);
    return lines;
  }

  findPlayerSkill(player: PlayerRecord, input: string) {
    const normalized = normalizeName(input);
    return this.characterConfig.jobDefinition(player.job).skills.find((skill) => {
      return skill.level <= player.level && (normalizeName(skill.id) === normalized || normalizeName(skill.name) === normalized);
    });
  }

  flee(player: PlayerRecord) {
    const combat = this.combats.get(player.id);
    if (!combat) return ["You are not in a duel."];
    this.combats.delete(player.id);
    this.playerGuards.delete(player.id);
    this.resting.delete(player.id);
    this.nextPlayerRecoveryAt.set(player.id, Date.now() + this.recoveryIntervalMs());
    const success = Math.random() < this.fleeChance(this.playerStats(player).grace ?? 8);
    if (success) return ["You run from the duel."];

    const npc = this.world.npcs.get(combat.npcId);
    if (!npc) return ["You stumble away from danger."];
    const damage = Math.max(1, Math.floor(this.npcDamage(npc).amount / 2));
    player.hp = Math.max(1, player.hp - damage);
    this.store.savePlayer(player);
    return [`You try to run, but ${npc.name} clips you for ${damage} damage before you get clear.`];
  }

  status(player: PlayerRecord) {
    const combat = this.combats.get(player.id);
    if (!combat) return ["You are not in a duel."];
    const npc = this.world.npcs.get(combat.npcId);
    if (!npc) return ["Your opponent is gone."];
    const state = this.npcState(combat.roomId, combat.npcId, combat.npcInstanceKey);
    const readyIn = Math.max(0, combat.nextPlayerAttackAt - Date.now());
    return [`Dueling ${npc.name}: ${state.hp}/${this.npcMaxHp(npc)} HP. Your HP: ${player.hp}/${player.maxHp}. Attack ${readyIn ? `ready in ${formatSeconds(readyIn)}` : "ready now"}.`];
  }

  view(player: PlayerRecord): CombatView {
    const serverNow = Date.now();
    if (this.isDead(player, serverNow)) {
      return {
        inCombat: false,
        isDead: true,
        serverNow,
        respawnAt: player.deadUntil
      };
    }

    const combat = this.combats.get(player.id);
    if (!combat) return { inCombat: false, isDead: false, serverNow };

    const npc = this.world.npcs.get(combat.npcId);
    return {
      inCombat: Boolean(npc),
      isDead: false,
      serverNow,
      targetName: npc?.name,
      nextPlayerReadyAt: combat.nextPlayerAttackAt,
      playerCooldownMs: this.attackCooldownMs(this.playerStats(player).grace ?? 8)
    };
  }

  private performPlayerAttack(player: PlayerRecord, combat: CombatState, now: number) {
    if (now < combat.nextPlayerAttackAt) return ["You're not done getting ready yet!"];

    const npc = this.world.npcs.get(combat.npcId);
    if (!npc) {
      this.combats.delete(player.id);
      return ["Your opponent is gone."];
    }

    const npcState = this.npcState(combat.roomId, combat.npcId, combat.npcInstanceKey, now);
    if (npcState.defeatedUntil && npcState.defeatedUntil > now) {
      this.combats.delete(player.id);
      return [`${npc.name} is already defeated.`];
    }

    const { amount: damage, critical } = this.playerDamage(player);
    combat.nextPlayerAttackAt = now + this.attackCooldownMs(this.playerStats(player).grace ?? 8);
    return this.damageNpc(player, combat, npc, npcState, damage, `You attack ${npc.name} for ${damage} damage.${critical ? " Critical!" : ""}`, now);
  }

  private damageNpc(
    player: PlayerRecord,
    combat: CombatState,
    npc: NpcDefinition,
    npcState: CombatantState,
    damage: number,
    hitLine: string,
    now: number,
    savePlayer = true
  ) {
    npcState.hp = Math.max(0, npcState.hp - damage);
    const lines = [hitLine];

    if (npcState.hp > 0) return lines;

    npcState.defeatedUntil = now + npc.combat.respawnSeconds * 1000;
    npcState.hp = this.npcMaxHp(npc);
    this.endCombatsWithNpc(combat.roomId, combat.npcId, combat.npcInstanceKey);
    lines.push(npc.combat.defeatMessage);

    if (npc.combat.xp > 0) {
      const reward = awardXp(player, npc.combat.xp, "combat", this.characterConfig);
      if (reward.amount > 0) lines.push(`Reward: ${reward.amount} XP.`);
      if (reward.leveledUp) lines.push(`Level up! You are now level ${reward.newLevel}.`);
    }

    if (npc.combat.tickets > 0) {
      player.tickets += npc.combat.tickets;
      lines.push(`Reward: ${npc.combat.tickets} Prize Tickets.`);
    }

    const binderLines = this.addBinderCard(player, npc);
    lines.push(...binderLines);

    const droppedItems = this.rollDrops(combat.roomId, npc);
    if (droppedItems.length) {
      lines.push(`${npc.name} leaves behind ${formatItemList(droppedItems)}.`);
    }

    if (savePlayer) this.store.savePlayer(player);
    return lines;
  }

  private addBinderCard(player: PlayerRecord, npc: NpcDefinition) {
    if (npc.disposition === "friendly") return [];
    if (player.binderCards.includes(npc.id)) return [];
    player.binderCards.push(npc.id);
    const lines = [`Collection card logged: ${npc.name}. Type binder to inspect the page.`];
    if (npc.card?.variant || npc.card?.event) {
      lines.push(`Secret Rare variant logged: ${npc.card.event ?? "Special Print"}. Try binder event to inspect the chase.`);
    }
    return lines;
  }

  private rollDrops(roomId: string, npc: NpcDefinition) {
    const drops: string[] = [];
    for (const drop of npc.combat.drops) {
      if (Math.random() > drop.chance) continue;
      for (let count = 0; count < drop.quantity; count += 1) drops.push(drop.itemId);
    }
    if (!drops.length) return [];

    const roomItems = this.store.getRoomItems(roomId);
    this.store.setRoomItems(roomId, [...roomItems, ...drops]);
    return drops.map((itemId) => this.world.items.get(itemId)?.name ?? itemId);
  }

  private applySkillEffects(
    player: PlayerRecord,
    combat: CombatState,
    npc: NpcDefinition,
    npcState: CombatantState,
    effects: SkillEffectDefinition[],
    now: number
  ) {
    const lines: string[] = [];

    for (const effect of effects) {
      if (effect.type === "damage") {
        if (npcState.hp <= 0) continue;
        const { amount: damage, critical } = this.rollPlayerDamage(this.playerStats(player), effect.formula);
        const line = this.renderEffectMessage(effect.message, npc.name, damage, 0, 0);
        lines.push(...this.damageNpc(player, combat, npc, npcState, damage, `${line}${critical ? " Critical!" : ""}`, now, false));
        if (npcState.defeatedUntil) break;
      }

      if (effect.type === "heal") {
        const { amount: healing, critical } = this.rollPlayerHealing(this.playerStats(player), effect.formula);
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + healing);
        const actualHealing = player.hp - before;
        if (actualHealing > 0) lines.push(`${this.renderEffectMessage(effect.message, npc.name, 0, actualHealing, 0)}${critical ? " Critical!" : ""}`);
      }

      if (effect.type === "guard") {
        this.playerGuards.set(player.id, {
          amount: Math.max(0, effect.amount),
          charges: Math.max(1, effect.charges)
        });
        lines.push(this.renderEffectMessage(effect.message, npc.name, 0, 0, effect.amount));
      }
    }

    return lines;
  }

  private applyGuard(player: PlayerRecord, incomingDamage: number) {
    const guard = this.playerGuards.get(player.id);
    if (!guard || guard.charges <= 0 || guard.amount <= 0) return { damage: incomingDamage };

    const prevented = Math.min(incomingDamage, guard.amount);
    guard.charges -= 1;
    if (guard.charges <= 0) this.playerGuards.delete(player.id);
    return {
      damage: Math.max(0, incomingDamage - prevented),
      guardLine: `Your guard turns aside ${prevented} damage.`
    };
  }

  private renderEffectMessage(message: string, targetName: string, damage: number, healing: number, guard: number) {
    return message
      .replaceAll("{target}", targetName)
      .replaceAll("{damage}", String(damage))
      .replaceAll("{healing}", String(healing))
      .replaceAll("{guard}", String(guard));
  }

  private npcState(roomId: string, npcId: string, instanceKey = this.npcInstanceKey(roomId, npcId, 0), now = Date.now()) {
    const key = instanceKey;
    const npc = this.world.npcs.get(npcId);
    if (!npc) throw new Error(`Missing NPC '${npcId}'.`);
    const existing = this.npcStates.get(key) ?? { hp: this.npcMaxHp(npc) };
    if (existing.defeatedUntil && existing.defeatedUntil <= now) {
      existing.defeatedUntil = undefined;
      existing.hp = this.npcMaxHp(npc);
    }
    this.npcStates.set(key, existing);
    return existing;
  }

  private activeNpcInstanceKeys(roomId: string, npcId: string, now = Date.now()) {
    return this.knownNpcInstanceKeys(roomId, npcId).filter((key) => {
      const state = this.npcState(roomId, npcId, key, now);
      return !state.defeatedUntil && (!state.despawnAt || state.despawnAt > now);
    });
  }

  private availableNpcInstanceKey(roomId: string, npcId: string, now = Date.now()) {
    const engaged = this.engagedNpcInstanceKeys(roomId, npcId);
    const active = this.activeNpcInstanceKeys(roomId, npcId, now);
    const available = active.find((key) => !engaged.has(key));
    if (available) {
      this.npcStates.get(available)!.despawnAt = undefined;
      return available;
    }

    if (active.length >= this.characterConfig.combat.npcMaxInstancesPerType) return undefined;
    return this.spawnNpcInstance(roomId, npcId, now);
  }

  private reconcileRoomNpcSpawns(players: PlayerRecord[], now: number): CombatTickEvent[] {
    const events: CombatTickEvent[] = [];
    const playersByRoom = new Map<string, number>();
    for (const player of players) playersByRoom.set(player.roomId, (playersByRoom.get(player.roomId) ?? 0) + 1);

    for (const room of this.world.rooms.values()) {
      const playerCount = playersByRoom.get(room.id) ?? 0;
      for (const npc of this.world.roomNpcs(room)) {
        if (npc.disposition === "friendly") continue;
        events.push(...this.cleanupDespawnedNpcInstances(room.id, npc, playerCount, now));

        const desired = this.desiredNpcInstances(playerCount);
        const active = this.activeNpcInstanceKeys(room.id, npc.id, now);
        const engaged = this.engagedNpcInstanceKeys(room.id, npc.id);

        if (active.length < desired) {
          const spawnKey = `${room.id}:${npc.id}`;
          const readyAt = this.nextNpcSpawnAt.get(spawnKey) ?? now + this.characterConfig.combat.npcSpawnSeconds * 1000;
          this.nextNpcSpawnAt.set(spawnKey, readyAt);
          if (now >= readyAt) {
            this.spawnNpcInstance(room.id, npc.id, now);
            this.nextNpcSpawnAt.set(spawnKey, now + this.characterConfig.combat.npcSpawnSeconds * 1000);
            if (playerCount > 0) {
              events.push({ roomId: room.id, lines: [], roomLines: [`${npc.name} stirs at the edge of the scene.`] });
            }
          }
        } else {
          this.nextNpcSpawnAt.delete(`${room.id}:${npc.id}`);
        }

        const refreshedActive = this.activeNpcInstanceKeys(room.id, npc.id, now);
        if (refreshedActive.length <= desired) {
          for (const key of refreshedActive) {
            const state = this.npcStates.get(key);
            if (state) state.despawnAt = undefined;
          }
          continue;
        }

        const removable = refreshedActive
          .filter((key) => !engaged.has(key) && this.npcInstanceIndex(key) > 0)
          .sort((a, b) => this.npcInstanceIndex(b) - this.npcInstanceIndex(a));
        const removeCount = Math.min(removable.length, refreshedActive.length - desired);
        for (const key of removable.slice(0, removeCount)) {
          const state = this.npcStates.get(key);
          if (!state) continue;
          if (this.characterConfig.combat.npcDespawnSeconds <= 0) {
            this.npcStates.delete(key);
            if (playerCount > 0) events.push({ roomId: room.id, lines: [], roomLines: [`${npc.name} slips back from the scene.`] });
            continue;
          }
          state.despawnAt ??= now + this.characterConfig.combat.npcDespawnSeconds * 1000;
          if (state.despawnAt <= now) {
            this.npcStates.delete(key);
            if (playerCount > 0) events.push({ roomId: room.id, lines: [], roomLines: [`${npc.name} slips back from the scene.`] });
          }
        }
      }
    }

    return events;
  }

  private desiredNpcInstances(playerCount: number) {
    const perInstance = Math.max(1, this.characterConfig.combat.npcPlayersPerInstance);
    return Math.min(this.characterConfig.combat.npcMaxInstancesPerType, Math.max(1, Math.ceil(playerCount / perInstance)));
  }

  private cleanupDespawnedNpcInstances(roomId: string, npc: NpcDefinition, playerCount: number, now: number) {
    const events: CombatTickEvent[] = [];
    for (const key of this.knownNpcInstanceKeys(roomId, npc.id)) {
      const state = this.npcStates.get(key);
      if (!state?.despawnAt || state.despawnAt > now) continue;
      this.npcStates.delete(key);
      if (playerCount > 0) events.push({ roomId, lines: [], roomLines: [`${npc.name} slips back from the scene.`] });
    }
    return events;
  }

  private spawnNpcInstance(roomId: string, npcId: string, now: number) {
    const npc = this.world.npcs.get(npcId);
    if (!npc) throw new Error(`Missing NPC '${npcId}'.`);
    for (let index = 0; index < this.characterConfig.combat.npcMaxInstancesPerType; index += 1) {
      const key = this.npcInstanceKey(roomId, npcId, index);
      const existing = this.npcStates.get(key);
      if (existing && !existing.defeatedUntil && !existing.despawnAt) continue;
      if (existing?.defeatedUntil && existing.defeatedUntil > now) continue;
      this.npcStates.set(key, { hp: this.npcMaxHp(npc) });
      return key;
    }
    return this.npcInstanceKey(roomId, npcId, 0);
  }

  private knownNpcInstanceKeys(roomId: string, npcId: string) {
    const baseKey = this.npcInstanceKey(roomId, npcId, 0);
    const prefix = `${roomId}:${npcId}:`;
    return [baseKey, ...[...this.npcStates.keys()].filter((key) => key.startsWith(prefix) && key !== baseKey)];
  }

  private engagedNpcInstanceKeys(roomId: string, npcId: string) {
    const engaged = new Set<string>();
    for (const combat of this.combats.values()) {
      if (combat.roomId === roomId && combat.npcId === npcId) engaged.add(combat.npcInstanceKey);
    }
    return engaged;
  }

  private npcInstanceKey(roomId: string, npcId: string, index: number) {
    return `${roomId}:${npcId}:${index}`;
  }

  private npcInstanceIndex(key: string) {
    return Number(key.split(":").at(-1) ?? 0);
  }

  private respawnNpcs(now: number): CombatTickEvent[] {
    const events: CombatTickEvent[] = [];
    for (const [key, state] of this.npcStates.entries()) {
      if (!state.defeatedUntil || state.defeatedUntil > now) continue;
      const [roomId, npcId] = key.split(":");
      const npc = this.world.npcs.get(npcId);
      if (!npc) continue;
      state.defeatedUntil = undefined;
      state.hp = this.npcMaxHp(npc);
      state.despawnAt = undefined;
      events.push({
        roomId,
        lines: [],
        roomLines: [`${npc.name} gathers itself and returns to the scene.`]
      });
    }
    return events;
  }

  private endCombatsWithNpc(roomId: string, npcId: string, npcInstanceKey: string) {
    const now = Date.now();
    for (const [playerId, combat] of this.combats.entries()) {
      if (combat.roomId === roomId && combat.npcId === npcId && combat.npcInstanceKey === npcInstanceKey) {
        this.combats.delete(playerId);
        this.nextPlayerRecoveryAt.set(playerId, now + this.recoveryIntervalMs());
        this.playerGuards.delete(playerId);
        this.resting.delete(playerId);
      }
    }
  }

  private attackCooldownMs(grace: number) {
    return Math.max(
      this.characterConfig.combat.minimumAttackCooldownMs,
      this.characterConfig.combat.baseAttackCooldownMs - grace * this.characterConfig.combat.graceCooldownReductionMs
    );
  }

  private fleeChance(grace: number) {
    return Math.min(
      this.characterConfig.combat.maximumFleeChance,
      Math.max(0, this.characterConfig.combat.baseFleeChance + grace * this.characterConfig.combat.graceFleeBonus)
    );
  }

  private recoverPlayersOutsideCombat(players: PlayerRecord[], now: number): CombatTickEvent[] {
    const events: CombatTickEvent[] = [];
    const interval = this.recoveryIntervalMs();
    const amount = Math.max(0, this.characterConfig.combat.outOfCombatRecoveryHp);
    if (amount <= 0 || interval <= 0) return events;

    for (const player of players) {
      if (this.isDead(player, now)) {
        this.nextPlayerRecoveryAt.delete(player.id);
        this.resting.delete(player.id);
        continue;
      }

      if (this.combats.has(player.id) || this.resting.has(player.id)) {
        this.nextPlayerRecoveryAt.set(player.id, now + interval);
        continue;
      }

      if (player.hp >= player.maxHp) {
        this.nextPlayerRecoveryAt.set(player.id, now + interval);
        continue;
      }

      const readyAt = this.nextPlayerRecoveryAt.get(player.id) ?? now + interval;
      if (now < readyAt) {
        this.nextPlayerRecoveryAt.set(player.id, readyAt);
        continue;
      }

      const ticks = Math.floor((now - readyAt) / interval) + 1;
      player.hp = Math.min(player.maxHp, player.hp + amount * ticks);
      this.nextPlayerRecoveryAt.set(player.id, readyAt + ticks * interval);
      this.store.savePlayer(player);
      events.push({ playerId: player.id, roomId: player.roomId, lines: [] });
    }

    return events;
  }

  private recoverRestingPlayers(players: PlayerRecord[], now: number): CombatTickEvent[] {
    const events: CombatTickEvent[] = [];

    for (const player of players) {
      const rest = this.resting.get(player.id);
      if (!rest) continue;

      if (this.isDead(player, now) || this.combats.has(player.id)) {
        this.resting.delete(player.id);
        continue;
      }

      const lines: string[] = [];
      const manaAmount = this.restAmount(this.characterConfig.combat.restManaRecoveryAmount, player.roomId);
      const hpAmount = this.restAmount(this.characterConfig.combat.restHpRecoveryAmount, player.roomId);
      const manaInterval = this.restManaIntervalMs(player);
      const hpInterval = this.restHpIntervalMs(player);

      if (manaAmount > 0 && player.mana < player.maxMana && now >= rest.nextManaAt) {
        const ticks = Math.floor((now - rest.nextManaAt) / manaInterval) + 1;
        const before = player.mana;
        player.mana = Math.min(player.maxMana, player.mana + manaAmount * ticks);
        rest.nextManaAt += ticks * manaInterval;
        const recovered = player.mana - before;
        if (recovered > 0) lines.push(`You recover ${recovered} Energy.`);
      }

      if (hpAmount > 0 && player.hp < player.maxHp && now >= rest.nextHpAt) {
        const ticks = Math.floor((now - rest.nextHpAt) / hpInterval) + 1;
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + hpAmount * ticks);
        rest.nextHpAt += ticks * hpInterval;
        const recovered = player.hp - before;
        if (recovered > 0) lines.push(`You recover ${recovered} HP.`);
      }

      if (player.hp >= player.maxHp && player.mana >= player.maxMana) {
        this.resting.delete(player.id);
        lines.push(this.isSanctuary(player.roomId) ? "The checkpoint lights leave you feeling whole." : "You feel fully recovered.");
      } else {
        this.resting.set(player.id, rest);
      }

      if (lines.length) {
        this.store.savePlayer(player);
        events.push({ playerId: player.id, roomId: player.roomId, lines });
      }
    }

    return events;
  }

  private recoveryIntervalMs() {
    return this.characterConfig.combat.outOfCombatRecoverySeconds * 1000;
  }

  private restManaIntervalMs(player: PlayerRecord) {
    return this.restIntervalMs(this.characterConfig.combat.restManaRecoverySeconds, player.roomId);
  }

  private restHpIntervalMs(player: PlayerRecord) {
    return this.restIntervalMs(this.characterConfig.combat.restHpRecoverySeconds, player.roomId);
  }

  private restIntervalMs(seconds: number, roomId: string) {
    const multiplier = this.isSanctuary(roomId) ? Math.max(1, this.characterConfig.combat.sanctuaryRestMultiplier) : 1;
    return Math.max(1, (seconds * 1000) / multiplier);
  }

  private restAmount(amount: number, roomId: string) {
    const multiplier = this.isSanctuary(roomId) ? Math.max(1, this.characterConfig.combat.sanctuaryRestMultiplier) : 1;
    return Math.max(0, Math.floor(amount * multiplier));
  }

  private isSanctuary(roomId: string) {
    const tags = this.world.room(roomId).tags;
    return tags.includes("sanctuary") || tags.includes("checkpoint");
  }

  private playerDamage(player: PlayerRecord): RollResult {
    return this.rollPlayerDamage(this.playerStats(player), this.characterConfig.combat.playerDamage);
  }

  private npcDamage(npc: NpcDefinition): RollResult {
    return this.rollWithCrit(npc.stats, this.characterConfig.combat.npcDamage, this.damageCritChance(npc.stats.spark ?? 0), this.characterConfig.combat.damageCritMultiplier);
  }

  private rollDamage(stats: PlayerRecord["stats"], formula: DamageFormula) {
    return formula.base + Math.floor((stats[formula.stat] ?? 8) / formula.divisor) + randomInt(formula.randomMin, formula.randomMax);
  }

  private rollPlayerDamage(stats: PlayerRecord["stats"], formula: DamageFormula): RollResult {
    return this.rollWithCrit(stats, formula, this.damageCritChance(stats.spark ?? 0), this.characterConfig.combat.damageCritMultiplier);
  }

  private rollPlayerHealing(stats: PlayerRecord["stats"], formula: DamageFormula): RollResult {
    return this.rollWithCrit(stats, formula, this.healCritChance(stats.bond ?? 0), this.characterConfig.combat.healCritMultiplier);
  }

  private rollWithCrit(stats: PlayerRecord["stats"], formula: DamageFormula, chance: number, multiplier: number): RollResult {
    const baseAmount = this.rollDamage(stats, formula);
    const critical = Math.random() < chance;
    return {
      amount: critical ? Math.max(1, Math.round(baseAmount * multiplier)) : baseAmount,
      critical
    };
  }

  private damageCritChance(spark: number) {
    return Math.min(
      this.characterConfig.combat.maximumDamageCritChance,
      Math.max(0, this.characterConfig.combat.baseDamageCritChance + spark * this.characterConfig.combat.sparkDamageCritChanceBonus)
    );
  }

  private healCritChance(bond: number) {
    return Math.min(
      this.characterConfig.combat.maximumHealCritChance,
      Math.max(0, this.characterConfig.combat.baseHealCritChance + bond * this.characterConfig.combat.bondHealCritChanceBonus)
    );
  }

  private npcMaxHp(npc: NpcDefinition) {
    return this.characterConfig.npcMaxHp(npc.hp, npc.stats);
  }
}

function formatItemList(items: string[]) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
