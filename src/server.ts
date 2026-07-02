import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { z, ZodError } from "zod";
import { adminWorldView, connectRooms, createItem, createLinkedRoom, createNpc, createQuest, createRoom, createZone, saveItem, saveNpc, saveQuest, saveRoom } from "./adminWorld.js";
import { CharacterConfig, characterConfigView, saveCharacterConfig } from "./characterConfig.js";
import { Game } from "./game.js";
import { Store, type AccountRecord, type CharacterAdminRecord } from "./store.js";
import type { ClientMessage, PlayerPresence, PlayerRecord, ServerMessage } from "./types.js";
import { World } from "./world.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST;
const adminCode = process.env.ADMIN_CODE ?? "cardbound";
const adminToken = process.env.ADMIN_TOKEN ?? "";
const adminPanelUsername = process.env.ADMIN_PANEL_USERNAME ?? "";
const adminPanelPassword = process.env.ADMIN_PANEL_PASSWORD ?? "";
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/play" });

let world = World.load();
let characterConfig = CharacterConfig.load();
const store = new Store(characterConfig);
store.initializeRoomItems(world.rooms.values());
store.initializeDoors(world.doors.values());
let game = new Game(world, store, characterConfig);
const sessions = new Map<WebSocket, PlayerRecord>();
const accountSessions = new Map<WebSocket, AccountRecord>();
const characterAdminUpdateSchema = z.object({
  roomId: z.string().min(1),
  level: z.number().int().min(1),
  xp: z.number().int().min(0),
  tickets: z.number().int().min(0),
  hp: z.number().int().min(0),
  mana: z.number().int().min(0),
  titles: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  inventory: z.array(z.string()).default([]),
  sanctuaryRoomId: z.string().min(1).optional()
});
const characterDebugActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("moveRoom"), roomId: z.string().min(1) }),
  z.object({ action: z.literal("setSanctuary"), roomId: z.string().min(1) }),
  z.object({ action: z.literal("heal") }),
  z.object({ action: z.literal("addItem"), itemId: z.string().min(1) }),
  z.object({ action: z.literal("grantFlag"), flag: z.string().trim().min(1) }),
  z.object({ action: z.literal("removeFlag"), flag: z.string().trim().min(1) }),
  z.object({ action: z.literal("completeQuest"), questId: z.string().min(1) }),
  z.object({ action: z.literal("resetQuest"), questId: z.string().min(1) })
]);
const accountPasswordResetSchema = z.object({
  password: z.string().min(8)
});

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.get(["/admin", "/admin/"], (_req, res) => {
  res.redirect(302, "/admin.html");
});

app.get("/api/world", (_req, res) => {
  res.json({
    metadata: world.metadata,
    zones: [...world.zones.values()],
    spawnPoints: [...world.spawnPoints.values()],
    doors: [...world.doors.values()],
    rooms: [...world.rooms.values()].map(({ id, zoneId, name, coords, tags, map, exits }) => ({
      id,
      zoneId,
      name,
      coords,
      tags,
      map,
      exits
    })),
    startRoomId: world.startRoomId,
    defaultSpawnId: world.defaultSpawnId
  });
});

app.get("/api/character", (_req, res) => {
  res.json({
    combat: characterConfig.combat,
    leveling: characterConfig.leveling,
    stats: characterConfig.stats,
    species: characterConfig.species,
    jobs: characterConfig.jobs,
    defaultSpeciesId: characterConfig.defaultSpeciesId,
    defaultJobId: characterConfig.defaultJobId
  });
});

app.get("/api/admin/summary", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ rooms: world.rooms.size, items: world.items.size, npcs: world.npcs.size });
});

app.get("/api/admin/characters", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ characters: store.allCharacterSummaries() });
});

app.get("/api/admin/accounts", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ accounts: store.allAccounts() });
});

