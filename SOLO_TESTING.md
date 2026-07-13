# Cardbound MUD Solo Testing Guide

Use this for a quick solo pass after world or balance edits.

## Character Creation

- Create an account.
- Create a character.
- Confirm the create screen offers classes only.
- Try at least one of:
  - Duelist
  - Trainer
  - Planeswalker
  - Pilot
  - Captain
  - Arena Fighter

## Starter Flow

From `Cardbound Plaza`:

```text
look
ask Marshal Echo about key
north
take Duel Disk keycard
east
south
attack Blue-Eyes White Dragon
use Duel Disk keycard
south
```

Expected:

- `Duel Disk Lockdown` starts from Marshal Echo.
- Marshal Echo adds a class-specific line; for example, Trainers hear Pokedex/Gym badge guidance and Pilots hear launch/catapult guidance.
- Taking `Duel Disk keycard` is blocked before the quest starts.
- The Duel Disk turnstile opens after the quest starts and you use the key from `Duel Disk Turnstiles`.
- Blue-Eyes cannot be challenged before the quest starts, and the mall concourse cannot be reached through the service hall or toy aisle as an alternate bypass.
- Completing main quests can grant a class reward such as `White Base launch patch`, `Chain Link token`, or `Union Arena AP die`.
- Player labels show class only, for example `Duelist`.

## Main Quest Chain

The current main chain is:

- `Duel Disk Lockdown`
- `Rotom Radio Relay`
- `Poke Ball Roundup`
- `Mana Leak Mayhem`
- `White Base Launch Trouble`
- `Union Arena Calamity`

Use `quests` and `quest <name>` to inspect progress.

The enforced gates after each completed assignment are:

| Next quest | Required level | Unique Collection cards |
| --- | ---: | ---: |
| Rotom Radio Relay | 2 | 3 |
| Poke Ball Roundup | 3 | 5 |
| Mana Leak Mayhem | 4 | 7 |
| White Base Launch Trouble | 5 | 9 |
| Union Arena Calamity | 6 | 12 |

Expected:

- `quests` and `binder` name the next gate, show current XP/card counts, and say how many XP and first-time wins remain.
- Repeating one already logged runaway grants XP but does not advance the unique-card requirement.
- Asking a future quest giver does not start the assignment until the prior quest, level, and Collection requirements are all met.
- Story bosses do not give pre-kill credit. A boss card obtained before its quest is active cannot retro-complete the defeat objective.
- All routes into the mall concourse, frame hangar, and crossover pavilion honor their matching story door.
- Quest pickups return after five seconds so a second connected player can complete the same objective.
- Story bosses remain absent for their configured respawn timer rather than being replaced by the population scaler.

## Combat Smoke Test

Try:

```text
attack kuriboh
combat
mechanic
normal summon
binder
binder duel
run
recover
```

Expected:

