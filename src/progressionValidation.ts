import type {
  DoorDefinition,
  ItemSpawnDefinition,
  NpcDefinition,
  QuestDefinition,
  QuestScriptAction,
  QuestTrigger,
  RoomDefinition,
  WorldFile
} from "./types.js";

export type ProgressionIssueSeverity = "error" | "warning";

export interface ProgressionIssue {
  severity: ProgressionIssueSeverity;
  code:
    | "duplicate-id"
    | "invalid-trigger"
    | "invalid-target"
    | "quest-cycle"
    | "quest-cannot-start"
    | "quest-step-unreachable"
    | "quest-route-impossible"
    | "collection-gate-unreachable"
    | "quest-item-not-renewable"
    | "key-behind-own-door"
    | "shared-quest-gate"
    | "unreachable-room"
    | "one-way-quest-route";
  message: string;
  questId?: string;
  stepId?: string;
  entityId?: string;
}

export interface ProgressionAnalysis {
  ok: boolean;
  issues: ProgressionIssue[];
  reachableRoomIds: string[];
  obtainableItemIds: string[];
  collectibleNpcIds: string[];
  completedQuestIds: string[];
}

interface SimulationState {
  reachableRooms: Set<string>;
  items: Set<string>;
  flags: Set<string>;
  unlockedDoors: Set<string>;
  openDoors: Set<string>;
  activeQuests: Set<string>;
  completedQuests: Set<string>;
  completedSteps: Map<string, Set<string>>;
  collectibleNpcs: Set<string>;
}

interface ValidationContext {
  file: WorldFile;
  roomById: Map<string, RoomDefinition>;
  doorById: Map<string, DoorDefinition>;
  itemIds: Set<string>;
  npcById: Map<string, NpcDefinition>;
  questById: Map<string, QuestDefinition>;
  npcRooms: Map<string, Set<string>>;
  doorRooms: Map<string, Set<string>>;
  takeOwners: Map<string, Set<string>>;
  defeatOwners: Map<string, Set<string>>;
  doorOwners: Map<string, Set<string>>;
  defaultSpawnRoomId?: string;
}

const triggerFields = ["npcId", "topic", "itemId", "roomId", "doorId", "count"] as const;

export function analyzeWorldProgression(file: WorldFile): ProgressionAnalysis {
  const issues: ProgressionIssue[] = [];
  const context = buildContext(file);
  validateUniqueIds(file, issues);
  validateWorldEntryPointsAndDoors(context, issues);
  validateQuestGraph(context, issues);
  validateQuestDefinitions(context, issues);
  validateRenewableQuestItems(context, issues);
  validateSharedQuestGates(context, issues);
  validateSelfLockedKeys(context, issues);

  const state: SimulationState = {
    reachableRooms: new Set(context.defaultSpawnRoomId ? [context.defaultSpawnRoomId] : []),
    items: new Set(),
    flags: new Set(),
    unlockedDoors: new Set(file.doors.filter((door) => !door.defaultLocked).map((door) => door.id)),
    openDoors: new Set(file.doors.filter((door) => !door.defaultLocked && door.defaultOpen).map((door) => door.id)),
    activeQuests: new Set(),
    completedQuests: new Set(),
    completedSteps: new Map(),
    collectibleNpcs: new Set()
  };

  simulateProgression(context, state);
  reportBlockedProgression(context, state, issues);
  reportImpossibleDirectedQuestRoutes(context, state, issues);
  reportUnreachableOptionalRooms(context, state, issues);
  reportOneWayQuestRoutes(context, state, issues);

  const deduped = dedupeIssues(issues);
  return {
    ok: !deduped.some((issue) => issue.severity === "error"),
    issues: deduped,
    reachableRoomIds: [...state.reachableRooms].sort(),
    obtainableItemIds: [...state.items].sort(),
    collectibleNpcIds: [...state.collectibleNpcs].sort(),
    completedQuestIds: [...state.completedQuests]
  };
}

function reportImpossibleDirectedQuestRoutes(context: ValidationContext, state: SimulationState, issues: ProgressionIssue[]) {
  if (state.completedQuests.size !== context.file.quests.length || !context.defaultSpawnRoomId) return;
  const adjacency = finalAdjacency(context, state);
  const reachability = new Map<string, Set<string>>();
  const reachableFrom = (roomId: string) => {
    const cached = reachability.get(roomId);
    if (cached) return cached;
    const reached = new Set([roomId]);
    const pending = [roomId];
    while (pending.length) {
      for (const target of adjacency.get(pending.shift()!) ?? []) {
        if (reached.has(target)) continue;
        reached.add(target);
        pending.push(target);
      }
    }
    reachability.set(roomId, reached);
    return reached;
  };

  for (const quest of context.file.quests) {
    const startRooms = triggerLocationRooms(quest.startsOn, context, state);
    const possibleStarts = [...startRooms].filter((roomId) => reachableFrom(context.defaultSpawnRoomId!).has(roomId));
    const objectives = quest.steps
      .map((step) => ({ stepId: step.id, rooms: triggerLocationRooms(step.trigger, context, state) }))
      .filter((objective) => objective.rooms.size);
    if (!possibleStarts.length || !objectives.length) continue;
    if (canVisitObjectiveGroups(possibleStarts, objectives.map((objective) => objective.rooms), reachableFrom)) continue;
    issues.push({
      severity: "error",
      code: "quest-route-impossible",
      questId: quest.id,
      message: `${quest.name} has individually reachable objectives that cannot all be visited from its start in the directed room graph. Check one-way exits or trapped branches.`
    });
  }
}

