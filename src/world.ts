import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { analyzeWorldProgression } from "./progressionValidation.js";
import type {
  Direction,
  DoorDefinition,
  ExitDefinition,
  ItemDefinition,
  NpcDefinition,
  RoomDefinition,
  SpawnPointDefinition,
  WorldFile,
  ZoneDefinition
} from "./types.js";

const directions = ["north", "east", "south", "west", "up", "down"] as const;
const questTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("talk"), npcId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("ask"), npcId: z.string().min(1), topic: z.string().min(1) }).strict(),
  z.object({ type: z.literal("take"), itemId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("enterRoom"), roomId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("unlockDoor"), doorId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("openDoor"), doorId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("defeat"), npcId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("binderCards"), count: z.number().int().min(1) }).strict()
]);
const questScriptActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), lines: z.array(z.string()) }),
  z.object({ type: z.literal("setFlag"), flag: z.string() }),
  z.object({ type: z.literal("openDoor"), doorId: z.string(), line: z.string().optional() }),
  z.object({ type: z.literal("unlockDoor"), doorId: z.string(), line: z.string().optional() })
]);
const questPrerequisiteSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("level"), level: z.number().int().min(1) }),
  z.object({ type: z.literal("flag"), flag: z.string() }),
  z.object({ type: z.literal("item"), itemId: z.string() }),
  z.object({ type: z.literal("quest"), questId: z.string() }),
  z.object({ type: z.literal("binderCards"), count: z.number().int().min(1) })
]);
const exitDefinitionSchema = z.object({
  to: z.string(),
  label: z.string().optional(),
  doorId: z.string().optional(),
  requiredItemId: z.string().optional(),
  hidden: z.boolean().optional(),
  blockedMessage: z.string().optional()
});
const exitSchema = z
  .object({
    north: exitDefinitionSchema,
    east: exitDefinitionSchema,
    south: exitDefinitionSchema,
    west: exitDefinitionSchema,
    up: exitDefinitionSchema,
    down: exitDefinitionSchema
  })
  .partial();
const itemSpawnSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1).default(1),
  respawnSeconds: z.number().int().min(0).optional(),
  startsAvailable: z.boolean().default(true)
});
const itemDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["misc", "consumable", "equipment", "key"]).default("misc"),
  rarity: z.enum(["common", "uncommon", "rare", "boss", "promo"]).optional(),
  value: z.number().int().min(0).optional(),
  consumable: z.object({ hp: z.number().int().min(0).optional(), mana: z.number().int().min(0).optional() }).optional(),
  equipment: z.object({
    slot: z.enum(["trinket", "head", "body", "feet"]),
    statBonuses: z.record(z.number())
  }).optional()
});
const merchantSchema = z.object({
  buys: z.boolean().default(true),
  markup: z.number().min(0).default(1),
  markdown: z.number().min(0).max(1).default(0.5),
  items: z.array(z.string()).default([])
});
const npcCardSchema = z.object({
  page: z.string().optional(),
  rarity: z.enum(["common", "uncommon", "rare", "showcase"]).optional(),
  flavor: z.string().optional(),
  variant: z.boolean().optional(),
  event: z.string().optional()
});
const npcEncounterSchema = z.object({
  telegraphs: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    warning: z.string().min(1),
    roomWarning: z.string().optional(),
    counterType: z.enum(["damage", "guard", "mechanicSpend", "brace"]),
    counterAmount: z.number().positive().default(1),
    counterHint: z.string().min(1),
    successMessage: z.string().min(1),
    failureMessage: z.string().min(1),
    roomFailureMessage: z.string().optional(),
    delaySeconds: z.number().min(1),
    initialDelaySeconds: z.number().min(0).default(4),
    cooldownSeconds: z.number().min(1),
    damageMultiplier: z.number().min(0),
    bracedDamageMultiplier: z.number().min(0).max(1).default(0.4),
    staggerSeconds: z.number().min(0).default(2)
  })).default([]),
  phases: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    startsAtHpPercent: z.number().min(0).max(100),
    enterMessage: z.string().min(1),
    damageMultiplier: z.number().min(0).default(1),
    attackCooldownMultiplier: z.number().min(0.25).default(1)
  })).default([])
}).superRefine((encounter, context) => {
  const telegraphIds = new Set<string>();
  for (const [index, telegraph] of encounter.telegraphs.entries()) {
    if (telegraphIds.has(telegraph.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["telegraphs", index, "id"], message: "Telegraph ids must be unique." });
    }
    telegraphIds.add(telegraph.id);
    if (telegraph.counterType === "brace" && telegraph.counterAmount !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["telegraphs", index, "counterAmount"], message: "Brace counters must require exactly one brace." });
    }
  }
  const phaseIds = new Set<string>();
  encounter.phases.forEach((phase, index) => {
    if (phaseIds.has(phase.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["phases", index, "id"], message: "Phase ids must be unique." });
    }
    phaseIds.add(phase.id);
    if (index > 0 && phase.startsAtHpPercent >= encounter.phases[index - 1].startsAtHpPercent) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["phases", index, "startsAtHpPercent"], message: "Phase thresholds must be unique and strictly descending." });
    }
  });
}).optional();

