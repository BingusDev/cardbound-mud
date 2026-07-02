import { CharacterConfig } from "./characterConfig.js";
import { awardXp } from "./progressionSystem.js";
import { Store } from "./store.js";
import type { PlayerRecord, QuestDefinition, QuestRecord, QuestScriptAction, QuestTrigger, QuestView } from "./types.js";
import { World } from "./world.js";
import { triggerMatches } from "./gameUtils.js";

export class QuestSystem {
  constructor(
    private readonly world: World,
    private readonly store: Store,
    private readonly characterConfig: CharacterConfig
  ) {}

  list(player: PlayerRecord) {
    const views = this.views(player);
    if (!views.length) return ["No quests are recorded yet. Speak with folk who look like they need help."];

    return views.map((quest) => {
      const completed = quest.completedSteps.length;
      const total = quest.steps.length;
      return `${quest.name} [${quest.status}] - ${completed}/${total} steps. ${quest.summary}`;
    });
  }

  detail(player: PlayerRecord, query: string) {
    const view = this.findView(player, query);
    if (!view) return ["You do not have a quest by that name. Try: quests."];

    const lines = [
      `${view.name} [${view.status}]`,
      view.summary,
      ...view.steps.map((step) => `${view.completedSteps.includes(step.id) ? "[x]" : "[ ]"} ${step.label}`)
    ];

    const rewards = view.rewards.map((reward) => this.rewardLabel(reward)).filter(Boolean);
    if (view.status === "completed" && rewards.length) {
      lines.push(`Rewards: ${rewards.join(", ")}.`);
    }

    return lines;
  }

  views(player: PlayerRecord): QuestView[] {
    const records = new Map(this.store.getQuestRecords(player.id).map((record) => [record.questId, record]));
    return [...this.world.quests.values()]
      .map((quest) => {
        const record = records.get(quest.id);
        if (!record) return undefined;
        return this.view(quest, record);
      })
      .filter((view): view is QuestView => Boolean(view));
  }

  applyTrigger(player: PlayerRecord, trigger: QuestTrigger) {
    const lines: string[] = [];

    for (const quest of this.world.quests.values()) {
      const record = this.store.getQuestRecord(player.id, quest.id);
      const startsQuest = !record && this.prerequisitesMet(player, quest) && triggerMatches(quest.startsOn, trigger);
      const activeRecord =
        record ??
        (startsQuest
          ? {
              playerId: player.id,
              questId: quest.id,
              status: "active" as const,
              completedSteps: []
            }
          : undefined);

      if (!activeRecord || activeRecord.status === "completed") continue;
      if (startsQuest) {
        lines.push(`Quest started: ${quest.name}.`);
        lines.push(...this.applyScripts(player, quest.scripts?.onStart ?? []));
      }

      let changed = startsQuest;
      const stepTriggers = startsQuest ? [trigger, ...this.currentStateTriggers(player)] : [trigger];
      for (const stepTrigger of stepTriggers) {
        for (const step of quest.steps) {
          if (!activeRecord.completedSteps.includes(step.id) && triggerMatches(step.trigger, stepTrigger)) {
            activeRecord.completedSteps.push(step.id);
            lines.push(`Quest updated: ${step.label}`);
            lines.push(...this.applyScripts(player, step.scripts ?? []));
            changed = true;
          }
        }
      }

      if (activeRecord.completedSteps.length === quest.steps.length) {
        activeRecord.status = "completed";
        activeRecord.completedAt = new Date().toISOString();
        lines.push(`Quest complete: ${quest.name}.`);
        lines.push(...this.applyScripts(player, quest.scripts?.onComplete ?? []));
        lines.push(...this.applyRewards(player, quest));
        changed = true;
      }

      if (changed) this.store.saveQuestRecord(activeRecord);
    }

    return lines;
  }

  private findView(player: PlayerRecord, query: string) {
    const normalized = query.trim().toLowerCase();
    return this.views(player).find((quest) => quest.id.toLowerCase() === normalized || quest.name.toLowerCase().includes(normalized));
  }