function canVisitObjectiveGroups(
  starts: string[],
  groups: Set<string>[],
  reachableFrom: (roomId: string) => Set<string>
) {
  if (groups.length > 20) return true;
  const fullMask = (1 << groups.length) - 1;
  const positions = new Map<number, Set<string>>([[0, new Set(starts)]]);
  for (let mask = 0; mask <= fullMask; mask += 1) {
    const currentRooms = positions.get(mask);
    if (!currentRooms) continue;
    if (mask === fullMask) return true;
    for (let index = 0; index < groups.length; index += 1) {
      if (mask & (1 << index)) continue;
      const nextMask = mask | (1 << index);
      const nextRooms = positions.get(nextMask) ?? new Set<string>();
      for (const currentRoom of currentRooms) {
        const reachable = reachableFrom(currentRoom);
        for (const targetRoom of groups[index]) {
          if (reachable.has(targetRoom)) nextRooms.add(targetRoom);
        }
      }
      if (nextRooms.size) positions.set(nextMask, nextRooms);
    }
  }
  return false;
}

function triggerLocationRooms(trigger: QuestTrigger, context: ValidationContext, state: SimulationState) {
  if (trigger.roomId) return new Set([trigger.roomId]);
  if (trigger.npcId) return new Set(context.npcRooms.get(trigger.npcId) ?? []);
  if (trigger.doorId) return new Set(context.doorRooms.get(trigger.doorId) ?? []);
  if (trigger.itemId) {
    const sources = directItemSourceRooms(context, trigger.itemId);
    if (sources.size) return sources;
    if (state.items.has(trigger.itemId)) return new Set(state.reachableRooms);
  }
  return new Set<string>();
}

function finalAdjacency(context: ValidationContext, state: SimulationState) {
  const adjacency = new Map<string, Set<string>>();
  for (const room of context.file.rooms) {
    for (const exit of Object.values(room.exits)) {
      if (!exit || exit.hidden || (exit.requiredItemId && !state.items.has(exit.requiredItemId))) continue;
      if (exit.doorId && (!state.unlockedDoors.has(exit.doorId) || !state.openDoors.has(exit.doorId))) continue;
      addToMapSet(adjacency, room.id, exit.to);
    }
  }
  return adjacency;
}

function validateWorldEntryPointsAndDoors(context: ValidationContext, issues: ProgressionIssue[]) {
  if (!context.roomById.has(context.file.startRoomId)) {
    issues.push({
      severity: "error",
      code: "invalid-target",
      entityId: context.file.startRoomId,
      message: `World startRoomId '${context.file.startRoomId}' does not exist.`
    });
  }
  const defaultSpawn = context.file.spawnPoints.find((spawn) => spawn.id === context.file.defaultSpawnId);
  if (!defaultSpawn) {
    issues.push({
      severity: "error",
      code: "invalid-target",
      entityId: context.file.defaultSpawnId,
      message: `World defaultSpawnId '${context.file.defaultSpawnId}' does not exist.`
    });
  } else if (!context.roomById.has(defaultSpawn.roomId)) {
    issues.push({
      severity: "error",
      code: "invalid-target",
      entityId: defaultSpawn.roomId,
      message: `Default spawn point '${defaultSpawn.id}' references missing room '${defaultSpawn.roomId}'.`
    });
  }

  for (const door of context.file.doors) {
    if (door.keyItemId && !context.itemIds.has(door.keyItemId)) {
      issues.push({
        severity: "error",
        code: "invalid-target",
        entityId: door.id,
        message: `${door.name} references missing key item '${door.keyItemId}'.`
      });
    }
    if (context.doorOwners.has(door.id) && door.defaultOpen && !door.defaultLocked) {
      const independentlyGuarded = context.file.rooms
        .flatMap((room) => Object.values(room.exits))
        .filter((exit) => exit?.doorId === door.id)
        .every((exit) => Boolean(exit?.requiredItemId));
      if (!independentlyGuarded) {
        issues.push({
          severity: "warning",
          code: "shared-quest-gate",
          entityId: door.id,
          message: `${door.name} is used by a quest but starts open and unlocked, so movement can bypass its quest protection.`
        });
      }
    }
  }
}

