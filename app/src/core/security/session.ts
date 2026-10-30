/**
 * Clave de datos (DEK) en memoria mientras la app está desbloqueada.
 * Nunca se persiste en claro; bloquear la descarta.
 */

let dek: CryptoKey | null = null;
const listeners = new Set<() => void>();

export class LockedError extends Error {
  constructor() {
    super('vault-locked');
    this.name = 'LockedError';
  }
}

export function getDek(): CryptoKey {
  if (!dek) throw new LockedError();
  return dek;
}

export function isUnlocked(): boolean {
  return dek !== null;
}

export function setDek(key: CryptoKey | null): void {
  dek = key;
  listeners.forEach((l) => l());
}

export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
