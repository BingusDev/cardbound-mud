import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CharacterConfigFile, JobDefinition, PlayerStats, SpeciesDefinition } from "./types.js";

const backupDir = path.join(process.cwd(), "data", "admin-backups");

const statSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  base: z.number()
});

const speciesSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  modifiers: z.record(z.number()),
  growthPerLevel: z.record(z.number())
});

const damageFormulaSchema = z.object({
  base: z.number(),
  stat: z.string(),
  divisor: z.number(),
  randomMin: z.number(),
  randomMax: z.number()
});

const skillEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("damage"),
    message: z.string(),
    formula: damageFormulaSchema
  }),
  z.object({
    type: z.literal("heal"),
    message: z.string(),
    formula: damageFormulaSchema
  }),
  z.object({
    type: z.literal("guard"),
    message: z.string(),
    amount: z.number(),
    charges: z.number()
  })
]);

const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.number(),
  manaCost: z.number(),
  cooldownSeconds: z.number(),
  requiresCombat: z.boolean(),
  scalesWith: z.string(),
  effect: skillEffectSchema.optional(),
  effects: z.array(skillEffectSchema).optional()
});

const jobSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  primaryStats: z.array(z.string()),
  growthPerLevel: z.record(z.number()),
  skills: z.array(skillSchema)
});

const characterConfigSchema = z.object({
  combat: z.object({
    baseMaxHp: z.number().int().min(1),
    heartMaxHpBonus: z.number().min(0),
    npcHeartMaxHpBonus: z.number().min(0),
    baseMaxMana: z.number().int().min(0),
    witMaxManaBonus: z.number().min(0),
    baseAttackCooldownMs: z.number(),
    graceCooldownReductionMs: z.number(),
    minimumAttackCooldownMs: z.number(),
    baseDamageCritChance: z.number().min(0),
    sparkDamageCritChanceBonus: z.number().min(0),
    maximumDamageCritChance: z.number().min(0).max(1),
    damageCritMultiplier: z.number().min(1),
    baseHealCritChance: z.number().min(0),
    bondHealCritChanceBonus: z.number().min(0),
    maximumHealCritChance: z.number().min(0).max(1),
    healCritMultiplier: z.number().min(1),
    baseFleeChance: z.number(),
    graceFleeBonus: z.number(),
    maximumFleeChance: z.number(),
    deathRespawnSeconds: z.number(),
    outOfCombatRecoveryHp: z.number(),
    outOfCombatRecoverySeconds: z.number(),
    npcSpawnSeconds: z.number().min(0),
    npcDespawnSeconds: z.number().min(0),
    npcPlayersPerInstance: z.number().int().min(1),
    npcMaxInstancesPerType: z.number().int().min(1),
    restManaRecoveryAmount: z.number(),
    restManaRecoverySeconds: z.number(),
    restHpRecoveryAmount: z.number(),
    restHpRecoverySeconds: z.number(),
    sanctuaryRestMultiplier: z.number(),
    playerDamage: damageFormulaSchema,
    npcDamage: damageFormulaSchema
  }),
  leveling: z.object({
    baseXpToLevel: z.number().int().min(1),
    xpGrowthRate: z.number().min(1),
    maxLevel: z.number().int().min(1),
    combatXpMultiplier: z.number().min(0),
    questXpMultiplier: z.number().min(0)
  }),
  stats: z.array(statSchema).min(1),
  jobs: z.array(jobSchema).min(1),
  species: z.array(speciesSchema).min(1)
});

export class CharacterConfig {
  readonly combat: CharacterConfigFile["combat"];
  readonly leveling: CharacterConfigFile["leveling"];
  readonly stats: CharacterConfigFile["stats"];
  readonly jobs: CharacterConfigFile["jobs"];
  readonly species: CharacterConfigFile["species"];
  readonly defaultJobId: string;
  readonly defaultSpeciesId: string;

  constructor(file: CharacterConfigFile) {
    this.combat = file.combat;
    this.leveling = file.leveling;
    this.stats = file.stats;
    this.jobs = file.jobs;
    this.species = file.species;
    this.defaultJobId = this.jobs[0]?.id ?? "duelist";
    this.defaultSpeciesId = this.species[0]?.id ?? "cardbound";
    this.validate();
  }

  static load(configPath = path.join(process.cwd(), "data", "character.json")) {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = characterConfigSchema.parse(JSON.parse(raw));
    return new CharacterConfig(parsed);
  }

  normalizeSpecies(species?: string) {
    return this.species.some((definition) => definition.id === species) ? String(species) : this.defaultSpeciesId;
  }

  normalizeJob(job?: string) {
    return this.jobs.some((definition) => definition.id === job) ? String(job) : this.defaultJobId;
  }

  speciesDefinition(species?: string): SpeciesDefinition {
    const normalized = this.normalizeSpecies(species);
    return this.species.find((definition) => definition.id === normalized) ?? this.species[0];
  }

  speciesName(species?: string) {
    return this.speciesDefinition(species).name;
  }

  jobDefinition(job?: string): JobDefinition {
    const normalized = this.normalizeJob(job);
    return this.jobs.find((definition) => definition.id === normalized) ?? this.jobs[0];
  }

  jobName(job?: string) {
    return this.jobDefinition(job).name;
  }

  baseStats(): PlayerStats {
    return Object.fromEntries(this.stats.map((stat) => [stat.id, stat.base]));
  }

  statsForSpecies(species?: string): PlayerStats {
    const baseStats = this.baseStats();
    const definition = this.speciesDefinition(species);
    return Object.fromEntries(
      this.stats.map((stat) => [stat.id, baseStats[stat.id] + (definition.modifiers[stat.id] ?? 0)])
    );
  }