function buildContext(file: WorldFile): ValidationContext {
  const roomById = new Map(file.rooms.map((room) => [room.id, room]));
  const doorById = new Map(file.doors.map((door) => [door.id, door]));
  const npcById = new Map(file.npcs.map((npc) => [npc.id, npc]));
  const questById = new Map(file.quests.map((quest) => [quest.id, quest]));
  const npcRooms = new Map<string, Set<string>>();
  const doorRooms = new Map<string, Set<string>>();
  for (const room of file.rooms) {
    for (const npcId of room.npcs) addToMapSet(npcRooms, npcId, room.id);
    for (const exit of Object.values(room.exits)) {
      if (exit?.doorId) addToMapSet(doorRooms, exit.doorId, room.id);
    }
  }

  const takeOwners = new Map<string, Set<string>>();
  const defeatOwners = new Map<string, Set<string>>();
  const doorOwners = new Map<string, Set<string>>();
  for (const quest of file.quests) {
    for (const step of quest.steps) {
      if (step.trigger.type === "take" && step.trigger.itemId) addToMapSet(takeOwners, step.trigger.itemId, quest.id);
      if (step.trigger.type === "defeat" && step.trigger.npcId) addToMapSet(defeatOwners, step.trigger.npcId, quest.id);
      if ((step.trigger.type === "openDoor" || step.trigger.type === "unlockDoor") && step.trigger.doorId) {
        addToMapSet(doorOwners, step.trigger.doorId, quest.id);
      }
    }
  }

  const defaultSpawnRoomId = file.spawnPoints.find((spawn) => spawn.id === file.defaultSpawnId)?.roomId;
  return {
    file,
    roomById,
    doorById,
    itemIds: new Set(file.items.map((item) => item.id)),
    npcById,
    questById,
    npcRooms,
    doorRooms,
    takeOwners,
    defeatOwners,
    doorOwners,
    defaultSpawnRoomId
  };
}

function validateUniqueIds(file: WorldFile, issues: ProgressionIssue[]) {
  const groups: Array<[string, Array<{ id: string }>]> = [
    ["zone", file.zones],
    ["spawn point", file.spawnPoints],
    ["door", file.doors],
    ["quest", file.quests],
    ["room", file.rooms],
    ["item", file.items],
    ["NPC", file.npcs]
  ];
  for (const [label, entries] of groups) {
    for (const duplicate of duplicateIds(entries)) {
      issues.push({
        severity: "error",
        code: "duplicate-id",
        entityId: duplicate,
        message: `Duplicate ${label} id '${duplicate}' would be silently overwritten at runtime.`
      });
    }
  }

  for (const quest of file.quests) {
    for (const duplicate of duplicateIds(quest.steps)) {
      issues.push({
        severity: "error",
        code: "duplicate-id",
        questId: quest.id,
        stepId: duplicate,
        entityId: duplicate,
        message: `${quest.name} has duplicate step id '${duplicate}', so the quest can never record every step.`
      });
    }
  }
}

