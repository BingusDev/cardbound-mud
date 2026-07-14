import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { adminWorldView, validateBuilderWorld } from "../src/adminWorld.js";
import { CharacterConfig } from "../src/characterConfig.js";
import { Game } from "../src/game.js";
import { awardXp, skillUnlockLines } from "../src/progressionSystem.js";
import { Store } from "../src/store.js";
import type { PlayerRecord, QuestDefinition, QuestTrigger } from "../src/types.js";
import { loadWorldFile, World } from "../src/world.js";

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
  assert.equal(world.items.size, 64);
  assert.equal(world.npcs.size, 39);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
});

test("world validation rejects impossible Collection gates and quest prerequisite cycles", () => {
  const impossibleGate = structuredClone(loadWorldFile());
  impossibleGate.quests[1].prerequisites.push({ type: "binderCards", count: 999 });
  assert.match(validateBuilderWorld(impossibleGate).issues.join("\n"), /requires 999 Collection cards, but only \d+ distinct opponents are reachable and fightable before it starts/i);
  assert.throws(() => new World(impossibleGate), /requires 999 Collection cards, but only \d+ distinct opponents are reachable and fightable before it starts/i);

  const cycle = structuredClone(loadWorldFile());
  cycle.quests[0].prerequisites.push({ type: "quest", questId: cycle.quests.at(-1)!.id });
  assert.match(validateBuilderWorld(cycle).issues.join("\n"), /Quest prerequisite cycle:/i);
  assert.throws(() => new World(cycle), /Quest prerequisite cycle:/i);
});

test("the starter quest objective order follows the physical route", () => {
  const quest = World.load().quests.get("starter-deck-panic");
  assert.ok(quest);
  const defeatBoss = quest.steps.findIndex((step) => step.id === "defeat-blue-eyes-traffic");
  const enterMall = quest.steps.findIndex((step) => step.id === "reach-main-concourse");

  assert.ok(defeatBoss >= 0 && enterMall >= 0);
  assert.ok(defeatBoss < enterMall, "The journal should send players through the turnstile boss before the mall");
});

test("story destinations have no ungated alternate route", () => {
  const world = World.load();
  const reachable = new Set([world.startRoomId]);
  const pending = [world.startRoomId];

  while (pending.length) {
    const room = world.room(pending.shift()!);
    for (const exit of Object.values(room.exits)) {
      if (!exit || exit.doorId || exit.requiredItemId || reachable.has(exit.to)) continue;
      reachable.add(exit.to);
      pending.push(exit.to);
    }
  }

  for (const roomId of ["main-concourse", "frame-hangar", "crossover-pavilion"]) {
    assert.equal(reachable.has(roomId), false, `${roomId} should remain behind its story door from every approach`);
  }
});

