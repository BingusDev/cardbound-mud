import { CharacterConfig } from "./characterConfig.js";
import type { PlayerRecord } from "./types.js";

export function awardXp(player: PlayerRecord, baseAmount: number, source: "combat" | "quest", characterConfig: CharacterConfig) {
  const amount = characterConfig.scaleXpReward(baseAmount, source);
  if (amount <= 0) return { amount: 0, leveledUp: false, previousLevel: player.level, newLevel: player.level, unlockedSkills: [] };

  const previousLevel = player.level;
  player.xp += amount;
  player.level = characterConfig.levelForXp(player.xp);
  const unlockedSkills = characterConfig.jobDefinition(player.job).skills.filter((skill) => skill.level > previousLevel && skill.level <= player.level);
  return {
    amount,
    leveledUp: player.level > previousLevel,
    previousLevel,
    newLevel: player.level,
    unlockedSkills
  };
}

export function skillUnlockLines(skills: ReturnType<typeof awardXp>["unlockedSkills"]) {
  return skills.map((skill) => skill.passive
    ? `Passive unlocked: ${skill.name}. ${skill.description}`
    : `Technique unlocked: ${skill.name}. ${skill.description}`);
}
