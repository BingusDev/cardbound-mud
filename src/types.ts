export type Direction = "north" | "east" | "south" | "west" | "up" | "down";
export type PlayerSpecies = string;
export type PlayerJob = string;
export type StatName = string;

export type ClientMessage =
  | { type: "accountLogin"; username: string; password: string }
  | { type: "accountRegister"; username: string; password: string }
  | { type: "createCharacter"; name: string; species?: PlayerSpecies; job?: PlayerJob; adminCode?: string }
  | { type: "selectCharacter"; characterId: number }
  | { type: "login"; name: string; species?: PlayerSpecies; job?: PlayerJob; adminCode?: string }
  | { type: "command"; input: string };

export type ServerMessage =
  | { type: "account"; account: AccountView }
  | { type: "log"; lines: string[] }
  | { type: "state"; state: PlayerView }
  | { type: "system"; message: string };

export interface AccountView {
  username: string;
  characters: CharacterSummary[];
}

export interface CharacterSummary {
  id: number;
  name: string;
  species: PlayerSpecies;
  speciesName: string;
  job: PlayerJob;
  jobName: string;
  level: number;
  roomId: string;
  isAdmin: boolean;
}

export interface Coords {
  x: number;
  y: number;
  z: number;
}

export interface WorldFile {
  metadata: WorldMetadata;
  startRoomId: string;
  defaultSpawnId: string;
  zones: ZoneDefinition[];
  spawnPoints: SpawnPointDefinition[];
  doors: DoorDefinition[];
  quests: QuestDefinition[];
  rooms: RoomDefinition[];
  items: ItemDefinition[];
  npcs: NpcDefinition[];
}

export interface CharacterConfigFile {
  combat: CombatConfig;
  leveling: LevelingConfig;
  stats: StatDefinition[];
  jobs: JobDefinition[];
  species: SpeciesDefinition[];
}

export interface LevelingConfig {
  baseXpToLevel: number;
  xpGrowthRate: number;
  maxLevel: number;
  combatXpMultiplier: number;
  questXpMultiplier: number;
}

export interface CombatConfig {
  baseMaxHp: number;
  heartMaxHpBonus: number;
  npcHeartMaxHpBonus: number;
  baseMaxMana: number;
  witMaxManaBonus: number;
  baseAttackCooldownMs: number;
  graceCooldownReductionMs: number;
  minimumAttackCooldownMs: number;
  baseDamageCritChance: number;
  sparkDamageCritChanceBonus: number;
  maximumDamageCritChance: number;
  damageCritMultiplier: number;
  baseHealCritChance: number;
  bondHealCritChanceBonus: number;
  maximumHealCritChance: number;
  healCritMultiplier: number;
  baseFleeChance: number;
  graceFleeBonus: number;
  maximumFleeChance: number;
  deathRespawnSeconds: number;
  outOfCombatRecoveryHp: number;
  outOfCombatRecoverySeconds: number;
  npcSpawnSeconds: number;
  npcDespawnSeconds: number;
  npcPlayersPerInstance: number;
  npcMaxInstancesPerType: number;
  restManaRecoveryAmount: number;
  restManaRecoverySeconds: number;
  restHpRecoveryAmount: number;
  restHpRecoverySeconds: number;
  sanctuaryRestMultiplier: number;
  playerDamage: DamageFormula;
  npcDamage: DamageFormula;
}

export interface DamageFormula {
  base: number;
  stat: StatName;
  divisor: number;
  randomMin: number;
  randomMax: number;
}

export interface StatDefinition {
  id: StatName;
  name: string;
  description: string;
  base: number;
}

export interface WorldMetadata {
  title: string;
  description: string;
  version: number;
}

export interface ZoneDefinition {
  id: string;
  name: string;
  description: string;
  tags: string[];
  map: {
    label: string;
    color: string;
    danger: "safe" | "low" | "medium" | "high";
  };
  levelRange?: {
    min: number;
    max: number;
  };
  defaultSpawnRoomId: string;
}

export interface SpawnPointDefinition {
  id: string;
  name: string;
  roomId: string;
  kind: "new-player" | "respawn" | "zone";
}

export interface DoorDefinition {
  id: string;
  name: string;
  description: string;
  defaultOpen: boolean;
  defaultLocked: boolean;
  keyItemId?: string;
}

export type QuestTriggerType = "talk" | "ask" | "take" | "enterRoom" | "unlockDoor" | "openDoor";

