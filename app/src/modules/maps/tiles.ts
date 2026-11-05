import { archiveContains, fetchTile, type MapSourceMode, type ServerMaps, type TileKind } from './sources';
import { importedTile } from './imported';

/**
 * Mapas offline (ARQUITECTURA §12): fuentes, cuentas de teselas y descarga
 * por zona.
 *
 * Cada tesela se pide primero al servidor VikArg propio y, si no la tiene o
 * no responde, a las fuentes públicas (ver sources.ts). Fuentes públicas:
 * - Mapa vectorial: OpenFreeMap (OpenStreetMap, esquema OpenMapTiles), sin
 *   clave. Sus condiciones permiten descargas offline de hasta 3.000 teselas
 *   o 50 MB por zona, con 4 pedidos en paralelo como máximo.
 * - Elevación: Terrain Tiles de AWS (Open Data, formato Terrarium), para el
 *   relieve y las curvas de nivel, que se calculan en el dispositivo.
 * - Letras de las etiquetas: las de OpenFreeMap (Noto Sans, licencia OFL).
 *
 * Todo se guarda en Cache Storage (`vikarg-maps`). Las teselas vectoriales se
 * guardan con una clave propia sin la versión del mapa (OpenFreeMap cambia la
 * URL cada semana); la elevación, con su URL real, que no cambia.
 */

export const MAP_CACHE = 'vikarg-maps';
export const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
/** Clave local de cada tesela vectorial, independiente de la versión del mapa. */
export const LOCAL_TILE = 'https://vikarg.local/tiles/{z}/{x}/{y}.pbf';
export const ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap · Elevación: Terrain Tiles (AWS)';

/** OpenMapTiles llega hasta el zoom 14; más cerca, MapLibre amplía esas teselas. */
export const VECTOR_MAX_ZOOM = 14;
/** Con zoom 12 (~30 m por píxel) alcanza para relieve y curvas de nivel útiles. */
export const DEM_MAX_ZOOM = 12;
/** Límite de OpenFreeMap por descarga. */
export const MAX_VECTOR_TILES = 3_000;
export const MAX_VECTOR_BYTES = 50 * 1024 * 1024;
export const PARALLEL = 4;
/** Fuentes y rangos de caracteres que usa el estilo (latín y acentos). */
export const FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
export const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

export const fill = (template: string, z: number, x: number, y: number) =>
  template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Rectángulo que contiene el círculo de `radiusKm` alrededor del centro. */
export function circleBounds(lat: number, lon: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { west: lon - dLon, east: lon + dLon, south: lat - dLat, north: lat + dLat };
}

export function tileRanges(bounds: ReturnType<typeof circleBounds>, minZoom: number, maxZoom: number): TileRange[] {
  const out: TileRange[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const max = 2 ** z - 1;
    out.push({
      z,
      minX: Math.max(0, lonToX(bounds.west, z)),
      maxX: Math.min(max, lonToX(bounds.east, z)),
      minY: Math.max(0, latToY(bounds.north, z)),
      maxY: Math.min(max, latToY(bounds.south, z)),
    });
  }
  return out;
}

export const countTiles = (ranges: TileRange[]) => ranges.reduce((n, r) => n + (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1), 0);

export function* eachTile(ranges: TileRange[]): Generator<{ z: number; x: number; y: number }> {
  for (const r of ranges) for (let x = r.minX; x <= r.maxX; x++) for (let y = r.minY; y <= r.maxY; y++) yield { z: r.z, x, y };
}

/** Detalle elegible: hasta qué zoom se bajan las teselas vectoriales. */
export const DETAILS = [
  { id: 'trails', maxZoom: 14 },
  { id: 'towns', maxZoom: 12 },
  { id: 'overview', maxZoom: 10 },
] as const;
export type DetailId = (typeof DETAILS)[number]['id'];