function validateQuestGraph(context: ValidationContext, issues: ProgressionIssue[]) {
  for (const quest of context.file.quests) {
    for (const prerequisite of quest.prerequisites ?? []) {
      if (prerequisite.type === "quest" && prerequisite.questId === quest.id) {
        issues.push({ severity: "error", code: "quest-cycle", questId: quest.id, message: `${quest.name} requires itself.` });
      } else if (prerequisite.type === "quest" && !context.questById.has(prerequisite.questId)) {
        issues.push({
          severity: "error",
          code: "invalid-target",
          questId: quest.id,
          entityId: prerequisite.questId,
          message: `${quest.name} requires missing quest '${prerequisite.questId}'.`
        });
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];
  const reported = new Set<string>();
  const visit = (questId: string) => {
    if (visited.has(questId)) return;
    if (visiting.has(questId)) {
      const cycleStart = path.indexOf(questId);
      const cycle = [...path.slice(cycleStart), questId];
      const key = [...new Set(cycle)].sort().join(":");
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({
          severity: "error",
          code: "quest-cycle",
          questId,
          message: `Quest prerequisite cycle: ${cycle.map((id) => context.questById.get(id)?.name ?? id).join(" -> ")}.`
        });
      }
      return;
    }
    const quest = context.questById.get(questId);
    if (!quest) return;
    visiting.add(questId);
    path.push(questId);
    for (const prerequisite of quest.prerequisites ?? []) {
      if (prerequisite.type === "quest" && prerequisite.questId !== questId) visit(prerequisite.questId);
    }
    path.pop();
    visiting.delete(questId);
    visited.add(questId);
  };
  for (const quest of context.file.quests) visit(quest.id);
}

function validateQuestDefinitions(context: ValidationContext, issues: ProgressionIssue[]) {
  const startTriggers = new Map<string, string[]>();
  for (const quest of context.file.quests) {
    validateTrigger(`${quest.name} start`, quest.startsOn, context, issues, quest.id);
    addToMapArray(startTriggers, triggerKey(quest.startsOn), quest.id);
    for (const step of quest.steps) {
      validateTrigger(`${quest.name} step '${step.id}'`, step.trigger, context, issues, quest.id, step.id);
    }
  }

  for (const [key, questIds] of startTriggers) {
    if (questIds.length < 2 || key.includes("undefined")) continue;
    issues.push({
      severity: "warning",
      code: "shared-quest-gate",
      entityId: key,
      message: `Quests ${questIds.map((id) => context.questById.get(id)?.name ?? id).join(", ")} share the same start trigger; an unmet earlier quest can intercept it.`
    });
  }
}

function validateTrigger(
  label: string,
  trigger: QuestTrigger,
  context: ValidationContext,
  issues: ProgressionIssue[],
  questId: string,
  stepId?: string
) {
  const required: Partial<Record<QuestTrigger["type"], Array<(typeof triggerFields)[number]>>> = {
    talk: ["npcId"],
    ask: ["npcId", "topic"],
    take: ["itemId"],
    enterRoom: ["roomId"],
    unlockDoor: ["doorId"],
    openDoor: ["doorId"],
    defeat: ["npcId"],
    binderCards: ["count"]
  };
  const allowed = new Set(["type", ...(required[trigger.type] ?? [])]);
  for (const field of required[trigger.type] ?? []) {
    if (trigger[field] === undefined || trigger[field] === "") {
      issues.push({
        severity: "error",
        code: "invalid-trigger",
        questId,
        stepId,
        message: `${label} (${trigger.type}) requires '${field}'.`
      });
    }
  }
  for (const field of triggerFields) {
    if (!allowed.has(field) && trigger[field] !== undefined) {
      issues.push({
        severity: "error",
        code: "invalid-trigger",
        questId,
        stepId,
        message: `${label} (${trigger.type}) contains unrelated field '${field}'.`
      });
    }
  }

  if (trigger.npcId && !context.npcById.has(trigger.npcId)) {
    issues.push({ severity: "error", code: "invalid-target", questId, stepId, entityId: trigger.npcId, message: `${label} references missing NPC '${trigger.npcId}'.` });
  }
  if (trigger.itemId && !context.itemIds.has(trigger.itemId)) {
    issues.push({ severity: "error", code: "invalid-target", questId, stepId, entityId: trigger.itemId, message: `${label} references missing item '${trigger.itemId}'.` });
  }
  if (trigger.roomId && !context.roomById.has(trigger.roomId)) {
    issues.push({ severity: "error", code: "invalid-target", questId, stepId, entityId: trigger.roomId, message: `${label} references missing room '${trigger.roomId}'.` });
  }
  if (trigger.doorId && !context.doorById.has(trigger.doorId)) {
    issues.push({ severity: "error", code: "invalid-target", questId, stepId, entityId: trigger.doorId, message: `${label} references missing door '${trigger.doorId}'.` });
  }
  if ((trigger.type === "openDoor" || trigger.type === "unlockDoor") && trigger.doorId && !(context.doorRooms.get(trigger.doorId)?.size)) {
    issues.push({
      severity: "error",
      code: "invalid-target",
      questId,
      stepId,
      entityId: trigger.doorId,
      message: `${label} references door '${trigger.doorId}', but that door is not used by any room exit.`
    });
  }
  if (trigger.type === "defeat" && trigger.npcId) {
    const npc = context.npcById.get(trigger.npcId);
    if (npc?.disposition === "friendly") {
      issues.push({
        severity: "error",
        code: "invalid-target",
        questId,
        stepId,
        entityId: trigger.npcId,
        message: `${label} requires defeating friendly NPC '${npc.name}'.`
      });
    }
  }
  if (trigger.type === "ask" && trigger.npcId && trigger.topic) {
    const npc = context.npcById.get(trigger.npcId);
    if (npc && !Object.hasOwn(npc.dialogue.topics, trigger.topic)) {
      issues.push({
        severity: "error",
        code: "invalid-target",
        questId,
        stepId,
        entityId: trigger.npcId,
        message: `${label} uses topic '${trigger.topic}', but ${npc.name} has no exact dialogue topic with that key.`
      });
    }
  }
}

function validateRenewableQuestItems(context: ValidationContext, issues: ProgressionIssue[]) {
  const checked = new Set<string>();
  for (const quest of context.file.quests) {
    for (const trigger of [quest.startsOn, ...quest.steps.map((step) => step.trigger)]) {
      if (trigger.type !== "take" || !trigger.itemId || checked.has(trigger.itemId)) continue;
      checked.add(trigger.itemId);
      if (hasRenewableTakeSource(context, trigger.itemId)) continue;
      const itemName = context.file.items.find((item) => item.id === trigger.itemId)?.name ?? trigger.itemId;
      issues.push({
        severity: "error",
        code: "quest-item-not-renewable",
        questId: quest.id,
        entityId: trigger.itemId,
        message: `Quest pickup '${itemName}' has no renewable source. Give it a starts-available room spawn with a positive respawn timer, a repeatable drop, a merchant source, or a prior per-player reward.`
      });
    }
  }
}

function validateSharedQuestGates(context: ValidationContext, issues: ProgressionIssue[]) {
  const groups: Array<[string, Map<string, Set<string>>]> = [
    ["pickup", context.takeOwners],
    ["opponent", context.defeatOwners],
    ["door", context.doorOwners]
  ];
  for (const [label, owners] of groups) {
    for (const [entityId, questIds] of owners) {
      if (questIds.size < 2) continue;
      issues.push({
        severity: "warning",
        code: "shared-quest-gate",
        entityId,
        message: `Quest ${label} '${entityId}' is shared by ${[...questIds].map((id) => context.questById.get(id)?.name ?? id).join(", ")}; starting any one of them releases the protection for all.`
      });
    }
  }
}

function validateSelfLockedKeys(context: ValidationContext, issues: ProgressionIssue[]) {
  if (!context.defaultSpawnRoomId) return;
  for (const door of context.file.doors) {
    if (!door.defaultLocked || !door.keyItemId) continue;
    const sourceRooms = directItemSourceRooms(context, door.keyItemId);
    if (!sourceRooms.size) continue;
    const reachable = new Set([context.defaultSpawnRoomId]);
    const pending = [context.defaultSpawnRoomId];
    while (pending.length) {
      const room = context.roomById.get(pending.shift()!);
      if (!room) continue;
      for (const exit of Object.values(room.exits)) {
        if (!exit || exit.hidden || exit.doorId === door.id || exit.requiredItemId === door.keyItemId || reachable.has(exit.to)) continue;
        reachable.add(exit.to);
        pending.push(exit.to);
      }
    }
    if ([...sourceRooms].some((roomId) => reachable.has(roomId))) continue;
    const keyName = context.file.items.find((item) => item.id === door.keyItemId)?.name ?? door.keyItemId;
    issues.push({
      severity: "error",
      code: "key-behind-own-door",
      entityId: door.id,
      message: `${door.name}'s only direct ${keyName} source is behind that door or an exit requiring the same key.`
    });
  }
}

function simulateProgression(context: ValidationContext, state: SimulationState) {
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 1000) {
    iterations += 1;
    changed = expandWorld(context, state);

    for (const quest of context.file.quests) {
      if (hasQuestRecord(state, quest.id) || !prerequisitesMet(quest, state)) continue;
      if (!triggerSatisfied(quest.startsOn, context, state, "start")) continue;
      state.activeQuests.add(quest.id);
      state.completedSteps.set(quest.id, new Set());
      changed = true;
      changed = applyActions(quest.scripts?.onStart ?? [], state) || changed;
    }

    for (const quest of context.file.quests) {
      if (!state.activeQuests.has(quest.id)) continue;
      const completedSteps = state.completedSteps.get(quest.id) ?? new Set<string>();
      state.completedSteps.set(quest.id, completedSteps);
      for (const step of quest.steps) {
        if (completedSteps.has(step.id) || !triggerSatisfied(step.trigger, context, state, "step")) continue;
        completedSteps.add(step.id);
        changed = true;
        changed = applyActions(step.scripts ?? [], state) || changed;
      }
      if (completedSteps.size !== quest.steps.length) continue;
      state.activeQuests.delete(quest.id);
      state.completedQuests.add(quest.id);
      changed = true;
      changed = applyActions(quest.scripts?.onComplete ?? [], state) || changed;
      for (const reward of quest.rewards) {
        if (reward.type === "item" && reward.itemId) changed = add(state.items, reward.itemId) || changed;
        if (reward.type === "flag" && reward.flag) changed = add(state.flags, reward.flag) || changed;
      }
    }
  }
}