  private view(quest: QuestDefinition, record: QuestRecord): QuestView {
    return {
      id: quest.id,
      name: quest.name,
      summary: quest.summary,
      description: quest.description,
      status: record.status,
      completedSteps: record.completedSteps,
      currentObjective: quest.steps.find((step) => !record.completedSteps.includes(step.id))?.objective ?? quest.steps.find((step) => !record.completedSteps.includes(step.id))?.label,
      steps: quest.steps.map(({ scripts: _scripts, ...step }) => step),
      rewards: quest.rewards
    };
  }

  private applyRewards(player: PlayerRecord, quest: QuestDefinition) {
    const lines: string[] = [];

    for (const reward of quest.rewards) {
      if (reward.type === "xp") {
        const rewardResult = awardXp(player, reward.amount ?? 0, "quest", this.characterConfig);
        if (rewardResult.amount > 0) lines.push(`Reward: ${rewardResult.amount} XP.`);
        if (rewardResult.leveledUp) lines.push(`Level up! You are now level ${rewardResult.newLevel}.`);
      }

      if (reward.type === "tickets") {
        const amount = reward.amount ?? 0;
        player.tickets += amount;
        lines.push(`Reward: ${amount} Prize Tickets.`);
      }

      if (reward.type === "title" && !player.titles.includes(reward.label)) {
        player.titles.push(reward.label);
        lines.push(`Title earned: ${reward.label}.`);
      }

      if (reward.type === "flag" && reward.flag && !player.flags.includes(reward.flag)) {
        player.flags.push(reward.flag);
      }

      if (reward.type === "item" && reward.itemId && !player.inventory.includes(reward.itemId)) {
        const item = this.world.items.get(reward.itemId);
        player.inventory.push(reward.itemId);
        lines.push(`Reward item: ${item?.name ?? reward.itemId}.`);
      }
    }

    this.store.savePlayer(player);
    return lines;
  }

  private applyScripts(player: PlayerRecord, actions: QuestScriptAction[]) {
    const lines: string[] = [];
    let playerChanged = false;

    for (const action of actions) {
      if (action.type === "message") {
        lines.push(...action.lines);
      }

      if (action.type === "setFlag" && !player.flags.includes(action.flag)) {
        player.flags.push(action.flag);
        playerChanged = true;
      }

      if (action.type === "openDoor" || action.type === "unlockDoor") {
        const door = this.world.doors.get(action.doorId);
        if (!door) continue;
        const state = this.store.getDoorState(player.id, door);
        this.store.setDoorState({ ...state, isLocked: false, isOpen: true });
        if (action.line) lines.push(action.line);
      }
    }

    if (playerChanged) this.store.savePlayer(player);
    return lines;
  }

  private rewardLabel(reward: QuestDefinition["rewards"][number]) {
    if (reward.type === "xp") return `${this.characterConfig.scaleXpReward(reward.amount ?? 0, "quest")} XP`;
    if (reward.type === "tickets") return `${reward.amount ?? 0} Prize Tickets`;
    if (reward.type === "title") return `Title: ${reward.label}`;
    if (reward.type === "flag") return "";
    return reward.label;
  }

  private prerequisitesMet(player: PlayerRecord, quest: QuestDefinition) {
    for (const prerequisite of quest.prerequisites ?? []) {
      if (prerequisite.type === "level" && player.level < prerequisite.level) return false;
      if (prerequisite.type === "flag" && !player.flags.includes(prerequisite.flag)) return false;
      if (prerequisite.type === "item" && !player.inventory.includes(prerequisite.itemId)) return false;
      if (prerequisite.type === "quest" && this.store.getQuestRecord(player.id, prerequisite.questId)?.status !== "completed") return false;
    }
    return true;
  }

  private currentStateTriggers(player: PlayerRecord): QuestTrigger[] {
    const triggers: QuestTrigger[] = [
      { type: "enterRoom", roomId: player.roomId },
      ...player.inventory.map((itemId) => ({ type: "take" as const, itemId }))
    ];

    for (const door of this.world.doors.values()) {
      const state = this.store.getDoorState(player.id, door);
      if (!state.isLocked) triggers.push({ type: "unlockDoor", doorId: door.id });
      if (state.isOpen) triggers.push({ type: "openDoor", doorId: door.id });
    }

    return triggers;
  }
}
