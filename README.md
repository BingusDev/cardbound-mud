# Cardbound MUD

A browser-first multiplayer text MUD prototype set in Binder Bay, a modern city where trading card monsters have burst out of decks, binders, toy aisles, and convention booths.

The tone is Saturday-morning chaos: dramatic monsters, improvised heroics, snack-table logistics, and a city that is somehow still trying to run errands.

## Features

- Browser client with command log, HP/charge bars, editable action slots, quest journal, and minimap
- Account and character creation
- Six card-game-inspired classes with legally safer names:
  - Duelist
  - Trainer
  - Planeswalker
  - Pilot
  - Captain
  - Arena Fighter
- Binder collection loop with card pages, rarity, flavor text, milestone bonuses, page-completion titles, event variants, and `binder <page>` filtering
- Event variants are always present in this playtest build so testers can find the chase without waiting on a rotation timer
- No separate ancestry choice; the engine keeps one hidden internal origin for save compatibility
- Data-driven world, NPCs, quests, items, classes, and stats
- Admin builder for rooms, NPCs, quests, items, characters, balance config, and per-NPC binder card metadata

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
