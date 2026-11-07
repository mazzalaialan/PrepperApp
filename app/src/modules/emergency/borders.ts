/**
 * Contorno de Argentina, Chile, Uruguay, Bolivia y Perú (tools/emergency-data/borders.mjs,
 * Natural Earth 1:50 m): en qué país se está y a qué distancia del otro, para
 * mostrar las frecuencias de montaña de cada país solo cerca de su territorio
 * y los números de emergencia del país donde uno está.
 */

import { COUNTRIES, type Country } from '@/core/settings/settings';

type Ring = [number, number][];

export type BorderCountry = Country;

export type BordersData = { source: string } & Record<BorderCountry, Ring[]>;

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

/**
 * País en el que cae el punto (de los que tiene la app); si no cae en
 * ninguno (por ejemplo en el mar, por la simplificación del borde), el más
 * cercano a menos de 20 km; si no, null.
 */
export function countryAt(data: BordersData, lat: number, lon: number): Country | null {
  const inside = COUNTRIES.find((c) => data[c]?.some((r) => inRing(r, lon, lat)));
  if (inside) return inside;
  let best: { c: Country; d: number } | null = null;
  for (const c of COUNTRIES) {
    if (!data[c]) continue;
    const d = distanceToCountry(data, c, lat, lon);
    if (!best || d < best.d) best = { c, d };
  }
  return best && best.d <= 20_000 ? best.c : null;
}