function expandWorld(context: ValidationContext, state: SimulationState) {
  let changed = false;
  const pending = [...state.reachableRooms];
  while (pending.length) {
    const room = context.roomById.get(pending.shift()!);
    if (!room) continue;
    for (const exit of Object.values(room.exits)) {
      if (!exit || exit.hidden || state.reachableRooms.has(exit.to)) continue;
      if (exit.requiredItemId && !state.items.has(exit.requiredItemId)) continue;
      if (exit.doorId && (!state.unlockedDoors.has(exit.doorId) || !state.openDoors.has(exit.doorId))) continue;
      state.reachableRooms.add(exit.to);
      pending.push(exit.to);
      changed = true;
    }
  }

  for (const door of context.file.doors) {
    if (state.openDoors.has(door.id) && state.unlockedDoors.has(door.id)) continue;
    if (!hasReachableDoorEdge(context, state, door.id)) continue;
    const locked = !state.unlockedDoors.has(door.id);
    if (locked && !guardReleased(context.doorOwners.get(door.id), state)) continue;
    if (!locked && door.keyItemId && !guardReleased(context.doorOwners.get(door.id), state)) continue;
    if (door.keyItemId && !state.items.has(door.keyItemId)) continue;
    changed = add(state.unlockedDoors, door.id) || changed;
    changed = add(state.openDoors, door.id) || changed;
  }

  for (const room of context.file.rooms) {
    if (!state.reachableRooms.has(room.id)) continue;
    for (const spawn of normalizedSpawns(room)) {
      if (!spawn.startsAvailable || !context.itemIds.has(spawn.itemId)) continue;
      if (!guardReleased(context.takeOwners.get(spawn.itemId), state)) continue;
      changed = add(state.items, spawn.itemId) || changed;
    }
  }

  for (const npc of context.file.npcs) {
    if (!npcIsReachable(context, state, npc.id)) continue;
    for (const itemId of npc.merchant?.items ?? []) changed = add(state.items, itemId) || changed;
    for (const topic of Object.values(npc.dialogue.topics)) {
      if (!topic.setsFlag || (topic.requiresFlag && !state.flags.has(topic.requiresFlag))) continue;
      if (dialogueTopicBlocked(context, state, npc.id, topic)) continue;
      changed = add(state.flags, topic.setsFlag) || changed;
    }
    if (npc.disposition === "friendly" || !guardReleased(context.defeatOwners.get(npc.id), state)) continue;
    changed = add(state.collectibleNpcs, npc.id) || changed;
    for (const drop of npc.combat.drops) {
      if (drop.chance <= 0 || !guardReleased(context.takeOwners.get(drop.itemId), state)) continue;
      changed = add(state.items, drop.itemId) || changed;
    }
  }
  return changed;
}

