/**
 * Contorno de Argentina y Chile (tools/emergency-data/borders.mjs, Natural
 * Earth 1:50 m): en qué país se está y a qué distancia del otro, para mostrar
 * las frecuencias de montaña de cada país solo cerca de su territorio.
 */

type Ring = [number, number][];

export interface BordersData {
  source: string;
  AR: Ring[];
  CL: Ring[];
}

export type BorderCountry = 'AR' | 'CL';

let pending: Promise<BordersData> | null = null;

export function loadBorders(): Promise<BordersData> {
  pending ??= import('./borders-data.json').then((m) => m.default as unknown as BordersData);
  return pending;
}

function inRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia en metros del punto al segmento a–b (proyección local equirectangular: alcanza a esta escala). */
function segmentDistance(lat: number, lon: number, a: [number, number], b: [number, number]): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_574;
  const ax = (a[0] - lon) * kx;
  const ay = (a[1] - lat) * ky;
  const bx = (b[0] - lon) * kx;
  const by = (b[1] - lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Distancia en metros al territorio del país: 0 si se está adentro. */
export function distanceToCountry(data: BordersData, country: BorderCountry, lat: number, lon: number): number {
  const rings = data[country];
  if (rings.some((r) => inRing(r, lon, lat))) return 0;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) best = Math.min(best, segmentDistance(lat, lon, ring[i]!, ring[i + 1]!));
  }
  return best;
}
