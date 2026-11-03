import type { TrackPoint } from './gpx';

/**
 * Puntos grabados con la app bloqueada. Sin la contraseña no está la clave de
 * la bóveda, así que cada grabación tiene su propio par de claves: la privada
 * se guarda dentro del track (cifrada con la bóveda) y la pública solo sirve
 * para cifrar. Bloqueada, cada punto se cifra con la pública y queda en el
 * dispositivo: nadie puede leerlo sin desbloquear, y si el sistema cierra la
 * app no se pierde. Al desbloquear se descifra con la privada y se suma.
 */

const STORE = 'vikarg.recLocked';
const ALG = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;

interface Stored {
  id: string;
  items: string[];
}

/** Clave privada nueva para una grabación (va dentro del track). */
export async function newRecKey(): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  return crypto.subtle.exportKey('jwk', pair.privateKey);
}

/** La pública sale de la privada (módulo y exponente). */
function publicOf(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', ext: true }, ALG, false, ['encrypt']);
}

function read(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null') as Stored | null;
  } catch {
    return null;
  }
}

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// En orden: cada punto espera al anterior.
let chain: Promise<unknown> = Promise.resolve();
let pub: { jwk: JsonWebKey; key: Promise<CryptoKey> } | null = null;

/** Prepara la pública antes de bloquear, para cifrar sin demora. */
export function prepareLocked(jwk: JsonWebKey) {
  if (pub?.jwk !== jwk) pub = { jwk, key: publicOf(jwk) };
}

/** Guarda cifrado un punto grabado con la app bloqueada. */
export function addLocked(trackId: string, jwk: JsonWebKey, p: TrackPoint) {
  prepareLocked(jwk);
  const key = pub!.key;
  chain = chain
    .then(async () => {
      const data = await crypto.subtle.encrypt(ALG, await key, new TextEncoder().encode(JSON.stringify(p)));
      const stored = read();
      const items = stored?.id === trackId ? stored.items : [];
      items.push(toB64(data));
      localStorage.setItem(STORE, JSON.stringify({ id: trackId, items } satisfies Stored));
    })
    .catch(() => undefined);
}

/** Los puntos grabados bloqueada de ese track, ya descifrados (los que no se puedan leer se saltean). */
export async function readLocked(trackId: string, jwk: JsonWebKey | undefined): Promise<TrackPoint[]> {
  await chain;
  const stored = read();
  if (!jwk || stored?.id !== trackId) return [];
  const key = await crypto.subtle.importKey('jwk', jwk, ALG, false, ['decrypt']);
  const out: TrackPoint[] = [];
  for (const item of stored.items) {
    try {
      out.push(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt(ALG, key, fromB64(item)))) as TrackPoint);
    } catch {
      // Un punto dañado no impide recuperar el resto.
    }
  }
  return out;
}

export async function clearLocked() {
  await chain;
  localStorage.removeItem(STORE);
}
