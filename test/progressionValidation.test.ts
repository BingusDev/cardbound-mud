import assert from "node:assert/strict";
import test from "node:test";
import { validateBuilderWorld } from "../src/adminWorld.js";
import { analyzeWorldProgression } from "../src/progressionValidation.js";
import type { WorldFile } from "../src/types.js";
import { loadWorldFile, World } from "../src/world.js";

function worldClone() {
  return structuredClone(loadWorldFile());
}

function messages(file: WorldFile, severity: "error" | "warning" = "error") {
  return analyzeWorldProgression(file).issues.filter((issue) => issue.severity === severity).map((issue) => issue.message).join("\n");
}

test("the symbolic progression proof completes the current world", () => {
  const file = worldClone();
  const analysis = analyzeWorldProgression(file);
  const builder = validateBuilderWorld(file);

  assert.equal(analysis.ok, true);
  assert.deepEqual(analysis.issues, []);
  assert.equal(analysis.completedQuestIds.length, file.quests.length);
  assert.equal(analysis.reachableRoomIds.length, file.rooms.length);
  assert.ok(analysis.collectibleNpcIds.length >= 12);
  assert.equal(builder.ok, true);
  assert.deepEqual(builder.issues, []);
  assert.deepEqual(builder.warnings, []);
  assert.deepEqual(builder.progression.completedQuests, file.quests.length);
});

test("duplicate world and quest-step ids are rejected before Maps can hide them", () => {
  const duplicateRoom = worldClone();
  duplicateRoom.rooms.push(structuredClone(duplicateRoom.rooms[0]));
  assert.match(messages(duplicateRoom), /Duplicate room id '.+' would be silently overwritten/i);
  assert.throws(() => new World(duplicateRoom), /Duplicate room id/i);

  const duplicateStep = worldClone();
  const starter = duplicateStep.quests[0];
  starter.steps.push({ ...structuredClone(starter.steps[0]), label: "Duplicate fatal step" });
  assert.match(messages(duplicateStep), /duplicate step id '.+'.*never record every step/i);
  assert.throws(() => new World(duplicateStep), /duplicate step id/i);
});

test("quest starts fail when their giver is only reachable behind their own progression", () => {
  const file = worldClone();
  for (const room of file.rooms) room.npcs = room.npcs.filter((npcId) => npcId !== "binder-marshal");
  file.rooms.find((room) => room.id === "main-concourse")!.npcs.push("binder-marshal");

  assert.match(messages(file), /Duel Disk Lockdown cannot start: Marshal Echo has no reachable placement/i);
  assert.match(validateBuilderWorld(file).issues.join("\n"), /Marshal Echo has no reachable placement/i);
  assert.throws(() => new World(file), /Marshal Echo has no reachable placement/i);
});

