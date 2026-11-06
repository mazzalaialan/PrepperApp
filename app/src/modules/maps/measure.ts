import { bearingDeg, distanceMeters, type LatLon } from '@/core/geo/geo';
import { decodeTerrarium, SLOPE_TILE } from './slope';
import { DEM_MAX_ZOOM, mapTile } from './tiles';

/**
 * Herramientas del mapa: medir una distancia o un recorrido (con desnivel, de
 * las teselas de elevación: las de las zonas descargadas o, con conexión, las
 * públicas) y la dirección y distancia a un punto.
 */

/** Alturas de una tesela (z, x, y) o null si no está y no hay conexión. */
export type HeightLoader = (x: number, y: number) => Promise<Float32Array | null>;

const cache = new Map<string, Promise<Float32Array | null>>();
const defaultLoader: HeightLoader = (x, y) => {
  const key = `${x}/${y}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = mapTile('dem', DEM_MAX_ZOOM, x, y)
      .then((png) => (png ? decodeTerrarium(png) : null))
      .catch(() => null);
    hit.then((h) => h ?? cache.delete(key));
    cache.set(key, hit);
    while (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  return hit;
};

/** Píxel (con decimales) de un punto en el mundo a zoom `z`. */
function worldPixel(p: LatLon, z: number, size = SLOPE_TILE) {
  const n = 2 ** z * size;
  const lat = Math.max(-85, Math.min(85, p.lat));
  const x = ((p.lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/** Altura en un punto (bilineal sobre la tesela de 30 m aprox.), o null si no hay datos. */
export async function elevationAt(p: LatLon, load: HeightLoader = defaultLoader): Promise<number | null> {
  const size = SLOPE_TILE;
  const { x, y } = worldPixel(p, DEM_MAX_ZOOM);
  const px = x - 0.5;
  const py = y - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  const at = async (gx: number, gy: number) => {
    const tile = await load(Math.floor(gx / size), Math.floor(gy / size));
    if (!tile) return null;
    return tile[(((gy % size) + size) % size) * size + (((gx % size) + size) % size)]!;
  };
  const [a, b, c, d] = await Promise.all([at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)]);
  if (a == null || b == null || c == null || d == null) return null;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export interface PathSummary {
  /** Metros, sobre el terreno plano (como en el mapa). */
  distance: number;
  /** Tramos: distancia de cada uno. */
  legs: number[];
  /** Desnivel positivo y negativo, en metros (null: sin datos de elevación). */
  ascent: number | null;
  descent: number | null;
  min: number | null;
  max: number | null;
  /** Altura del primer y último punto. */
  start: number | null;
  end: number | null;
  /** Perfil: [distancia acumulada, altura]. */
  profile: [number, number][];
}

export const pathDistance = (pts: LatLon[]) => pts.slice(1).reduce((s, p, i) => s + distanceMeters(pts[i]!, p), 0);

/** Muestras cada ~30 m (la resolución de la elevación), sin pasar de `maxSamples`. */
function samples(pts: LatLon[], step = 30, maxSamples = 1500): { p: LatLon; d: number }[] {
  const total = pathDistance(pts);
  const every = Math.max(step, total / maxSamples);
  const out: { p: LatLon; d: number }[] = [{ p: pts[0]!, d: 0 }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = distanceMeters(a, b);
    const n = Math.max(1, Math.ceil(len / every));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push({ p: { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }, d: acc + len * f });
    }
    acc += len;
  }
  return out;
}

/**
 * Desnivel acumulado con un umbral (histéresis): las pequeñas ondas del modelo
 * de elevación no suman metros que no se suben.
 */
export function climb(heights: number[], threshold = 5): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  let ref = heights[0] ?? 0;
  for (const h of heights.slice(1)) {
    if (h - ref >= threshold) {
      ascent += h - ref;
      ref = h;
    } else if (ref - h >= threshold) {
      descent += ref - h;
      ref = h;
    }
  }
  return { ascent, descent };
}

export async function summarizePath(pts: LatLon[], load: HeightLoader = defaultLoader): Promise<PathSummary> {
  const legs = pts.slice(1).map((p, i) => distanceMeters(pts[i]!, p));
  const distance = legs.reduce((a, b) => a + b, 0);
  const base = { distance, legs, ascent: null, descent: null, min: null, max: null, start: null, end: null, profile: [] };
  if (pts.length < 2) return base;
  const s = samples(pts);
  const hs = await Promise.all(s.map((x) => elevationAt(x.p, load)));
  if (hs.some((h) => h === null)) return base;
  const heights = hs as number[];
  const { ascent, descent } = climb(heights);
  return {
    distance,
    legs,
    ascent,
    descent,
    min: Math.min(...heights),
    max: Math.max(...heights),
    start: heights[0]!,
    end: heights.at(-1)!,
    profile: s.map((x, i) => [x.d, heights[i]!]),
  };
}

export interface TargetInfo {
  distance: number;
  /** Rumbo geográfico desde el origen. */
  bearing: number;
  /** Altura del punto y del origen (null: sin datos). */
  targetAlt: number | null;
  originAlt: number | null;
  /** Ángulo de elevación (positivo = hay que mirar hacia arriba), sin curvatura. */
  elevationAngle: number | null;
}

export async function targetInfo(origin: LatLon & { alt?: number | null }, target: LatLon, load: HeightLoader = defaultLoader): Promise<TargetInfo> {
  const distance = distanceMeters(origin, target);
  const bearing = bearingDeg(origin, target);
  const [targetAlt, demOrigin] = await Promise.all([elevationAt(target, load), elevationAt(origin, load)]);
  // El terreno del modelo es más parejo que la altura del GPS; se usa el GPS solo si no hay modelo.
  const originAlt = demOrigin ?? origin.alt ?? null;
  const elevationAngle =
    targetAlt !== null && originAlt !== null && distance > 0 ? (Math.atan2(targetAlt - originAlt, distance) * 180) / Math.PI : null;
  return { distance, bearing, targetAlt, originAlt, elevationAngle };
}
