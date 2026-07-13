import assert from "node:assert/strict";
import test from "node:test";
import { CharacterConfig } from "../src/characterConfig.js";
import type { DamageFormula, JobDefinition, PlayerStats, SkillDefinition, SkillEffectDefinition } from "../src/types.js";

test("each job has a clean level 1-10 skill curve with a passive at level 6", () => {
  const config = CharacterConfig.load();
  const expectedLevels = Array.from({ length: 10 }, (_, index) => index + 1);

  for (const job of config.jobs) {
    assert.deepEqual(job.skills.map((skill) => skill.level), expectedLevels, `${job.name} should unlock one skill per level 1-10`);
    for (const skill of job.skills) {
      const effects = skillEffects(skill);
      if (skill.passive) {
        assert.equal(skill.level, 6, `${job.name} passives should currently occupy the level 6 milestone`);
        assert.equal(effects.length, 0, `${job.name} ${skill.name} should be passive-only`);
        assert.equal(skill.manaCost, 0, `${job.name} ${skill.name} should not cost Energy`);
        assert.equal(skill.cooldownSeconds, 0, `${job.name} ${skill.name} should not have a cooldown`);
        assert.equal(skill.requiresCombat, false, `${job.name} ${skill.name} should always be active`);
        assert.ok(Object.values(skill.passive).some((value) => (value ?? 0) > 0), `${job.name} ${skill.name} should improve its class mechanic`);
        continue;
      }

      assert.ok(effects.length > 0, `${job.name} ${skill.name} should have an implemented effect`);
      assert.ok(skill.manaCost > 0, `${job.name} ${skill.name} should cost Energy`);
      assert.ok(skill.cooldownSeconds >= 2.5, `${job.name} ${skill.name} cooldown should not be spam-fast`);
      assert.ok(skill.cooldownSeconds <= 7, `${job.name} ${skill.name} cooldown should stay responsive`);
    }
  }
});

test("character config rejects ambiguous legacy and multi-effect skill shapes", () => {
  const config = CharacterConfig.load();
  const file = structuredClone({
    combat: config.combat,
    leveling: config.leveling,
    stats: config.stats,
    jobs: config.jobs,
    species: config.species
  });
  const skill = file.jobs[0].skills[0];
  skill.effect = skill.effects?.[0];

  assert.throws(() => new CharacterConfig(file), /cannot define both effect and effects/i);
});

test("level 1 skills are usable several times from a fresh Energy pool", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 1);
    const maxMana = config.maxManaForStats(stats);
    const firstSkill = job.skills.find((skill) => skill.level === 1);
    assert.ok(firstSkill, `${job.name} should have a level 1 skill`);
    assert.ok(Math.floor(maxMana / firstSkill.manaCost) >= 4, `${job.name} should get at least four level 1 skill uses before resting`);
  }
});

test("class modifiers give each job a distinct level 1 stat identity", () => {
  const config = CharacterConfig.load();
  const signatures = new Set<string>();

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 1);
    signatures.add(JSON.stringify(stats));
    for (const statId of job.primaryStats) {
      assert.ok((stats[statId] ?? 0) >= 9, `${job.name} should start strong in ${config.statName(statId)}`);
    }
  }

  assert.equal(signatures.size, config.jobs.length, "Each class should have a unique starting stat spread");
});