app.post("/api/admin/accounts/:accountId/reset-password", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { password } = accountPasswordResetSchema.parse(req.body.reset);
    const account = store.resetAccountPassword(Number(req.params.accountId), password);
    res.json({ account, accounts: store.allAccounts() });
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.get("/api/admin/characters/:characterId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json({ character: store.getCharacterAdminRecord(Number(req.params.characterId)) });
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/characters/:characterId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const update = characterAdminUpdateSchema.parse(req.body.character);
    if (!world.rooms.has(update.roomId)) throw new Error(`Room '${update.roomId}' does not exist.`);
    if (update.sanctuaryRoomId && !world.rooms.has(update.sanctuaryRoomId)) throw new Error(`Room '${update.sanctuaryRoomId}' does not exist.`);
    for (const itemId of update.inventory) {
      if (!world.items.has(itemId)) throw new Error(`Item '${itemId}' does not exist.`);
    }
    const character = store.updateCharacterAdminRecord(Number(req.params.characterId), update);
    applyAdminCharacterToSession(character);
    res.json({ character, characters: store.allCharacterSummaries() });
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/characters/:characterId/debug", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const action = characterDebugActionSchema.parse(req.body.debug);
    const characterId = Number(req.params.characterId);
    let character = store.getCharacterAdminRecord(characterId);

    if (action.action === "moveRoom" || action.action === "setSanctuary") {
      if (!world.rooms.has(action.roomId)) throw new Error(`Room '${action.roomId}' does not exist.`);
      character = store.updateCharacterAdminRecord(characterId, {
        roomId: action.action === "moveRoom" ? action.roomId : character.roomId,
        level: character.level,
        xp: character.xp,
        tickets: character.tickets,
        hp: character.hp,
        mana: character.mana,
        titles: character.titles,
        flags: character.flags,
        inventory: character.inventory,
        sanctuaryRoomId: action.action === "setSanctuary" ? action.roomId : character.sanctuaryRoomId
      });
    }

    if (action.action === "heal") {
      character = store.updateCharacterAdminRecord(characterId, {
        roomId: character.roomId,
        level: character.level,
        xp: character.xp,
        tickets: character.tickets,
        hp: character.maxHp,
        mana: character.maxMana,
        titles: character.titles,
        flags: character.flags,
        inventory: character.inventory,
        sanctuaryRoomId: character.sanctuaryRoomId
      });
    }

    if (action.action === "addItem") {
      if (!world.items.has(action.itemId)) throw new Error(`Item '${action.itemId}' does not exist.`);
      character = store.updateCharacterAdminRecord(characterId, {
        roomId: character.roomId,
        level: character.level,
        xp: character.xp,
        tickets: character.tickets,
        hp: character.hp,
        mana: character.mana,
        titles: character.titles,
        flags: character.flags,
        inventory: [...character.inventory, action.itemId],
        sanctuaryRoomId: character.sanctuaryRoomId
      });
    }

    if (action.action === "grantFlag" || action.action === "removeFlag") {
      const flags = action.action === "grantFlag" ? [...new Set([...character.flags, action.flag])] : character.flags.filter((flag) => flag !== action.flag);
      character = store.updateCharacterAdminRecord(characterId, {
        roomId: character.roomId,
        level: character.level,
        xp: character.xp,
        tickets: character.tickets,
        hp: character.hp,
        mana: character.mana,
        titles: character.titles,
        flags,
        inventory: character.inventory,
        sanctuaryRoomId: character.sanctuaryRoomId
      });
    }

    if (action.action === "completeQuest") {
      const quest = world.quests.get(action.questId);
      if (!quest) throw new Error(`Quest '${action.questId}' does not exist.`);
      store.saveQuestRecord({
        playerId: characterId,
        questId: quest.id,
        status: "completed",
        completedSteps: quest.steps.map((step) => step.id),
        completedAt: new Date().toISOString()
      });
    }

    if (action.action === "resetQuest") {
      if (!world.quests.has(action.questId)) throw new Error(`Quest '${action.questId}' does not exist.`);
      store.deleteQuestRecord(characterId, action.questId);
    }

    const updatedCharacter = store.getCharacterAdminRecord(characterId);
    applyAdminCharacterToSession(updatedCharacter);
    res.json({ character: updatedCharacter, characters: store.allCharacterSummaries() });
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.get("/api/admin/world", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(adminWorldView());
});

app.get("/api/admin/character-config", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(characterConfigView());
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/character-config", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const result = saveCharacterConfig(req.body.config);
    reloadLiveCharacterConfig();
    res.json(result);
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.get("/api/admin/export/world", (req, res) => {
  if (!requireAdmin(req, res)) return;
  sendJsonDownload(res, "cardbound-world", adminWorldView());
});

app.get("/api/admin/export/character-config", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    sendJsonDownload(res, "cardbound-character-config", characterConfigView());
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.get("/api/admin/export/bundle", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    sendJsonDownload(res, "cardbound-builder-bundle", {
      exportedAt: new Date().toISOString(),
      world: adminWorldView(),
      characterConfig: characterConfigView()
    });
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/zones", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createZone(req.body.zone, req.body.room)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/rooms/:roomId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(applyWorldMutation(() => saveRoom(req.params.roomId, req.body.room)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/rooms/link", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createLinkedRoom(req.body.sourceRoomId, req.body.direction, req.body.room)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/rooms/connect", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(applyWorldMutation(() => connectRooms(req.body.sourceRoomId, req.body.targetRoomId, req.body.direction)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/rooms", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createRoom(req.body.room)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/quests/:questId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(applyWorldMutation(() => saveQuest(req.params.questId, req.body.quest)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/quests", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createQuest(req.body.quest)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/items/:itemId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(applyWorldMutation(() => saveItem(req.params.itemId, req.body.item)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/items", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createItem(req.body.item)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.put("/api/admin/npcs/:npcId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(applyWorldMutation(() => saveNpc(req.params.npcId, req.body.npc)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

app.post("/api/admin/npcs", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(201).json(applyWorldMutation(() => createNpc(req.body.npc)));
  } catch (error) {
    sendAdminError(res, error);
  }
});

wss.on("connection", (socket) => {
  send(socket, { type: "system", message: "Connected. Log in or create an account, then choose a character to enter Cardbound City." });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw)) as ClientMessage;
      handleMessage(socket, message);
    } catch (error) {
      send(socket, { type: "log", lines: [`That did not work: ${(error as Error).message}`] });
    }
  });

  socket.on("close", () => {
    const player = sessions.get(socket);
    sessions.delete(socket);
    accountSessions.delete(socket);
    if (player) broadcastToRoom(player.roomId, `${player.name} signs off from the crossing.`, socket);
  });
});