export const worldSchema = z.object({
  metadata: z.object({
    title: z.string(),
    description: z.string(),
    version: z.number()
  }),
  startRoomId: z.string(),
  defaultSpawnId: z.string(),
  zones: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      map: z.object({
        label: z.string(),
        color: z.string(),
        danger: z.enum(["safe", "low", "medium", "high"])
      }),
      levelRange: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).optional(),
      defaultSpawnRoomId: z.string()
    })
  ),
  spawnPoints: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      roomId: z.string(),
      kind: z.enum(["new-player", "respawn", "zone"])
    })
  ),
  doors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      defaultOpen: z.boolean(),
      defaultLocked: z.boolean(),
      keyItemId: z.string().optional()
    })
  ),
  quests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      description: z.string(),
      tags: z.array(z.string()).default([]),
      prerequisites: z.array(questPrerequisiteSchema).default([]),
      startsOn: questTriggerSchema,
      scripts: z.object({
        onStart: z.array(questScriptActionSchema).optional(),
        onComplete: z.array(questScriptActionSchema).optional()
      }).optional(),
      steps: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          objective: z.string().optional(),
          trigger: questTriggerSchema,
          scripts: z.array(questScriptActionSchema).optional()
        })
      ),
      rewards: z.array(
        z.object({
          type: z.enum(["title", "tickets", "xp", "item", "classItem", "flag"]),
          label: z.string(),
          amount: z.number().optional(),
          itemId: z.string().optional(),
          classItems: z.record(z.string()).optional(),
          flag: z.string().optional()
        })
      )
    })
  ),
  rooms: z.array(
    z.object({
      id: z.string(),
      zoneId: z.string(),
      name: z.string(),
      description: z.string(),
      coords: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      tags: z.array(z.string()),
      map: z.object({
        symbol: z.string(),
        color: z.string().optional(),
        label: z.string().optional()
      }),
      exits: exitSchema,
      items: z.array(z.string()),
      itemSpawns: z.array(itemSpawnSchema).default([]),
      npcs: z.array(z.string())
    })
  ),
  items: z.array(itemDefinitionSchema),
  npcs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      species: z.string(),
      description: z.string(),
      card: npcCardSchema.optional(),
      stats: z.record(z.number()),
      hp: z.number(),
      mana: z.number(),
      disposition: z.enum(["friendly", "wild", "hostile"]),
      behavior: z.object({
        stationary: z.boolean().optional(),
        autoEngage: z.boolean().optional(),
        wander: z.object({
          enabled: z.boolean(),
          intervalSeconds: z.number().int().min(1)
        }).optional()
      }).optional(),
      combat: z.object({
        attackName: z.string(),
        defeatMessage: z.string(),
        respawnSeconds: z.number(),
        xp: z.number(),
        tickets: z.number(),
        specials: z.array(
          z.object({
            name: z.string(),
            message: z.string(),
            roomMessage: z.string().optional(),
            chance: z.number().min(0).max(1),
            cooldownSeconds: z.number().min(0),
            damageMultiplier: z.number().min(0)
          })
        ).optional(),
        encounter: npcEncounterSchema,
        drops: z.array(
          z.object({
            itemId: z.string(),
            chance: z.number().min(0).max(1),
            quantity: z.number().int().min(1).default(1)
          })
        ).default([])
      }),
      dialogue: z.object({
        greeting: z.array(z.string()),
        topics: z.record(
          z.object({
            prompt: z.string().optional(),
            aliases: z.array(z.string()),
            response: z.array(z.string()),
            classResponses: z.record(z.array(z.string())).optional(),
            requiresFlag: z.string().optional(),
            setsFlag: z.string().optional()
          })
        )
      }),
      merchant: merchantSchema.optional()
    })
  )
});

