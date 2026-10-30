import {
  PBKDF2_ITERATIONS,
  generateDek,
  generateRecoveryKey,
  normalizeRecoveryKey,
  unwrapDek,
  wrapDek,
  type WrappedKey,
} from '@/core/crypto/crypto';
import { db } from '@/core/db/db';
import { getDek, setDek } from './session';

/** Encabezado criptográfico persistido en `meta` (ver ARQUITECTURA §7.1). */
export interface VaultHeader {
  version: 1;
  password: WrappedKey;
  recovery: WrappedKey;
  createdAt: string;
}

const HEADER_KEY = 'vault';
export const MIN_PASSWORD_LENGTH = 8;

let iterations = PBKDF2_ITERATIONS;

/** Solo para tests: PBKDF2 completo tarda segundos. */
export function setTestIterations(n: number): void {
  iterations = n;
}

async function readHeader(): Promise<VaultHeader | undefined> {
  return (await db.meta.get(HEADER_KEY))?.value as VaultHeader | undefined;
}

export async function isVaultInitialized(): Promise<boolean> {
  return (await readHeader()) !== undefined;
}

export class WeakPasswordError extends Error {
  constructor() {
    super('weak-password');
    this.name = 'WeakPasswordError';
  }
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
}

/**
 * Configura la bóveda por primera vez y la deja desbloqueada.
 * Devuelve la clave de recuperación: se muestra una única vez y no se guarda.
 */
export async function initializeVault(password: string): Promise<string> {
  assertPassword(password);
  if (await isVaultInitialized()) throw new Error('vault-already-initialized');
  const dek = await generateDek();
  const recoveryKey = generateRecoveryKey();
  const header: VaultHeader = {
    version: 1,
    password: await wrapDek(dek, password, iterations),
    recovery: await wrapDek(dek, normalizeRecoveryKey(recoveryKey), iterations),
    createdAt: new Date().toISOString(),
  };
  await db.meta.put({ key: HEADER_KEY, value: header });
  setDek(dek);
  return recoveryKey;
}

async function requireHeader(): Promise<VaultHeader> {
  const header = await readHeader();
  if (!header) throw new Error('vault-not-initialized');
  return header;
}

/** Lanza `WrongSecretError` si la contraseña no es correcta. */
export async function unlockWithPassword(password: string): Promise<void> {
  const header = await requireHeader();
  setDek(await unwrapDek(header.password, password));
}

/**
 * Desbloquea con la clave de recuperación. Quien la usa olvidó la contraseña,
 * así que la UI debe pedir una nueva a continuación (`changePassword`).
 */
export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  const header = await requireHeader();
  setDek(await unwrapDek(header.recovery, normalizeRecoveryKey(recoveryKey)));
}

/** Re-envuelve la DEK con la nueva contraseña; los datos no se re-cifran. */
export async function changePassword(newPassword: string): Promise<void> {
  assertPassword(newPassword);
  const header = await requireHeader();
  const updated: VaultHeader = { ...header, password: await wrapDek(getDek(), newPassword, iterations) };
  await db.meta.put({ key: HEADER_KEY, value: updated });
}

export function lockVault(): void {
  setDek(null);
}
