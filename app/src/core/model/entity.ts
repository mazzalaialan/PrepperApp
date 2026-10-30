import { v7 as uuidv7 } from 'uuid';
import type { BaseEntity } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Crea una entidad nueva con los campos comunes completos. */
export function newEntity<T extends BaseEntity>(fields: Omit<T, keyof BaseEntity>): T {
  const now = nowIso();
  return { ...fields, id: uuidv7(), createdAt: now, updatedAt: now, deletedAt: null } as T;
}

/** Devuelve una copia con los cambios aplicados y `updatedAt` actualizado. */
export function touch<T extends BaseEntity>(entity: T, changes: Partial<Omit<T, keyof BaseEntity>> = {}): T {
  return { ...entity, ...changes, updatedAt: nowIso() };
}
