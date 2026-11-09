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
  // Avisos de rayos en los mismos lugares: cuándo se avisó por última vez (como mucho uno cada 10 minutos).
  `ALTER TABLE rain_places ADD COLUMN lightning_notified_at INTEGER;`,
  // Avisos de actualizaciones importantes (se pueden apagar en la app) y qué versiones ya se anunciaron.
  `ALTER TABLE devices ADD COLUMN updates INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE announcements (
     version TEXT PRIMARY KEY,
     sent_at TEXT NOT NULL,
     devices INTEGER NOT NULL,
     delivered INTEGER NOT NULL
   );`,
  // Peligros naturales cerca (sismos, GDACS): se pueden apagar en la app; qué evento ya se avisó en cada lugar y con qué nivel.
  `ALTER TABLE devices ADD COLUMN hazards INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE hazard_notices (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     place_id TEXT NOT NULL,
     event_key TEXT NOT NULL,
     level INTEGER NOT NULL,
     notified_at INTEGER NOT NULL,
     PRIMARY KEY (device_id, place_id, event_key)
   );`,
  // Huerta (opcional): un lugar por cada grupo de canteros a menos de ~1 km, con lo que hace falta para la
  // helada (nombre del cultivo y desde qué mínima se quema) y el riego (coeficiente, umbral y último riego).
  `CREATE TABLE garden_places (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     place_id TEXT NOT NULL,
     label TEXT,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     frost TEXT NOT NULL,
     water TEXT,
     frost_notified_date TEXT,
     water_notified INTEGER NOT NULL DEFAULT 0,
     water_checked_day TEXT,
     PRIMARY KEY (device_id, place_id)
   );
   CREATE TABLE garden_tasks (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     task_id TEXT NOT NULL,
     text TEXT NOT NULL,
     date TEXT NOT NULL,
     notified INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (device_id, task_id)
   );`,
  // Lugares donde el usuario guarda reserva (ubicaciones del inventario con waypoint), redondeados a ~1 km:
  // solo para avisar de peligros naturales cerca (inundación, incendio, sismo…) y ponerla a resguardo.
  `CREATE TABLE stock_places (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     place_id TEXT NOT NULL,
     label TEXT,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     PRIMARY KEY (device_id, place_id)
   );`,
  // Alertas oficiales (SMN, DMC, INUMET) ya avisadas a cada dispositivo, por organismo y fenómeno:
  // una renovación o actualización con otro identificador no se vuelve a avisar, salvo que empeore.
  `CREATE TABLE official_notices (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     family TEXT NOT NULL,
     alert_key TEXT NOT NULL,
     severity INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     notified_at INTEGER NOT NULL,
     PRIMARY KEY (device_id, family)
   );`,
  // Fuentes externas que están fallando (para avisar al administrador una sola vez por caída).
  `CREATE TABLE source_status (
     source TEXT PRIMARY KEY,
     failures INTEGER NOT NULL,
     since INTEGER NOT NULL,
     last_error TEXT,
     notified INTEGER NOT NULL DEFAULT 0
   );`,
  // Episodio de lluvia: nivel avisado y desde cuándo está seco (para no repetir el aviso, ver rain/episode.ts).
  // Solo si faltan: en un servidor la 0.41.0 llegó a agregar dry_since con las migraciones en otro orden.
  (db: Db) => addColumnIfMissing(db, 'rain_places', 'rain_level', 'INTEGER NOT NULL DEFAULT 0'),
  (db: Db) => addColumnIfMissing(db, 'rain_places', 'dry_since', 'INTEGER'),
  // Y las dos de nuevo, por si una base quedó en la versión 10 con solo dry_since (despliegue fallido de la 0.41.0).
  (db: Db) => {
    addColumnIfMissing(db, 'rain_places', 'rain_level', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'rain_places', 'dry_since', 'INTEGER');
  },
  // Salidas de Entrenamiento compartidas con un enlace público (routes/sharedOutings.ts).
  `CREATE TABLE IF NOT EXISTS shared_outings (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );`,
  // Seguimiento en vivo para la familia (routes/liveSessions.ts): se borra al terminar o al vencer.
  `CREATE TABLE IF NOT EXISTS live_sessions (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
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

function addColumnIfMissing(db: Db, table: string, column: string, type: string): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
}

function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      const m = MIGRATIONS[v]!;
      if (typeof m === 'string') db.exec(m);
      else m(db);
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
