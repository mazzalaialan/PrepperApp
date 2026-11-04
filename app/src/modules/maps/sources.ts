import { DEM_URL, fill, vectorTemplate } from './tiles';

/**
 * De dónde se bajan las teselas de los mapas offline (ARQUITECTURA §12.2).
 *
 * - `auto` (por defecto): primero el servidor VikArg propio, si tiene mapas
 *   para ese lugar; si no responde, está sobrecargado (503) o no tiene esa
 *   tesela, las fuentes públicas (OpenFreeMap y Terrain Tiles de AWS).
 * - `server`: solo el servidor propio.
 * - `public`: solo las fuentes públicas, como antes del servidor.
 *
 * Si el servidor falla, se lo deja de lado un rato (lo que diga su
 * Retry-After, o 5 minutos) para no seguir esperándolo en cada tesela.
 *
 * Sin dependencias de la interfaz: lo usa también el service worker
 * (curvas de nivel), que le pasa su propia forma de leer la configuración.
 */

export type MapSourceMode = 'auto' | 'server' | 'public';
export type TileKind = 'vector' | 'dem';

export interface ServerArchive {
  minZoom: number;
  maxZoom: number;
  /** [oeste, sur, este, norte] */
  bounds: [number, number, number, number];
  updatedAt: string;
}

export interface ServerMaps {
  vector: ServerArchive | null;
  elevation: ServerArchive | null;
  maxZoneTiles: number;
  maxZoneMb: number;
}

export interface MapSourceConfig {
  serverUrl: string;
  mode: MapSourceMode;
}

let getConfig: () => MapSourceConfig | Promise<MapSourceConfig> = () => ({ serverUrl: '', mode: 'public' });
export function setMapSourceConfig(fn: typeof getConfig) {
  getConfig = fn;
}

const INFO_TTL_MS = 10 * 60_000;
const INFO_FAIL_TTL_MS = 2 * 60_000;
const DOWN_MS = 5 * 60_000;
const SERVER_TIMEOUT_MS = 10_000;

let info: { url: string; at: number; ok: boolean; value: Promise<ServerMaps | null> } | null = null;
let downUntil = 0;

const base = (url: string) => url.trim().replace(/\/+$/, '');

/** Qué mapas tiene el servidor (se pregunta cada 10 minutos como mucho). null: no tiene, no hay servidor o no responde. */
export function serverMaps(serverUrl: string, now = Date.now()): Promise<ServerMaps | null> {
  const url = base(serverUrl);
  if (!url) return Promise.resolve(null);
  if (info && info.url === url && now - info.at < (info.ok ? INFO_TTL_MS : INFO_FAIL_TTL_MS)) return info.value;
  const entry = { url, at: now, ok: true, value: Promise.resolve<ServerMaps | null>(null) };
  entry.value = fetch(`${url}/api/maps`, { signal: AbortSignal.timeout(SERVER_TIMEOUT_MS) })
    .then((r) => (r.ok ? (r.json() as Promise<ServerMaps>) : null))
    .catch(() => null)
    .then((v) => {
      if (!v) entry.ok = false;
      return v;
    });
  info = entry;
  return entry.value;
}

export function serverIsDown(now = Date.now()) {
  return now < downUntil;
}

function markDown(retryAfter: string | null) {
  const s = Number(retryAfter);
  downUntil = Date.now() + (Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 30 * 60_000) : DOWN_MS);
}

/** Para las pruebas. */
export function resetMapSources() {
  info = null;
  downUntil = 0;
}

const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** Si el archivo del servidor tiene esa tesela (por zoom y por zona). */
export function archiveCovers(a: ServerArchive | null | undefined, z: number, x: number, y: number): boolean {
  if (!a || z < a.minZoom || z > a.maxZoom) return false;
  const [w, s, e, n] = a.bounds;
  return tileLon(x + 1, z) > w && tileLon(x, z) < e && tileLat(y, z) > s && tileLat(y + 1, z) < n;
}

/** Si el archivo cubre una zona entera (para bajarla toda del servidor). */
export function archiveContains(a: ServerArchive | null | undefined, b: { west: number; south: number; east: number; north: number }, maxZoom: number): boolean {
  if (!a || maxZoom > a.maxZoom) return false;
  const [w, s, e, n] = a.bounds;
  return b.west >= w && b.east <= e && b.south >= s && b.north <= n;
}

const archiveOf = (maps: ServerMaps | null, kind: TileKind) => (kind === 'vector' ? maps?.vector : maps?.elevation);

/** Resultado: los datos (null = no hay nada en ese lugar, p. ej. mar) y de dónde salieron. */
export interface TileResult {
  data: ArrayBuffer | null;
  from: 'server' | 'public';
}

/**
 * Baja una tesela según la configuración. `allowPublic: false` la pide solo
 * al servidor (zonas más grandes que lo que permiten las fuentes públicas).
 * Tira un error si no se pudo de ningún lado.
 */
export async function fetchTile(kind: TileKind, z: number, x: number, y: number, opts: { allowPublic?: boolean; signal?: AbortSignal } = {}): Promise<TileResult> {
  const { serverUrl, mode } = await getConfig();
  const allowPublic = (opts.allowPublic ?? true) && mode !== 'server';
  if (mode !== 'public' && base(serverUrl) && !serverIsDown()) {
    const maps = await serverMaps(serverUrl);
    if (archiveCovers(archiveOf(maps, kind), z, x, y)) {
      try {
        const res = await fetch(`${base(serverUrl)}/api/maps/${kind === 'vector' ? 'vector' : 'elevation'}/${z}/${x}/${y}`, {
          signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(SERVER_TIMEOUT_MS)]) : AbortSignal.timeout(SERVER_TIMEOUT_MS),
        });
        if (res.status === 204) return { data: null, from: 'server' };
        if (res.ok) return { data: await res.arrayBuffer(), from: 'server' };
        // Sobrecargado o caído: se deja de lado un rato. 404: ya no tiene ese mapa (se vuelve a preguntar).
        if (res.status === 404) info = null;
        else markDown(res.headers.get('retry-after'));
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        markDown(null);
      }
    }
  }
  if (!allowPublic) throw new Error('servidor de mapas no disponible');
  const url = kind === 'vector' ? fill(await vectorTemplate(), z, x, y) : fill(DEM_URL, z, x, y);
  const res = await fetch(url, opts.signal ? { signal: opts.signal } : {});
  // Fuera de la zona con datos, OpenFreeMap responde 204 (sin contenido).
  if (res.status === 204) return { data: null, from: 'public' };
  if (!res.ok) throw new Error(String(res.status));
  return { data: await res.arrayBuffer(), from: 'public' };
}