test("each class has a distinct build-and-spend combat mechanic", () => {
  const config = CharacterConfig.load();
  const mechanicIds = new Set<string>();

  for (const job of config.jobs) {
    const mechanic = job.mechanic;
    assert.ok(mechanic, `${job.name} should define a combat mechanic`);
    assert.ok(!mechanicIds.has(mechanic.id), `${mechanic.name} should have a unique id`);
    mechanicIds.add(mechanic.id);
    const endgameMechanic = effectiveMechanic(job, 10);
    assert.ok(endgameMechanic.maxStacks >= 3 && endgameMechanic.maxStacks <= 6, `${mechanic.name} should use a readable stack range at level 10`);
    assert.ok(
      endgameMechanic.damagePerStack > 0 || endgameMechanic.healingPerStack > 0 || endgameMechanic.guardPerStack > 0,
      `${mechanic.name} should change at least one combat outcome`
    );
    assert.ok(endgameMechanic.damagePerStack * endgameMechanic.maxStacks <= 12, `${mechanic.name} damage scaling should stay within the boss budget`);
    assert.ok(endgameMechanic.healingPerStack * endgameMechanic.maxStacks <= 12, `${mechanic.name} healing scaling should stay within the sustain budget`);
    assert.ok(endgameMechanic.guardPerStack * endgameMechanic.maxStacks <= 6, `${mechanic.name} guard scaling should stay within the mitigation budget`);
    assert.ok(job.skills.some((skill) => (skill.mechanicGain ?? 0) > 0), `${job.name} should have mechanic builders`);
    assert.ok(job.skills.some((skill) => (skill.mechanicCost ?? 0) > 0 || skill.mechanicSpendAll), `${job.name} should have mechanic payoffs`);
    assert.ok(job.skills.some((skill) => skill.mechanicSpendAll), `${job.name} should have a full-meter finisher`);
  }
});

test("skill damage bands fit current solo combat", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    for (const skill of job.skills) {
      if (skill.passive) continue;
      const effects = skillEffects(skill);
      if (!effects.some((effect) => effect.type === "damage")) continue;

      const stats = leveledStats(config, config.defaultSpeciesId, job.id, skill.level);
      const basicDps = averageFormula(config.combat.playerDamage, stats) / attackCooldownSeconds(config, stats);
      const damage = totalEffect(effects, "damage", stats);
      const dps = damage / skill.cooldownSeconds;
      assert.ok(dps >= basicDps * 0.6, `${job.name} ${skill.name} should contribute even when it is primarily setup or utility`);
      const burstCeiling = skill.mechanicSpendAll ? 3.5 : 2.75;
      assert.ok(dps <= basicDps * burstCeiling, `${job.name} ${skill.name} should not compress boss fights too hard`);
    }
  }
});

test("level 10 finishers are exciting upgrades without replacing the early kit", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 10);
    const firstSkill = job.skills.find((skill) => skill.level === 1);
    const finalSkill = job.skills.find((skill) => skill.level === 10);
    assert.ok(firstSkill && finalSkill, `${job.name} should have level 1 and level 10 skills`);

    const firstEffects = skillEffects(firstSkill);
    const finalEffects = skillEffects(finalSkill);
    const firstDamage = totalEffect(firstEffects, "damage", stats);
    const finalDamage = totalEffect(finalEffects, "damage", stats);
    assert.ok(finalDamage >= firstDamage * 3, `${job.name} level 10 skill should feel like a real payoff`);
    assert.ok(finalSkill.manaCost >= firstSkill.manaCost * 3, `${job.name} level 10 skill should spend meaningful Energy`);
    assert.equal(finalSkill.mechanicSpendAll, true, `${job.name} level 10 skill should be a full-meter finisher`);
  }
});

test("full-meter level 10 finishers improve on level 5 without breaking the shared boss budget", () => {
  const config = CharacterConfig.load();
  const endgameDamage: number[] = [];

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 10);
    const midgameSkill = job.skills.find((skill) => skill.level === 5);
    const endgameSkill = job.skills.find((skill) => skill.level === 10);
    assert.ok(midgameSkill && endgameSkill, `${job.name} should have both finisher milestones`);

    const midgameDamage = fullMeterDamage(job, midgameSkill, stats);
    const finalDamage = fullMeterDamage(job, endgameSkill, stats);
    const basicHit = averageFormula(config.combat.playerDamage, stats);
    assert.ok(finalDamage >= midgameDamage * 1.25, `${job.name} level 10 finisher should clearly improve on its level 5 payoff`);
    assert.ok(finalDamage >= basicHit * 5, `${job.name} level 10 finisher should reward filling the meter`);
    assert.ok(finalDamage <= basicHit * 11, `${job.name} level 10 finisher should leave room for a boss fight`);
    endgameDamage.push(finalDamage);
  }

  assert.ok(Math.max(...endgameDamage) <= Math.min(...endgameDamage) * 1.5, "Full-meter finisher damage should stay comparable across class roles");
});