export class World {
  readonly metadata: WorldFile["metadata"];
  readonly zones = new Map<string, ZoneDefinition>();
  readonly spawnPoints = new Map<string, SpawnPointDefinition>();
  readonly doors = new Map<string, DoorDefinition>();
  readonly quests = new Map<string, WorldFile["quests"][number]>();
  readonly rooms = new Map<string, RoomDefinition>();
  readonly items = new Map<string, ItemDefinition>();
  readonly npcs = new Map<string, NpcDefinition>();
  readonly startRoomId: string;
  readonly defaultSpawnId: string;

  constructor(file: WorldFile) {
    const progressionAnalysis = analyzeWorldProgression(file);
    const progressionError = progressionAnalysis.issues.find((issue) => issue.severity === "error");
    if (progressionError) throw new Error(progressionError.message);

    this.metadata = file.metadata;
    this.startRoomId = file.startRoomId;
    this.defaultSpawnId = file.defaultSpawnId;
    file.zones.forEach((zone) => this.zones.set(zone.id, zone));
    file.spawnPoints.forEach((spawnPoint) => this.spawnPoints.set(spawnPoint.id, spawnPoint));
    file.doors.forEach((door) => this.doors.set(door.id, door));
    file.quests.forEach((quest) => this.quests.set(quest.id, quest));
    file.rooms.forEach((room) => this.rooms.set(room.id, normalizeRoom(room)));
    file.items.forEach((item) => this.items.set(item.id, normalizeItem(item)));
    file.npcs.forEach((npc) => this.npcs.set(npc.id, npc));

    if (!this.rooms.has(this.startRoomId)) {
      throw new Error(`World startRoomId '${this.startRoomId}' does not exist.`);
    }
    if (!this.spawnPoints.has(this.defaultSpawnId)) {
      throw new Error(`World defaultSpawnId '${this.defaultSpawnId}' does not exist.`);
    }
    this.validateReferences();
  }

  static load(worldPath = path.join(process.cwd(), "data", "world.json")) {
    return new World(loadWorldFile(worldPath));
  }

