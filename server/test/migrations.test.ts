import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';

describe('migraciones', () => {
  it('una base que quedó a medias (versión 10 con dry_since pero sin rain_level, despliegue fallido de la 0.41.0) se completa', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    try {
      const db = openDb(dir);
      db.exec('ALTER TABLE rain_places DROP COLUMN rain_level; PRAGMA user_version = 10;');
      db.close();
      const again = openDb(dir);
      const cols = (again.prepare('PRAGMA table_info(rain_places)').all() as { name: string }[]).map((c) => c.name);
      assert.ok(cols.includes('rain_level') && cols.includes('dry_since'));
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('una base de la versión anterior (sin salidas con hora límite) suma la tabla sin tocar lo demás', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    try {
      const db = openDb(dir);
      const latest = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      db.prepare("INSERT INTO settings (key, value) VALUES ('antes', 'sigue')").run();
      db.exec(`DROP TABLE outing_deadlines; PRAGMA user_version = ${latest - 1};`);
      db.close();
      const again = openDb(dir);
      assert.ok(again.prepare("SELECT name FROM sqlite_master WHERE name = 'outing_deadlines'").get());
      assert.equal((again.prepare("SELECT value FROM settings WHERE key = 'antes'").get() as { value: string }).value, 'sigue');
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
