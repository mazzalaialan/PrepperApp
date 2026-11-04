import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SQLite integrado en Node: un solo archivo en DATA_DIR, sin dependencias nativas.
 * Cada cambio de esquema es una migración nueva al final de la lista.
 */
const MIGRATIONS = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE devices (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL,
     subscription TEXT NOT NULL,
     timezone TEXT NOT NULL,
     notify_hour INTEGER NOT NULL,
     language TEXT NOT NULL,
     last_notified_day TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE alerts (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     lot_id TEXT NOT NULL,
     item_name TEXT NOT NULL,
     kind TEXT NOT NULL,
     due_date TEXT,
     notify_from TEXT NOT NULL,
     PRIMARY KEY (device_id, lot_id)
   );
   CREATE TABLE transfers (
     code TEXT PRIMARY KEY,
     data BLOB NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );`,
  // Avisos de lluvia con la app cerrada (opcional): los lugares que el usuario eligió, redondeados a ~1 km.
  `CREATE TABLE rain_places (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     place_id TEXT NOT NULL,
     label TEXT,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     fix_at TEXT,
     notified INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (device_id, place_id)
   );`,
];

export type Db = DatabaseSync;

export function openDb(dataDir: string | ':memory:'): Db {
  let path = ':memory:';
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true });
    path = join(dataDir, 'vikarg.db');
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function getSetting(db: Db, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
