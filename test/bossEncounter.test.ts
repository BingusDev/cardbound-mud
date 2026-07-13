import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { CharacterConfig } from "../src/characterConfig.js";
import { CombatSystem } from "../src/combatSystem.js";
import { Store } from "../src/store.js";
import type { NpcEncounterDefinition, NpcTelegraphDefinition, PlayerRecord } from "../src/types.js";
import { World } from "../src/world.js";

const TEST_NPC_ID = "holo-topdeck";

interface EncounterFixture {
  combat: CombatSystem;
  config: CharacterConfig;
  player: PlayerRecord;
  now: (advanceMs?: number) => number;
}

function telegraph(overrides: Partial<NpcTelegraphDefinition> = {}): NpcTelegraphDefinition {
  return {
    id: "test-finisher",
    name: "Test Finisher",
    warning: "{name} warns {player} about Test Finisher.",
    roomWarning: "{name} starts charging Test Finisher.",
    counterType: "damage",
    counterAmount: 999,
    counterHint: "Deal enough test damage",
    successMessage: "Test Finisher is interrupted.",
    failureMessage: "{name} resolves Test Finisher for {damage} damage.",
    roomFailureMessage: "{name} resolves Test Finisher for {damage} damage.",
    delaySeconds: 5,
    initialDelaySeconds: 1,
    cooldownSeconds: 60,
    damageMultiplier: 2,
    bracedDamageMultiplier: 0.25,
    staggerSeconds: 2,
    ...overrides
  };
}

