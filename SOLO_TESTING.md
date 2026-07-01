# Cardbound MUD Solo Testing Guide

Use this for a quick solo pass after world or balance edits.

## Character Creation

- Create an account.
- Create a character.
- Confirm the create screen offers classes only.
- Try at least one of:
  - Duel Architect
  - Creature Trainer
  - Mana Binder
  - Frame Pilot
  - Voyage Captain
  - Crossover Tactician

## Starter Flow

From `Binder Square`:

```text
look
ask Marshal Echo about key
north
take sleeve key
south
east
west
```

Expected:

- `Starter Deck Panic` starts from Marshal Echo.
- Taking `sleeve key` is blocked before the quest starts.
- The sleeve turnstile opens after the quest starts and you use the key from `Mall Gate Turnstiles`.
- Player labels show class only, for example `Duel Architect`.

## Main Quest Chain

The current main chain is:

- `Starter Deck Panic`
- `Citywide Signal`
- `Park Roundup`
- `Mana Leak Mayhem`
- `Frame Bay Havoc`
- `Crossover Calamity`

Use `quests` and `quest <name>` to inspect progress.

## Combat Smoke Test

Try:

```text
strike rogue topdeck
combat
set and swing
binder
binder duel
break
recover
```

Expected:

- Basic attacks and class skills work.
- HP and charge update.
- First-time defeated loose monsters add a card to your binder.
- `binder` shows collection pages, card rarity, flavor text, and milestone bonuses.
- `binder <page>` filters to a page, for example `binder duel`.
- `binder` shows `Page chase` progress, and completed multi-card pages grant titles such as `Duel Page Ace`.
- The first collected card activates `First Sleeve` for +1 max charge; three cards activate `Page Starter` for +1 max HP.
- Optional event variants appear around the route, including `Holo Topdeck`, `Prismatic Pocket Lizard`, `Cabinet Boss Drake`, and `Cross-Promo Mecha`.
- Extra page-depth monsters include `Trapline Busker`, `Plush Spark Buddy`, `Token Mascot`, `Dockside Deckhand`, `Continuity Cameo`, and `Credits Colossus`.
- Event variants can drop a `promo foil stamp`.
- Recover restores missing HP/charge out of combat.
- Defeated enemies grant XP, tickets, and occasional drops.

## Item Smoke Test

Try:

```text
inventory
inventory full
take foil snack
use foil snack
take duel disk holster
equip duel disk holster
inventory full
```

Expected:

- Consumables work only when recovery is useful.
- Equipment shows modern slots such as `trinket`, `head`, `body`, and `feet`.
- No obsolete theme-specific item names or slots appear.

## Admin Builder

Open `/admin.html` with the admin code configured for the server.

Check:

- World validation is clean.
- New NPC defaults say Binder Bay/card monster.
- NPCs expose optional Binder Card controls for page, rarity, flavor, variant, and event labels.
- Character records show an internal origin plus class.
- Config still contains one hidden internal origin for engine compatibility.
