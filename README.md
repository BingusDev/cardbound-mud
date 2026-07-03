# Cardbound MUD

A browser-first multiplayer text MUD prototype set in Cardbound City, a modern city where Duel Monsters, Pokemon, Magic spells, Gunpla frames, One Piece crews, and Union Arena crossovers have burst out of cards, binders, toy aisles, and convention booths.

The tone is Saturday-morning chaos: dramatic monsters, improvised heroics, snack-table logistics, and a city that is somehow still trying to run errands.

## Features

- Browser client with command log, HP/Energy bars, editable action slots, quest journal, and minimap
- Account and character creation
- Six direct-reference card/anime classes:
  - Duelist
  - Trainer
  - Planeswalker
  - Pilot
  - Captain
  - Arena Fighter
- Collection Binder loop with series pages, rarity, flavor text, milestone bonuses, page-completion titles, Secret Rare variants, optional mini-boss cards, and `binder <page>` filtering
- Series-specific equipment and drops, from Duel Disk gear and Pokedex tech to Black Lotus proxies, Gunpla accessories, Straw Hat keepsakes, and Union Arena counters
- Main quest dialogue and quest-completion rewards can branch by class, so Duelists, Trainers, Planeswalkers, Pilots, Captains, and Arena Fighters get different flavor and gear
- Event variants are always present in this playtest build so testers can find the chase without waiting on a rotation timer
- No separate ancestry choice; the engine keeps one hidden internal origin for save compatibility
- Data-driven world, NPCs, quests, items, classes, and stats
- Admin builder for rooms, NPCs, quests, items, characters, balance config, and per-NPC collection card metadata

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
