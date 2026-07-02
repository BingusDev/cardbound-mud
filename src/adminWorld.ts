import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Direction, ItemDefinition, NpcDefinition, QuestDefinition, RoomDefinition, WorldFile, ZoneDefinition } from "./types.js";
import { loadWorldFile, validateWorldFile } from "./world.js";

const worldPath = path.join(process.cwd(), "data", "world.json");
const backupDir = path.join(process.cwd(), "data", "admin-backups");
const editableDirections = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly Direction[];
const directionInputSchema = z.enum(editableDirections);
const oppositeDirections: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
  up: "down",
  down: "up"
};

const exitInputSchema = z.object({
  to: z.string().trim(),
  label: z.string().trim().optional(),
  doorId: z.string().trim().optional(),
  requiredItemId: z.string().trim().optional(),
  hidden: z.boolean().optional(),
  blockedMessage: z.string().trim().optional()
});
const itemSpawnInputSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).default(1),
  respawnSeconds: z.number().int().min(0).optional(),
  startsAvailable: z.boolean().default(true)
});
const questTriggerInputSchema = z.object({
  type: z.enum(["talk", "ask", "take", "enterRoom", "unlockDoor", "openDoor"]),
  npcId: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  itemId: z.string().trim().optional(),
  roomId: z.string().trim().optional(),
  doorId: z.string().trim().optional()
});
const questScriptActionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    lines: z.array(z.string().trim()).default([])
  }),
  z.object({
    type: z.literal("setFlag"),
    flag: z.string().trim().min(1)
  }),
  z.object({
    type: z.literal("openDoor"),
    doorId: z.string().trim().min(1),
    line: z.string().trim().optional()
  }),
  z.object({
    type: z.literal("unlockDoor"),
    doorId: z.string().trim().min(1),
    line: z.string().trim().optional()
  })
]);
const questPrerequisiteInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("level"), level: z.number().int().min(1) }),
  z.object({ type: z.literal("flag"), flag: z.string().trim().min(1) }),
  z.object({ type: z.literal("item"), itemId: z.string().trim().min(1) }),
  z.object({ type: z.literal("quest"), questId: z.string().trim().min(1) })
]);
const questInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  description: z.string().trim().min(1),
  tags: z.array(z.string().trim()).default([]),
  prerequisites: z.array(questPrerequisiteInputSchema).default([]),
  startsOn: questTriggerInputSchema,
  scripts: z.object({
    onStart: z.array(questScriptActionInputSchema).optional(),
    onComplete: z.array(questScriptActionInputSchema).optional()
  }).optional(),
  steps: z.array(
    z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      objective: z.string().trim().optional(),
      trigger: questTriggerInputSchema,
      scripts: z.array(questScriptActionInputSchema).optional()
    })
  ).default([]),
  rewards: z.array(
    z.object({
      type: z.enum(["title", "tickets", "xp", "item", "flag"]),
      label: z.string().trim().min(1),
      amount: z.number().optional(),
      itemId: z.string().trim().optional(),
      flag: z.string().trim().optional()
    })
  ).default([])
});
const npcBehaviorInputSchema = z.object({
  stationary: z.boolean().optional(),
  autoEngage: z.boolean().optional(),
  wander: z.object({
    enabled: z.boolean(),
    intervalSeconds: z.number().int().min(1)
  }).optional()
});
const zoneInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  tags: z.array(z.string().trim()).default([]),
  map: z.object({
    label: z.string().trim().min(1),
    color: z.string().trim().min(1),
    danger: z.enum(["safe", "low", "medium", "high"])
  }),
  levelRange: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).optional(),
  defaultSpawnRoomId: z.string().trim().min(1)
});
const itemInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  type: z.enum(["misc", "consumable", "equipment", "key"]).default("misc"),
  value: z.number().int().min(0).optional(),
  consumable: z.object({ hp: z.number().int().min(0).optional(), mana: z.number().int().min(0).optional() }).optional(),
  equipment: z.object({
    slot: z.enum(["trinket", "head", "body", "feet"]),
    statBonuses: z.record(z.number())
  }).optional()
});
const merchantInputSchema = z.object({
  buys: z.boolean().default(true),
  markup: z.number().min(0).default(1),
  markdown: z.number().min(0).max(1).default(0.5),
  items: z.array(z.string().trim()).default([])
});
const npcCardInputSchema = z.object({
  page: z.string().trim().optional(),
  rarity: z.enum(["common", "uncommon", "rare", "showcase"]).optional(),
  flavor: z.string().trim().optional(),
  variant: z.boolean().optional(),
  event: z.string().trim().optional()
});
const npcInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  species: z.string().trim().min(1),
  description: z.string().trim().min(1),
  card: npcCardInputSchema.optional(),
  stats: z.record(z.number()),
  hp: z.number().int().min(1),
  mana: z.number().int().min(0),
  disposition: z.enum(["friendly", "wild", "hostile"]),
  behavior: npcBehaviorInputSchema.optional(),
  combat: z.object({
    attackName: z.string().trim().min(1),
    defeatMessage: z.string().trim().min(1),
    respawnSeconds: z.number().int().min(0),
    xp: z.number().int().min(0),
    tickets: z.number().int().min(0),
    drops: z.array(
      z.object({
        itemId: z.string().trim().min(1),
        chance: z.number().min(0).max(1),
        quantity: z.number().int().min(1).default(1)
      })
    ).default([])
  }),
  dialogue: z.object({
    greeting: z.array(z.string().trim()).default([]),
    topics: z.record(
      z.object({
        prompt: z.string().trim().optional(),
        aliases: z.array(z.string().trim()).default([]),
        response: z.array(z.string().trim()).default([]),
        requiresFlag: z.string().trim().optional(),
        setsFlag: z.string().trim().optional()
      })
    ).default({})
  }),
  merchant: merchantInputSchema.optional()
});