function prerequisitesMet(quest: QuestDefinition, state: SimulationState) {
  return (quest.prerequisites ?? []).every((prerequisite) => {
    if (prerequisite.type === "level") return true;
    if (prerequisite.type === "flag") return state.flags.has(prerequisite.flag);
    if (prerequisite.type === "item") return state.items.has(prerequisite.itemId);
    if (prerequisite.type === "quest") return state.completedQuests.has(prerequisite.questId);
    return state.collectibleNpcs.size >= prerequisite.count;
  });
}

function triggerSatisfied(trigger: QuestTrigger, context: ValidationContext, state: SimulationState, phase: "start" | "step") {
  if (trigger.type === "talk") return Boolean(trigger.npcId && npcIsReachable(context, state, trigger.npcId));
  if (trigger.type === "ask") {
    if (!trigger.npcId || !trigger.topic || !npcIsReachable(context, state, trigger.npcId)) return false;
    const topic = context.npcById.get(trigger.npcId)?.dialogue.topics[trigger.topic];
    if (!topic || (topic.requiresFlag && !state.flags.has(topic.requiresFlag))) return false;
    return !askInterceptedByUnmetQuest(context, state, trigger.npcId, trigger.topic);
  }
  if (trigger.type === "take") {
    return Boolean(trigger.itemId && state.items.has(trigger.itemId) && guardReleased(context.takeOwners.get(trigger.itemId), state));
  }
  if (trigger.type === "enterRoom") return Boolean(trigger.roomId && state.reachableRooms.has(trigger.roomId));
  if (trigger.type === "defeat") {
    return Boolean(
      trigger.npcId
      && context.npcById.get(trigger.npcId)?.disposition !== "friendly"
      && npcIsReachable(context, state, trigger.npcId)
      && guardReleased(context.defeatOwners.get(trigger.npcId), state)
    );
  }
  if (trigger.type === "binderCards") return Boolean(trigger.count && state.collectibleNpcs.size >= trigger.count);
  if ((trigger.type === "openDoor" || trigger.type === "unlockDoor") && trigger.doorId) {
    const door = context.doorById.get(trigger.doorId);
    if (!door || !hasReachableDoorEdge(context, state, trigger.doorId)) return false;
    if (trigger.type === "unlockDoor") {
      return state.unlockedDoors.has(trigger.doorId) && guardReleased(context.doorOwners.get(trigger.doorId), state);
    }
    const guarded = Boolean(door.keyItemId) || !state.unlockedDoors.has(trigger.doorId);
    return state.openDoors.has(trigger.doorId) && (!guarded || guardReleased(context.doorOwners.get(trigger.doorId), state));
  }
  return phase === "step" && false;
}

function applyActions(actions: QuestScriptAction[], state: SimulationState) {
  let changed = false;
  for (const action of actions) {
    if (action.type === "setFlag") changed = add(state.flags, action.flag) || changed;
    if (action.type === "openDoor" || action.type === "unlockDoor") {
      changed = add(state.unlockedDoors, action.doorId) || changed;
      changed = add(state.openDoors, action.doorId) || changed;
    }
  }
  return changed;
}

function reportBlockedProgression(context: ValidationContext, state: SimulationState, issues: ProgressionIssue[]) {
  for (const quest of context.file.quests) {
    if (state.completedQuests.has(quest.id)) continue;
    const priorQuestIds = (quest.prerequisites ?? [])
      .filter((prerequisite) => prerequisite.type === "quest")
      .map((prerequisite) => prerequisite.questId);
    if (priorQuestIds.some((questId) => !state.completedQuests.has(questId))) continue;

    if (!state.activeQuests.has(quest.id)) {
      const binderGate = (quest.prerequisites ?? []).find((prerequisite) => prerequisite.type === "binderCards" && state.collectibleNpcs.size < prerequisite.count);
      if (binderGate?.type === "binderCards") {
        issues.push({
          severity: "error",
          code: "collection-gate-unreachable",
          questId: quest.id,
          message: `${quest.name} requires ${binderGate.count} Collection cards, but only ${state.collectibleNpcs.size} distinct opponents are reachable and fightable before it starts.`
        });
        continue;
      }
      const blockers = prerequisiteBlockers(quest, context, state);
      if (blockers.length) {
        issues.push({
          severity: "error",
          code: "quest-cannot-start",
          questId: quest.id,
          message: `${quest.name} cannot start because ${blockers.join(" and ")}.`
        });
        continue;
      }
      issues.push({
        severity: "error",
        code: "quest-cannot-start",
        questId: quest.id,
        message: `${quest.name} cannot start: ${triggerBlocker(quest.startsOn, context, state)}.`
      });
      continue;
    }

    const completedSteps = state.completedSteps.get(quest.id) ?? new Set<string>();
    for (const step of quest.steps) {
      if (completedSteps.has(step.id)) continue;
      const code = step.trigger.type === "binderCards" ? "collection-gate-unreachable" : "quest-step-unreachable";
      issues.push({
        severity: "error",
        code,
        questId: quest.id,
        stepId: step.id,
        message: `${quest.name} step '${step.id}' cannot complete: ${triggerBlocker(step.trigger, context, state)}.`
      });
    }
  }
}