test("every level 10 capstone has a legal fresh-Energy route to full meter", () => {
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    const stats = leveledStats(config, config.defaultSpeciesId, job.id, 10);
    const maxEnergy = config.maxManaForStats(stats);
    const mechanic = effectiveMechanic(job, 10);
    const capstone = job.skills.find((skill) => skill.level === 10);
    assert.ok(capstone, `${job.name} should have a level 10 capstone`);
    assert.equal(capstone.mechanicCost, mechanic.maxStacks, `${job.name} capstone should require a full meter`);

    const openingStacks = Math.min(mechanic.maxStacks, mechanic.startStacks + mechanic.basicAttackGain);
    const setupEnergy = mechanic.basicAttackGain > 0
      ? 0
      : minimumBuilderEnergy(job, openingStacks, mechanic.maxStacks);
    assert.ok(Number.isFinite(setupEnergy), `${job.name} should have a legal route to full meter`);
    assert.ok(
      setupEnergy + capstone.manaCost <= maxEnergy,
      `${job.name} should afford setup (${setupEnergy}) plus ${capstone.name} (${capstone.manaCost}) from ${maxEnergy} Energy`
    );
  }
});

test("recovery pacing gets players back into the arcade loop quickly", () => {
  const config = CharacterConfig.load();

  assert.ok(config.combat.deathRespawnSeconds <= 20, "A knockout should not sideline a player for long");
  assert.ok(config.combat.restHpRecoveryAmount >= 3, "Active recovery should restore meaningful HP per tick");
  assert.ok(config.combat.restManaRecoveryAmount >= 3, "Active recovery should restore meaningful Energy per tick");
  assert.ok(config.combat.restHpRecoverySeconds <= 6, "Active HP recovery should tick promptly");
  assert.ok(config.combat.restManaRecoverySeconds <= 6, "Active Energy recovery should tick promptly");
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

function skillEffects(skill: SkillDefinition) {
  return skill.effects ?? (skill.effect ? [skill.effect] : []);
}

function effectiveMechanic(job: JobDefinition, level: number) {
  assert.ok(job.mechanic, `${job.name} should define a combat mechanic`);
  const passives = job.skills.filter((skill) => skill.level <= level && skill.passive).map((skill) => skill.passive!);
  const passiveTotal = (field: keyof NonNullable<SkillDefinition["passive"]>) => {
    return passives.reduce((total, passive) => total + (passive[field] ?? 0), 0);
  };

  return {
    maxStacks: job.mechanic.maxStacks + passiveTotal("maxStacksBonus"),
    basicAttackGain: job.mechanic.basicAttackGain + passiveTotal("basicAttackGainBonus"),
    startStacks: passiveTotal("startStacks"),
    damagePerStack: job.mechanic.damagePerStack + passiveTotal("damagePerStackBonus"),
    healingPerStack: job.mechanic.healingPerStack + passiveTotal("healingPerStackBonus"),
    guardPerStack: job.mechanic.guardPerStack + passiveTotal("guardPerStackBonus")
  };
}

function minimumBuilderEnergy(job: JobDefinition, openingStacks: number, maxStacks: number) {
  const costs = Array.from({ length: maxStacks + 1 }, () => Number.POSITIVE_INFINITY);
  costs[Math.min(maxStacks, openingStacks)] = 0;
  const builders = job.skills.filter((skill) => skill.level <= 10 && (skill.mechanicGain ?? 0) > 0 && !(skill.mechanicCost ?? 0));

  for (let stack = openingStacks; stack < maxStacks; stack += 1) {
    if (!Number.isFinite(costs[stack])) continue;
    for (const skill of builders) {
      const nextStack = Math.min(maxStacks, stack + (skill.mechanicGain ?? 0));
      costs[nextStack] = Math.min(costs[nextStack], costs[stack] + skill.manaCost);
    }
  }
  return costs[maxStacks];
}

function fullMeterDamage(job: JobDefinition, skill: SkillDefinition, stats: PlayerStats) {
  const effects = skillEffects(skill);
  const mechanic = effectiveMechanic(job, skill.level);
  const damageEffectCount = effects.filter((effect) => effect.type === "damage").length;
  return totalEffect(effects, "damage", stats) + damageEffectCount * mechanic.maxStacks * mechanic.damagePerStack;
}
