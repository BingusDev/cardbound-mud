import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { CharacterConfig } from "./characterConfig.js";
import { roomStartingItemIds } from "./world.js";
import type {
  CharacterSummary,
  DoorDefinition,
  DoorState,
  PlayerJob,
  PlayerRecord,
  PlayerSpecies,
  PlayerStats,
  QuestRecord,
  QuestStatus,
  RoomDefinition
} from "./types.js";

export interface CharacterAdminRecord extends CharacterSummary {
  description: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  xp: number;
  tickets: number;
  binderCards: string[];
  roomId: string;
  sanctuaryRoomId: string;
  titles: string[];
  flags: string[];
  inventory: string[];
  equipment: PlayerRecord["equipment"];
  quests: QuestRecord[];
}

export interface CharacterAdminUpdate {
  roomId: string;
  level: number;
  xp: number;
  tickets: number;
  hp: number;
  mana: number;
  titles: string[];
  flags: string[];
  inventory: string[];
  sanctuaryRoomId?: string;
}

export interface AccountRecord {
  id: number;
  username: string;
}

export interface AdminAccountRecord extends AccountRecord {
  createdAt: string;
  updatedAt: string;
  characters: CharacterSummary[];
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(
    private characterConfig: CharacterConfig,
    dbPath = path.join(process.cwd(), "data", "cardbound.sqlite")
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        species TEXT NOT NULL DEFAULT '${this.characterConfig.defaultSpeciesId}',
        job TEXT NOT NULL DEFAULT '${this.characterConfig.defaultJobId}',
        stats_json TEXT NOT NULL DEFAULT '${JSON.stringify(this.characterConfig.statsForSpecies())}',
        room_id TEXT NOT NULL,
        hp INTEGER NOT NULL,
        max_hp INTEGER NOT NULL,
        mana INTEGER NOT NULL,
        max_mana INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        tickets INTEGER NOT NULL DEFAULT 0,
        binder_cards_json TEXT NOT NULL DEFAULT '[]',
        titles_json TEXT NOT NULL DEFAULT '[]',
        flags_json TEXT NOT NULL DEFAULT '[]',
        inventory_json TEXT NOT NULL,
        equipment_json TEXT NOT NULL DEFAULT '{}',
        sanctuary_room_id TEXT,
        dead_until INTEGER,
        account_id INTEGER,
        is_admin INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS room_state (
        room_id TEXT PRIMARY KEY,
        item_ids_json TEXT NOT NULL,
        item_respawns_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS door_state (
        player_id INTEGER NOT NULL DEFAULT 0,
        door_id TEXT NOT NULL,
        is_open INTEGER NOT NULL,
        is_locked INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, door_id)
      );

      CREATE TABLE IF NOT EXISTS player_quests (
        player_id INTEGER NOT NULL,
        quest_id TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_steps_json TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, quest_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
    `);
    this.ensurePlayerProgressionColumns();
    this.ensurePlayerQuestForeignKey();
    this.ensureRoomStateColumns();
    this.ensureDoorStateColumns();
  }

  setCharacterConfig(characterConfig: CharacterConfig) {
    this.characterConfig = characterConfig;
  }

  private ensurePlayerProgressionColumns() {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(players)").all() as unknown as Array<{ name: string }>).map((column) => column.name)
    );
    const migrations: Array<[string, string]> = [
      ["xp", "ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0"],
      ["level", "ALTER TABLE players ADD COLUMN level INTEGER NOT NULL DEFAULT 1"],
      ["tickets", "ALTER TABLE players ADD COLUMN tickets INTEGER NOT NULL DEFAULT 0"],
      ["binder_cards_json", "ALTER TABLE players ADD COLUMN binder_cards_json TEXT NOT NULL DEFAULT '[]'"],
      ["titles_json", "ALTER TABLE players ADD COLUMN titles_json TEXT NOT NULL DEFAULT '[]'"],
      ["flags_json", "ALTER TABLE players ADD COLUMN flags_json TEXT NOT NULL DEFAULT '[]'"],
      ["species", `ALTER TABLE players ADD COLUMN species TEXT NOT NULL DEFAULT '${this.characterConfig.defaultSpeciesId}'`],
      ["job", `ALTER TABLE players ADD COLUMN job TEXT NOT NULL DEFAULT '${this.characterConfig.defaultJobId}'`],
      ["stats_json", `ALTER TABLE players ADD COLUMN stats_json TEXT NOT NULL DEFAULT '${JSON.stringify(this.characterConfig.statsForSpecies())}'`],
      ["sanctuary_room_id", "ALTER TABLE players ADD COLUMN sanctuary_room_id TEXT"],
      ["dead_until", "ALTER TABLE players ADD COLUMN dead_until INTEGER"],
      ["equipment_json", "ALTER TABLE players ADD COLUMN equipment_json TEXT NOT NULL DEFAULT '{}'"],
      ["account_id", "ALTER TABLE players ADD COLUMN account_id INTEGER"],
      ["description", "ALTER TABLE players ADD COLUMN description TEXT NOT NULL DEFAULT ''"]
    ];

    for (const [column, sql] of migrations) {
      if (!columns.has(column)) this.db.exec(sql);
    }
    this.normalizePlayerTableShape();
  }

  private normalizePlayerTableShape() {
    const desiredColumns = [
      "id",
      "name",
      "description",
      "species",
      "job",
      "stats_json",
      "room_id",
      "hp",
      "max_hp",
      "mana",
      "max_mana",
      "xp",
      "level",
      "tickets",
      "binder_cards_json",
      "titles_json",
      "flags_json",
      "inventory_json",
      "equipment_json",
      "sanctuary_room_id",
      "dead_until",
      "account_id",
      "is_admin",
      "updated_at"
    ];
    const currentColumns = (this.db.prepare("PRAGMA table_info(players)").all() as unknown as Array<{ name: string }>).map((column) => column.name);
    if (currentColumns.join(",") === desiredColumns.join(",")) return;

    this.db.exec(`
      ALTER TABLE players RENAME TO players_previous;
      CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        species TEXT NOT NULL DEFAULT '${this.characterConfig.defaultSpeciesId}',
        job TEXT NOT NULL DEFAULT '${this.characterConfig.defaultJobId}',
        stats_json TEXT NOT NULL DEFAULT '${JSON.stringify(this.characterConfig.statsForSpecies())}',
        room_id TEXT NOT NULL,
        hp INTEGER NOT NULL,
        max_hp INTEGER NOT NULL,
        mana INTEGER NOT NULL,
        max_mana INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        tickets INTEGER NOT NULL DEFAULT 0,
        binder_cards_json TEXT NOT NULL DEFAULT '[]',
        titles_json TEXT NOT NULL DEFAULT '[]',
        flags_json TEXT NOT NULL DEFAULT '[]',
        inventory_json TEXT NOT NULL,
        equipment_json TEXT NOT NULL DEFAULT '{}',
        sanctuary_room_id TEXT,
        dead_until INTEGER,
        account_id INTEGER,
        is_admin INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO players (${desiredColumns.join(", ")})
        SELECT ${desiredColumns.join(", ")} FROM players_previous;
      DROP TABLE players_previous;
    `);
  }

  private ensurePlayerQuestForeignKey() {
    const foreignKeys = this.db.prepare("PRAGMA foreign_key_list(player_quests)").all() as unknown as Array<{ table: string }>;
    if (foreignKeys.every((key) => key.table === "players")) return;

    this.db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE player_quests_rebuilt (
        player_id INTEGER NOT NULL,
        quest_id TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_steps_json TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, quest_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO player_quests_rebuilt (player_id, quest_id, status, completed_steps_json, completed_at, updated_at)
        SELECT player_id, quest_id, status, completed_steps_json, completed_at, updated_at FROM player_quests;
      DROP TABLE player_quests;
      ALTER TABLE player_quests_rebuilt RENAME TO player_quests;
      PRAGMA foreign_keys = ON;
    `);
  }