test("the main quest forces level and Collection grinds through level 6 without skipping into level 7", () => {
  const characterConfig = CharacterConfig.load();
  const world = World.load();
  const expectedBaseQuestXp = [25, 40, 55, 70, 90, 120];
  const expectedScaledQuestXp = [50, 80, 110, 140, 180, 240];
  const xpRewards = [...world.quests.values()].map((quest) => {
    const reward = quest.rewards.find((candidate) => candidate.type === "xp");
    assert.ok(reward, `${quest.name} should grant XP`);
    return reward;
  });

  assert.deepEqual(xpRewards.map((reward) => reward.amount), expectedBaseQuestXp);
  assert.deepEqual(xpRewards.map((reward) => reward.label), expectedBaseQuestXp.map((amount) => `${amount} XP`));
  assert.deepEqual(
    xpRewards.map((reward) => characterConfig.scaleXpReward(reward.amount ?? 0, "quest")),
    expectedScaledQuestXp
  );

  const laterQuests = [...world.quests.values()].slice(1);
  assert.deepEqual(
    laterQuests.map((quest) => (quest.prerequisites ?? []).find((prerequisite) => prerequisite.type === "level")?.level),
    [2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    laterQuests.map((quest) => (quest.prerequisites ?? []).find((prerequisite) => prerequisite.type === "binderCards")?.count),
    [3, 5, 7, 9, 12]
  );

  const requiredQuestFightIds = new Set(
    [...world.quests.values()].flatMap((quest) =>
      quest.steps.flatMap((step) => step.trigger.type === "defeat" && step.trigger.npcId ? [step.trigger.npcId] : [])
    )
  );
  const combatXp = (npcId: string) => {
    const npc = world.npcs.get(npcId);
    assert.ok(npc, `Missing required quest fight ${npcId}`);
    return characterConfig.scaleXpReward(npc.combat.xp, "combat");
  };
  const requiredQuestFightXp = [...requiredQuestFightIds].reduce((total, npcId) => total + combatXp(npcId), 0);
  const fillerFightXp = [...world.npcs.values()]
    .filter((npc) => npc.disposition !== "friendly" && npc.card && npc.combat.xp > 0 && !requiredQuestFightIds.has(npc.id))
    .map((npc) => characterConfig.scaleXpReward(npc.combat.xp, "combat"))
    .sort((left, right) => left - right);

  assert.ok(fillerFightXp.length >= 6, "The quest card gates need at least six eligible filler fights");
  const guaranteedXp = expectedScaledQuestXp.reduce((total, amount) => total + amount, 0) + requiredQuestFightXp;
  const cheapestRouteXp = guaranteedXp + fillerFightXp.slice(0, 6).reduce((total, amount) => total + amount, 0);
  const priciestRouteXp = guaranteedXp + fillerFightXp.slice(-6).reduce((total, amount) => total + amount, 0);

  assert.ok(cheapestRouteXp >= characterConfig.xpForLevel(6), "Even the six cheapest filler cards should unlock level 6");
  assert.ok(priciestRouteXp < characterConfig.xpForLevel(7), "Even the six priciest filler cards should remain below level 7");
});

test("equipment spread favors multiple slots without power creep", () => {
  const world = World.load();
  const slotCounts = new Map<string, number>();

  for (const item of world.items.values()) {
    if (!item.equipment) continue;
    const slot = item.equipment.slot;
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
    let bonusTotal = 0;
    for (const value of Object.values(item.equipment.statBonuses)) {
      if (Number.isFinite(value)) bonusTotal += Math.max(0, Number(value));
    }
    assert.ok(bonusTotal > 0, `${item.name} should grant at least one stat bonus`);
    assert.ok(bonusTotal <= 2, `${item.name} should stay within the current +2 equipment budget`);
  }

  assert.ok((slotCounts.get("head") ?? 0) >= 8, "Head slot should have several choices");
  assert.ok((slotCounts.get("body") ?? 0) >= 8, "Body slot should have several choices");
  assert.ok((slotCounts.get("feet") ?? 0) >= 8, "Feet slot should have several choices");
});

test("items have rarity labels and classes start with modest loadout gear", (t) => {
  const characterConfig = CharacterConfig.load();
  const world = World.load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardbound-starter-loadouts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(characterConfig, path.join(dir, "cardbound.sqlite"));

  for (const item of world.items.values()) {
    assert.ok(item.rarity, `${item.name} should have an item rarity label`);
  }

  for (const job of characterConfig.jobs) {
    assert.ok(job.starterItemId, `${job.name} should define a starter item`);
    const starterItem = world.items.get(job.starterItemId);
    assert.ok(starterItem?.equipment, `${job.name} starter item should be equipment`);
    let bonusTotal = 0;
    for (const value of Object.values(starterItem.equipment.statBonuses)) {
      if (Number.isFinite(value)) bonusTotal += Number(value);
    }
    assert.equal(bonusTotal, 1, `${job.name} starter item should stay at the +1 starter budget`);

    const player = store.findOrCreatePlayer(`Tester ${job.id.replace(/-/g, " ")}`, world.defaultSpawnRoomId(), false, undefined, job.id);
    assert.ok(player.inventory.includes(job.starterItemId), `${job.name} should start with ${starterItem.name}`);
  }
});

test("equipment look and equip output compare the current slot", (t) => {
  const { game, player, store } = testGame(t, "equipment-compare");
  player.inventory.push("duel-disk-holster");
  store.savePlayer(player);

  const firstEquip = game.runCommand(player, "equip Starter Duel token", []);
  assert.match(firstEquip.lines.join("\n"), /Equipped trinket: nothing/i);
  assert.match(firstEquip.lines.join("\n"), /New item: Starter Duel token \(\+1 Combo\)/i);

  const look = game.runCommand(player, "look Duel Disk holster", []);
  assert.match(look.lines.join("\n"), /Rarity: Uncommon/i);
  assert.match(look.lines.join("\n"), /Equipped trinket: Starter Duel token \(\+1 Combo\)/i);
  assert.match(look.lines.join("\n"), /Change: \+1 Control/i);

  const secondEquip = game.runCommand(player, "equip Duel Disk holster", []);
  assert.match(secondEquip.lines.join("\n"), /replace Starter Duel token with Duel Disk holster/i);
  assert.match(secondEquip.lines.join("\n"), /Change: \+1 Control/i);
});

test("mini-bosses have deterministic special or telegraphed attack hooks", (t) => {
  const { game, player, store, world } = testGame(t, "boss-specials");
  const bosses = ["blue-eyes-traffic-dragon", "gym-leader-gyarados", "nicol-bolas-standee", "red-comet-gunpla", "mihawk-dockside-rival", "union-arena-raid-boss"];
  for (const bossId of bosses) {
    const boss = world.npcs.get(bossId);
    assert.ok(
      boss?.combat.specials?.length || boss?.combat.encounter?.telegraphs?.length,
      `${bossId} should have a special or telegraphed attack`
    );
  }

  const blueEyesSpecial = world.npcs.get("blue-eyes-traffic-dragon")?.combat.specials?.[0];
  assert.ok(blueEyesSpecial);
  blueEyesSpecial.cooldownSeconds = 0;
  player.hp = 999;
  player.maxHp = 999;
  movePlayerToNpc(player, store, world, "blue-eyes-traffic-dragon");
  authorizeQuestFight(store, player, "starter-deck-panic");
  store.savePlayer(player);
  game.runCommand(player, "attack Blue-Eyes White Dragon", []);

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const events = game.tickCombat([player], Date.now() + 5000);
    const lines = events.flatMap((event) => event.lines).join("\n");
    assert.match(lines, /Burst Stream of Destruction/i);
  } finally {
    Math.random = originalRandom;
  }
});

test("story bosses cannot be pre-killed or retro-credited from Collection history", (t) => {
  const { game, player, store, world } = testGame(t, "story-boss-prekill");
  movePlayerToNpc(player, store, world, "blue-eyes-traffic-dragon");
  player.stats = { ...player.stats, might: 999, grace: 999 };
  store.savePlayer(player);

  const blocked = game.runCommand(player, "attack Blue-Eyes White Dragon", []);
  assert.match(blocked.lines.join("\n"), /Duel Disk Lockdown has not begun yet/i);
  assert.equal(player.binderCards.includes("blue-eyes-traffic-dragon"), false);

  player.binderCards.push("blue-eyes-traffic-dragon");
  store.savePlayer(player);
  const starter = world.quests.get("starter-deck-panic");
  assert.ok(starter);
  runQuestTrigger(game, player, store, world, starter.startsOn);
  assert.equal(store.getQuestRecord(player.id, starter.id)?.completedSteps.includes("defeat-blue-eyes-traffic"), false);
});

test("boss population scaling respects the configured story respawn timer", (t) => {
  const originalNow = Date.now;
  let now = 8_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  const { game, player, store, world } = testGame(t, "story-boss-respawn");
  const boss = world.npcs.get("blue-eyes-traffic-dragon");
  assert.equal(boss?.combat.respawnSeconds, 90);
  authorizeQuestFight(store, player, "starter-deck-panic");
  movePlayerToNpc(player, store, world, "blue-eyes-traffic-dragon");
  player.stats = { ...player.stats, might: 999, grace: 999 };
  player.hp = 999;
  player.maxHp = 999;
  store.savePlayer(player);

  assert.match(game.runCommand(player, "attack Blue-Eyes White Dragon", []).lines.join("\n"), /Collection card logged/i);
  now += 20_001;
  const earlyTick = game.tickCombat([player], now).flatMap((event) => event.roomLines ?? []).join("\n");
  assert.doesNotMatch(earlyTick, /stirs at the edge of the scene|returns to the scene/i);
  assert.match(game.runCommand(player, "attack Blue-Eyes White Dragon", []).lines.join("\n"), /do not see that target here/i);

  now += 70_000;
  game.tickCombat([player], now);
  assert.match(game.runCommand(player, "attack Blue-Eyes White Dragon", []).lines.join("\n"), /challenge Blue-Eyes White Dragon/i);
});