test("a key placed entirely behind its own door is diagnosed directly", () => {
  const file = worldClone();
  for (const room of file.rooms) {
    room.items = room.items.filter((itemId) => itemId !== "sleeve-key");
    room.itemSpawns = room.itemSpawns.filter((spawn) => spawn.itemId !== "sleeve-key");
  }
  const concourse = file.rooms.find((room) => room.id === "main-concourse")!;
  concourse.items.push("sleeve-key");
  concourse.itemSpawns.push({ itemId: "sleeve-key", quantity: 1, startsAvailable: true, respawnSeconds: 5 });

  assert.match(messages(file), /Duel Disk turnstile's only direct Duel Disk keycard source is behind that door/i);
  assert.throws(() => new World(file), /only direct Duel Disk keycard source is behind that door/i);
});

test("quest take objectives require at least one renewable shared-world source", () => {
  const unsafe = worldClone();
  for (const room of unsafe.rooms) {
    for (const spawn of room.itemSpawns) {
      if (spawn.itemId === "sleeve-key") spawn.respawnSeconds = 0;
    }
  }
  assert.match(messages(unsafe), /Quest pickup 'Duel Disk keycard' has no renewable source/i);
  assert.throws(() => new World(unsafe), /Duel Disk keycard.*no renewable source/i);

  const alternate = structuredClone(unsafe);
  const plaza = alternate.rooms.find((room) => room.id === "binder-square")!;
  plaza.itemSpawns.push({ itemId: "sleeve-key", quantity: 1, startsAvailable: true, respawnSeconds: 5 });
  assert.doesNotMatch(messages(alternate), /Duel Disk keycard.*no renewable source/i);
});

test("quest objectives are checked against prerequisite-aware room reachability", () => {
  const file = worldClone();
  const relay = file.quests.find((quest) => quest.id === "citywide-signal")!;
  const roofStep = relay.steps.find((step) => step.id === "reach-broadcast-roof")!;
  roofStep.trigger = { type: "enterRoom", roomId: "crossover-pavilion" };

  assert.match(messages(file), /Rotom Radio Relay step 'reach-broadcast-roof' cannot complete: room 'Union Arena Pavilion' is unreachable/i);
  assert.throws(() => new World(file), /reach-broadcast-roof.*unreachable/i);
});

test("individually reachable objectives cannot be combined across a one-way quest trap", () => {
  const file = worldClone();
  const foodCourt = file.rooms.find((room) => room.id === "food-court")!;
  delete foodCourt.exits.north;
  delete foodCourt.exits.east;

  assert.match(messages(file), /Rotom Radio Relay has individually reachable objectives that cannot all be visited from its start/i);
  assert.throws(() => new World(file), /Rotom Radio Relay has individually reachable objectives/i);
});

test("Collection gates count only opponents available before that quest", () => {
  const file = worldClone();
  const relay = file.quests.find((quest) => quest.id === "citywide-signal")!;
  const gate = relay.prerequisites!.find((prerequisite) => prerequisite.type === "binderCards")!;
  assert.equal(gate.type, "binderCards");
  gate.count = 22;
  assert.ok(file.npcs.filter((npc) => npc.disposition !== "friendly").length > gate.count);

  assert.match(messages(file), /Rotom Radio Relay requires 22 Collection cards, but only 21 distinct opponents are reachable and fightable before it starts/i);
  assert.throws(() => new World(file), /only 21 distinct opponents are reachable/i);
});

test("semantic trigger mistakes are rejected with actionable messages", () => {
  const badTopic = worldClone();
  badTopic.quests[0].startsOn = { type: "ask", npcId: "binder-marshal", topic: "typo-topic" };
  assert.match(messages(badTopic), /Marshal Echo has no exact dialogue topic with that key/i);

  const friendlyTarget = worldClone();
  friendlyTarget.quests[0].steps.find((step) => step.id === "defeat-blue-eyes-traffic")!.trigger = {
    type: "defeat",
    npcId: "binder-marshal"
  };
  assert.match(messages(friendlyTarget), /requires defeating friendly NPC 'Marshal Echo'/i);

  const orphanDoor = worldClone();
  orphanDoor.doors.push({ id: "orphan-door", name: "Orphan Door", description: "No exits use it.", defaultOpen: false, defaultLocked: false });
  orphanDoor.quests[0].steps.find((step) => step.id === "open-sleeve-turnstile")!.trigger = { type: "openDoor", doorId: "orphan-door" };
  assert.match(messages(orphanDoor), /door 'orphan-door'.*not used by any room exit/i);
});

test("item and flag dependencies produced only downstream are detected", () => {
  const itemCycle = worldClone();
  itemCycle.quests[0].prerequisites!.push({ type: "item", itemId: "trainer-jacket" });
  assert.match(messages(itemCycle), /Duel Disk Lockdown cannot start because required item 'Pokemon Trainer jacket' is not obtainable/i);

  const flagCycle = worldClone();
  flagCycle.quests[0].prerequisites!.push({ type: "flag", flag: "mall_route_open" });
  assert.match(messages(flagCycle), /Duel Disk Lockdown cannot start because flag 'mall_route_open' is not obtainable/i);
});

test("shared quest protections are warnings and do not prevent runtime loading", () => {
  const file = worldClone();
  const relay = file.quests.find((quest) => quest.id === "citywide-signal")!;
  relay.steps.push({
    id: "rematch-blue-eyes",
    label: "Rematch Blue-Eyes White Dragon.",
    trigger: { type: "defeat", npcId: "blue-eyes-traffic-dragon" }
  });

  const analysis = analyzeWorldProgression(file);
  assert.equal(analysis.ok, true);
  assert.match(messages(file, "warning"), /opponent 'blue-eyes-traffic-dragon' is shared/i);
  assert.doesNotThrow(() => new World(file));
});