  createAccount(username: string, password: string): AccountRecord {
    const cleanedUsername = cleanUsername(username);
    assertPassword(password);
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);

    try {
      this.db
        .prepare("INSERT INTO accounts (username, password_hash, salt) VALUES (?, ?, ?)")
        .run(cleanedUsername, passwordHash, salt);
    } catch (error) {
      if (String((error as Error).message).includes("UNIQUE")) throw new Error("That account name is already taken.");
      throw error;
    }

    const created = this.db.prepare("SELECT id, username FROM accounts WHERE username = ?").get(cleanedUsername) as DbAccount | undefined;
    if (!created) throw new Error("Could not create account.");
    return { id: created.id, username: created.username };
  }

  authenticateAccount(username: string, password: string): AccountRecord {
    const cleanedUsername = cleanUsername(username);
    const account = this.db.prepare("SELECT id, username, password_hash, salt FROM accounts WHERE username = ?").get(cleanedUsername) as
      | DbAccount
      | undefined;
    if (!account) throw new Error("Account name or password did not match.");

    const passwordHash = hashPassword(password, account.salt);
    const expected = Buffer.from(account.password_hash, "hex");
    const actual = Buffer.from(passwordHash, "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new Error("Account name or password did not match.");
    }
    return { id: account.id, username: account.username };
  }

  allAccounts(): AdminAccountRecord[] {
    const rows = this.db.prepare("SELECT id, username, created_at, updated_at FROM accounts ORDER BY updated_at DESC, id DESC").all() as unknown as Array<
      Pick<DbAccount, "id" | "username" | "created_at" | "updated_at">
    >;
    return rows.map((account) => ({
      id: account.id,
      username: account.username,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
      characters: this.charactersForAccount(account.id)
    }));
  }

  resetAccountPassword(accountId: number, password: string): AccountRecord {
    assertPassword(password);
    const account = this.db.prepare("SELECT id, username FROM accounts WHERE id = ?").get(accountId) as Pick<DbAccount, "id" | "username"> | undefined;
    if (!account) throw new Error("Account not found.");
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    this.db
      .prepare("UPDATE accounts SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(passwordHash, salt, accountId);
    return { id: account.id, username: account.username };
  }

  charactersForAccount(accountId: number): CharacterSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM players WHERE account_id = ? ORDER BY updated_at DESC, id DESC")
      .all(accountId) as unknown as DbPlayer[];
    return rows.map((row) => this.characterSummary(row));
  }

  allCharacterSummaries(): CharacterSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM players ORDER BY updated_at DESC, id DESC")
      .all() as unknown as DbPlayer[];
    return rows.map((row) => this.characterSummary(row));
  }

  getCharacterAdminRecord(playerId: number): CharacterAdminRecord {
    const row = this.db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as DbPlayer | undefined;
    if (!row) throw new Error("Character not found.");
    const player = fromDbPlayer(row, this.characterConfig);
    return {
      ...this.characterSummary(row),
      description: player.description,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      xp: player.xp,
      tickets: player.tickets,
      binderCards: player.binderCards,
      roomId: player.roomId,
      sanctuaryRoomId: player.sanctuaryRoomId,
      titles: player.titles,
      flags: player.flags,
      inventory: player.inventory,
      equipment: player.equipment,
      quests: this.getQuestRecords(player.id)
    };
  }

  updateCharacterAdminRecord(playerId: number, update: CharacterAdminUpdate): CharacterAdminRecord {
    const existing = this.db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as DbPlayer | undefined;
    if (!existing) throw new Error("Character not found.");
    const player = fromDbPlayer(existing, this.characterConfig);
    player.roomId = update.roomId;
    player.level = Math.max(1, Math.floor(update.level));
    player.xp = Math.max(0, Math.floor(update.xp));
    player.tickets = Math.max(0, Math.floor(update.tickets));
    player.hp = Math.max(0, Math.min(player.maxHp, Math.floor(update.hp)));
    player.mana = Math.max(0, Math.min(player.maxMana, Math.floor(update.mana)));
    player.titles = [...new Set(update.titles.map((value) => value.trim()).filter(Boolean))];
    player.flags = [...new Set(update.flags.map((value) => value.trim()).filter(Boolean))];
    player.inventory = update.inventory.map((value) => value.trim()).filter(Boolean);
    player.sanctuaryRoomId = update.sanctuaryRoomId ?? player.sanctuaryRoomId;
    this.savePlayer(player);
    return this.getCharacterAdminRecord(playerId);
  }

  createPlayerForAccount(accountId: number, name: string, startRoomId: string, isAdmin: boolean, species?: PlayerSpecies, job?: PlayerJob): PlayerRecord {
    const cleanedName = cleanCharacterName(name);
    const playerSpecies = this.characterConfig.normalizeSpecies(species);
    const playerJob = this.characterConfig.normalizeJob(job);
    const stats = this.characterConfig.statsForSpecies(playerSpecies);
    const maxHp = this.characterConfig.maxHpForStats(stats);
    const maxMana = this.characterConfig.maxManaForStats(stats);

    try {
      this.db
        .prepare(
          `INSERT INTO players (account_id, name, species, job, stats_json, room_id, hp, max_hp, mana, max_mana, xp, level, tickets, binder_cards_json, titles_json, flags_json, inventory_json, sanctuary_room_id, is_admin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, '[]', '[]', '[]', '[]', ?, ?)`
        )
        .run(
          accountId,
          cleanedName,
          playerSpecies,
          playerJob,
          JSON.stringify(stats),
          startRoomId,
          maxHp,
          maxHp,
          maxMana,
          maxMana,
          startRoomId,
          isAdmin ? 1 : 0
        );
    } catch (error) {
      if (String((error as Error).message).includes("UNIQUE")) throw new Error("That character name is already taken.");
      throw error;
    }

    const created = this.db
      .prepare("SELECT * FROM players WHERE account_id = ? AND name = ?")
      .get(accountId, cleanedName) as DbPlayer | undefined;
    if (!created) throw new Error("Could not create character.");
    return fromDbPlayer(created, this.characterConfig);
  }

  getPlayerForAccount(accountId: number, playerId: number): PlayerRecord {
    const player = this.db
      .prepare("SELECT * FROM players WHERE id = ? AND account_id = ?")
      .get(playerId, accountId) as DbPlayer | undefined;
    if (!player) throw new Error("Choose one of your characters first.");
    return fromDbPlayer(player, this.characterConfig);
  }

  private characterSummary(row: DbPlayer): CharacterSummary {
    const species = this.characterConfig.normalizeSpecies(row.species);
    const job = this.characterConfig.normalizeJob(row.job);
    return {
      id: row.id,
      name: row.name,
      species,
      speciesName: this.characterConfig.speciesName(species),
      job,
      jobName: this.characterConfig.jobName(job),
      level: row.level,
      roomId: row.room_id,
      isAdmin: Boolean(row.is_admin)
    };
  }

  initializeRoomItems(rooms: Iterable<RoomDefinition>) {
    const insert = this.db.prepare("INSERT OR IGNORE INTO room_state (room_id, item_ids_json) VALUES (?, ?)");
    for (const room of rooms) {
      const spawnItemIds = roomStartingItemIds(room);
      insert.run(room.id, JSON.stringify(spawnItemIds));
      const existingItems = this.getRoomItems(room.id);
      const mergedItems = [...existingItems];
      for (const itemId of spawnItemIds) {
        const desiredCount = spawnItemIds.filter((id) => id === itemId).length;
        const currentCount = mergedItems.filter((id) => id === itemId).length;
        if (currentCount < desiredCount) mergedItems.push(itemId);
      }
      if (mergedItems.length !== existingItems.length) {
        this.setRoomItems(room.id, mergedItems);
      }
    }
  }

  private ensureRoomStateColumns() {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(room_state)").all() as unknown as Array<{ name: string }>).map((column) => column.name)
    );
    if (!columns.has("item_respawns_json")) {
      this.db.exec("ALTER TABLE room_state ADD COLUMN item_respawns_json TEXT NOT NULL DEFAULT '{}'");
    }
  }

  private ensureDoorStateColumns() {
    const columns = (this.db.prepare("PRAGMA table_info(door_state)").all() as unknown as Array<{ name: string; pk: number }>).map((column) => column.name);
    const primaryKeyColumns = (this.db.prepare("PRAGMA table_info(door_state)").all() as unknown as Array<{ name: string; pk: number }>)
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    if (columns.includes("player_id") && primaryKeyColumns.join(",") === "player_id,door_id") return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_door_state_new (
        player_id INTEGER NOT NULL DEFAULT 0,
        door_id TEXT NOT NULL,
        is_open INTEGER NOT NULL,
        is_locked INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, door_id)
      );
      INSERT OR IGNORE INTO player_door_state_new (player_id, door_id, is_open, is_locked, updated_at)
        SELECT 0, door_id, is_open, is_locked, updated_at FROM door_state;
      DROP TABLE door_state;
      ALTER TABLE player_door_state_new RENAME TO door_state;
    `);
  }

  initializeDoors(_doors: Iterable<DoorDefinition>) {
    // Doors are initialized lazily per character from world defaults.
  }

  findOrCreatePlayer(name: string, startRoomId: string, isAdmin: boolean, species?: PlayerSpecies, job?: PlayerJob): PlayerRecord {
    const cleanedName = cleanCharacterName(name);

    const existing = this.db
      .prepare("SELECT * FROM players WHERE name = ?")
      .get(cleanedName) as DbPlayer | undefined;

    if (existing) {
      if (isAdmin && !existing.is_admin) {
        this.db.prepare("UPDATE players SET is_admin = 1 WHERE id = ?").run(existing.id);
        existing.is_admin = 1;
      }
      if (!existing.sanctuary_room_id) {
        this.db.prepare("UPDATE players SET sanctuary_room_id = ? WHERE id = ?").run(startRoomId, existing.id);
        existing.sanctuary_room_id = startRoomId;
      }
      return fromDbPlayer(existing, this.characterConfig);
    }

    const playerSpecies = this.characterConfig.normalizeSpecies(species);
    const playerJob = this.characterConfig.normalizeJob(job);
    const stats = this.characterConfig.statsForSpecies(playerSpecies);
    const maxHp = this.characterConfig.maxHpForStats(stats);
    const maxMana = this.characterConfig.maxManaForStats(stats);
    this.db
      .prepare(
        `INSERT INTO players (name, species, job, stats_json, room_id, hp, max_hp, mana, max_mana, xp, level, tickets, binder_cards_json, titles_json, flags_json, inventory_json, sanctuary_room_id, is_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, '[]', '[]', '[]', '[]', ?, ?)`
      )
      .run(cleanedName, playerSpecies, playerJob, JSON.stringify(stats), startRoomId, maxHp, maxHp, maxMana, maxMana, startRoomId, isAdmin ? 1 : 0);

    const created = this.db
      .prepare("SELECT * FROM players WHERE name = ?")
      .get(cleanedName) as DbPlayer | undefined;
    if (!created) throw new Error("Could not create player.");
    return fromDbPlayer(created, this.characterConfig);
  }

  savePlayer(player: PlayerRecord) {
    this.db
      .prepare(
        `UPDATE players
         SET description = ?, species = ?, job = ?, stats_json = ?, room_id = ?, hp = ?, max_hp = ?, mana = ?, max_mana = ?, xp = ?, level = ?, tickets = ?, binder_cards_json = ?, titles_json = ?, flags_json = ?, inventory_json = ?, equipment_json = ?, sanctuary_room_id = ?, dead_until = ?, is_admin = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        player.description,
        player.species,
        player.job,
        JSON.stringify(player.stats),
        player.roomId,
        player.hp,
        player.maxHp,
        player.mana,
        player.maxMana,
        player.xp,
        player.level,
        player.tickets,
        JSON.stringify(player.binderCards),
        JSON.stringify(player.titles),
        JSON.stringify(player.flags),
        JSON.stringify(player.inventory),
        JSON.stringify(player.equipment),
        player.sanctuaryRoomId,
        player.deadUntil ?? null,
        player.isAdmin ? 1 : 0,
        player.id
      );
  }

  getRoomItems(roomId: string) {
    const row = this.db.prepare("SELECT item_ids_json FROM room_state WHERE room_id = ?").get(roomId) as
      | { item_ids_json: string }
      | undefined;
    return row ? (JSON.parse(row.item_ids_json) as string[]) : [];
  }

  setRoomItems(roomId: string, itemIds: string[]) {
    this.db
      .prepare(
        `INSERT INTO room_state (room_id, item_ids_json, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(room_id) DO UPDATE SET item_ids_json = excluded.item_ids_json, updated_at = CURRENT_TIMESTAMP`
      )
      .run(roomId, JSON.stringify(itemIds));
  }

  getRoomItemRespawns(roomId: string) {
    const row = this.db.prepare("SELECT item_respawns_json FROM room_state WHERE room_id = ?").get(roomId) as
      | { item_respawns_json: string }
      | undefined;
    return row ? (JSON.parse(row.item_respawns_json) as Record<string, number[]>) : {};
  }

  setRoomItemRespawns(roomId: string, respawns: Record<string, number[]>) {
    this.db
      .prepare(
        `INSERT INTO room_state (room_id, item_ids_json, item_respawns_json, updated_at)
         VALUES (?, '[]', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(room_id) DO UPDATE SET item_respawns_json = excluded.item_respawns_json, updated_at = CURRENT_TIMESTAMP`
      )
      .run(roomId, JSON.stringify(respawns));
  }

  getDoorState(playerId: number, door: DoorDefinition): DoorState {
    const row = this.db.prepare("SELECT player_id, door_id, is_open, is_locked FROM door_state WHERE player_id = ? AND door_id = ?").get(playerId, door.id) as
      | { player_id: number; door_id: string; is_open: number; is_locked: number }
      | undefined;
    return {
      playerId,
      doorId: door.id,
      isOpen: row ? Boolean(row.is_open) : door.defaultOpen,
      isLocked: row ? Boolean(row.is_locked) : door.defaultLocked
    };
  }

  setDoorState(state: DoorState) {
    this.db
      .prepare(
        `INSERT INTO door_state (player_id, door_id, is_open, is_locked, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, door_id) DO UPDATE SET
           is_open = excluded.is_open,
           is_locked = excluded.is_locked,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(state.playerId, state.doorId, state.isOpen ? 1 : 0, state.isLocked ? 1 : 0);
  }

  getQuestRecord(playerId: number, questId: string) {
    const row = this.db
      .prepare("SELECT player_id, quest_id, status, completed_steps_json, completed_at FROM player_quests WHERE player_id = ? AND quest_id = ?")
      .get(playerId, questId) as DbQuest | undefined;
    return row ? fromDbQuest(row) : undefined;
  }

  getQuestRecords(playerId: number) {
    const rows = this.db
      .prepare("SELECT player_id, quest_id, status, completed_steps_json, completed_at FROM player_quests WHERE player_id = ?")
      .all(playerId) as unknown as DbQuest[];
    return rows.map(fromDbQuest);
  }

  saveQuestRecord(record: QuestRecord) {
    this.db
      .prepare(
        `INSERT INTO player_quests (player_id, quest_id, status, completed_steps_json, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(player_id, quest_id) DO UPDATE SET
           status = excluded.status,
           completed_steps_json = excluded.completed_steps_json,
           completed_at = excluded.completed_at,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(
        record.playerId,
        record.questId,
        record.status,
        JSON.stringify(record.completedSteps),
        record.completedAt ?? null
      );
  }

  deleteQuestRecord(playerId: number, questId: string) {
    this.db.prepare("DELETE FROM player_quests WHERE player_id = ? AND quest_id = ?").run(playerId, questId);
  }
}

interface DbPlayer {
  id: number;
  name: string;
  description?: string;
  species: string;
  job: string;
  stats_json: string;
  room_id: string;
  hp: number;
  max_hp: number;
  mana: number;
  max_mana: number;
  xp: number;
  level: number;
  tickets: number;
  binder_cards_json: string;
  titles_json: string;
  flags_json: string;
  inventory_json: string;
  equipment_json: string;
  sanctuary_room_id?: string | null;
  dead_until?: number | null;
  is_admin: number;
}

interface DbAccount {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
  updated_at: string;
}

interface DbQuest {
  player_id: number;
  quest_id: string;
  status: QuestStatus;
  completed_steps_json: string;
  completed_at?: string | null;
}

function cleanUsername(username: string) {
  const cleaned = username.trim().slice(0, 32);
  if (cleaned.length < 3) throw new Error("Account names need at least 3 characters.");
  if (!/^[a-z0-9 _.-]+$/i.test(cleaned)) throw new Error("Account names can use letters, numbers, spaces, dots, dashes, and underscores.");
  return cleaned;
}

function cleanCharacterName(name: string) {
  const cleaned = name.trim().slice(0, 24);
  if (!cleaned) throw new Error("Choose a character name first.");
  if (!/^[a-z][a-z '-]*$/i.test(cleaned)) throw new Error("Character names can use letters, spaces, apostrophes, and dashes.");
  return cleaned;
}

function assertPassword(password: string) {
  if (password.length < 8) throw new Error("Passwords need at least 8 characters.");
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function fromDbPlayer(row: DbPlayer, characterConfig: CharacterConfig): PlayerRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    species: characterConfig.normalizeSpecies(row.species),
    job: characterConfig.normalizeJob(row.job),
    stats: parseStats(row.stats_json, characterConfig, row.species),
    roomId: row.room_id,
    hp: row.hp,
    maxHp: row.max_hp,
    mana: row.mana,
    maxMana: row.max_mana,
    xp: row.xp,
    level: row.level,
    tickets: row.tickets,
    binderCards: JSON.parse(row.binder_cards_json ?? "[]") as string[],
    titles: JSON.parse(row.titles_json) as string[],
    flags: JSON.parse(row.flags_json) as string[],
    inventory: JSON.parse(row.inventory_json) as string[],
    equipment: JSON.parse(row.equipment_json ?? "{}") as PlayerRecord["equipment"],
    sanctuaryRoomId: row.sanctuary_room_id || row.room_id,
    deadUntil: row.dead_until ?? undefined,
    isAdmin: Boolean(row.is_admin)
  };
}

function parseStats(rawStats: string, characterConfig: CharacterConfig, species: PlayerSpecies): PlayerStats {
  try {
    const mergedStats = characterConfig.statsForSpecies(species);
    const savedStats = JSON.parse(rawStats) as Record<string, unknown>;
    for (const [statId, value] of Object.entries(savedStats)) {
      if (typeof value === "number") mergedStats[statId] = value;
    }
    return mergedStats;
  } catch {
    return characterConfig.statsForSpecies(species);
  }
}

function fromDbQuest(row: DbQuest): QuestRecord {
  return {
    playerId: row.player_id,
    questId: row.quest_id,
    status: row.status === "completed" ? "completed" : "active",
    completedSteps: JSON.parse(row.completed_steps_json) as string[],
    completedAt: row.completed_at ?? undefined
  };
}
