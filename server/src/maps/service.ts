import { statSync } from 'node:fs';
import { join } from 'node:path';
import { PmtilesReader } from './pmtiles.ts';

/**
 * Mapas del servidor propio (ARQUITECTURA §12.2): un PMTiles con el mapa
 * vectorial (esquema OpenMapTiles, el mismo de OpenFreeMap) y otro con la
 * elevación (Terrarium, el mismo de Terrain Tiles de AWS), en MAPS_DIR.
 * Cualquiera de los dos puede faltar: la app usa las fuentes públicas para
 * lo que el servidor no tenga.
 *
 * Si se reemplaza un archivo (versión nueva del mapa), se abre de nuevo solo.
 */

export type MapKind = 'vector' | 'elevation';
export const MAP_FILES: Record<MapKind, string> = { vector: 'vector.pmtiles', elevation: 'elevation.pmtiles' };

export interface ArchiveSummary {
  minZoom: number;
  maxZoom: number;
  /** [oeste, sur, este, norte] */
  bounds: [number, number, number, number];
  /** Fecha del archivo: la app la muestra como versión del mapa. */
  updatedAt: string;
}

export interface MapsService {
  summary(kind: MapKind): Promise<ArchiveSummary | null>;
  tile(kind: MapKind, z: number, x: number, y: number): Promise<{ data: Buffer; encoding: 'gzip' | null } | null>;
  close(): Promise<void>;
}

export function createMapsService(dir: string | null): MapsService {
  type Open = { reader: PmtilesReader; mtimeMs: number };
  // Se guarda la promesa de apertura: si llegan muchas peticiones juntas
  // (la app pide decenas de teselas a la vez), todas comparten la misma
  // apertura en lugar de abrir el archivo varias veces y dejar handles sueltos.
  const open = new Map<MapKind, { mtimeMs: number; ready: Promise<Open> }>();

  async function reader(kind: MapKind): Promise<Open | null> {
    if (!dir) return null;
    const path = join(dir, MAP_FILES[kind]);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      return null;
    }
    const current = open.get(kind);
    if (current && current.mtimeMs === mtimeMs) return current.ready;
    if (current) {
      open.delete(kind);
      void current.ready.then((o) => o.reader.close()).catch(() => undefined);
    }
    const entry = { mtimeMs, ready: PmtilesReader.open(path).then((reader) => ({ reader, mtimeMs })) };
    open.set(kind, entry);
    entry.ready.catch(() => {
      if (open.get(kind) === entry) open.delete(kind);
    });
    return entry.ready;
  }

  return {
    async summary(kind) {
      const r = await reader(kind).catch(() => null);
      if (!r) return null;
      const h = r.reader.header;
      return { minZoom: h.minZoom, maxZoom: h.maxZoom, bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat], updatedAt: new Date(r.mtimeMs).toISOString() };
    },
    async tile(kind, z, x, y) {
      const r = await reader(kind);
      return r ? r.reader.tile(z, x, y) : null;
    },
    async close() {
      const all = [...open.values()];
      open.clear();
      await Promise.all(all.map((o) => o.ready.then((r) => r.reader.close()).catch(() => undefined)));
    },
  };
}