test("quest pickup items are gated until their quest has started", (t) => {
  const { game, player } = testGame(t, "quest-gate");

  game.runCommand(player, "north", []);
  const blocked = game.runCommand(player, "take the Duel Disk keycard", []);

  assert.match(blocked.lines.join("\n"), /Duel Disk Lockdown has not begun yet/i);
  assert.match(blocked.lines.join("\n"), /ask Marshal Echo about key/i);
  assert.equal(player.inventory.includes("sleeve-key"), false);
});

test("every quest pickup has a shared-world respawn", () => {
  const world = World.load();
  const pickupIds = new Set(
    [...world.quests.values()].flatMap((quest) =>
      quest.steps.flatMap((step) => step.trigger.type === "take" && step.trigger.itemId ? [step.trigger.itemId] : [])
    )
  );

  for (const itemId of pickupIds) {
    const spawns = [...world.rooms.values()].flatMap((room) => room.itemSpawns.filter((spawn) => spawn.itemId === itemId));
    assert.ok(spawns.length, `${itemId} should be placed`);
    assert.ok(spawns.every((spawn) => (spawn.respawnSeconds ?? 0) > 0), `${itemId} should respawn everywhere it is placed`);
  }
});

test("quest doors are gated until their quest has started", (t) => {
  const { game, player, store } = testGame(t, "door-gate");
  player.inventory.push("sleeve-key");
  player.roomId = "mall-gate";
  store.savePlayer(player);

  const blocked = game.runCommand(player, "use Duel Disk keycard", []);

  assert.match(blocked.lines.join("\n"), /Duel Disk Lockdown has not begun yet/i);
  assert.match(blocked.lines.join("\n"), /ask Marshal Echo about key/i);
});

test("future quest items point to prerequisites instead of unusable starts", (t) => {
  const { game, player, store, world } = testGame(t, "future-gate");

  movePlayerToItem(player, store, world, "prism-shard");
  const blocked = game.runCommand(player, "take prism shard", []);

  assert.match(blocked.lines.join("\n"), /Mana Leak Mayhem is tied to later work/i);
  assert.match(blocked.lines.join("\n"), /Poke Ball Roundup/i);
});

test("future quest dialogue cannot bypass story and Collection gates", (t) => {
  const { game, player, store, world } = testGame(t, "future-dialogue-gate");
  movePlayerToNpc(player, store, world, "signal-dj");

  const blocked = game.runCommand(player, "ask Signal DJ Pax about broadcast", []);

  assert.match(blocked.lines.join("\n"), /Rotom Radio Relay is tied to later work/i);
  assert.match(blocked.lines.join("\n"), /Duel Disk Lockdown/i);
  assert.match(blocked.lines.join("\n"), /logging 3 unique Collection cards/i);
  assert.equal(store.getQuestRecord(player.id, "citywide-signal"), undefined);
});

test("the quest journal and binder expose the next required Collection grind", (t) => {
  const { game, player, store, world } = testGame(t, "collection-story-gate");
  const starter = world.quests.get("starter-deck-panic");
  assert.ok(starter);
  store.saveQuestRecord({
    playerId: player.id,
    questId: starter.id,
    status: "completed",
    completedSteps: starter.steps.map((step) => step.id),
    completedAt: new Date().toISOString()
  });
  player.binderCards = ["rogue-topdeck", "blue-eyes-traffic-dragon"];
  store.savePlayer(player);

  assert.match(game.view(player, []).progressionHint ?? "", /Rotom Radio Relay requires level 2 \(0\/120 XP\) and 3 unique Collection cards \(2\/3\)/i);
  assert.match(game.runCommand(player, "binder", []).lines.join("\n"), /Defeat 1 unlogged runaway/i);

  player.binderCards.push("snack-mimic");
  store.savePlayer(player);
  assert.match(game.view(player, []).progressionHint ?? "", /Rotom Radio Relay requires level 2 \(0\/120 XP\)/i);

  const characterConfig = CharacterConfig.load();
  player.xp = characterConfig.xpForLevel(2);
  player.level = characterConfig.levelForXp(player.xp);
  store.savePlayer(player);
  assert.match(game.view(player, []).progressionHint ?? "", /Next story assignment ready: Rotom Radio Relay/i);
  assert.match(game.view(player, []).progressionHint ?? "", /ask Signal DJ Pax about broadcast/i);
});

test("look shows available quest starts in the current room", (t) => {
  const { game, player } = testGame(t, "quest-hints");

  const look = game.runCommand(player, "look", []);

  assert.match(look.lines.join("\n"), /Work to begin here:/);
  assert.match(look.lines.join("\n"), /Duel Disk Lockdown/);
  assert.match(look.lines.join("\n"), /Ask Marshal Echo about key/);
});

test("starting Duel Disk Lockdown permits the key and records progress", (t) => {
  const { game, player, store } = testGame(t, "brass-key");

  const start = game.runCommand(player, "ask Marshal Echo about key", []);
  assert.match(start.lines.join("\n"), /Quest started: Duel Disk Lockdown/i);

  game.runCommand(player, "north", []);
  const take = game.runCommand(player, "take the Duel Disk keycard", []);

  assert.match(take.lines.join("\n"), /You take the Duel Disk keycard/i);
  assert.equal(player.inventory.includes("sleeve-key"), true);
  assert.deepEqual(store.getQuestRecord(player.id, "starter-deck-panic")?.completedSteps.includes("take-sleeve-key"), true);
});

test("quest starter dialogue includes class-specific branches", (t) => {
  const { game, player, store } = testGame(t, "class-dialogue");
  player.job = "trainer";
  store.savePlayer(player);

  const start = game.runCommand(player, "ask Marshal Echo about key", []);

  assert.match(start.lines.join("\n"), /Pokedex phone/i);
  assert.match(start.lines.join("\n"), /Gym badge/i);
});

