import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ageOn } from '@/modules/firstAid/medicalStore';
import { UserDb } from './db';

describe('migraciones', () => {
  it('una base v2 (v0.3) pasa a v3 conservando los datos y suma las fichas médicas', async () => {
    const name = 'upgrade-v2-v3';
    const tables = ['categories', 'locations', 'items', 'lots', 'stockMins', 'documents', 'attachments', 'waypoints', 'householdMembers', 'recommendationRules'];
    const old = new Dexie(name);
    old.version(1).stores({ meta: 'key', settings: 'key', blobs: 'id', alertIndex: 'lotId, dueDate', ...Object.fromEntries(tables.map((t) => [t, 'id, updatedAt'])) });
    old.version(2).stores({ alertIndex: 'lotId, notifyFrom' });
    await old.open();
    await old.table('items').put({ id: 'a', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    old.close();

    const upgraded = new UserDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(3);
    expect(await upgraded.items.count()).toBe(1);
    await upgraded.medicalProfiles.put({ id: 'p', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    expect(await upgraded.medicalProfiles.count()).toBe(1);
    upgraded.close();
  });
});

describe('ageOn', () => {
  it('cuenta años cumplidos', () => {
    expect(ageOn('2000-10-31', '2026-10-30')).toBe(25);
    expect(ageOn('2000-10-30', '2026-10-30')).toBe(26);
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
  });
});