- Basic attacks and class skills work.
- HP and Energy update.
- The action panel keeps the current enemy's HP visible, and `combat` or `status` prints a detailed duel readout.
- When a boss begins a major attack, the action panel shows its name and countdown, highlights the encounter readout, and enables `Brace`. The `brace` or `block` command reduces any telegraphed hit but delays your next action.
- The action panel also shows the class meter. Basic attacks and builder skills increase it, setup skills reject insufficient resources clearly, and level 5 finishers spend the meter.
- At level 6, each class unlocks one always-on mechanic passive: a larger Chain, opening Partner Bond or Target Lock, spend refunds, or faster basic-attack generation. Passive unlocks appear in the log and do not consume an action slot.
- Levels 7–9 add a setup tool, an alternative spender, and an advanced signature. Level 10 adds a capstone that explicitly requires a full class meter.
- `mechanic` or `rotation` explains the effective class loop, including passive-adjusted caps, build rates, refunds, builders, and spenders.
- Fresh classes show different starting stat profiles in the create preview and character view.
- Fresh classes start with a small +1 class item in inventory.
- First-time defeated runaway monsters add a card to your Collection Binder.
- `binder`, `deck`, or `pokedex` shows collection pages, card rarity, flavor text, and milestone bonuses.
- `binder <page>` filters to a page, for example `binder duel`.
- `binder` shows `Page chase` progress, and completed multi-card pages grant titles such as `Duel Monsters Ace`.
- The first collected card activates `First Pull` for +1 max Energy; three cards activate `Starter Deck` for +1 max HP.
- Optional showcase variants appear around the route, including `Winged Kuriboh LV10`, `Shiny Charmander`, `Mega Charizard X`, and `Guren Mk-II`.
- Extra page-depth monsters include `Kuriboh`, `Performage Trick Clown`, `Mimikyu`, `Porygon`, `Usopp`, `Gon Freecss`, and `Post-Credits Colossus`.
- Series mini-bosses include `Blue-Eyes White Dragon`, `Misty's Gyarados`, `Nicol Bolas, Dragon-God`, `Char's Zaku II`, `Dracule Mihawk`, and `Meruem`.
- Mini-boss rooms should read as dangerous before you engage them.
- Later bosses should visibly announce their mechanics before damage lands. Test at least one damage interrupt (`Cruel Ultimatum`), guard check (`Full Armor Barrage`), class-meter spend (`Royal Adaptation`), and direct brace counter (`Observation Counter`).
- Boss phase names should appear in the action panel and `status` after their HP threshold is crossed. `Char's Zaku II` has two speed phases, while the `Final Trigger Titan` alternates damage and class-meter counters across two finale phases.
- Event variants and series bosses can drop distinctive equipment such as `Millennium Puzzle replica`, `Black Lotus proxy`, `Beam rifle keychain`, `KaibaCorp Duel Visor`, `KaibaCorp blazer`, `Ash's League Cap`, `Char custom visor`, `Luffy's straw hat`, `Rotom Running Shoes`, `Magnetic ankle boosters`, and `Final Trigger lanyard`.
- Recover restores meaningful HP/Energy every few seconds out of combat, and a knockout resets within 20 seconds.
- Defeated enemies grant XP, Prize Tickets, and occasional drops.
- A normal clear of all six quests plus the required XP and first-time Collection fights should reach level 6, but not level 7. Each chapter boundary may require extra runaway fights even after its card count is met; this is intentional.

## Item Smoke Test

Try:

```text
inventory
inventory full
take Potion snack cake
use Potion snack cake
take Trap Card sleeves
equip Trap Card sleeves
inventory full
```

Expected:

- Consumables work only when recovery is useful.
- Equipment shows modern slots such as `trinket`, `head`, `body`, and `feet`.
- Equipment summaries show rarity and compare against the item currently equipped in that slot.
- Head, body, and foot slots have multiple on-theme options now, so test swapping more than one item per slot.
- No obsolete theme-specific item names or slots appear.

## Admin Builder

Open `/admin.html` with the admin code configured for the server.

Check:

- World validation is clean.
- Impossible Collection gates and circular quest prerequisites are rejected.
- Expand `Checks` and confirm the progression proof reports every quest and room reachable.
- Fatal progression checks cover inaccessible quest givers/objectives, keys trapped behind their own doors, non-renewing shared quest pickups, phase-inappropriate Collection counts, invalid trigger shapes/topics, friendly defeat targets, orphaned door triggers, duplicate IDs/step IDs, and indirect item/flag dependency cycles.
- Shared quest protection and quest-critical rooms with no return route appear as warnings. A one-way layout that makes a quest's otherwise reachable objectives impossible to visit in one play path is a fatal error.
- New NPC defaults say Cardbound City/runaway card monster.
- NPCs expose optional Collection Binder controls for page, rarity, flavor, variant, and event labels.
- NPCs expose optional `Boss Encounter JSON` for validated telegraphs and strictly descending phase thresholds.
- Quest rewards support class-item JSON maps for class-specific gear.
- Character records show an internal origin plus class.
- Character config jobs expose starting modifiers and growth per level.
- Character config skills preserve mechanic gain/cost, spend-all rules, and passive mechanic modifiers through a save.
- Admin item editing exposes item rarity labels.
- Config still contains one hidden internal origin for engine compatibility.