function prerequisiteBlockers(quest: QuestDefinition, context: ValidationContext, state: SimulationState) {
  return (quest.prerequisites ?? []).flatMap((prerequisite) => {
    if (prerequisite.type === "flag" && !state.flags.has(prerequisite.flag)) return [`flag '${prerequisite.flag}' is not obtainable`];
    if (prerequisite.type === "item" && !state.items.has(prerequisite.itemId)) {
      const name = context.file.items.find((item) => item.id === prerequisite.itemId)?.name ?? prerequisite.itemId;
      return [`required item '${name}' is not obtainable`];
    }
    return [];
  });
}

function triggerBlocker(trigger: QuestTrigger, context: ValidationContext, state: SimulationState) {
  if ((trigger.type === "talk" || trigger.type === "ask") && trigger.npcId) {
    const npc = context.npcById.get(trigger.npcId);
    if (!npcIsReachable(context, state, trigger.npcId)) return `${npc?.name ?? trigger.npcId} has no reachable placement`;
    if (trigger.type === "ask" && trigger.topic) {
      const topic = npc?.dialogue.topics[trigger.topic];
      if (!topic) return `dialogue topic '${trigger.topic}' does not exist`;
      if (topic.requiresFlag && !state.flags.has(topic.requiresFlag)) return `dialogue topic '${trigger.topic}' requires unobtainable flag '${topic.requiresFlag}'`;
      if (askInterceptedByUnmetQuest(context, state, trigger.npcId, trigger.topic)) return `another unmet quest intercepts that dialogue topic`;
    }
  }
  if (trigger.type === "take" && trigger.itemId) {
    const name = context.file.items.find((item) => item.id === trigger.itemId)?.name ?? trigger.itemId;
    return `${name} has no reachable take source while this quest is active`;
  }
  if (trigger.type === "enterRoom" && trigger.roomId) return `room '${context.roomById.get(trigger.roomId)?.name ?? trigger.roomId}' is unreachable`;
  if (trigger.type === "defeat" && trigger.npcId) {
    const npc = context.npcById.get(trigger.npcId);
    if (npc?.disposition === "friendly") return `${npc.name} is friendly`;
    return `${npc?.name ?? trigger.npcId} has no reachable fightable placement`;
  }
  if (trigger.type === "binderCards") return `only ${state.collectibleNpcs.size}/${trigger.count ?? 0} required Collection opponents are reachable`;
  if ((trigger.type === "openDoor" || trigger.type === "unlockDoor") && trigger.doorId) {
    const door = context.doorById.get(trigger.doorId);
    if (!(context.doorRooms.get(trigger.doorId)?.size)) return `door '${trigger.doorId}' is not attached to an exit`;
    if (!hasReachableDoorEdge(context, state, trigger.doorId)) return `${door?.name ?? trigger.doorId} has no reachable side`;
    if (door?.keyItemId && !state.items.has(door.keyItemId)) {
      const keyName = context.file.items.find((item) => item.id === door.keyItemId)?.name ?? door.keyItemId;
      return `${keyName} is not obtainable before ${door.name}`;
    }
    return `${door?.name ?? trigger.doorId} cannot be operated in the current quest state`;
  }
  return `its ${trigger.type} trigger is invalid or unreachable`;
}

function reportUnreachableOptionalRooms(context: ValidationContext, state: SimulationState, issues: ProgressionIssue[]) {
  if (state.completedQuests.size !== context.file.quests.length) return;
  const unreachable = context.file.rooms.filter((room) => !state.reachableRooms.has(room.id));
  for (const room of unreachable) {
    issues.push({
      severity: "warning",
      code: "unreachable-room",
      entityId: room.id,
      message: `${room.name} is still unreachable after every quest and obtainable key are resolved.`
    });
  }
}

function reportOneWayQuestRoutes(context: ValidationContext, state: SimulationState, issues: ProgressionIssue[]) {
  if (state.completedQuests.size !== context.file.quests.length || !context.defaultSpawnRoomId) return;
  const reverse = new Map<string, Set<string>>();
  for (const room of context.file.rooms) {
    for (const exit of Object.values(room.exits)) {
      if (!exit || exit.hidden || (exit.requiredItemId && !state.items.has(exit.requiredItemId))) continue;
      if (exit.doorId && (!state.unlockedDoors.has(exit.doorId) || !state.openDoors.has(exit.doorId))) continue;
      addToMapSet(reverse, exit.to, room.id);
    }
  }
  const canReturn = new Set([context.defaultSpawnRoomId]);
  const pending = [context.defaultSpawnRoomId];
  while (pending.length) {
    for (const source of reverse.get(pending.shift()!) ?? []) {
      if (canReturn.has(source)) continue;
      canReturn.add(source);
      pending.push(source);
    }
  }
  const criticalRooms = questCriticalRooms(context);
  for (const roomId of criticalRooms) {
    if (!state.reachableRooms.has(roomId) || canReturn.has(roomId)) continue;
    issues.push({
      severity: "warning",
      code: "one-way-quest-route",
      entityId: roomId,
      message: `Quest-critical room ${context.roomById.get(roomId)?.name ?? roomId} has no route back to the new-player spawn after progression is complete.`
    });
  }
}

