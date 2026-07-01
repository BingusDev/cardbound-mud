import type { ItemDefinition, NpcDefinition, QuestTrigger } from "./types.js";

export function matches(item: ItemDefinition, query: string) {
  const normalizedQuery = normalizeName(query);
  return normalizeName(item.id) === normalizedQuery || normalizeName(item.name) === normalizedQuery || normalizeName(item.name).includes(normalizedQuery);
}

export function matchesNpc(npc: NpcDefinition, query: string) {
  const normalizedQuery = normalizeName(query);
  return normalizeName(npc.id) === normalizedQuery || normalizeName(npc.name) === normalizedQuery || normalizeName(npc.name).includes(normalizedQuery);
}

export function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(?:to|at|the|a|an|about)\s+/i, "")
    .replace(/\s+(?:to|at|the|a|an)$/i, "")
    .replace(/[\s_-]+/g, "-");
}

export function triggerMatches(expected: QuestTrigger, actual: QuestTrigger) {
  return (
    expected.type === actual.type &&
    (!expected.npcId || expected.npcId === actual.npcId) &&
    (!expected.topic || expected.topic.toLowerCase() === actual.topic?.toLowerCase()) &&
    (!expected.itemId || expected.itemId === actual.itemId) &&
    (!expected.roomId || expected.roomId === actual.roomId) &&
    (!expected.doorId || expected.doorId === actual.doorId)
  );
}

export function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