test("every advertised NPC dialogue prompt and configured ask phrase resolves to its topic", (t) => {
  const { game, player, store, world } = testGame(t, "dialogue-topics");

  player.flags = [
    ...new Set(
      [...world.npcs.values()].flatMap((npc) =>
        Object.values(npc.dialogue.topics).flatMap((topic) => topic.requiresFlag ? [topic.requiresFlag] : [])
      )
    )
  ];
  store.savePlayer(player);

  for (const quest of world.quests.values()) {
    store.saveQuestRecord({
      playerId: player.id,
      questId: quest.id,
      status: "completed",
      completedSteps: quest.steps.map((step) => step.id),
      completedAt: new Date().toISOString()
    });
  }

  for (const npc of world.npcs.values()) {
    const topics = Object.entries(npc.dialogue.topics);
    if (!topics.length) continue;

    movePlayerToNpc(player, store, world, npc.id);
    const talk = game.runCommand(player, `talk ${npc.name}`, []);
    const advertisedLine = talk.lines.find((line) => line.startsWith(`You can ask ${npc.name} about:`));
    assert.ok(advertisedLine, `${npc.name} should advertise their available dialogue topics`);

    for (const [key, topic] of topics) {
      const prompt = topic.prompt ?? key;
      assert.match(
        advertisedLine,
        new RegExp(`${escapeRegExp(prompt)}(?:,|\\.)`, "i"),
        `${npc.name} should advertise topic '${key}' as '${prompt}'`
      );

      for (const phrase of new Set([key, prompt, ...topic.aliases])) {
        const result = game.runCommand(player, `ask ${npc.name} about ${phrase}`, []);
        const output = result.lines.join("\n");
        assert.doesNotMatch(
          output,
          /Ask whom about what|You do not see them here|uncertain what you mean/i,
          `${npc.name}'s topic '${key}' should accept '${phrase}'`
        );
        assert.ok(
          topic.response.some((line) => output.includes(`"${line}"`)),
          `${npc.name}'s phrase '${phrase}' should resolve to topic '${key}'`
        );
      }
    }
  }
});

test("talk quest steps name the command and target NPC explicitly", () => {
  const world = World.load();

  for (const quest of world.quests.values()) {
    for (const step of quest.steps) {
      if (step.trigger.type !== "talk" || !step.trigger.npcId) continue;
      const npc = world.npcs.get(step.trigger.npcId);
      assert.ok(npc, `${quest.name} references missing talk target ${step.trigger.npcId}`);
      assert.match(
        step.label,
        new RegExp(`talk to ${escapeRegExp(npc.name)}`, "i"),
        `${quest.name}'s talk step should tell players to use 'Talk to ${npc.name}'`
      );
    }
  }
});

test("taking one item copy does not schedule a respawn while another spawned copy remains", (t) => {
  const { game, player, store } = testGame(t, "duplicate-item-take");

  player.roomId = "binder-square";
  store.savePlayer(player);
  store.setRoomItems("binder-square", ["foil-snack", "foil-snack"]);
  store.setRoomItemRespawns("binder-square", {});

  const take = game.runCommand(player, "take Potion snack cake", []);

  assert.match(take.lines.join("\n"), /You take the Potion snack cake/i);
  assert.deepEqual(store.getRoomItems("binder-square"), ["foil-snack"]);
  assert.deepEqual(store.getRoomItemRespawns("binder-square"), {});
});

test("a quest pickup respawns for a second player instead of dead-ending the quest", (t) => {
  const originalNow = Date.now;
  let now = 9_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  const { game, player: firstPlayer, store, world } = testGame(t, "shared-quest-pickup");
  const secondPlayer = store.findOrCreatePlayer("Second Pickup Tester", world.defaultSpawnRoomId(), false);
  for (const player of [firstPlayer, secondPlayer]) {
    authorizeQuestFight(store, player, "starter-deck-panic");
    movePlayerToItem(player, store, world, "sleeve-key");
  }

  assert.match(game.runCommand(firstPlayer, "take Duel Disk keycard", []).lines.join("\n"), /You take the Duel Disk keycard/i);
  assert.match(game.runCommand(secondPlayer, "take Duel Disk keycard", []).lines.join("\n"), /do not see that here/i);

  now += 5_001;
  game.tickItems();
  assert.match(game.runCommand(secondPlayer, "take Duel Disk keycard", []).lines.join("\n"), /You take the Duel Disk keycard/i);
  assert.equal(secondPlayer.inventory.includes("sleeve-key"), true);
});

test("starting a quest retro-credits already satisfied steps", (t) => {
  const { game, player, store } = testGame(t, "retro-credit");

  player.inventory.push("sleeve-key");
  store.savePlayer(player);
  store.setDoorState({ playerId: player.id, doorId: "sleeve-turnstile", isLocked: false, isOpen: true });

  const start = game.runCommand(player, "ask Marshal Echo about key", []);
  const completed = store.getQuestRecord(player.id, "starter-deck-panic")?.completedSteps ?? [];

  assert.match(start.lines.join("\n"), /Quest started: Duel Disk Lockdown/i);
  assert.equal(completed.includes("take-sleeve-key"), true);
  assert.equal(completed.includes("unlock-sleeve-turnstile"), true);
  assert.equal(completed.includes("open-sleeve-turnstile"), true);
  assert.equal(completed.includes("reach-main-concourse"), false);
});

test("use key opens a matching nearby quest door after the quest is active", (t) => {
  const { game, player, store } = testGame(t, "use-key");

  game.runCommand(player, "ask Marshal Echo about key", []);
  game.runCommand(player, "north", []);
  game.runCommand(player, "take Duel Disk keycard", []);
  player.roomId = "mall-gate";
  store.savePlayer(player);

  const used = game.runCommand(player, "use Duel Disk keycard", []);
  const door = World.load().door("sleeve-turnstile");
  const state = store.getDoorState(player.id, door);

  assert.match(used.lines.join("\n"), /unlock and open Duel Disk turnstile/i);
  assert.equal(state.isLocked, false);
  assert.equal(state.isOpen, true);
});