  room(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Missing room '${roomId}'.`);
    return room;
  }

  zone(zoneId: string) {
    const zone = this.zones.get(zoneId);
    if (!zone) throw new Error(`Missing zone '${zoneId}'.`);
    return zone;
  }

  door(doorId: string) {
    const door = this.doors.get(doorId);
    if (!door) throw new Error(`Missing door '${doorId}'.`);
    return door;
  }

  defaultSpawnRoomId() {
    return this.spawnPoints.get(this.defaultSpawnId)?.roomId ?? this.startRoomId;
  }

  resolveExit(roomId: string, direction: Direction) {
    return this.room(roomId).exits[direction];
  }

  visibleExits(roomId: string) {
    return Object.entries(this.room(roomId).exits).filter((entry): entry is [Direction, ExitDefinition] => {
      const [, exit] = entry;
      return Boolean(exit) && !exit.hidden;
    });
  }

  roomItems(room: RoomDefinition) {
    return this.itemsForIds(roomItemSpawnIds(room));
  }

  itemsForIds(itemIds: string[]) {
    return itemIds.map((id) => this.items.get(id)).filter((item): item is ItemDefinition => Boolean(item));
  }

  roomNpcs(room: RoomDefinition) {
    return room.npcs.map((id) => this.npcs.get(id)).filter((npc): npc is NpcDefinition => Boolean(npc));
  }

  private validateReferences() {
    for (const zone of this.zones.values()) {
      if (!this.rooms.has(zone.defaultSpawnRoomId)) {
        throw new Error(`Zone '${zone.id}' defaultSpawnRoomId '${zone.defaultSpawnRoomId}' does not exist.`);
      }
    }

    for (const spawnPoint of this.spawnPoints.values()) {
      if (!this.rooms.has(spawnPoint.roomId)) {
        throw new Error(`Spawn point '${spawnPoint.id}' roomId '${spawnPoint.roomId}' does not exist.`);
      }
    }

    for (const room of this.rooms.values()) {
      if (!this.zones.has(room.zoneId)) {
        throw new Error(`Room '${room.id}' references missing zone '${room.zoneId}'.`);
      }
      for (const itemId of roomItemSpawnIds(room)) {
        if (!this.items.has(itemId)) {
          throw new Error(`Room '${room.id}' references missing item '${itemId}'.`);
        }
      }

      for (const [direction, exit] of Object.entries(room.exits)) {
        if (!this.rooms.has(exit.to)) {
          throw new Error(`Room '${room.id}' ${direction} exit references missing room '${exit.to}'.`);
        }
        if (exit.doorId && !this.doors.has(exit.doorId)) {
          throw new Error(`Room '${room.id}' ${direction} exit references missing door '${exit.doorId}'.`);
        }
        if (exit.requiredItemId && !this.items.has(exit.requiredItemId)) {
          throw new Error(`Room '${room.id}' ${direction} exit references missing required item '${exit.requiredItemId}'.`);
        }
      }
    }

    for (const npc of this.npcs.values()) {
      for (const drop of npc.combat.drops) {
        if (!this.items.has(drop.itemId)) {
          throw new Error(`NPC '${npc.id}' drop references missing item '${drop.itemId}'.`);
        }
      }
      for (const itemId of npc.merchant?.items ?? []) {
        if (!this.items.has(itemId)) {
          throw new Error(`NPC '${npc.id}' merchant references missing item '${itemId}'.`);
        }
      }
    }

  }
}

export function questProgressionIssues(file: WorldFile) {
  return analyzeWorldProgression(file).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

function normalizeItem(item: ItemDefinition): ItemDefinition {
  return {
    ...item,
    type: item.type ?? (item.id.includes("key") ? "key" : "misc")
  };
}

export function loadWorldFile(worldPath = path.join(process.cwd(), "data", "world.json")) {
  const raw = fs.readFileSync(worldPath, "utf8");
  return worldSchema.parse(JSON.parse(raw));
}

export function validateWorldFile(file: WorldFile) {
  const parsed = worldSchema.parse(file);
  new World(parsed);
  return parsed;
}

export function normalizeRoom(room: RoomDefinition): RoomDefinition {
  const legacySpawns = (room.items ?? []).map((itemId) => ({ itemId, quantity: 1, startsAvailable: true }));
  const explicitSpawns = room.itemSpawns ?? [];
  const explicitItemIds = new Set(explicitSpawns.map((spawn) => spawn.itemId));
  return {
    ...room,
    items: room.items ?? [],
    itemSpawns: explicitSpawns.length
      ? [...explicitSpawns, ...legacySpawns.filter((spawn) => !explicitItemIds.has(spawn.itemId))]
      : legacySpawns
  };
}

export function roomItemSpawnIds(room: RoomDefinition) {
  return roomItemSpawns(room).flatMap((spawn) => Array.from({ length: spawn.quantity }, () => spawn.itemId));
}

export function roomStartingItemIds(room: RoomDefinition) {
  return roomItemSpawns(room)
    .filter((spawn) => spawn.startsAvailable)
    .flatMap((spawn) => Array.from({ length: spawn.quantity }, () => spawn.itemId));
}

export function roomItemSpawns(room: RoomDefinition) {
  return normalizeRoom(room).itemSpawns;
}
