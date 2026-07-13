import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { CharacterConfig } from "../src/characterConfig.js";
import { CombatSystem } from "../src/combatSystem.js";
import { Store } from "../src/store.js";
import type { NpcDefinition, PlayerRecord, SkillDefinition, SkillEffectDefinition } from "../src/types.js";
import { World } from "../src/world.js";

const laterBossIds = [
  "nicol-bolas-standee",
  "plastic-mecha",
  "red-comet-gunpla",
  "mihawk-dockside-rival",
  "union-arena-raid-boss",
  "genre-jam-titan"
];

function effects(skill: SkillDefinition): SkillEffectDefinition[] {
  return skill.effects ?? (skill.effect ? [skill.effect] : []);
}

function defensiveValue(skill: SkillDefinition) {
  return effects(skill).reduce((value, effect) => {
    if (effect.type === "guard") return value + effect.amount * 2;
    if (effect.type === "heal") return value + effect.formula.base;
    return value;
  }, 0);
}

function canSpend(skill: SkillDefinition, stacks: number) {
  const required = skill.mechanicSpendAll ? Math.max(1, skill.mechanicCost ?? 0) : (skill.mechanicCost ?? 0);
  return required > 0 && stacks >= required;
}

function trySkill(combat: CombatSystem, player: PlayerRecord, skills: SkillDefinition[]) {
  for (const skill of skills) {
    if (player.mana < skill.manaCost) continue;
    const lines = combat.useSkill(player, skill).join("\n");
    if (!/needs? \d+|not done getting ready|passive technique|training form/i.test(lines)) return true;
  }
  return false;
}

function playBoss(
  t: TestContext,
  config: CharacterConfig,
  job: CharacterConfig["jobs"][number],
  bossId: string,
  databaseDirectory: string
) {
  const world = World.load();
  const boss = world.npcs.get(bossId);
  assert.ok(boss, `Missing boss '${bossId}'.`);
  const room = [...world.rooms.values()].find((candidate) => candidate.npcs.includes(bossId));
  assert.ok(room, `${boss.name} must be placed in a room.`);

  const databasePath = path.join(databaseDirectory, `${job.id}-${bossId}.sqlite`);
  const store = new Store(config, databasePath);
  store.initializeRoomItems(world.rooms.values());
  store.initializeDoors(world.doors.values());
  const player = store.findOrCreatePlayer(`Sim ${job.id} ${bossId}`, world.defaultSpawnRoomId(), false, config.defaultSpeciesId, job.id);
  player.level = 6;
  player.roomId = room.id;
  const stats = config.leveledStats(player.stats, player.species, player.job, player.level);
  player.maxHp = config.maxHpForStats(stats);
  player.hp = player.maxHp;
  player.maxMana = config.maxManaForStats(stats);
  player.mana = player.maxMana;
  store.savePlayer(player);

  let now = 1_000_000;
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => now;
  Math.random = () => 0.5;
  t.after(() => {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  });

  const combat = new CombatSystem(
    world,
    store,
    config,
    (record) => config.leveledStats(record.stats, record.species, record.job, record.level)
  );
  const kit = job.skills.filter((skill) => skill.level <= 6 && effects(skill).length);
  combat.attack(player, boss.name);
  const telegraphsSeen = new Set<string>();
  const phasesSeen = new Set<string>();

  for (let step = 0; step < 1_200 && combat.view(player).inCombat; step += 1) {
    now += 200;
    combat.tick([player], now);
    let view = combat.view(player);
    if (!view.inCombat) break;
    if (view.telegraph) telegraphsSeen.add(view.telegraph.id);
    if (view.bossPhase) phasesSeen.add(view.bossPhase.id);
    if (now < (view.nextPlayerReadyAt ?? Number.POSITIVE_INFINITY)) continue;

    let acted = false;
    if (view.telegraph && !view.telegraph.braced) {
      const telegraph = boss.combat.encounter?.telegraphs?.find((candidate) => candidate.id === view.telegraph?.id);
      assert.ok(telegraph);
      let counters: SkillDefinition[] = [];
      if (telegraph.counterType === "guard") {
        counters = kit.filter((skill) => effects(skill).some((effect) => effect.type === "guard"));
      } else if (telegraph.counterType === "mechanicSpend") {
        counters = kit.filter((skill) => canSpend(skill, view.mechanic?.stacks ?? 0));
      } else if (telegraph.counterType === "damage") {
        counters = kit.filter((skill) => effects(skill).some((effect) => effect.type === "damage"));
      }
      counters.sort((left, right) => defensiveValue(right) - defensiveValue(left) || right.level - left.level);
      acted = trySkill(combat, player, counters);
      view = combat.view(player);
      if (!acted && view.telegraph && !view.telegraph.braced) {
        acted = /You brace/i.test(combat.brace(player).join("\n"));
      }
    }
    if (acted) continue;

    view = combat.view(player);
    const stacks = view.mechanic?.stacks ?? 0;
    const spenders = kit
      .filter((skill) => canSpend(skill, stacks))
      .sort((left, right) => defensiveValue(right) - defensiveValue(left) || right.level - left.level);
    const builders = kit
      .filter((skill) => (skill.mechanicGain ?? 0) > 0)
      .sort((left, right) => defensiveValue(right) - defensiveValue(left) || (right.mechanicGain ?? 0) - (left.mechanicGain ?? 0));
    const rotation = stacks >= 2 ? [...spenders, ...builders] : [...builders, ...spenders];
    if (!trySkill(combat, player, rotation)) combat.attack(player, "");
  }

  const finalView = combat.view(player);
  return {
    won: !finalView.inCombat && !finalView.isDead,
    hp: player.hp,
    maxHp: player.maxHp,
    telegraphsSeen,
    phasesSeen
  };
}

