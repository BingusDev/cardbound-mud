import { CharacterConfig } from "./characterConfig.js";
import type { PlayerRecord } from "./types.js";

export function awardXp(player: PlayerRecord, baseAmount: number, source: "combat" | "quest", characterConfig: CharacterConfig) {
  const amount = characterConfig.scaleXpReward(baseAmount, source);
  if (amount <= 0) return { amount: 0, leveledUp: false, previousLevel: player.level, newLevel: player.level };

  const previousLevel = player.level;
  player.xp += amount;
  player.level = characterConfig.levelForXp(player.xp);
  return {
    amount,
    leveledUp: player.level > previousLevel,
    previousLevel,
    newLevel: player.level
  };
}