export const roomInputSchema = z.object({
  id: z.string().trim().min(1),
  zoneId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  coords: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  }),
  tags: z.array(z.string().trim()).default([]),
  map: z.object({
    symbol: z.string().trim().min(1),
    color: z.string().trim().optional(),
    label: z.string().trim().optional()
  }),
  exits: z.record(z.enum(editableDirections), exitInputSchema).default({}),
  items: z.array(z.string().trim()).default([]),
  itemSpawns: z.array(itemSpawnInputSchema).default([]),
  npcs: z.array(z.string().trim()).default([])
});

export function adminWorldView() {
  const file = loadWorldFile(worldPath);
  return {
    ...file,
    validation: validateBuilderWorld(file)
  };
}

export function saveRoom(roomId: string, input: unknown) {
  const nextRoom = normalizeRoom(roomInputSchema.parse(input));
  if (nextRoom.id !== roomId) {
    throw new Error("Room id cannot be changed in this editor yet.");
  }

  const file = loadWorldFile(worldPath);
  const index = file.rooms.findIndex((room) => room.id === roomId);
  if (index === -1) throw new Error(`Room '${roomId}' does not exist.`);

  const nextFile: WorldFile = {
    ...file,
    rooms: file.rooms.map((room, roomIndex) => (roomIndex === index ? nextRoom : room))
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createRoom(input: unknown) {
  const nextRoom = normalizeRoom(roomInputSchema.parse(input));
  const file = loadWorldFile(worldPath);
  if (file.rooms.some((room) => room.id === nextRoom.id)) {
    throw new Error(`Room '${nextRoom.id}' already exists.`);
  }

  const nextFile: WorldFile = {
    ...file,
    rooms: [...file.rooms, nextRoom]
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createLinkedRoom(sourceRoomId: string, directionInput: unknown, input: unknown) {
  const direction = directionInputSchema.parse(directionInput);
  const nextRoom = normalizeRoom(roomInputSchema.parse(input));
  const file = loadWorldFile(worldPath);
  const sourceRoom = file.rooms.find((room) => room.id === sourceRoomId);
  if (!sourceRoom) throw new Error(`Source room '${sourceRoomId}' does not exist.`);
  if (file.rooms.some((room) => room.id === nextRoom.id)) {
    throw new Error(`Room '${nextRoom.id}' already exists.`);
  }
  if (sourceRoom.exits[direction]?.to) {
    throw new Error(`${sourceRoom.name} already has a ${direction} exit.`);
  }

  const oppositeDirection = oppositeDirections[direction];
  const linkedRoom: RoomDefinition = {
    ...nextRoom,
    exits: {
      ...nextRoom.exits,
      [oppositeDirection]: cleanObject({ to: sourceRoom.id })
    }
  };
  const updatedSource: RoomDefinition = {
    ...sourceRoom,
    exits: {
      ...sourceRoom.exits,
      [direction]: cleanObject({ to: linkedRoom.id })
    }
  };
  const nextFile: WorldFile = {
    ...file,
    rooms: file.rooms.map((room) => (room.id === sourceRoom.id ? updatedSource : room)).concat(linkedRoom)
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createZone(input: unknown, roomInput: unknown) {
  const nextZone = normalizeZone(zoneInputSchema.parse(input));
  const firstRoom = normalizeRoom(roomInputSchema.parse(roomInput));
  if (firstRoom.zoneId !== nextZone.id) {
    throw new Error("The first room must belong to the new zone.");
  }
  if (nextZone.defaultSpawnRoomId !== firstRoom.id) {
    throw new Error("The new zone default spawn room must be its first room.");
  }

  const file = loadWorldFile(worldPath);
  if (file.zones.some((zone) => zone.id === nextZone.id)) {
    throw new Error(`Zone '${nextZone.id}' already exists.`);
  }
  if (file.rooms.some((room) => room.id === firstRoom.id)) {
    throw new Error(`Room '${firstRoom.id}' already exists.`);
  }

  const nextFile: WorldFile = {
    ...file,
    zones: [...file.zones, nextZone],
    rooms: [...file.rooms, firstRoom]
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function connectRooms(sourceRoomId: string, targetRoomId: string, directionInput: unknown) {
  const direction = directionInputSchema.parse(directionInput);
  const file = loadWorldFile(worldPath);
  const sourceRoom = file.rooms.find((room) => room.id === sourceRoomId);
  const targetRoom = file.rooms.find((room) => room.id === targetRoomId);
  if (!sourceRoom) throw new Error(`Source room '${sourceRoomId}' does not exist.`);
  if (!targetRoom) throw new Error(`Target room '${targetRoomId}' does not exist.`);
  if (sourceRoom.id === targetRoom.id) throw new Error("A room cannot connect to itself.");
  if (sourceRoom.exits[direction]?.to && sourceRoom.exits[direction]?.to !== targetRoom.id) {
    throw new Error(`${sourceRoom.name} already has a ${direction} exit.`);
  }

  const oppositeDirection = oppositeDirections[direction];
  if (targetRoom.exits[oppositeDirection]?.to && targetRoom.exits[oppositeDirection]?.to !== sourceRoom.id) {
    throw new Error(`${targetRoom.name} already has a ${oppositeDirection} exit.`);
  }

  const updatedSource: RoomDefinition = {
    ...sourceRoom,
    exits: {
      ...sourceRoom.exits,
      [direction]: cleanObject({ to: targetRoom.id })
    }
  };
  const updatedTarget: RoomDefinition = {
    ...targetRoom,
    exits: {
      ...targetRoom.exits,
      [oppositeDirection]: cleanObject({ to: sourceRoom.id })
    }
  };
  const nextFile: WorldFile = {
    ...file,
    rooms: file.rooms.map((room) => {
      if (room.id === updatedSource.id) return updatedSource;
      if (room.id === updatedTarget.id) return updatedTarget;
      return room;
    })
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function saveQuest(questId: string, input: unknown) {
  const nextQuest = normalizeQuest(questInputSchema.parse(input));
  if (nextQuest.id !== questId) {
    throw new Error("Quest id cannot be changed in this editor yet.");
  }

  const file = loadWorldFile(worldPath);
  const index = file.quests.findIndex((quest) => quest.id === questId);
  if (index === -1) throw new Error(`Quest '${questId}' does not exist.`);
  const nextFile: WorldFile = {
    ...file,
    quests: file.quests.map((quest, questIndex) => (questIndex === index ? nextQuest : quest))
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createQuest(input: unknown) {
  const nextQuest = normalizeQuest(questInputSchema.parse(input));
  const file = loadWorldFile(worldPath);
  if (file.quests.some((quest) => quest.id === nextQuest.id)) {
    throw new Error(`Quest '${nextQuest.id}' already exists.`);
  }
  const nextFile: WorldFile = {
    ...file,
    quests: [...file.quests, nextQuest]
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function saveItem(itemId: string, input: unknown) {
  const nextItem = normalizeItem(itemInputSchema.parse(input));
  if (nextItem.id !== itemId) {
    throw new Error("Item id cannot be changed in this editor yet.");
  }

  const file = loadWorldFile(worldPath);
  const index = file.items.findIndex((item) => item.id === itemId);
  if (index === -1) throw new Error(`Item '${itemId}' does not exist.`);
  const nextFile: WorldFile = {
    ...file,
    items: file.items.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createItem(input: unknown) {
  const nextItem = normalizeItem(itemInputSchema.parse(input));
  const file = loadWorldFile(worldPath);
  if (file.items.some((item) => item.id === nextItem.id)) {
    throw new Error(`Item '${nextItem.id}' already exists.`);
  }
  const nextFile: WorldFile = {
    ...file,
    items: [...file.items, nextItem]
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function saveNpc(npcId: string, input: unknown) {
  const nextNpc = normalizeNpc(npcInputSchema.parse(input));
  if (nextNpc.id !== npcId) {
    throw new Error("NPC id cannot be changed in this editor yet.");
  }

  const file = loadWorldFile(worldPath);
  const index = file.npcs.findIndex((npc) => npc.id === npcId);
  if (index === -1) throw new Error(`NPC '${npcId}' does not exist.`);
  const nextFile: WorldFile = {
    ...file,
    npcs: file.npcs.map((npc, npcIndex) => (npcIndex === index ? nextNpc : npc))
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

export function createNpc(input: unknown) {
  const nextNpc = normalizeNpc(npcInputSchema.parse(input));
  const file = loadWorldFile(worldPath);
  if (file.npcs.some((npc) => npc.id === nextNpc.id)) {
    throw new Error(`NPC '${nextNpc.id}' already exists.`);
  }
  const nextFile: WorldFile = {
    ...file,
    npcs: [...file.npcs, nextNpc]
  };
  validateWorldFile(nextFile);
  writeWorldFile(nextFile);
  return adminWorldView();
}

function writeWorldFile(file: WorldFile) {
  backupFile(worldPath, "world");
  fs.writeFileSync(worldPath, `${JSON.stringify(file, null, 2)}\n`);
}

function normalizeZone(zone: ZoneDefinition): ZoneDefinition {
  return {
    ...zone,
    tags: zone.tags.filter(Boolean),
    levelRange: zone.levelRange ? { min: zone.levelRange.min, max: zone.levelRange.max } : undefined
  };
}

function backupFile(filePath: string, label: string) {
  if (!fs.existsSync(filePath)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "-");
  fs.copyFileSync(filePath, path.join(backupDir, `${label}-${stamp}.json`));
}

export function validateBuilderWorld(file = loadWorldFile(worldPath)) {
  const issues: string[] = [];
  const roomIds = new Set(file.rooms.map((room) => room.id));
  const zoneIds = new Set(file.zones.map((zone) => zone.id));
  const doorIds = new Set(file.doors.map((door) => door.id));
  const itemIds = new Set(file.items.map((item) => item.id));
  const npcIds = new Set(file.npcs.map((npc) => npc.id));
  const questIds = new Set(file.quests.map((quest) => quest.id));
  const seenCoords = new Map<string, string>();
  const placedNpcIds = new Set<string>();
  const placedItemIds = new Set<string>();
  const triggerItemIds = new Set<string>();
  const triggerNpcIds = new Set<string>();
  const triggerRoomIds = new Set<string>();
  const rewardItemIds = new Set<string>();
  const grantedFlags = new Set<string>();

  for (const zone of file.zones) {
    if (!roomIds.has(zone.defaultSpawnRoomId)) issues.push(`${zone.name} default spawn room '${zone.defaultSpawnRoomId}' is missing.`);
    if (zone.levelRange && zone.levelRange.max < zone.levelRange.min) issues.push(`${zone.name} has an inverted level range.`);
  }

  for (const room of file.rooms) {
    if (!zoneIds.has(room.zoneId)) issues.push(`${room.name} references missing zone '${room.zoneId}'.`);
    if (!Object.keys(room.exits).length) issues.push(`${room.name} has no exits.`);
    const zone = file.zones.find((candidate) => candidate.id === room.zoneId);
    if (zone?.levelRange) {
      const combatNpcs = room.npcs.map((npcId) => file.npcs.find((npc) => npc.id === npcId)).filter((npc): npc is NpcDefinition => Boolean(npc));
      if (combatNpcs.some((npc) => npc.combat.xp <= 0 && npc.disposition !== "friendly")) {
        issues.push(`${room.name} has a combat NPC with no XP reward.`);
      }
    }
    const coordKey = `${room.zoneId}:${room.coords.x},${room.coords.y},${room.coords.z}`;
    const coordOwner = seenCoords.get(coordKey);
    if (coordOwner) issues.push(`${room.name} shares map coordinates with ${coordOwner}.`);
    seenCoords.set(coordKey, room.name);

    for (const spawn of room.itemSpawns) {
      if (!itemIds.has(spawn.itemId)) issues.push(`${room.name} spawns missing item '${spawn.itemId}'.`);
      placedItemIds.add(spawn.itemId);
      if ((spawn.respawnSeconds ?? 0) <= 0 && spawn.quantity > 0) issues.push(`${room.name} spawn for '${spawn.itemId}' has no respawn timer.`);
    }
    for (const itemId of room.items) placedItemIds.add(itemId);
    for (const npcId of room.npcs) {
      if (!npcIds.has(npcId)) issues.push(`${room.name} contains missing NPC '${npcId}'.`);
      placedNpcIds.add(npcId);
    }
    for (const [direction, exit] of Object.entries(room.exits)) {
      if (!exit) continue;
      if (!roomIds.has(exit.to)) issues.push(`${room.name} ${direction} exit points to missing room '${exit.to}'.`);
      if (exit.doorId && !doorIds.has(exit.doorId)) issues.push(`${room.name} ${direction} exit references missing door '${exit.doorId}'.`);
      const door = exit.doorId ? file.doors.find((candidate) => candidate.id === exit.doorId) : undefined;
      if (door?.keyItemId && exit.requiredItemId !== door.keyItemId) {
        issues.push(`${room.name} ${direction} exit uses keyed door '${door.name}' but does not require '${door.keyItemId}'.`);
      }
      if (exit.requiredItemId && !itemIds.has(exit.requiredItemId)) {
        issues.push(`${room.name} ${direction} exit requires missing item '${exit.requiredItemId}'.`);
      }
    }
  }

  for (const npc of file.npcs) {
    if (!placedNpcIds.has(npc.id)) issues.push(`${npc.name} is not placed in any room.`);
    if (npc.disposition !== "friendly" && npc.combat.xp <= 0 && npc.combat.tickets <= 0 && !npc.combat.drops.length) {
      issues.push(`${npc.name} is fightable but has no XP, Prize Tickets, or drops.`);
    }
    if (!npc.dialogue.greeting.length) issues.push(`${npc.name} has no greeting lines.`);
    if (npc.disposition === "friendly" && !Object.keys(npc.dialogue.topics ?? {}).length && !npc.merchant) {
      issues.push(`${npc.name} is friendly but has no dialogue topics or merchant wares.`);
    }
    for (const [key, topic] of Object.entries(npc.dialogue.topics ?? {})) {
      if (!topic.response.length) issues.push(`${npc.name} topic '${key}' has no response lines.`);
      if (topic.setsFlag) grantedFlags.add(topic.setsFlag);
    }
    for (const drop of npc.combat.drops) {
      if (!itemIds.has(drop.itemId)) issues.push(`${npc.name} drops missing item '${drop.itemId}'.`);
      placedItemIds.add(drop.itemId);
    }
    for (const itemId of npc.merchant?.items ?? []) {
      if (!itemIds.has(itemId)) issues.push(`${npc.name} sells missing item '${itemId}'.`);
      placedItemIds.add(itemId);
    }
    if (npc.behavior?.autoEngage && npc.disposition === "friendly") issues.push(`${npc.name} auto-engages but is marked friendly.`);
    if (npc.behavior?.wander?.enabled && npc.behavior.stationary) issues.push(`${npc.name} cannot be both stationary and wandering.`);
  }

  for (const quest of file.quests) {
    for (const action of [...(quest.scripts?.onStart ?? []), ...(quest.scripts?.onComplete ?? [])]) {
      if (action.type === "setFlag") grantedFlags.add(action.flag);
    }
    for (const step of quest.steps) {
      for (const action of step.scripts ?? []) {
        if (action.type === "setFlag") grantedFlags.add(action.flag);
      }
    }
    for (const reward of quest.rewards) {
      if (reward.flag) grantedFlags.add(reward.flag);
    }
  }

  for (const quest of file.quests) {
    if (!quest.steps.length) issues.push(`${quest.name} has no quest steps.`);
    if (!quest.rewards.length) issues.push(`${quest.name} has no rewards.`);
    for (const prerequisite of quest.prerequisites ?? []) {
      if (prerequisite.type === "item" && !itemIds.has(prerequisite.itemId)) issues.push(`${quest.name} requires missing item '${prerequisite.itemId}'.`);
      if (prerequisite.type === "quest" && !questIds.has(prerequisite.questId)) issues.push(`${quest.name} requires missing quest '${prerequisite.questId}'.`);
      if (prerequisite.type === "quest" && prerequisite.questId === quest.id) issues.push(`${quest.name} requires itself.`);
      if (prerequisite.type === "flag" && !grantedFlags.has(prerequisite.flag)) issues.push(`${quest.name} requires flag '${prerequisite.flag}' that no dialogue topic grants.`);
    }
    validateTrigger(`${quest.name} start`, quest.startsOn, issues, { roomIds, itemIds, npcIds, doorIds });
    collectTriggerRefs(quest.startsOn, { triggerItemIds, triggerNpcIds, triggerRoomIds });
    validateScriptActions(`${quest.name} start script`, quest.scripts?.onStart ?? [], issues, { doorIds });
    validateScriptActions(`${quest.name} completion script`, quest.scripts?.onComplete ?? [], issues, { doorIds });
    for (const step of quest.steps) {
      validateTrigger(`${quest.name} step '${step.id}'`, step.trigger, issues, { roomIds, itemIds, npcIds, doorIds });
      collectTriggerRefs(step.trigger, { triggerItemIds, triggerNpcIds, triggerRoomIds });
      validateScriptActions(`${quest.name} step '${step.id}' script`, step.scripts ?? [], issues, { doorIds });
    }
    for (const reward of quest.rewards) {
      if (reward.itemId && !itemIds.has(reward.itemId)) issues.push(`${quest.name} rewards missing item '${reward.itemId}'.`);
      if (reward.itemId) rewardItemIds.add(reward.itemId);
    }
  }

  for (const item of file.items) {
    if (!placedItemIds.has(item.id) && !triggerItemIds.has(item.id) && !rewardItemIds.has(item.id)) {
      issues.push(`${item.name} is not placed, sold, dropped, rewarded, or used by a quest.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function normalizeRoom(room: z.infer<typeof roomInputSchema>): RoomDefinition {
  return {
    ...room,
    tags: cleanList(room.tags),
    items: cleanList(room.items),
    itemSpawns: room.itemSpawns.map((spawn) => cleanObject(spawn)),
    npcs: cleanList(room.npcs),
    map: cleanObject(room.map),
    exits: Object.fromEntries(
      Object.entries(room.exits)
        .filter(([, exit]) => exit?.to)
        .map(([direction, exit]) => [direction, cleanObject(exit)])
    )
  };
}

function normalizeItem(item: z.infer<typeof itemInputSchema>): ItemDefinition {
  return cleanObject(item);
}

function normalizeNpc(npc: z.infer<typeof npcInputSchema>): NpcDefinition {
  return {
    ...npc,
    card: npc.card ? cleanObject(npc.card) : undefined,
    behavior: npc.behavior ? cleanObject({ ...npc.behavior, wander: npc.behavior.wander ? cleanObject(npc.behavior.wander) : undefined }) : undefined,
    combat: {
      ...npc.combat,
      drops: npc.combat.drops.map((drop) => cleanObject(drop))
    },
    dialogue: {
      greeting: cleanList(npc.dialogue.greeting),
      topics: Object.fromEntries(Object.entries(npc.dialogue.topics).map(([key, topic]) => [key, cleanObject({ ...topic, aliases: cleanList(topic.aliases), response: cleanList(topic.response) })]))
    },
    merchant: npc.merchant ? { ...npc.merchant, items: cleanList(npc.merchant.items) } : undefined
  };
}

function collectTriggerRefs(
  trigger: QuestDefinition["startsOn"],
  refs: { triggerItemIds: Set<string>; triggerNpcIds: Set<string>; triggerRoomIds: Set<string> }
) {
  if (trigger.itemId) refs.triggerItemIds.add(trigger.itemId);
  if (trigger.npcId) refs.triggerNpcIds.add(trigger.npcId);
  if (trigger.roomId) refs.triggerRoomIds.add(trigger.roomId);
}

function normalizeQuest(quest: z.infer<typeof questInputSchema>): QuestDefinition {
  return {
    ...quest,
    tags: cleanList(quest.tags),
    prerequisites: quest.prerequisites.map((prerequisite) => cleanObject(prerequisite)),
    startsOn: cleanObject(quest.startsOn),
    scripts: normalizeScriptHooks(quest.scripts),
    steps: quest.steps.map((step) => cleanObject({ ...step, trigger: cleanObject(step.trigger), scripts: normalizeScriptActions(step.scripts ?? []) })),
    rewards: quest.rewards.map((reward) => cleanObject(reward))
  };
}

function normalizeScriptHooks(scripts: z.infer<typeof questInputSchema>["scripts"]) {
  if (!scripts) return undefined;
  return cleanObject({
    onStart: normalizeScriptActions(scripts.onStart ?? []),
    onComplete: normalizeScriptActions(scripts.onComplete ?? [])
  });
}

function normalizeScriptActions(actions: z.infer<typeof questScriptActionInputSchema>[]) {
  return actions.map((action) => {
    if (action.type === "message") return cleanObject({ type: action.type, lines: cleanList(action.lines) });
    return cleanObject(action);
  }).filter((action) => action.type !== "message" || action.lines?.length);
}

function validateTrigger(
  label: string,
  trigger: QuestDefinition["startsOn"],
  issues: string[],
  ids: { roomIds: Set<string>; itemIds: Set<string>; npcIds: Set<string>; doorIds: Set<string> }
) {
  if (trigger.roomId && !ids.roomIds.has(trigger.roomId)) issues.push(`${label} references missing room '${trigger.roomId}'.`);
  if (trigger.itemId && !ids.itemIds.has(trigger.itemId)) issues.push(`${label} references missing item '${trigger.itemId}'.`);
  if (trigger.npcId && !ids.npcIds.has(trigger.npcId)) issues.push(`${label} references missing NPC '${trigger.npcId}'.`);
  if (trigger.doorId && !ids.doorIds.has(trigger.doorId)) issues.push(`${label} references missing door '${trigger.doorId}'.`);
}

function validateScriptActions(
  label: string,
  actions: QuestDefinition["steps"][number]["scripts"],
  issues: string[],
  ids: { doorIds: Set<string> }
) {
  for (const action of actions ?? []) {
    if ((action.type === "openDoor" || action.type === "unlockDoor") && !ids.doorIds.has(action.doorId)) {
      issues.push(`${label} references missing door '${action.doorId}'.`);
    }
  }
}

function cleanList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== "")) as T;
}