server.listen(port, host, () => {
  console.log(`Cardbound MUD listening at http://${host ?? "0.0.0.0"}:${port}`);
});

setInterval(() => {
  const events = game.tickCombat([...sessions.values()]);
  for (const event of events) {
    const socket = event.playerId ? socketForPlayer(event.playerId) : undefined;
    const player = socket ? sessions.get(socket) : undefined;
    if (socket && event.lines.length) send(socket, { type: "log", lines: event.lines });
    if (socket) sendState(socket);
    for (const line of event.roomLines ?? []) {
      broadcastToRoom(event.roomId, line, socket);
    }
    broadcastStateForRoom(event.roomId);
    if (player && player.roomId !== event.roomId) broadcastStateForRoom(player.roomId);
  }
}, 500);

setInterval(() => {
  for (const event of game.tickItems()) {
    broadcastToRoom(event.roomId, event.line);
    broadcastStateForRoom(event.roomId);
  }
}, 1000);

function handleMessage(socket: WebSocket, message: ClientMessage) {
  if (message.type === "accountRegister") {
    const account = store.createAccount(message.username, message.password);
    accountSessions.set(socket, account);
    send(socket, { type: "log", lines: [`Account created for ${account.username}. Make your first character when you are ready.`] });
    sendAccount(socket);
    return;
  }

  if (message.type === "accountLogin") {
    const account = store.authenticateAccount(message.username, message.password);
    accountSessions.set(socket, account);
    send(socket, { type: "log", lines: [`Welcome back, ${account.username}. Choose a character to enter Cardbound City.`] });
    sendAccount(socket);
    return;
  }

  if (message.type === "createCharacter") {
    const account = accountSessions.get(socket);
    if (!account) {
      send(socket, { type: "log", lines: ["Log into an account before creating a character."] });
      return;
    }
    const player = game.createCharacter(account.id, message.name, message.adminCode === adminCode ? adminCode : undefined, message.species, message.job);
    sendAccount(socket);
    enterWorld(socket, player, `Welcome, ${player.name}. Type help for commands.`, [
      ...classIntroLines(player.job),
      "First steps: try look, talk Marshal Echo, ask Marshal Echo about key, then travel north/east/south/west.",
      "For roleplay, use /me <action> or me <action>."
    ]);
    return;
  }

  if (message.type === "selectCharacter") {
    const account = accountSessions.get(socket);
    if (!account) {
      send(socket, { type: "log", lines: ["Log into an account before choosing a character."] });
      return;
    }
    const player = game.selectCharacter(account.id, message.characterId);
    enterWorld(socket, player, `Welcome back, ${player.name}. Type help for commands.`);
    return;
  }

  if (message.type === "login") {
    const player = game.login(message.name, message.adminCode === adminCode ? adminCode : undefined, message.species, message.job);
    enterWorld(socket, player, `Welcome, ${player.name}. Type help for commands.`);
    return;
  }

  const player = sessions.get(socket);
  if (!player) {
    send(socket, { type: "log", lines: ["Log in before sending commands."] });
    return;
  }

  if (message.type === "command") {
    const beforeRoom = player.roomId;
    const result = game.runCommand(player, message.input, () => playerNamesInRoom(player.roomId, socket));
    send(socket, { type: "log", lines: result.lines });
    sendState(socket);

    if (result.roomEcho) broadcastToRoom(player.roomId, result.roomEcho, socket);
    if (beforeRoom !== player.roomId) {
      broadcastToRoom(beforeRoom, `${player.name} leaves.`, socket);
      broadcastToRoom(player.roomId, `${player.name} arrives.`, socket);
      broadcastStateForRoom(beforeRoom);
      broadcastStateForRoom(player.roomId);
    } else {
      broadcastStateForRoom(player.roomId);
    }
  }
}