function encounterFixture(
  t: TestContext,
  name: string,
  encounter: NpcEncounterDefinition,
  preparePlayer: (player: PlayerRecord) => void = () => undefined
): EncounterFixture {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `cardbound-boss-${name}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const config = CharacterConfig.load();
  const world = World.load();
  const store = new Store(config, path.join(directory, "cardbound.sqlite"));
  store.initializeRoomItems(world.rooms.values());
  store.initializeDoors(world.doors.values());

  const npc = world.npcs.get(TEST_NPC_ID);
  assert.ok(npc, `Missing test NPC '${TEST_NPC_ID}'.`);
  npc.hp = 100;
  npc.stats = { heart: 0, wit: 0, grace: 0, might: 0, spark: 0, bond: 0 };
  npc.combat.attackName = "normal test hit";
  npc.combat.specials = [];
  npc.combat.encounter = structuredClone(encounter);

  const room = [...world.rooms.values()].find((candidate) => candidate.npcs.includes(npc.id));
  assert.ok(room, `Test NPC '${npc.id}' is not placed in a room.`);
  const player = store.findOrCreatePlayer(`Boss ${name}`, world.defaultSpawnRoomId(), false);
  player.roomId = room.id;
  player.hp = 200;
  player.maxHp = 200;
  player.mana = 200;
  player.maxMana = 200;
  player.stats = { heart: 0, wit: 0, grace: 0, might: 0, spark: 0, bond: 0 };
  preparePlayer(player);
  store.savePlayer(player);

  let clock = 1_000_000;
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => clock;
  Math.random = () => 0.99;
  t.after(() => {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  });

  const combat = new CombatSystem(world, store, config);
  combat.attack(player, npc.name);
  return {
    combat,
    config,
    player,
    now(advanceMs = 0) {
      clock += advanceMs;
      return clock;
    }
  };
}

function playerLines(fixture: EncounterFixture, now: number) {
  return fixture.combat.tick([fixture.player], now).flatMap((event) => event.lines).join("\n");
}

test("boss telegraphs warn before damage and do not add a normal hit when they resolve", (t) => {
  const fixture = encounterFixture(t, "warning", { telegraphs: [telegraph()] });
  const hpBeforeWarning = fixture.player.hp;

  const warningLines = playerLines(fixture, fixture.now(1_000));
  assert.match(warningLines, /warns .* about Test Finisher/i);
  assert.match(warningLines, /Counter: Deal enough test damage/i);
  assert.equal(fixture.player.hp, hpBeforeWarning, "The warning tick must not deal damage.");
  assert.equal(fixture.combat.view(fixture.player).telegraph?.resolvesAt, fixture.now() + 5_000);

  const hpBeforeResolution = fixture.player.hp;
  const resolutionLines = playerLines(fixture, fixture.now(5_000));
  assert.match(resolutionLines, /resolves Test Finisher for 6 damage/i);
  assert.doesNotMatch(resolutionLines, /normal test hit/i, "A telegraph resolution must consume the NPC attack tick.");
  assert.equal(hpBeforeResolution - fixture.player.hp, 6, "Only the telegraphed hit should damage the player.");
  assert.equal(fixture.combat.view(fixture.player).telegraph, undefined);
});

test("expired telegraphs reject late attacks and braces before resolving", (t) => {
  const fixture = encounterFixture(t, "expired-window", { telegraphs: [telegraph()] });
  playerLines(fixture, fixture.now(1_000));
  const targetHpAtWarning = fixture.combat.view(fixture.player).targetHp;

  fixture.now(5_000);
  const lateBrace = fixture.combat.brace(fixture.player).join("\n");
  assert.match(lateBrace, /already resolving.*too late/i);
  assert.equal(fixture.combat.view(fixture.player).telegraph?.braced, false);

  const lateAttack = fixture.combat.attack(fixture.player, "").join("\n");
  assert.match(lateAttack, /already resolving.*too late/i);
  assert.equal(fixture.combat.view(fixture.player).targetHp, targetHpAtWarning, "A late attack cannot erase an attack that has already resolved.");

  const hpBeforeResolution = fixture.player.hp;
  const resolutionLines = playerLines(fixture, fixture.now());
  assert.match(resolutionLines, /resolves Test Finisher/i);
  assert.ok(fixture.player.hp < hpBeforeResolution, "The overdue telegraph must still land on the next combat tick.");
});

test("brace reduces an unresolved telegraph and can directly counter brace checks", async (t) => {
  await t.test("mitigation", (t) => {
    const fixture = encounterFixture(t, "brace-mitigation", { telegraphs: [telegraph()] });
    playerLines(fixture, fixture.now(1_000));

    assert.match(fixture.combat.brace(fixture.player).join("\n"), /brace for Test Finisher/i);
    assert.equal(fixture.combat.view(fixture.player).telegraph?.braced, true);
    const hpBeforeResolution = fixture.player.hp;
    const resolutionLines = playerLines(fixture, fixture.now(5_000));

    assert.match(resolutionLines, /resolves Test Finisher for 2 damage/i);
    assert.match(resolutionLines, /brace blunts the impact/i);
    assert.equal(hpBeforeResolution - fixture.player.hp, 2);
  });

  await t.test("brace counter", (t) => {
    const fixture = encounterFixture(t, "brace-counter", {
      telegraphs: [
        telegraph({
          counterType: "brace",
          counterAmount: 1,
          counterHint: "Brace before impact"
        })
      ]
    });
    playerLines(fixture, fixture.now(1_000));

    const braceLines = fixture.combat.brace(fixture.player).join("\n");
    assert.match(braceLines, /Test Finisher is interrupted/i);
    assert.equal(fixture.combat.view(fixture.player).telegraph, undefined);
  });
});

test("damage, guard, and mechanic spending satisfy their matching counters", async (t) => {
  await t.test("damage", (t) => {
    const fixture = encounterFixture(t, "damage-counter", {
      telegraphs: [telegraph({ counterType: "damage", counterAmount: 1 })]
    });
    playerLines(fixture, fixture.now(1_000));

    fixture.now(4_000);
    const attackLines = fixture.combat.attack(fixture.player, "").join("\n");
    assert.match(attackLines, /Test Finisher is interrupted/i);
    assert.equal(fixture.combat.view(fixture.player).telegraph, undefined);
  });

  await t.test("guard", (t) => {
    const fixture = encounterFixture(t, "guard-counter", {
      telegraphs: [telegraph({ counterType: "guard", counterAmount: 1 })]
    });
    playerLines(fixture, fixture.now(1_000));

    fixture.now(4_000);
    const guardSkill = fixture.config.jobDefinition(fixture.player.job).skills.find((skill) => skill.name === "Normal Summon");
    assert.ok(guardSkill);
    const skillLines = fixture.combat.useSkill(fixture.player, guardSkill).join("\n");
    assert.match(skillLines, /Test Finisher is interrupted/i);
    assert.equal(fixture.combat.view(fixture.player).telegraph, undefined);
  });

  await t.test("mechanic spend", (t) => {
    const fixture = encounterFixture(
      t,
      "mechanic-counter",
      { telegraphs: [telegraph({ counterType: "mechanicSpend", counterAmount: 1 })] },
      (player) => {
        player.job = "pilot";
        player.level = 6;
      }
    );
    playerLines(fixture, fixture.now(1_000));

    fixture.now(4_000);
    const spendSkill = fixture.config.jobDefinition("pilot").skills.find((skill) => skill.name === "Gundam Shield Bash");
    assert.ok(spendSkill);
    const skillLines = fixture.combat.useSkill(fixture.player, spendSkill).join("\n");
    assert.match(skillLines, /Test Finisher is interrupted/i);
    assert.equal(fixture.combat.view(fixture.player).telegraph, undefined);
  });
});

test("boss phases enter once each as HP crosses their thresholds", (t) => {
  const fixture = encounterFixture(t, "phases", {
    phases: [
      {
        id: "phase-one",
        name: "Phase One",
        description: "The first test phase.",
        startsAtHpPercent: 95,
        enterMessage: "PHASE ONE ENTER",
        damageMultiplier: 1.1,
        attackCooldownMultiplier: 0.9
      },
      {
        id: "phase-two",
        name: "Phase Two",
        description: "The second test phase.",
        startsAtHpPercent: 90,
        enterMessage: "PHASE TWO ENTER",
        damageMultiplier: 1.2,
        attackCooldownMultiplier: 0.8
      }
    ]
  });

  assert.equal(fixture.combat.view(fixture.player).bossPhase, undefined, "The opening hit should remain above the first threshold.");
  fixture.now(5_000);
  const firstCrossing = fixture.combat.attack(fixture.player, "").join("\n");
  assert.equal(firstCrossing.match(/PHASE ONE ENTER/g)?.length, 1);
  assert.doesNotMatch(firstCrossing, /PHASE TWO ENTER/);
  assert.equal(fixture.combat.view(fixture.player).bossPhase?.id, "phase-one");

  fixture.now(5_000);
  const secondCrossing = fixture.combat.attack(fixture.player, "").join("\n");
  assert.equal(secondCrossing.match(/PHASE TWO ENTER/g)?.length, 1);
  assert.doesNotMatch(secondCrossing, /PHASE ONE ENTER/);
  assert.equal(fixture.combat.view(fixture.player).bossPhase?.id, "phase-two");

  fixture.now(5_000);
  const laterAttack = fixture.combat.attack(fixture.player, "").join("\n");
  assert.doesNotMatch(laterAttack, /PHASE (?:ONE|TWO) ENTER/);
  assert.equal(fixture.combat.view(fixture.player).bossPhase?.id, "phase-two");
});