export interface ZonePlan {
  bounds: ReturnType<typeof circleBounds>;
  maxZoom: number;
  vector: TileRange[];
  dem: TileRange[];
  vectorTiles: number;
  demTiles: number;
  /** Estimación: el tamaño real depende de cuánto hay dibujado en la zona. */
  bytes: number;
  vectorBytes: number;
  /** Dentro del límite de OpenFreeMap (las fuentes públicas). */
  withinLimits: boolean;
}

/** Tamaños promedio medidos: rural y pueblos (las ciudades densas pesan más). */
const AVG_VECTOR_BYTES = (z: number) => (z >= 13 ? 22_000 : z >= 10 ? 35_000 : 60_000);
const AVG_DEM_BYTES = 70_000;

export function planZone(lat: number, lon: number, radiusKm: number, maxZoom: number): ZonePlan {
  const bounds = circleBounds(lat, lon, radiusKm);
  const vector = tileRanges(bounds, 0, maxZoom);
  const dem = tileRanges(bounds, 0, Math.min(maxZoom, DEM_MAX_ZOOM));
  const vectorTiles = countTiles(vector);
  const demTiles = countTiles(dem);
  const vectorBytes = vector.reduce((n, r) => n + (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1) * AVG_VECTOR_BYTES(r.z), 0);
  const bytes = vectorBytes + demTiles * AVG_DEM_BYTES;
  return { bounds, maxZoom, vector, dem, vectorTiles, demTiles, bytes, vectorBytes, withinLimits: vectorTiles <= MAX_VECTOR_TILES && vectorBytes <= MAX_VECTOR_BYTES };
}

/** URL vigente de las teselas de OpenFreeMap (cambia con cada versión semanal del mapa). */
let templatePromise: Promise<string> | null = null;
export function vectorTemplate(): Promise<string> {
  templatePromise ??= fetch(OPENFREEMAP_TILEJSON)
    .then((r) => {
      if (!r.ok) throw new Error('tilejson');
      return r.json() as Promise<{ tiles: string[] }>;
    })
    .then((j) => j.tiles[0]!)
    .catch((e: unknown) => {
      templatePromise = null;
      throw e;
    });
  return templatePromise;
}

/** De dónde se bajaría una zona y si se puede. */
export type ZoneSource =
  | { ok: true; from: 'server' | 'public'; vectorPublic: boolean }
  | { ok: false; reason: 'tooBig' | 'tooBigServer' | 'outsideServer' | 'noServer' };

/**
 * El servidor propio no tiene el límite de OpenFreeMap: si cubre la zona
 * entera, se baja de ahí (con su propio límite). Si la zona entra en el
 * límite público, en modo automático las teselas que el servidor no pueda
 * dar salen de las fuentes públicas; si es más grande, solo del servidor.
 */
export function zoneSource(plan: ZonePlan, maps: ServerMaps | null, mode: MapSourceMode): ZoneSource {
  const covered = mode !== 'public' && archiveContains(maps?.vector, plan.bounds, plan.maxZoom);
  if (covered && maps) {
    if (plan.vectorTiles + plan.demTiles <= maps.maxZoneTiles && plan.bytes <= maps.maxZoneMb * 1024 * 1024) return { ok: true, from: 'server', vectorPublic: mode === 'auto' && plan.withinLimits };
    if (mode === 'server' || !plan.withinLimits) return { ok: false, reason: 'tooBigServer' };
  }
  if (mode === 'server') return { ok: false, reason: maps?.vector ? 'outsideServer' : 'noServer' };
  return plan.withinLimits ? { ok: true, from: 'public', vectorPublic: true } : { ok: false, reason: 'tooBig' };
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
  failed: number;
}

/**
 * Baja las teselas de la zona que todavía no estén guardadas, de a 4 en
 * paralelo. Devuelve las claves de caché de la zona (para poder borrarla).
 * Con `vectorPublic: false` las teselas del mapa salen solo del servidor
 * propio (zona más grande que el límite de OpenFreeMap).
 */
