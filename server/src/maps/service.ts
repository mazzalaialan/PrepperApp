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
  const open = new Map<MapKind, { reader: PmtilesReader; mtimeMs: number }>();

  async function reader(kind: MapKind): Promise<{ reader: PmtilesReader; mtimeMs: number } | null> {
    if (!dir) return null;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(join(dir, MAP_FILES[kind])).mtimeMs;
    } catch {
      return null;
    }
    const current = open.get(kind);
    if (current && current.mtimeMs === mtimeMs) return current;
    if (current) {
      open.delete(kind);
      void current.reader.close().catch(() => undefined);
    }
    const next = { reader: await PmtilesReader.open(join(dir, MAP_FILES[kind])), mtimeMs };
    open.set(kind, next);
    return next;
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
      await Promise.all([...open.values()].map((o) => o.reader.close()));
      open.clear();
    },
  };
}
