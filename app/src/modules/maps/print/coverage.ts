import type { LatLon } from '@/core/geo/geo';
import { importedTile } from '../imported';
import { DEM_MAX_ZOOM, DEM_URL, fill, LOCAL_TILE, MAP_CACHE, tileRanges, VECTOR_MAX_ZOOM, eachTile } from '../tiles';

/** Rectángulo del terreno que cubre el marco del mapa (con un margen por el giro de la cuadrícula). */
export function sheetBounds(center: LatLon, scale: number, frameMm: { w: number; h: number }, pad = 1.06) {
  const halfW = ((frameMm.w * scale) / 1000 / 2) * pad;
  const halfH = ((frameMm.h * scale) / 1000 / 2) * pad;
  const dLat = halfH / 111_320;
  const dLon = halfW / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return { west: center.lon - dLon, east: center.lon + dLon, south: center.lat - dLat, north: center.lat + dLat };
}

/** Zoom de las teselas de mapa y de relieve que se piden para dibujar a un zoom del mapa. */
export function tileZooms(mapZoom: number): { vector: number; dem: number } {
  return { vector: Math.min(VECTOR_MAX_ZOOM, Math.max(0, Math.floor(mapZoom))), dem: Math.min(DEM_MAX_ZOOM, Math.max(0, Math.floor(mapZoom) + 1)) };
}

export interface Coverage {
  vector: { have: number; total: number };
  dem: { have: number; total: number };
}

/**
 * Cuántas de las teselas que hacen falta para la hoja ya están en el dispositivo (mapas importados o zonas descargadas).
 * No cuenta lo que se podría bajar con conexión: solo lo que sirve sin ella.
 */
export async function mapCoverage(bounds: ReturnType<typeof sheetBounds>, mapZoom: number): Promise<Coverage> {
  const z = tileZooms(mapZoom);
  const cache = await caches.open(MAP_CACHE);
  const count = async (kind: 'vector' | 'dem', zoom: number) => {
    const tiles = [...eachTile(tileRanges(bounds, zoom, zoom))];
    const hits = await Promise.all(
      tiles.map(async (t) => {
        const imported = await importedTile(kind, t.z, t.x, t.y).catch(() => undefined);
        if (imported !== undefined) return true;
        return !!(await cache.match(fill(kind === 'vector' ? LOCAL_TILE : DEM_URL, t.z, t.x, t.y)));
      }),
    );
    return { have: hits.filter(Boolean).length, total: tiles.length };
  };
  const [vector, dem] = await Promise.all([count('vector', z.vector), count('dem', z.dem)]);
  return { vector, dem };
}