  leveledStats(baseStats: PlayerStats, species: string | undefined, job: string | undefined, level: number): PlayerStats {
    const stats = { ...baseStats };
    const gainedLevels = Math.max(0, Math.floor(level) - 1);
    if (gainedLevels <= 0) return stats;

    const speciesGrowth = this.speciesDefinition(species).growthPerLevel;
    const jobGrowth = this.jobDefinition(job).growthPerLevel;
    for (const stat of this.stats) {
      const growth = (speciesGrowth[stat.id] ?? 0) + (jobGrowth[stat.id] ?? 0);
      stats[stat.id] = (stats[stat.id] ?? stat.base) + Math.floor(growth * gainedLevels);
    }
    return stats;
  }

  levelForXp(xp: number) {
    const safeXp = Math.max(0, Math.floor(xp));
    let level = 1;
    while (level < this.leveling.maxLevel && safeXp >= this.xpForLevel(level + 1)) {
      level += 1;
    }
    return level;
  }

  xpForLevel(level: number) {
    const targetLevel = Math.max(1, Math.floor(level));
    if (targetLevel <= 1) return 0;

    let total = 0;
    for (let nextLevel = 2; nextLevel <= targetLevel; nextLevel += 1) {
      total += Math.ceil(this.leveling.baseXpToLevel * this.leveling.xpGrowthRate ** (nextLevel - 2));
    }
    return total;
  }

  xpForNextLevel(level: number) {
    const safeLevel = Math.max(1, Math.floor(level));
    if (safeLevel >= this.leveling.maxLevel) return this.xpForLevel(this.leveling.maxLevel);
    return this.xpForLevel(safeLevel + 1);
  }

  scaleXpReward(amount: number, source: "combat" | "quest") {
    const multiplier = source === "combat" ? this.leveling.combatXpMultiplier : this.leveling.questXpMultiplier;
    return Math.max(0, Math.round(amount * multiplier));
  }

  maxHpForStats(stats: PlayerStats) {
    return Math.max(1, Math.floor(this.combat.baseMaxHp + (stats.heart ?? 0) * this.combat.heartMaxHpBonus));
  }

  npcMaxHp(baseHp: number, stats: PlayerStats) {
    return Math.max(1, Math.floor(baseHp + (stats.heart ?? 0) * this.combat.npcHeartMaxHpBonus));
  }

  maxManaForStats(stats: PlayerStats) {
    return Math.max(0, Math.floor(this.combat.baseMaxMana + (stats.wit ?? 0) * this.combat.witMaxManaBonus));
  }

  statName(statId: string) {
    return this.stats.find((stat) => stat.id === statId)?.name ?? statId;
  }

  private validate() {
    const statIds = new Set(this.stats.map((stat) => stat.id));
    for (const definition of this.species) {
      for (const statId of [...Object.keys(definition.modifiers), ...Object.keys(definition.growthPerLevel)]) {
        if (!statIds.has(statId)) {
          throw new Error(`Origin '${definition.id}' references missing stat '${statId}'.`);
        }
      }
    }
    for (const definition of this.jobs) {
      for (const statId of [...definition.primaryStats, ...Object.keys(definition.growthPerLevel)]) {
        if (!statIds.has(statId)) {
          throw new Error(`Class '${definition.id}' references missing stat '${statId}'.`);
        }
      }
      for (const skill of definition.skills) {
        if (!statIds.has(skill.scalesWith)) {
          throw new Error(`Skill '${skill.id}' references missing scalesWith stat '${skill.scalesWith}'.`);
        }
        const effects = skill.effects ?? (skill.effect ? [skill.effect] : []);
        for (const effect of effects) {
          if ("formula" in effect) {
            this.validateDamageFormula(effect.formula, `Skill '${skill.id}'`);
          }
          if (effect.type === "damage" && effect.formula.stat !== skill.scalesWith) {
            throw new Error(`Skill '${skill.id}' damage formula stat must match scalesWith.`);
          }
          if (effect.type === "guard" && (effect.amount <= 0 || effect.charges <= 0)) {
            throw new Error(`Skill '${skill.id}' guard effects need positive amount and charges.`);
          }
        }
      }
    }
    for (const formula of [this.combat.playerDamage, this.combat.npcDamage]) {
      this.validateDamageFormula(formula, "Combat formula");
    }
  }

  private validateDamageFormula(formula: CharacterConfigFile["combat"]["playerDamage"], label: string) {
    const statIds = new Set(this.stats.map((stat) => stat.id));
    if (!statIds.has(formula.stat)) {
      throw new Error(`${label} references missing stat '${formula.stat}'.`);
    }
    if (formula.divisor <= 0) {
      throw new Error(`${label} divisor must be greater than 0.`);
    }
    if (formula.randomMax < formula.randomMin) {
      throw new Error(`${label} randomMax must be greater than or equal to randomMin.`);
    }
  }
}

export function characterConfigView(configPath = path.join(process.cwd(), "data", "character.json")) {
  return characterConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
}

export function saveCharacterConfig(input: unknown, configPath = path.join(process.cwd(), "data", "character.json")) {
  const parsed = characterConfigSchema.parse(input);
  new CharacterConfig(parsed);
  backupConfigFile(configPath);
  fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

function backupConfigFile(configPath: string) {
  if (!fs.existsSync(configPath)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const label = path.basename(configPath, path.extname(configPath));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "-");
  fs.copyFileSync(configPath, path.join(backupDir, `${label}-${stamp}.json`));
}
