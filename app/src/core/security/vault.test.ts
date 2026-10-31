import { beforeEach, describe, expect, it } from 'vitest';
import { WrongSecretError } from '@/core/crypto/crypto';
import { db, setTestDb } from '@/core/db/db';
import { blobStore, repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { LockedError, isUnlocked } from './session';
import {
  WeakPasswordError,
  changePassword,
  initializeVault,
  isVaultInitialized,
  lockVault,
  setTestIterations,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from './vault';

setTestIterations(1_000);

const waypoint = () =>
  newEntity<Waypoint>({ name: 'Refugio Sierra', lat: -41.1, lon: -71.3, alt: 900, icon: 'cabin', notes: '', rainAlerts: false });

describe('vault', () => {
  beforeEach(() => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
  });

  it('se inicializa, queda desbloqueada y devuelve clave de recuperación', async () => {
    expect(await isVaultInitialized()).toBe(false);
    const recovery = await initializeVault('una-contraseña');
    expect(recovery).toMatch(/^[A-Z2-9-]{29}$/);
    expect(await isVaultInitialized()).toBe(true);
    expect(isUnlocked()).toBe(true);
  });

  it('rechaza contraseñas cortas', async () => {
    await expect(initializeVault('corta')).rejects.toBeInstanceOf(WeakPasswordError);
  });

  it('guarda las entidades cifradas, sin texto en claro', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    const raw = await db.waypoints.get(wp.id);
    expect(raw?.id).toBe(wp.id);
    expect(JSON.stringify(raw)).not.toContain('Refugio');
    expect(await repos.waypoints.get(wp.id)).toEqual(wp);
  });

  it('bloqueada no permite leer datos', async () => {
    await initializeVault('una-contraseña');
    await repos.waypoints.put(waypoint());
    lockVault();
    await expect(repos.waypoints.loadAll()).rejects.toBeInstanceOf(LockedError);
  });

  it('desbloquea con contraseña y rechaza una incorrecta', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    lockVault();
    await expect(unlockWithPassword('otra-contraseña')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('una-contraseña');
    expect(await repos.waypoints.loadAll()).toEqual([wp]);
  });

  it('recupera con la clave de recuperación (tipeada sin guiones) y permite cambiar la contraseña', async () => {
    const recovery = await initializeVault('olvidada-123');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    lockVault();
    await unlockWithRecoveryKey(recovery.toLowerCase().replaceAll('-', ' '));
    await changePassword('nueva-contraseña');
    lockVault();
    await expect(unlockWithPassword('olvidada-123')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('nueva-contraseña');
    expect(await repos.waypoints.get(wp.id)).toEqual(wp);
  });

  it('el borrado es lógico', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    await repos.waypoints.remove(wp.id);
    expect(await repos.waypoints.loadAll()).toEqual([]);
    const all = await repos.waypoints.loadAll({ includeDeleted: true });
    expect(all[0]?.deletedAt).not.toBeNull();
  });

  it('cifra y recupera binarios', async () => {
    await initializeVault('una-contraseña');
    const bytes = new Uint8Array([1, 2, 3, 250]);
    await blobStore.put('foto-1', bytes);
    expect(await blobStore.get('foto-1')).toEqual(bytes);
  });
});
