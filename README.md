# Cardbound MUD

A browser-first multiplayer text MUD prototype set in Cardbound City, a modern city where Duel Monsters, Pokemon, Magic spells, Gunpla frames, One Piece crews, and Union Arena crossovers have burst out of cards, binders, toy aisles, and convention booths.

The tone is Saturday-morning chaos: dramatic monsters, improvised heroics, snack-table logistics, and a city that is somehow still trying to run errands.

## Features

- Browser client with command log, HP/Energy bars, persistent enemy HP, boss phase/telegraph readouts, editable action slots, quest journal, and minimap
- Account and character creation
- Six direct-reference card/anime classes:
  - Duelist
  - Trainer
  - Planeswalker
  - Pilot
  - Captain
  - Arena Fighter
- Classes have distinct starting stat modifiers as well as level growth, so a Pilot immediately plays faster/harder while a Trainer immediately leans into Synergy/Ramp.
- Every class now has a visible build-and-spend combat engine: Duelists stack Chain Links, Trainers grow Partner Bond, Planeswalkers widen their Mana Spectrum, Pilots establish Target Lock, Captains build Crew Momentum, and Arena Fighters generate Action Points.
- Class meters strengthen different outcomes—damage, healing, or guard—and signature skills either build, require, or cash in those resources. Use `mechanic` or `rotation` in game for the current class guide.
- Every class has a complete level 1–10 kit: the original core rotation at 1–5, a mechanic-changing passive at 6, new setup and alternative-spender choices at 7–9, and a true full-meter capstone at 10.
- The current six-quest chapter has enforced story pacing: quests 2–6 require levels 2–6 and 3/5/7/9/12 unique Collection cards. Story bosses, quest doors, and pickup items cannot be used to skip ahead, so a normal clear includes real combat grind and lands around level 6 while levels 7–10 remain progression space for the next zone.
- Quest pickups respawn after five seconds in the shared world, and defeated bosses honor their configured cooldowns, so one player cannot strand another or immediately recycle a story boss.
- Collection Binder loop with series pages, rarity, flavor text, milestone bonuses, page-completion titles, Secret Rare variants, mini-boss cards, and `binder <page>` filtering
- Series-specific equipment and drops, from Duel Disk gear and Pokedex tech to Black Lotus proxies, Gunpla accessories, Straw Hat keepsakes, Union Arena counters, headgear, body gear, foot gear, and boss-run consumables
- Expanded slot itemization gives head, body, and feet slots multiple balanced sidegrades, including Duel Academy headbands, Ash's League Caps, KaibaCorp blazers, Planeswalker cloaks, Duel Runner boots, Acro Bike shoes, and Swiftfoot Boots
- Item rarity labels, equipment comparison text, and +1 class starter loadouts make gear choices easier to read without pushing early combat out of tune
- Later bosses now use readable, mechanically distinct encounters: damage interrupts, defensive guard checks, class-meter spends, explicit brace counters, phase changes, and the finale's alternating two-mechanic cycle. `brace`/`block` gives every class a universal fallback at the cost of its next action.
- The enemy roster now uses canonical game characters and creatures throughout—such as Fan Rotom, Colossal Dreadmaw, Full Armor Gundam, Char's Zaku II, Dracule Mihawk, Gon Freecss, Mahito, and Meruem—while retaining stable internal IDs for save and quest compatibility.
- Fast active recovery and a short Life Point reset keep defeats from stalling the arcade-paced quest loop
- Main quest dialogue and quest-completion rewards can branch by class, so Duelists, Trainers, Planeswalkers, Pilots, Captains, and Arena Fighters get different flavor and gear
- Event variants are always present in this playtest build so testers can find the chase without waiting on a rotation timer
- No separate ancestry choice; the engine keeps one hidden internal origin for save compatibility
- Data-driven world, NPCs, quests, items, classes, and stats
- Admin builder for rooms, NPCs, quests, items, characters, balance config, class mechanics/passives, per-NPC collection card metadata, and data-driven boss telegraphs/phases
- Builder and runtime validation reject impossible Collection requirements and circular quest prerequisites before they can dead-end progression
- A symbolic progression proof now walks the quest graph from the real new-player spawn, acquiring keys/items, opening global doors, resolving flags and unordered objectives, and counting only opponents available before each Collection gate. Invalid worlds are rejected before runtime maps can hide duplicate IDs.
- The builder separates fatal progression errors from design warnings and reports how many quests, rooms, items, and Collection opponents its proof can reach.
- The proof covers structural solvability; exact combat difficulty, XP pacing, drop odds, and merchant affordability remain the responsibility of the balance and playthrough tests.
- Deterministic boss tests verify warning timing, deadline enforcement, brace mitigation, every counter type, phase transitions, and a 36-matchup level-6 class/boss playability matrix.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run verify
```
