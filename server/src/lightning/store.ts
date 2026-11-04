import type { Flash } from './glm.ts';

/**
 * Los últimos rayos de la región, para el mapa de la app: se reemplazan en
 * cada pasada (los viejos se borran). El servidor solo baja archivos del
 * satélite si hay lugares con aviso o si alguien miró el mapa hace poco.
 */
export interface LightningStore {
  updatedAt: number | null;
  flashes: Flash[];
  /** Última vez que la app pidió los rayos. */
  requestedAt: number;
}

export const createLightningStore = (): LightningStore => ({ updatedAt: null, flashes: [], requestedAt: 0 });

/** Mientras alguien mire el mapa (lo pide cada 20 s), se siguen bajando rayos. */
export const MAP_ACTIVE_MS = 5 * 60_000;

export function mapActive(store: LightningStore, now = Date.now()): boolean {
  return now - store.requestedAt < MAP_ACTIVE_MS;
}