function questCriticalRooms(context: ValidationContext) {
  const rooms = new Set<string>();
  const addTriggerRooms = (trigger: QuestTrigger) => {
    if (trigger.roomId) rooms.add(trigger.roomId);
    if (trigger.npcId) for (const roomId of context.npcRooms.get(trigger.npcId) ?? []) rooms.add(roomId);
    if (trigger.itemId) for (const roomId of directItemSourceRooms(context, trigger.itemId)) rooms.add(roomId);
    if (trigger.doorId) for (const roomId of context.doorRooms.get(trigger.doorId) ?? []) rooms.add(roomId);
  };
  for (const quest of context.file.quests) {
    addTriggerRooms(quest.startsOn);
    for (const step of quest.steps) addTriggerRooms(step.trigger);
  }
  return rooms;
}

function dialogueTopicBlocked(context: ValidationContext, state: SimulationState, npcId: string, topic: NpcDefinition["dialogue"]["topics"][string]) {
  const entry = Object.entries(context.npcById.get(npcId)?.dialogue.topics ?? {}).find(([, candidate]) => candidate === topic);
  return entry ? askInterceptedByUnmetQuest(context, state, npcId, entry[0]) : false;
}

function askInterceptedByUnmetQuest(context: ValidationContext, state: SimulationState, npcId: string, topic: string) {
  return context.file.quests.some((quest) => {
    return !hasQuestRecord(state, quest.id)
      && quest.startsOn.type === "ask"
      && quest.startsOn.npcId === npcId
      && quest.startsOn.topic === topic
      && !prerequisitesMet(quest, state);
  });
}

function npcIsReachable(context: ValidationContext, state: SimulationState, npcId: string) {
  return [...(context.npcRooms.get(npcId) ?? [])].some((roomId) => state.reachableRooms.has(roomId));
}

function hasReachableDoorEdge(context: ValidationContext, state: SimulationState, doorId: string) {
  return [...(context.doorRooms.get(doorId) ?? [])].some((roomId) => state.reachableRooms.has(roomId));
}

function guardReleased(owners: Set<string> | undefined, state: SimulationState) {
  return !owners?.size || [...owners].some((questId) => hasQuestRecord(state, questId));
}

function hasQuestRecord(state: SimulationState, questId: string) {
  return state.activeQuests.has(questId) || state.completedQuests.has(questId);
}

function hasRenewableTakeSource(context: ValidationContext, itemId: string) {
  const roomSpawn = context.file.rooms.some((room) => normalizedSpawns(room).some((spawn) => {
    return spawn.itemId === itemId && spawn.startsAvailable && (spawn.respawnSeconds ?? 0) > 0;
  }));
  const repeatableDrop = context.file.npcs.some((npc) => npc.disposition !== "friendly" && npc.combat.drops.some((drop) => drop.itemId === itemId && drop.chance > 0));
  const merchant = context.file.npcs.some((npc) => npc.merchant?.items.includes(itemId));
  const perPlayerReward = context.file.quests.some((quest) => quest.rewards.some((reward) => reward.type === "item" && reward.itemId === itemId));
  return roomSpawn || repeatableDrop || merchant || perPlayerReward;
}

function directItemSourceRooms(context: ValidationContext, itemId: string) {
  const rooms = new Set<string>();
  for (const room of context.file.rooms) {
    if (normalizedSpawns(room).some((spawn) => spawn.itemId === itemId && spawn.startsAvailable)) rooms.add(room.id);
  }
  for (const npc of context.file.npcs) {
    const providesItem = npc.combat.drops.some((drop) => drop.itemId === itemId && drop.chance > 0) || npc.merchant?.items.includes(itemId);
    if (providesItem) for (const roomId of context.npcRooms.get(npc.id) ?? []) rooms.add(roomId);
  }
  return rooms;
}

function normalizedSpawns(room: RoomDefinition): ItemSpawnDefinition[] {
  const explicit = room.itemSpawns ?? [];
  const explicitIds = new Set(explicit.map((spawn) => spawn.itemId));
  const legacy = (room.items ?? [])
    .filter((itemId) => !explicitIds.has(itemId))
    .map((itemId) => ({ itemId, quantity: 1, startsAvailable: true }));
  return [...explicit, ...legacy];
}

function triggerKey(trigger: QuestTrigger) {
  return [trigger.type, trigger.npcId, trigger.topic, trigger.itemId, trigger.roomId, trigger.doorId, trigger.count].join(":");
}

function duplicateIds(entries: Array<{ id: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) duplicates.add(entry.id);
    seen.add(entry.id);
  }
  return duplicates;
}

function addToMapSet(map: Map<string, Set<string>>, key: string, value: string) {
  map.set(key, new Set([...(map.get(key) ?? []), value]));
}

function addToMapArray(map: Map<string, string[]>, key: string, value: string) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function add<T>(set: Set<T>, value: T) {
  if (set.has(value)) return false;
  set.add(value);
  return true;
}

function dedupeIssues(issues: ProgressionIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [issue.severity, issue.code, issue.questId, issue.stepId, issue.entityId, issue.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