test("store repairs player quest foreign keys left pointing at rebuilt player tables", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardbound-fk-repair-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, "cardbound.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      room_id TEXT NOT NULL,
      hp INTEGER NOT NULL,
      max_hp INTEGER NOT NULL,
      mana INTEGER NOT NULL,
      max_mana INTEGER NOT NULL,
      inventory_json TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE player_quests (
      player_id INTEGER NOT NULL,
      quest_id TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_steps_json TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player_id, quest_id),
      FOREIGN KEY (player_id) REFERENCES "players_previous"(id) ON DELETE CASCADE
    );
  `);
  db.close();

  new Store(CharacterConfig.load(), dbPath);
  const repaired = new DatabaseSync(dbPath);
  const foreignKeys = repaired.prepare("PRAGMA foreign_key_list(player_quests)").all() as unknown as Array<{ table: string }>;
  repaired.close();

  assert.deepEqual(foreignKeys.map((key) => key.table), ["players"]);
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
    satisfyQuestPrerequisites(player, store, world, quest);
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

test("quest completion grants a class-flavored item reward", (t) => {
  const { game, player, store, world } = testGame(t, "class-reward");
  player.job = "pilot";
  store.savePlayer(player);
  const quest = world.quests.get("starter-deck-panic");
  assert.ok(quest);

  runQuestTrigger(game, player, store, world, quest.startsOn);
  let lastResult = "";
  for (const step of quest.steps) {
    if (store.getQuestRecord(player.id, quest.id)?.completedSteps.includes(step.id)) continue;
    lastResult = runQuestTrigger(game, player, store, world, step.trigger).lines.join("\n");
  }

  assert.match(lastResult, /Class reward: White Base launch patch/i);
  assert.match(lastResult, /Next story gate: Rotom Radio Relay requires level 2 \(.+ XP\) and 3 unique Collection cards \(2\/3\)/i);
  assert.equal(player.inventory.includes("pilot-launch-patch"), true);
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
      jobName: "Duelist",
      titles: [],
      description: other.description
    }
  ]);
  const who = game.runCommand(player, "who", [
    {
      name: other.name,
      speciesName: "Cardbound",
      jobName: "Duelist",
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
      jobName: "Duelist",
      titles: ["Battle City Hall Monitor"],
      description: "A traveler."
    }
  ]);

  assert.match(look.lines.join("\n"), /Also here: Road Friend \(Duelist - Battle City Hall Monitor\)/);
});

test("inventory full includes item descriptions", (t) => {
  const { game, player } = testGame(t, "inventory");

  game.runCommand(player, "north", []);
  game.runCommand(player, "take duel disk holster", []);
  const inventory = game.runCommand(player, "inventory full", []);

  assert.match(inventory.lines.join("\n"), /Duel Disk holster:/);
  assert.match(inventory.lines.join("\n"), /Type: equipment/i);
});

test("cardbound combat verbs attack, run, and recover are accepted", (t) => {
  const { game, player, store, world } = testGame(t, "combat-verbs");

  movePlayerToNpc(player, store, world, "rogue-topdeck");
  const attack = game.runCommand(player, "attack kuriboh", []);
  assert.match(attack.lines.join("\n"), /You challenge Kuriboh to a duel|You attack Kuriboh/i);
  const combat = game.view(player, []).combat;
  assert.equal(combat.targetName, "Kuriboh");
  assert.ok(Number.isFinite(combat.targetHp));
  assert.ok(Number.isFinite(combat.targetMaxHp));
  assert.ok((combat.targetHp ?? 0) < (combat.targetMaxHp ?? 0));
  assert.match(game.runCommand(player, "status", []).lines.join("\n"), /Dueling Kuriboh: \d+\/\d+ HP/i);

  const ran = game.runCommand(player, "run", []);
  assert.doesNotMatch(ran.lines.join("\n"), /Unknown command/i);
  assert.match(game.runCommand(player, "combat", []).lines.join("\n"), /You are not in a duel/i);

  player.hp = Math.max(1, player.maxHp - 3);
  store.savePlayer(player);
  const recover = game.runCommand(player, "recover", []);
  assert.match(recover.lines.join("\n"), /recover/i);
});

test("each class can build, inspect, and spend its signature mechanic", (t) => {
  const characterConfig = CharacterConfig.load();
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  for (const job of characterConfig.jobs) {
    const { game, player, store, world } = testGame(t, `mechanic-${job.id}`);
    const boss = world.npcs.get("genre-jam-titan");
    assert.ok(boss);
    boss.hp = 999;
    player.job = job.id;
    player.level = 5;
    player.mana = 999;
    player.maxMana = 999;
    movePlayerToNpc(player, store, world, boss.id);
    authorizeQuestFight(store, player, "crossover-calamity");
    store.savePlayer(player);

    const mechanicGuide = game.runCommand(player, "mechanic", []);
    assert.match(mechanicGuide.lines.join("\n"), new RegExp(escapeRegExp(job.mechanic?.name ?? ""), "i"));
    assert.match(mechanicGuide.lines.join("\n"), /Build:|Spend:/i);

    game.runCommand(player, `attack ${boss.name}`, []);
    now += 10_000;
    const builder = job.skills.find((skill) => (skill.mechanicGain ?? 0) > 0);
    assert.ok(builder, `${job.name} should have a mechanic builder`);
    const buildResult = game.runCommand(player, builder.name, []);
    assert.doesNotMatch(buildResult.lines.join("\n"), /needs \d+ .*You have/i);
    const builtView = game.view(player, []).combat.mechanic;
    assert.ok(builtView, `${job.name} mechanic should be visible during combat`);
    assert.ok(builtView.stacks > 0, `${job.name} should build ${builtView.name}`);
    assert.match(game.runCommand(player, "status", []).lines.join("\n"), new RegExp(escapeRegExp(builtView.name), "i"));

    now += 10_000;
    const finisher = job.skills.find((skill) => skill.mechanicSpendAll);
    assert.ok(finisher, `${job.name} should have a mechanic finisher`);
    const finishResult = game.runCommand(player, finisher.name, []);
    assert.match(finishResult.lines.join("\n"), new RegExp(`${escapeRegExp(builtView.name)}: 0/${builtView.maxStacks}`, "i"));
    assert.equal(game.view(player, []).combat.mechanic?.stacks, 0, `${job.name} finisher should spend its mechanic`);

    now += 10_000;
    const gatedSkill = job.skills.find((skill) => (skill.mechanicCost ?? 0) >= 2);
    assert.ok(gatedSkill, `${job.name} should have a setup-dependent skill`);
    player.mana = player.maxMana;
    const gatedResult = game.runCommand(player, gatedSkill.name, []);
    assert.match(gatedResult.lines.join("\n"), /needs 2 .*You have 0\//i);

    game.runCommand(player, "run", []);
    now += 10_000;
    game.runCommand(player, `attack ${boss.name}`, []);
    assert.equal(
      game.view(player, []).combat.mechanic?.stacks,
      Math.min(job.mechanic?.maxStacks ?? 0, job.mechanic?.basicAttackGain ?? 0),
      `${job.name} should start each duel with a fresh mechanic meter`
    );
  }
});

test("level 6 passives switch on visibly and reset with each duel", (t) => {
  const characterConfig = CharacterConfig.load();
  const originalNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  const expected = {
    duelist: { level5Stacks: 1, level6Stacks: 1, level5Cap: 4, level6Cap: 5, level5Basic: 1, level6Basic: 1, level5EnergyRefund: 0, level6EnergyRefund: 0 },
    trainer: { level5Stacks: 0, level6Stacks: 2, level5Cap: 5, level6Cap: 5, level5Basic: 0, level6Basic: 0, level5EnergyRefund: 0, level6EnergyRefund: 0 },
    planeswalker: { level5Stacks: 0, level6Stacks: 0, level5Cap: 5, level6Cap: 5, level5Basic: 0, level6Basic: 0, level5EnergyRefund: 0, level6EnergyRefund: 1 },
    pilot: { level5Stacks: 1, level6Stacks: 2, level5Cap: 3, level6Cap: 3, level5Basic: 1, level6Basic: 1, level5EnergyRefund: 0, level6EnergyRefund: 0 },
    captain: { level5Stacks: 1, level6Stacks: 2, level5Cap: 5, level6Cap: 5, level5Basic: 1, level6Basic: 2, level5EnergyRefund: 0, level6EnergyRefund: 0 },
    "arena-fighter": { level5Stacks: 1, level6Stacks: 1, level5Cap: 4, level6Cap: 4, level5Basic: 1, level6Basic: 1, level5EnergyRefund: 0, level6EnergyRefund: 1 }
  } as const;

  for (const job of characterConfig.jobs) {
    const passive = job.skills.find((skill) => skill.level === 6 && skill.passive);
    assert.ok(passive, `${job.name} should unlock a passive at level 6`);
    const snapshots = new Map<number, ReturnType<Game["view"]>>();
    const levelSixEncounter: ReturnType<typeof testGame> | undefined = (() => {
      let savedEncounter: ReturnType<typeof testGame> | undefined;
      for (const level of [5, 6]) {
        const encounter = testGame(t, `passive-${job.id}-${level === 5 ? "five" : "six"}`);
        const boss = encounter.world.npcs.get("genre-jam-titan");
        assert.ok(boss);
        boss.hp = 999;
        encounter.player.job = job.id;
        encounter.player.level = level;
        encounter.player.mana = 999;
        encounter.player.maxMana = 999;
        movePlayerToNpc(encounter.player, encounter.store, encounter.world, boss.id);
        authorizeQuestFight(encounter.store, encounter.player, "crossover-calamity");
        encounter.store.savePlayer(encounter.player);
        if (level === 6) {
          const passiveOutsideCombat = encounter.game.runCommand(encounter.player, passive.name, []);
          assert.match(passiveOutsideCombat.lines.join("\n"), /passive technique.*already/i);
        }
        encounter.game.runCommand(encounter.player, `attack ${boss.name}`, []);
        snapshots.set(level, encounter.game.view(encounter.player, []));
        if (level === 6) savedEncounter = encounter;
      }
      return savedEncounter;
    })();

    const level5 = snapshots.get(5);
    const level6 = snapshots.get(6);
    const values = expected[job.id as keyof typeof expected];
    assert.ok(level5 && level6 && values && levelSixEncounter);
    assert.ok(level5.lockedJobSkills.some((skill) => skill.id === passive.id), `${passive.name} should remain locked at level 5`);
    assert.ok(level6.jobSkills.some((skill) => skill.id === passive.id), `${passive.name} should unlock at level 6`);
    assert.equal(level5.combat.mechanic?.stacks, values.level5Stacks, `${job.name} level 5 opening meter`);
    assert.equal(level6.combat.mechanic?.stacks, values.level6Stacks, `${job.name} level 6 opening meter`);
    assert.equal(level5.classMechanic?.maxStacks, values.level5Cap, `${job.name} level 5 meter cap`);
    assert.equal(level6.classMechanic?.maxStacks, values.level6Cap, `${job.name} level 6 meter cap`);
    assert.equal(level5.classMechanic?.basicAttackGain, values.level5Basic, `${job.name} level 5 basic gain`);
    assert.equal(level6.classMechanic?.basicAttackGain, values.level6Basic, `${job.name} level 6 basic gain`);
    assert.equal(level5.classMechanic?.energyPerStackSpent, values.level5EnergyRefund, `${job.name} level 5 spend refund`);
    assert.equal(level6.classMechanic?.energyPerStackSpent, values.level6EnergyRefund, `${job.name} level 6 spend refund`);

    const passiveCommand = levelSixEncounter.game.runCommand(levelSixEncounter.player, passive.name, []);
    assert.match(passiveCommand.lines.join("\n"), /passive technique.*already/i);
    levelSixEncounter.game.runCommand(levelSixEncounter.player, "run", []);
    now += 10_000;
    levelSixEncounter.game.runCommand(levelSixEncounter.player, `attack ${levelSixEncounter.world.npcs.get("genre-jam-titan")?.name}`, []);
    assert.equal(levelSixEncounter.game.view(levelSixEncounter.player, []).combat.mechanic?.stacks, values.level6Stacks, `${job.name} should reset to its passive-adjusted opening meter`);
  }
});

test("level 6 passive unlocks are announced across a multi-level-safe XP award", (t) => {
  const characterConfig = CharacterConfig.load();

  for (const job of characterConfig.jobs) {
    const { player } = testGame(t, `passive-unlock-${job.id}`);
    player.job = job.id;
    player.level = 5;
    player.xp = characterConfig.xpForLevel(6) - 1;
    const result = awardXp(player, 1, "quest", characterConfig);
    const passive = job.skills.find((skill) => skill.level === 6 && skill.passive);
    assert.ok(passive);
    assert.equal(result.newLevel, 6);
    assert.deepEqual(result.unlockedSkills.map((skill) => skill.id), [passive.id]);
    assert.match(skillUnlockLines(result.unlockedSkills).join("\n"), new RegExp(`Passive unlocked: ${escapeRegExp(passive.name)}`, "i"));
  }
});

test("level 10 capstones require and consume a full class meter", (t) => {
  const characterConfig = CharacterConfig.load();
  const originalNow = Date.now;
  let now = 3_000_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  for (const job of characterConfig.jobs) {
    const { game, player, store, world } = testGame(t, `capstone-${job.id}`);
    const boss = world.npcs.get("genre-jam-titan");
    const capstone = job.skills.find((skill) => skill.level === 10);
    const builder = [...job.skills]
      .filter((skill) => skill.level <= 10 && (skill.mechanicGain ?? 0) > 0 && !(skill.mechanicCost ?? 0))
      .sort((left, right) => (right.mechanicGain ?? 0) - (left.mechanicGain ?? 0))[0];
    assert.ok(boss && capstone && builder && job.mechanic);
    boss.hp = 999;
    player.job = job.id;
    player.level = 10;
    player.mana = 999;
    player.maxMana = 999;
    movePlayerToNpc(player, store, world, boss.id);
    authorizeQuestFight(store, player, "crossover-calamity");
    store.savePlayer(player);
    game.runCommand(player, `attack ${boss.name}`, []);
    now += 10_000;

    const openingMechanic = game.view(player, []).combat.mechanic;
    assert.ok(openingMechanic);
    const early = game.runCommand(player, capstone.name, []);
    assert.match(early.lines.join("\n"), new RegExp(`needs ${openingMechanic.maxStacks} ${escapeRegExp(openingMechanic.name)}`, "i"));

    player.mana = 999;
    player.maxMana = 999;
    store.savePlayer(player);
    const castsNeeded = Math.ceil((openingMechanic.maxStacks - openingMechanic.stacks) / (builder.mechanicGain ?? 1));
    for (let cast = 0; cast < castsNeeded; cast += 1) {
      now += 10_000;
      const build = game.runCommand(player, builder.name, []);
      assert.doesNotMatch(build.lines.join("\n"), /needs \d+ .*You have/i);
    }

    player.mana = 999;
    player.maxMana = 999;
    store.savePlayer(player);
    now += 10_000;
    const result = game.runCommand(player, capstone.name, []);
    assert.doesNotMatch(result.lines.join("\n"), /needs \d+ .*You have/i);
    assert.equal(game.view(player, []).combat.mechanic?.stacks, 0, `${job.name} capstone should empty its full meter`);
  }
});

test("each level 1 class can open combat against an early monster", (t) => {
  const characterConfig = CharacterConfig.load();

  for (const job of characterConfig.jobs) {
    const { game, player, store, world } = testGame(t, `class-combat-${job.id}`);
    player.job = job.id;
    player.stats = characterConfig.statsForSpecies(player.species);
    const effectiveStats = characterConfig.leveledStats(player.stats, player.species, player.job, player.level);
    player.maxHp = characterConfig.maxHpForStats(effectiveStats);
    player.hp = player.maxHp;
    player.maxMana = characterConfig.maxManaForStats(effectiveStats);
    player.mana = player.maxMana;
    movePlayerToNpc(player, store, world, "rogue-topdeck");
    store.savePlayer(player);

    const result = game.runCommand(player, "attack kuriboh", []);
    assert.match(result.lines.join("\n"), /You challenge Kuriboh to a duel/i, `${job.name} should be able to start combat`);
    assert.ok(player.hp > 0, `${job.name} should survive opening combat`);
    assert.ok(player.mana >= 0, `${job.name} Energy should remain valid`);
  }
});

test("defeated runaway monsters are logged into the collection binder", (t) => {
  const { game, player, store, world } = testGame(t, "binder-cards");

  movePlayerToNpc(player, store, world, "rogue-topdeck");
  player.stats = { ...player.stats, might: 99, grace: 99 };
  store.savePlayer(player);

  const lookBefore = game.runCommand(player, "look rogue topdeck", []);
  assert.match(lookBefore.lines.join("\n"), /Collection Binder: not collected \(Duel Monsters Page, uncommon\)/i);

  const attack = game.runCommand(player, "attack kuriboh", []);
  assert.match(attack.lines.join("\n"), /Collection card logged: Kuriboh/i);
  assert.doesNotMatch(attack.lines.join("\n"), /Collection page complete: Duel Monsters Page/i);
  assert.equal(player.titles.includes("Duel Monsters Ace"), false);
  assert.deepEqual(player.binderCards, ["rogue-topdeck"]);

  movePlayerToNpc(player, store, world, "trapline-busker");
  const secondAttack = game.runCommand(player, "attack trapline busker", []);
  assert.match(secondAttack.lines.join("\n"), /Collection card logged: Performage Trick Clown/i);
  assert.doesNotMatch(secondAttack.lines.join("\n"), /Collection page complete: Duel Monsters Page/i);
  assert.equal(player.titles.includes("Duel Monsters Ace"), false);

  movePlayerToNpc(player, store, world, "blue-eyes-traffic-dragon");
  authorizeQuestFight(store, player, "starter-deck-panic");
  player.stats = { ...player.stats, might: 999, grace: 999 };
  store.savePlayer(player);
  const bossAttack = game.runCommand(player, "attack blue-eyes white dragon", []);
  assert.match(bossAttack.lines.join("\n"), /Collection card logged: Blue-Eyes White Dragon/i);

  movePlayerToNpc(player, store, world, "snack-mimic");
  const morphingJarAttack = game.runCommand(player, "attack morphing jar", []);
  assert.match(morphingJarAttack.lines.join("\n"), /Collection card logged: Morphing Jar/i);

  movePlayerToNpc(player, store, world, "coupon-knight");
  const goblinAttack = game.runCommand(player, "attack goblin of greed", []);
  assert.match(goblinAttack.lines.join("\n"), /Collection card logged: Goblin of Greed/i);
  assert.match(goblinAttack.lines.join("\n"), /Collection page complete: Duel Monsters Page/i);
  assert.equal(player.titles.includes("Duel Monsters Ace"), true);

  const binder = game.runCommand(player, "deck", []);
  assert.match(binder.lines.join("\n"), /Collection cards \(5\): First Pull, Starter Deck active; \+1 max HP, \+1 max Energy/i);
  assert.match(binder.lines.join("\n"), /Duel Monsters Page:/i);
  assert.match(binder.lines.join("\n"), /Page chase:/i);
  assert.match(binder.lines.join("\n"), /Duel Monsters Page: complete, title Duel Monsters Ace/i);
  assert.match(binder.lines.join("\n"), /Kuriboh/i);
  assert.match(binder.lines.join("\n"), /Side Deck Tech \(locked at 6\)/i);

  const duelPage = game.runCommand(player, "binder duel", []);
  assert.match(duelPage.lines.join("\n"), /Duel Monsters Page:/i);
  assert.match(duelPage.lines.join("\n"), /Performage Trick Clown/i);
  assert.doesNotMatch(duelPage.lines.join("\n"), /Event Page:/i);
});

test("repeated wins against the same runaway do not satisfy unique-card grind gates", (t) => {
  const { game, player, store, world } = testGame(t, "binder-duplicates");
  player.binderCards = ["rogue-topdeck"];
  player.stats = { ...player.stats, might: 99, grace: 99 };
  movePlayerToNpc(player, store, world, "rogue-topdeck");
  store.savePlayer(player);

  const repeatWin = game.runCommand(player, "attack Kuriboh", []);

  assert.doesNotMatch(repeatWin.lines.join("\n"), /Collection card logged/i);
  assert.deepEqual(player.binderCards, ["rogue-topdeck"]);
});

test("event variants announce their event binder chase", (t) => {
  const { game, player, store, world } = testGame(t, "event-binder");

  movePlayerToNpc(player, store, world, "holo-topdeck");
  player.stats = { ...player.stats, might: 99, grace: 99 };
  store.savePlayer(player);

  const attack = game.runCommand(player, "attack winged kuriboh lv10", []);
  assert.match(attack.lines.join("\n"), /Collection card logged: Winged Kuriboh LV10/i);
  assert.match(attack.lines.join("\n"), /Secret Rare variant logged: Opening Night Foil/i);

  const eventPage = game.runCommand(player, "pokedex event", []);
  assert.match(eventPage.lines.join("\n"), /Event Page:/i);
  assert.match(eventPage.lines.join("\n"), /Winged Kuriboh LV10/i);
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
  assert.match(profile.lines.join("\n"), /First Pull, Starter Deck active/i);
});

test("each zone has a fightable monster that can be logged", (t) => {
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
    const result = game.runCommand(player, `attack ${npc.name}`, []);
    assert.match(result.lines.join("\n"), new RegExp(`Collection card logged: ${escapeRegExp(npc.name)}`, "i"));
    zonesWithCombat.add(zone.id);
  }

  assert.equal(zonesWithCombat.size, world.zones.size);
});

test("series mini-bosses are placed, fightable, and collectible", (t) => {
  const { game, player, store, world } = testGame(t, "mini-bosses");
  const bossIds = [
    "blue-eyes-traffic-dragon",
    "gym-leader-gyarados",
    "nicol-bolas-standee",
    "red-comet-gunpla",
    "mihawk-dockside-rival",
    "union-arena-raid-boss"
  ];
  const bossQuestIds: Partial<Record<(typeof bossIds)[number], string>> = {
    "blue-eyes-traffic-dragon": "starter-deck-panic",
    "gym-leader-gyarados": "park-roundup",
    "nicol-bolas-standee": "mana-leak-mayhem",
    "red-comet-gunpla": "frame-bay-havoc",
    "union-arena-raid-boss": "crossover-calamity"
  };

  for (const bossId of bossIds) {
    movePlayerToNpc(player, store, world, bossId);
    player.stats = { ...player.stats, might: 999, grace: 999 };
    player.hp = player.maxHp;
    const questId = bossQuestIds[bossId];
    if (questId) authorizeQuestFight(store, player, questId);
    store.savePlayer(player);

    const npc = world.npcs.get(bossId);
    assert.ok(npc, `${bossId} should exist`);
    const result = game.runCommand(player, `attack ${npc.name}`, []);

    assert.match(result.lines.join("\n"), new RegExp(`Collection card logged: ${escapeRegExp(npc.name)}`, "i"));
    assert.equal(player.binderCards.includes(bossId), true);
  }
});

function satisfyQuestPrerequisites(player: PlayerRecord, store: Store, world: World, quest: QuestDefinition) {
  for (const prerequisite of quest.prerequisites ?? []) {
    if (prerequisite.type === "level") {
      const characterConfig = CharacterConfig.load();
      player.xp = Math.max(player.xp, characterConfig.xpForLevel(prerequisite.level));
      player.level = characterConfig.levelForXp(player.xp);
    }
    if (prerequisite.type === "binderCards") {
      const combatNpcIds = [...world.npcs.values()].filter((npc) => npc.disposition !== "friendly").map((npc) => npc.id);
      player.binderCards = [...new Set([...player.binderCards, ...combatNpcIds])].slice(0, prerequisite.count);
    }
    store.savePlayer(player);
  }
}

function authorizeQuestFight(store: Store, player: PlayerRecord, questId: string) {
  store.saveQuestRecord({ playerId: player.id, questId, status: "active", completedSteps: [] });
}

function runQuestTrigger(game: Game, player: PlayerRecord, store: Store, world: World, trigger: QuestTrigger) {
  if (trigger.type === "ask" && trigger.npcId && trigger.topic) {
    movePlayerToNpc(player, store, world, trigger.npcId);
    const npc = world.npcs.get(trigger.npcId);
    assert.ok(npc, `Missing NPC ${trigger.npcId}`);
    const result = game.runCommand(player, `ask ${npc.name} about ${trigger.topic}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see them here|uncertain what you mean/i);
    return result;
  }

  if (trigger.type === "talk" && trigger.npcId) {
    movePlayerToNpc(player, store, world, trigger.npcId);
    const npc = world.npcs.get(trigger.npcId);
    assert.ok(npc, `Missing NPC ${trigger.npcId}`);
    const result = game.runCommand(player, `talk ${npc.name}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see them here/i);
    return result;
  }

  if (trigger.type === "take" && trigger.itemId) {
    movePlayerToItem(player, store, world, trigger.itemId);
    const item = world.items.get(trigger.itemId);
    assert.ok(item, `Missing item ${trigger.itemId}`);
    const result = game.runCommand(player, `take ${item.name}`, []);
    assert.doesNotMatch(result.lines.join("\n"), /You do not see that here|has not begun yet/i);
    return result;
  }

  if (trigger.type === "defeat" && trigger.npcId) {
    movePlayerToNpc(player, store, world, trigger.npcId);
    const npc = world.npcs.get(trigger.npcId);
    assert.ok(npc, `Missing NPC ${trigger.npcId}`);
    player.stats = { ...player.stats, might: 999, grace: 999, spark: 999 };
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    store.savePlayer(player);
    const result = game.runCommand(player, `attack ${npc.name}`, []);
    assert.match(result.lines.join("\n"), new RegExp(`Collection card logged: ${escapeRegExp(npc.name)}`, "i"));
    return result;
  }

  if (trigger.type === "binderCards" && trigger.count) {
    const combatNpcIds = [...world.npcs.values()].filter((npc) => npc.disposition !== "friendly").map((npc) => npc.id);
    player.binderCards = [...new Set([...player.binderCards, ...combatNpcIds])].slice(0, trigger.count);
    store.savePlayer(player);
    return game.runCommand(player, "binder", []);
  }

  if (trigger.type === "enterRoom" && trigger.roomId) {
    moveIntoRoom(game, player, store, world, trigger.roomId);
    return { lines: [] };
  }

  if ((trigger.type === "unlockDoor" || trigger.type === "openDoor") && trigger.doorId) {
    movePlayerToDoor(player, store, world, trigger.doorId);
    const door = world.door(trigger.doorId);
    const key = door.keyItemId ? world.items.get(door.keyItemId) : undefined;
    if (key && !player.inventory.includes(key.id)) player.inventory.push(key.id);
    store.savePlayer(player);
    const result = key ? game.runCommand(player, `use ${key.name}`, []) : game.runCommand(player, "open door", []);
    assert.doesNotMatch(result.lines.join("\n"), /has not begun yet|locked/i);
    return result;
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
