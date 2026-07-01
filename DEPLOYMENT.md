# Cardbound Ubuntu VPS Install Guide

Cardbound is a Node.js MUD server with a browser client and WebSocket play session.

## Requirements

- Ubuntu VPS
- Node.js 22 or newer
- npm
- nginx or another reverse proxy if exposing it publicly

## Local Build Check

```bash
npm install
npm run verify
```

## Basic Server Run

```bash
npm install --omit=dev
npm run build
npm start
```

By default the server listens on the configured `PORT`, or `3000` if no port is set.

## Important Files

- `data/world.json`: Binder Bay rooms, quests, NPCs, items, and zones
- `data/character.json`: classes, hidden internal origin, stats, skills, and combat tuning
- `public/`: browser client and admin builder
- `src/`: TypeScript server and game systems

## Service Notes

The example service file is in `deploy/cardbound-mud.service.example`.
