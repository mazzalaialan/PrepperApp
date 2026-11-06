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
});
