/**
 * Cifrado de datos del usuario (ver docs/ARQUITECTURA.md §7).
 *
 * Esquema de sobre: una DEK aleatoria (AES-256-GCM) cifra los datos; cada
 * secreto del usuario (contraseña, clave de recuperación) deriva una KEK con
 * PBKDF2 que "envuelve" a la DEK. Cambiar la contraseña solo re-envuelve la DEK.
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

export interface WrappedKey {
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
  wrapped: Sealed;
}

const subtle = () => globalThis.crypto.subtle;

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function generateDek(): Promise<CryptoKey> {
  // Extraíble solo para poder envolverla; nunca se persiste sin envolver.
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function wrapDek(dek: CryptoKey, secret: string, iterations = PBKDF2_ITERATIONS): Promise<WrappedKey> {
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveKek(secret, salt, iterations);
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { salt, iterations, wrapped: { iv, ct } };
}

/** Lanza `WrongSecretError` si el secreto no corresponde. */
export async function unwrapDek(w: WrappedKey, secret: string): Promise<CryptoKey> {
  const kek = await deriveKek(secret, w.salt, w.iterations);
  try {
    return await subtle().unwrapKey(
      'raw',
      w.wrapped.ct,
      kek,
      { name: 'AES-GCM', iv: w.wrapped.iv },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new WrongSecretError();
  }
}

export class WrongSecretError extends Error {
  constructor() {
    super('wrong-secret');
    this.name = 'WrongSecretError';
  }
}

export async function seal(dek: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, dek, data);
  return { iv, ct };
}

export async function open(dek: CryptoKey, s: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: s.iv }, dek, s.ct));
}

export async function sealJson(dek: CryptoKey, value: unknown): Promise<Sealed> {
  return seal(dek, new TextEncoder().encode(JSON.stringify(value)));
}

export async function openJson<T>(dek: CryptoKey, s: Sealed): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await open(dek, s))) as T;
}

// Base32 sin caracteres ambiguos (0/O, 1/I/L) para que se pueda anotar a mano.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_GROUPS = 6;
const RECOVERY_GROUP_LEN = 4;

/** Clave de recuperación: 24 caracteres (~118 bits), en grupos de 4. */
export function generateRecoveryKey(): string {
  const chars = Array.from(randomBytes(RECOVERY_GROUPS * RECOVERY_GROUP_LEN), (b) => {
    // Rechazo de sesgo: 248 es el mayor múltiplo de 31 menor a 256.
    let v = b;
    while (v >= 248) v = randomBytes(1)[0]!;
    return RECOVERY_ALPHABET[v % RECOVERY_ALPHABET.length];
  });
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    groups.push(chars.slice(i * RECOVERY_GROUP_LEN, (i + 1) * RECOVERY_GROUP_LEN).join(''));
  }
  return groups.join('-');
}

/** Normaliza lo que tipea el usuario: mayúsculas, sin espacios ni guiones. */
export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