export interface QuestDefinition {
  id: string;
  name: string;
  summary: string;
  description: string;
  tags?: string[];
  prerequisites?: QuestPrerequisiteDefinition[];
  startsOn: QuestTrigger;
  scripts?: QuestScriptHooks;
  steps: QuestStepDefinition[];
  rewards: QuestRewardDefinition[];
}

export type QuestPrerequisiteDefinition =
  | { type: "level"; level: number }
  | { type: "flag"; flag: string }
  | { type: "item"; itemId: string }
  | { type: "quest"; questId: string };

export interface QuestTrigger {
  type: QuestTriggerType;
  npcId?: string;
  topic?: string;
  itemId?: string;
  roomId?: string;
  doorId?: string;
}

export interface QuestStepDefinition {
  id: string;
  label: string;
  objective?: string;
  trigger: QuestTrigger;
  scripts?: QuestScriptAction[];
}

export interface QuestScriptHooks {
  onStart?: QuestScriptAction[];
  onComplete?: QuestScriptAction[];
}

export type QuestScriptAction =
  | { type: "message"; lines: string[] }
  | { type: "setFlag"; flag: string }
  | { type: "openDoor"; doorId: string; line?: string }
  | { type: "unlockDoor"; doorId: string; line?: string };

export interface QuestRewardDefinition {
  type: "title" | "tickets" | "xp" | "item" | "flag";
  label: string;
  amount?: number;
  itemId?: string;
  flag?: string;
}

export interface RoomDefinition {
  id: string;
  zoneId: string;
  name: string;
  description: string;
  coords: Coords;
  tags: string[];
  map: {
    symbol: string;
    color?: string;
    label?: string;
  };
  exits: Partial<Record<Direction, ExitDefinition>>;
  items: string[];
  itemSpawns: ItemSpawnDefinition[];
  npcs: string[];
}

export interface ItemSpawnDefinition {
  itemId: string;
  quantity: number;
  respawnSeconds?: number;
  startsAvailable: boolean;
}

export interface ExitDefinition {
  to: string;
  label?: string;
  doorId?: string;
  requiredItemId?: string;
  hidden?: boolean;
  blockedMessage?: string;
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: "misc" | "consumable" | "equipment" | "key";
  value?: number;
  consumable?: {
    hp?: number;
    mana?: number;
  };
  equipment?: {
    slot: EquipmentSlot;
    statBonuses: Partial<PlayerStats>;
  };
}

export type EquipmentSlot = "trinket" | "head" | "body" | "feet";

export interface NpcDefinition {
  id: string;
  name: string;
  species: string;
  description: string;
  card?: NpcCardDefinition;
  stats: PlayerStats;
  hp: number;
  mana: number;
  disposition: "friendly" | "wild" | "hostile";
  behavior?: NpcBehaviorDefinition;
  combat: NpcCombatDefinition;
  dialogue: NpcDialogue;
  merchant?: MerchantDefinition;
}

export interface NpcCardDefinition {
  page?: string;
  rarity?: "common" | "uncommon" | "rare" | "showcase";
  flavor?: string;
  variant?: boolean;
  event?: string;
}

export interface NpcBehaviorDefinition {
  stationary?: boolean;
  autoEngage?: boolean;
  wander?: {
    enabled: boolean;
    intervalSeconds: number;
  };
}

export interface MerchantDefinition {
  buys: boolean;
  markup: number;
  markdown: number;
  items: string[];
}

export interface NpcCombatDefinition {
  attackName: string;
  defeatMessage: string;
  respawnSeconds: number;
  xp: number;
  tickets: number;
  drops: NpcDropDefinition[];
}

export interface NpcDropDefinition {
  itemId: string;
  chance: number;
  quantity: number;
}

export interface NpcDialogue {
  greeting: string[];
  topics: Record<string, NpcDialogueTopic>;
}

export interface NpcDialogueTopic {
  prompt?: string;
  aliases: string[];
  response: string[];
  requiresFlag?: string;
  setsFlag?: string;
}

export interface PlayerRecord {
  id: number;
  name: string;
  description: string;
  species: PlayerSpecies;
  job: PlayerJob;
  stats: PlayerStats;
  roomId: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  xp: number;
  level: number;
  tickets: number;
  binderCards: string[];
  titles: string[];
  flags: string[];
  inventory: string[];
  equipment: Partial<Record<EquipmentSlot, string>>;
  sanctuaryRoomId: string;
  deadUntil?: number;
  isAdmin: boolean;
}

