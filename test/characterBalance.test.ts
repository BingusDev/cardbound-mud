import assert from "node:assert/strict";
import test from "node:test";
import { CharacterConfig } from "../src/characterConfig.js";
import type { DamageFormula, PlayerStats, SkillDefinition, SkillEffectDefinition } from "../src/types.js";

test("each job has a clean level 1-5 skill curve", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    assert.deepEqual(job.skills.map((skill) => skill.level), [1, 2, 3, 4, 5], `${job.name} should unlock one skill per level 1-5`);
    for (const skill of job.skills) {
      const effects = skill.effects ?? (skill.effect ? [skill.effect] : []);
      assert.ok(effects.length > 0, `${job.name} ${skill.name} should have an implemented effect`);
      assert.ok(skill.manaCost > 0, `${job.name} ${skill.name} should cost Energy`);
      assert.ok(skill.cooldownSeconds >= 2.5, `${job.name} ${skill.name} cooldown should not be spam-fast`);
      assert.ok(skill.cooldownSeconds <= 7, `${job.name} ${skill.name} cooldown should stay responsive`);
    }
  }
});

test("level 1 skills are usable several times from a fresh Energy pool", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    const stats = config.statsForSpecies(config.defaultSpeciesId);
    const maxMana = config.maxManaForStats(stats);
    const firstSkill = job.skills.find((skill) => skill.level === 1);
    assert.ok(firstSkill, `${job.name} should have a level 1 skill`);
    assert.ok(Math.floor(maxMana / firstSkill.manaCost) >= 4, `${job.name} should get at least four level 1 skill uses before resting`);
  }
});

test("skill damage bands fit current solo combat", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 5);
    const basicDps = averageFormula(config.combat.playerDamage, stats) / attackCooldownSeconds(config, stats);

    for (const skill of job.skills) {
      const effects = skill.effects ?? (skill.effect ? [skill.effect] : []);
      const damage = totalEffect(effects, "damage", stats);
      const dps = damage / skill.cooldownSeconds;
      assert.ok(dps >= basicDps * 0.65, `${job.name} ${skill.name} should not feel worse than basic attacks`);
      assert.ok(dps <= 3.25, `${job.name} ${skill.name} should not outrun current enemy HP too hard`);
    }
  }
});

test("support and defensive classes trade damage for mitigation or healing", () => {
  const config = CharacterConfig.load();
  const duelist = config.jobDefinition("duelist");
  const trainer = config.jobDefinition("trainer");
  const trainerStats = leveledStats(config, config.defaultSpeciesId, "trainer", 5);

  assert.ok(duelist.skills.some((skill) => totalFlatGuard(skill.effects ?? []) >= 6), "Duelist should have meaningful guard skills");
  assert.ok(trainer.skills.some((skill) => totalEffect(skill.effects ?? [], "heal", trainerStats) >= 7), "Trainer should have meaningful healing skills");
});

function leveledStats(config: CharacterConfig, species: string, job: string, level: number): PlayerStats {
  return config.leveledStats(config.statsForSpecies(species), species, job, level);
}

function attackCooldownSeconds(config: CharacterConfig, stats: PlayerStats) {
  return Math.max(
    config.combat.minimumAttackCooldownMs,
    config.combat.baseAttackCooldownMs - (stats.grace ?? 0) * config.combat.graceCooldownReductionMs
  ) / 1000;
}

function averageFormula(formula: DamageFormula, stats: PlayerStats) {
  return formula.base + Math.floor((stats[formula.stat] ?? 8) / formula.divisor) + (formula.randomMin + formula.randomMax) / 2;
}

function totalEffect(effects: SkillEffectDefinition[], type: "damage" | "heal", stats: PlayerStats) {
  return effects
    .filter((effect) => effect.type === type)
    .reduce((total, effect) => total + ("formula" in effect ? averageFormula(effect.formula, stats) : 0), 0);
}

function totalFlatGuard(effects: SkillEffectDefinition[]) {
  return effects
    .filter((effect) => effect.type === "guard")
    .reduce((total, effect) => total + effect.amount * effect.charges, 0);
}