export async function downloadZone(
  plan: ZonePlan,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
  opts: { vectorPublic: boolean } = { vectorPublic: true },
): Promise<{ keys: string[]; bytes: number; failed: number }> {
  const cache = await caches.open(MAP_CACHE);
  type Job = { key: string; load: () => Promise<{ data: ArrayBuffer | null; type: string }> };
  const jobs: Job[] = [];
  const tile = (kind: TileKind, z: number, x: number, y: number, allowPublic: boolean) => async () => {
    const r = await fetchTile(kind, z, x, y, { allowPublic, signal });
    return { data: r.data, type: kind === 'vector' ? 'application/x-protobuf' : 'image/png' };
  };
  for (const t of eachTile(plan.vector)) jobs.push({ key: fill(LOCAL_TILE, t.z, t.x, t.y), load: tile('vector', t.z, t.x, t.y, opts.vectorPublic) });
  for (const t of eachTile(plan.dem)) jobs.push({ key: fill(DEM_URL, t.z, t.x, t.y), load: tile('dem', t.z, t.x, t.y, true) });
  for (const font of FONTS) {
    for (const range of GLYPH_RANGES) {
      const url = GLYPHS_URL.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range);
      jobs.push({
        key: url,
        load: async () => {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(String(res.status));
          return { data: await res.arrayBuffer(), type: 'application/x-protobuf' };
        },
      });
    }
  }

  const progress: DownloadProgress = { done: 0, total: jobs.length, bytes: 0, failed: 0 };
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      if (signal.aborted) return;
      const job = jobs[next++]!;
      try {
        const hit = await cache.match(job.key);
        if (hit) {
          progress.bytes += Number(hit.headers.get('content-length') ?? 0);
        } else {
          // Sin datos en ese lugar (mar, fuera del mapa): igual cuenta como bajada.
          const { data, type } = await job.load();
          const body = data ?? new ArrayBuffer(0);
          progress.bytes += body.byteLength;
          await cache.put(job.key, new Response(body, { headers: { 'content-type': type, 'content-length': String(body.byteLength) } }));
        }
      } catch {
        if (signal.aborted) return;
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return { keys: jobs.map((j) => j.key), bytes: progress.bytes, failed: progress.failed };
}

/** Borra las teselas de una zona que no use ninguna otra. */
export async function removeZoneTiles(keys: string[], keepKeys: Set<string>): Promise<void> {
  const cache = await caches.open(MAP_CACHE);
  await Promise.all(keys.filter((k) => !keepKeys.has(k)).map((k) => cache.delete(k)));
}

/** Busca en lo descargado y, si no está y hay conexión, lo baja (sin guardarlo). null: no hay datos o no se pudo. */
export async function cachedOr(key: string, load: () => Promise<ArrayBuffer | null>): Promise<ArrayBuffer | null> {
  const hit = await (await caches.open(MAP_CACHE)).match(key);
  if (hit) return hit.arrayBuffer();
  if (!navigator.onLine) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}

/** Una tesela fuera de lo descargado, según la fuente elegida (servidor propio o públicas). */
export const networkTile = (kind: TileKind, z: number, x: number, y: number) => async () => (await fetchTile(kind, z, x, y)).data;

/**
 * Una tesela para el mapa, en orden: los mapas importados (.pmtiles), lo
 * descargado por zonas y, con conexión, el servidor propio o las públicas.
 */
export async function mapTile(kind: TileKind, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const local = await importedTile(kind, z, x, y).catch(() => undefined);
  if (local !== undefined) return local;
  return cachedOr(fill(kind === 'vector' ? LOCAL_TILE : DEM_URL, z, x, y), networkTile(kind, z, x, y));
}

/** Lo que no son teselas (letras): directo de su URL. */
export const networkUrl = (url: string) => async () => {
  const res = await fetch(url);
  return res.status === 204 || !res.ok ? null : res.arrayBuffer();
};