export interface PlayerPresence {
  name: string;
  speciesName: string;
  jobName: string;
  titles: string[];
  description: string;
}

export interface PlayerView {
  name: string;
  species: PlayerSpecies;
  speciesName: string;
  job: PlayerJob;
  jobName: string;
  stats: PlayerStats;
  statDefinitions: StatDefinition[];
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  xp: number;
  xpForNextLevel: number;
  level: number;
  tickets: number;
  binderCards: string[];
  titles: string[];
  flags: string[];
  sanctuaryRoomId: string;
  deadUntil?: number;
  room: RoomView;
  zone: ZoneDefinition;
  areaMap: AreaMapView;
  inventory: ItemDefinition[];
  equipment: Partial<Record<EquipmentSlot, ItemDefinition>>;
  combat: CombatView;
  jobSkills: SkillDefinition[];
  lockedJobSkills: SkillDefinition[];
  quests: QuestView[];
  playersHere: PlayerPresence[];
  isAdmin: boolean;
}

export interface AreaMapView {
  zoneId: string;
  zoneName: string;
  layer: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  rooms: AreaMapRoomView[];
}

export interface AreaMapRoomView {
  id: string;
  name: string;
  coords: Coords;
  tags: string[];
  map: RoomDefinition["map"];
  current: boolean;
  availableQuests: AreaMapQuestView[];
  exits: AreaMapExitView[];
}

export interface AreaMapQuestView {
  id: string;
  name: string;
  startHint: string;
}

export interface AreaMapExitView {
  direction: Direction;
  to: string;
  roomName: string;
  blocked: boolean;
  offMap: boolean;
}

export type PlayerStats = Record<StatName, number>;

export interface CombatView {
  inCombat: boolean;
  isDead: boolean;
  serverNow: number;
  targetName?: string;
  nextPlayerReadyAt?: number;
  playerCooldownMs?: number;
  respawnAt?: number;
}

export interface SpeciesDefinition {
  id: PlayerSpecies;
  name: string;
  description: string;
  modifiers: Partial<PlayerStats>;
  growthPerLevel: Partial<PlayerStats>;
}

export interface JobDefinition {
  id: PlayerJob;
  name: string;
  description: string;
  primaryStats: StatName[];
  growthPerLevel: Partial<PlayerStats>;
  skills: SkillDefinition[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  level: number;
  manaCost: number;
  cooldownSeconds: number;
  requiresCombat: boolean;
  scalesWith: StatName;
  effect?: SkillEffectDefinition;
  effects?: SkillEffectDefinition[];
}

export type SkillEffectDefinition = DamageSkillEffect | HealSkillEffect | GuardSkillEffect;

export interface DamageSkillEffect {
  type: "damage";
  formula: DamageFormula;
  message: string;
}

export interface HealSkillEffect {
  type: "heal";
  formula: DamageFormula;
  message: string;
}

export interface GuardSkillEffect {
  type: "guard";
  amount: number;
  charges: number;
  message: string;
}

export interface QuestView {
  id: string;
  name: string;
  summary: string;
  description: string;
  status: QuestStatus;
  completedSteps: string[];
  currentObjective?: string;
  steps: QuestStepDefinition[];
  rewards: QuestRewardDefinition[];
}

export type QuestStatus = "available" | "active" | "completed";

export interface QuestRecord {
  playerId: number;
  questId: string;
  status: Exclude<QuestStatus, "available">;
  completedSteps: string[];
  completedAt?: string;
}

export interface RoomView {
  id: string;
  zoneId: string;
  name: string;
  description: string;
  tags: string[];
  map: RoomDefinition["map"];
  exits: Partial<Record<Direction, ExitView>>;
  minimap: Partial<Record<Direction | "here", { name: string; id: string; blocked?: boolean }>>;
  items: ItemDefinition[];
  npcs: NpcDefinition[];
}

export interface ExitView {
  to: string;
  roomName: string;
  label?: string;
  doorName?: string;
  isOpen: boolean;
  isLocked: boolean;
  requiredItemId?: string;
  hidden: boolean;
}

export interface DoorState {
  playerId: number;
  doorId: string;
  isOpen: boolean;
  isLocked: boolean;
}