test("later bosses keep distinct canonical identities and encounter patterns", () => {
  const world = World.load();
  const expected = new Map<string, { name: string; counters: string[] }>([
    ["weather-wyrm", { name: "Fan Rotom", counters: ["damage"] }],
    ["gym-leader-gyarados", { name: "Misty's Gyarados", counters: ["guard"] }],
    ["nicol-bolas-standee", { name: "Nicol Bolas, Dragon-God", counters: ["damage"] }],
    ["plastic-mecha", { name: "Full Armor Gundam", counters: ["guard"] }],
    ["red-comet-gunpla", { name: "Char's Zaku II", counters: ["damage"] }],
    ["mihawk-dockside-rival", { name: "Dracule Mihawk", counters: ["brace"] }],
    ["union-arena-raid-boss", { name: "Meruem", counters: ["mechanicSpend"] }],
    ["genre-jam-titan", { name: "Final Trigger Titan", counters: ["damage", "mechanicSpend"] }]
  ]);

  for (const [npcId, identity] of expected) {
    const npc = world.npcs.get(npcId);
    assert.equal(npc?.name, identity.name);
    assert.deepEqual(npc?.combat.encounter?.telegraphs?.map((telegraph) => telegraph.counterType), identity.counters);
    assert.equal(npc?.combat.specials?.length ?? 0, 0, `${identity.name} should not mix random specials with readable telegraphs.`);
    for (const telegraph of npc?.combat.encounter?.telegraphs ?? []) {
      assert.ok(telegraph.initialDelaySeconds >= 4, `${identity.name} must give a fair first warning.`);
      assert.ok(telegraph.delaySeconds >= 5, `${identity.name} must leave time to react.`);
      assert.ok(telegraph.cooldownSeconds >= 10, `${identity.name} must leave recovery time between mechanics.`);
    }
  }
});

test("every level 6 class can solo every later boss by using counters and defensive spenders", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cardbound-boss-playability-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const config = CharacterConfig.load();

  for (const job of config.jobs) {
    for (const bossId of laterBossIds) {
      const result = playBoss(t, config, job, bossId, directory);
      assert.equal(
        result.won,
        true,
        `${job.name} should solo ${bossId} with a defensive level 6 rotation; finished at ${result.hp}/${result.maxHp} HP.`
      );
      assert.ok(result.telegraphsSeen.size >= 1, `${bossId} should survive long enough to show its signature mechanic to ${job.name}.`);
    }
  }
});

test("all level 6 classes have legal damage, guard, and mechanic-spend answers", () => {
  const config = CharacterConfig.load();
  for (const job of config.jobs) {
    assert.ok(job.mechanic, `${job.name} needs a class mechanic.`);
    const kit = job.skills.filter((skill) => skill.level <= 6 && effects(skill).length);
    assert.ok(kit.some((skill) => effects(skill).some((effect) => effect.type === "damage")), `${job.name} needs a damage answer.`);
    assert.ok(kit.some((skill) => effects(skill).some((effect) => effect.type === "guard")), `${job.name} needs a guard answer.`);
    assert.ok(kit.some((skill) => (skill.mechanicCost ?? 0) >= 2 || skill.mechanicSpendAll), `${job.name} needs a two-stack spender.`);
    assert.ok(job.mechanic.maxStacks >= 2, `${job.name} must be able to hold the required mechanic stacks.`);
  }
});
