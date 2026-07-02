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
south
east
west
```

Expected:

- `Duel Disk Lockdown` starts from Marshal Echo.
- Taking `Duel Disk keycard` is blocked before the quest starts.
- The Duel Disk turnstile opens after the quest starts and you use the key from `Duel Disk Turnstiles`.
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

## Combat Smoke Test

Try:

```text
attack rogue topdeck
combat
normal summon
binder
binder duel
run
recover
```

Expected:

- Basic attacks and class skills work.
- HP and Energy update.
- First-time defeated runaway monsters add a card to your Collection Binder.
- `binder` shows collection pages, card rarity, flavor text, and milestone bonuses.
- `binder <page>` filters to a page, for example `binder duel`.
- `binder` shows `Page chase` progress, and completed multi-card pages grant titles such as `Duel Monsters Ace`.
- The first collected card activates `First Pull` for +1 max Energy; three cards activate `Starter Deck` for +1 max HP.
- Optional Secret Rare variants appear around the route, including `Secret Rare Topdeck`, `Shiny Pocket Lizard`, `Game Corner Boss Drake`, and `Cross-Promo Gundam`.
- Extra page-depth monsters include `Trap Card Busker`, `Plush Pikaclone Buddy`, `Prize Ticket Mascot`, `Straw Hat Deckhand`, `Union Cameo`, and `Post-Credits Colossus`.
- Event variants can drop a `Secret Rare foil stamp`.
- Recover restores missing HP/Energy out of combat.
- Defeated enemies grant XP, Prize Tickets, and occasional drops.

## Item Smoke Test

Try:

```text
inventory
inventory full
take Potion snack cake
use Potion snack cake
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
- New NPC defaults say Cardbound City/runaway card monster.
- NPCs expose optional Collection Binder controls for page, rarity, flavor, variant, and event labels.
- Character records show an internal origin plus class.
- Config still contains one hidden internal origin for engine compatibility.
