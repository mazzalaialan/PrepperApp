import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { normalizeRecoveryKey, unwrapDek, type Sealed, type WrappedKey } from '@/core/crypto/crypto';
import { ENTITY_TABLES, db, type EncryptedRow } from '@/core/db/db';
import type { EntityTable } from '@/core/model/types';
import { setDek } from '@/core/security/session';
import { VAULT_HEADER_KEY, readHeader, type VaultHeader } from '@/core/security/vault';
import type { Settings } from '@/core/settings/settings';

/**
 * Backup `.vikarg` (ARQUITECTURA §8.1). Las filas viajan tal como están en la
 * base, ya cifradas con la DEK, junto con el encabezado que la envuelve: el
 * archivo se abre con la contraseña vigente al exportar o con la clave de
 * recuperación. Restaurar reemplaza todo.
 */

export const BACKUP_FORMAT = 'vikarg-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = '.vikarg';

// ---------- serialización binaria ----------

function toB64(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

interface SealedJson {
  iv: string;
  ct: string;
}

const sealedToJson = (s: Sealed): SealedJson => ({ iv: toB64(s.iv), ct: toB64(s.ct) });
const sealedFromJson = (s: SealedJson): Sealed => ({ iv: fromB64(s.iv), ct: fromB64(s.ct).buffer });

interface WrappedJson {
  salt: string;
  iterations: number;
  wrapped: SealedJson;
}

const wrappedToJson = (w: WrappedKey): WrappedJson => ({ salt: toB64(w.salt), iterations: w.iterations, wrapped: sealedToJson(w.wrapped) });
const wrappedFromJson = (w: WrappedJson): WrappedKey => ({ salt: fromB64(w.salt), iterations: w.iterations, wrapped: sealedFromJson(w.wrapped) });

// ---------- formato ----------

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  dbVersion: number;
  createdAt: string;
  vault: { version: 1; createdAt: string; password: WrappedJson; recovery: WrappedJson };
  /** Ajustes no sensibles (idioma, tema, unidades, URLs). */
  settings: Partial<Settings> | null;
  counts: Partial<Record<EntityTable, number>>;
}

interface RowJson extends SealedJson {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

type DataJson = Partial<Record<EntityTable, RowJson[]>>;

// Blob en el ZIP: IV (12 bytes) seguido del texto cifrado.
const IV_LENGTH = 12;

export interface ParsedBackup {
  manifest: BackupManifest;
  header: VaultHeader;
  data: DataJson;
  blobs: Map<string, Sealed>;
}

export class BackupError extends Error {
  constructor(public readonly code: 'invalid-file' | 'newer-version' | 'no-vault') {
    super(code);
    this.name = 'BackupError';
  }
}

// ---------- exportar ----------

export async function exportBackup(appVersion: string): Promise<Uint8Array<ArrayBuffer>> {
  const header = await readHeader();
  if (!header) throw new BackupError('no-vault');

  const data: DataJson = {};
  const counts: BackupManifest['counts'] = {};
  for (const table of ENTITY_TABLES) {
    // Incluye los borrados lógicos: sin ellos una futura sincronización no sabría qué se eliminó.
    const rows = await db.entityTable(table).toArray();
    data[table] = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, ...sealedToJson(r) }));
    counts[table] = rows.filter((r) => !r.deletedAt).length;
  }

  const files: Record<string, Uint8Array> = {};
  for (const blob of await db.blobs.toArray()) {
    const ct = new Uint8Array(blob.ct);
    const bytes = new Uint8Array(IV_LENGTH + ct.length);
    bytes.set(blob.iv, 0);
    bytes.set(ct, IV_LENGTH);
    files[`blobs/${blob.id}`] = bytes;
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    dbVersion: db.verno,
    createdAt: new Date().toISOString(),
    vault: {
      version: header.version,
      createdAt: header.createdAt,
      password: wrappedToJson(header.password),
      recovery: wrappedToJson(header.recovery),
    },
    settings: ((await db.settings.get('app'))?.value as Partial<Settings> | undefined) ?? null,
    counts,
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['data.json'] = strToU8(JSON.stringify(data));
  // Los datos ya están cifrados (no comprimen): se guardan sin compresión salvo los JSON.
  return zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>;
}

const LAST_BACKUP_KEY = 'lastBackupAt';

export async function markBackupDone(): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: new Date().toISOString() });
}

export async function lastBackupAt(): Promise<string | null> {
  return ((await db.meta.get(LAST_BACKUP_KEY))?.value as string | undefined) ?? null;
}

export function backupFileName(date = new Date()): string {
  return `vikarg-backup-${date.toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
}

// ---------- leer ----------

export function readBackup(bytes: Uint8Array): ParsedBackup {
  let entries: Record<string, Uint8Array>;
  let manifest: BackupManifest;
  try {
    entries = unzipSync(bytes);
    manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as BackupManifest;
  } catch {
    throw new BackupError('invalid-file');
  }
  if (manifest.format !== BACKUP_FORMAT || !entries['data.json']) throw new BackupError('invalid-file');
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION || manifest.dbVersion > db.verno) throw new BackupError('newer-version');

  const blobs = new Map<string, Sealed>();
  for (const [path, content] of Object.entries(entries)) {
    if (!path.startsWith('blobs/')) continue;
    blobs.set(path.slice('blobs/'.length), { iv: content.slice(0, IV_LENGTH), ct: content.slice(IV_LENGTH).buffer });
  }

  return {
    manifest,
    header: {
      version: manifest.vault.version,
      createdAt: manifest.vault.createdAt,
      password: wrappedFromJson(manifest.vault.password),
      recovery: wrappedFromJson(manifest.vault.recovery),
    },
    data: JSON.parse(strFromU8(entries['data.json'])) as DataJson,
    blobs,
  };
}

// ---------- restaurar ----------

export type SecretKind = 'password' | 'recovery';

/** Verifica el secreto contra el backup sin tocar la base. Lanza `WrongSecretError`. */
export async function unlockBackup(backup: ParsedBackup, secret: string, kind: SecretKind): Promise<CryptoKey> {
  return kind === 'password'
    ? unwrapDek(backup.header.password, secret)
    : unwrapDek(backup.header.recovery, normalizeRecoveryKey(secret));
}

/**
 * Reemplaza todos los datos por los del backup y deja la bóveda desbloqueada.
 * Se valida el secreto antes de borrar nada.
 */
export async function restoreBackup(backup: ParsedBackup, secret: string, kind: SecretKind): Promise<void> {
  const dek = await unlockBackup(backup, secret, kind);
  setDek(null);

  const tables = [db.meta, db.blobs, db.alertIndex, ...ENTITY_TABLES.map((t) => db.entityTable(t))];
  await db.transaction('rw', [...tables, db.settings], async () => {
    for (const table of tables) await table.clear();
    await db.meta.put({ key: VAULT_HEADER_KEY, value: backup.header });
    for (const table of ENTITY_TABLES) {
      const rows: EncryptedRow[] = (backup.data[table] ?? []).map((r) => ({
        id: r.id,
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt,
        ...sealedFromJson(r),
      }));
      await db.entityTable(table).bulkPut(rows);
    }
    await db.blobs.bulkPut([...backup.blobs].map(([id, s]) => ({ id, ...s })));
    if (backup.manifest.settings) await db.settings.put({ key: 'app', value: backup.manifest.settings });
  });

  setDek(dek);
}