function enterWorld(socket: WebSocket, player: PlayerRecord, welcomeLine: string, extraLines: string[] = []) {
  const previousPlayer = sessions.get(socket);
  if (previousPlayer && previousPlayer.id !== player.id) {
    broadcastToRoom(previousPlayer.roomId, `${previousPlayer.name} signs off from the crossing.`, socket);
  }
  sessions.set(socket, player);
  send(socket, { type: "log", lines: [welcomeLine, ...extraLines, ...game.look(player, playerNamesInRoom(player.roomId, socket))] });
  sendState(socket);
  broadcastToRoom(player.roomId, `${player.name} steps into the crossing light.`, socket);
}

function classIntroLines(job: PlayerRecord["job"]) {
  const intros: Record<string, string[]> = {
    duelist: [
      "Your Duel Disk calibrates with a KaibaCorp chirp, and the Normal Summon zone glows like it has been waiting for a close-up.",
      "Starter instinct: attack <monster> or duel <monster>, then use Normal Summon when your Energy is ready."
    ],
    trainer: [
      "Your Pokedex phone pings a warning: nearby monsters are unregistered, overexcited, and probably snack-motivated.",
      "Starter instinct: attack <monster>, then use Quick Attack when your partner is ready to move first."
    ],
    planeswalker: [
      "A five-color mana shimmer crawls over your deckbox, then politely pretends it was always part of the sidewalk.",
      "Starter instinct: attack <monster>, then use Lightning Bolt when the stack is clear enough for fireworks."
    ],
    pilot: [
      "A Haro icon blinks on your wrist display while a tiny launch alarm counts down from nowhere in particular.",
      "Starter instinct: attack <monster>, then use Beam Saber Slash once you have target lock."
    ],
    captain: [
      "A Straw Hat sash snaps in the wind like the city itself just joined your crew.",
      "Starter instinct: attack <monster>, then use Gum-Gum Pistol when the target is asking for a dramatic reach check."
    ],
    "arena-fighter": [
      "Your Union Arena AP counter clicks to ready, then starts tracking every nearby crossover like it has opinions.",
      "Starter instinct: attack <monster>, then use AP Assist when you want the board state to get loud."
    ]
  };
  return intros[job] ?? ["Your deck hums with several incompatible rulesets and exactly enough confidence to make that work."];
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function sendState(socket: WebSocket) {
  const player = sessions.get(socket);
  if (!player) return;
  send(socket, { type: "state", state: game.view(player, playerNamesInRoom(player.roomId, socket)) });
}

function sendAccount(socket: WebSocket) {
  const account = accountSessions.get(socket);
  if (!account) return;
  send(socket, {
    type: "account",
    account: {
      username: account.username,
      characters: store.charactersForAccount(account.id)
    }
  });
}

function broadcastToRoom(roomId: string, line: string, except?: WebSocket) {
  for (const [socket, player] of sessions.entries()) {
    if (socket !== except && player.roomId === roomId) {
      send(socket, { type: "log", lines: [line] });
    }
  }
}

function broadcastStateForRoom(roomId: string) {
  for (const [socket, player] of sessions.entries()) {
    if (player.roomId === roomId) sendState(socket);
  }
}

function broadcastStateForAll() {
  for (const socket of sessions.keys()) sendState(socket);
}

function applyWorldMutation<T>(operation: () => T) {
  const result = operation();
  reloadLiveWorld();
  return result;
}

function reloadLiveWorld() {
  world = World.load();
  store.initializeRoomItems(world.rooms.values());
  store.initializeDoors(world.doors.values());
  game = new Game(world, store, characterConfig);

  for (const player of sessions.values()) {
    let changed = false;
    if (!world.rooms.has(player.roomId)) {
      player.roomId = world.defaultSpawnRoomId();
      changed = true;
    }
    if (!world.rooms.has(player.sanctuaryRoomId)) {
      player.sanctuaryRoomId = world.defaultSpawnRoomId();
      changed = true;
    }
    if (changed) store.savePlayer(player);
  }

  broadcastStateForAll();
}

function reloadLiveCharacterConfig() {
  characterConfig = CharacterConfig.load();
  store.setCharacterConfig(characterConfig);
  game = new Game(world, store, characterConfig);
  broadcastStateForAll();
}

function socketForPlayer(playerId: number) {
  return [...sessions.entries()].find(([, player]) => player.id === playerId)?.[0];
}

function applyAdminCharacterToSession(record: CharacterAdminRecord) {
  const socket = socketForPlayer(record.id);
  const player = socket ? sessions.get(socket) : undefined;
  if (!socket || !player) return;
  player.roomId = record.roomId;
  player.description = record.description;
  player.hp = record.hp;
  player.maxHp = record.maxHp;
  player.mana = record.mana;
  player.maxMana = record.maxMana;
  player.xp = record.xp;
  player.level = record.level;
  player.tickets = record.tickets;
  player.binderCards = record.binderCards;
  player.titles = record.titles;
  player.flags = record.flags;
  player.inventory = record.inventory;
  player.equipment = record.equipment;
  player.sanctuaryRoomId = record.sanctuaryRoomId;
  sendState(socket);
}

function playerNamesInRoom(roomId: string, except?: WebSocket) {
  return [...sessions.entries()]
    .filter(([socket, player]) => socket !== except && player.roomId === roomId)
    .map(([, player]): PlayerPresence => ({
      name: player.name,
      speciesName: characterConfig.speciesName(player.species),
      jobName: characterConfig.jobName(player.job),
      titles: player.titles,
      description: player.description
    }));
}

function requireAdmin(req: express.Request, res: express.Response) {
  const name = String(req.query.name ?? req.body?.adminName ?? req.get("x-admin-name") ?? "");
  const password = String(
    req.query.adminPassword ?? req.body?.adminPassword ?? req.body?.adminToken ?? req.get("x-admin-password") ?? req.get("x-admin-token") ?? ""
  );

  if (adminPanelUsername && adminPanelPassword && (name === adminPanelUsername || password)) {
    if (name === adminPanelUsername && password === adminPanelPassword) return true;
    res.status(403).json({ error: "Admin username or password did not match." });
    return false;
  }

  const token = String(req.query.adminToken ?? req.body?.adminToken ?? req.get("x-admin-token") ?? "");
  if (adminToken && token !== adminToken) {
    res.status(403).json({ error: "Admin token required." });
    return false;
  }
  const player = [...sessions.values()].find((session) => session.name.toLowerCase() === name.toLowerCase());
  if (!player?.isAdmin) {
    res.status(403).json({ error: "Admin access required. Log into the game with the admin code first." });
    return false;
  }
  return true;
}

function sendJsonDownload(res: express.Response, baseName: string, data: unknown) {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}-${date}.json"`);
  res.send(`${JSON.stringify(data, null, 2)}\n`);
}

function sendAdminError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed.", details: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
    return;
  }
  res.status(400).json({ error: (error as Error).message });
}
