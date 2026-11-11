import { bearingDeg, distanceMeters, type LatLon } from '@/core/geo/geo';
import type { Route, Track, Waypoint } from '@/core/model/types';
import { declinationAt } from '@/core/sensors/heading';
import { legsOf } from '@/modules/waypoints/plan';
import { climb, summarizePath } from '../measure';
import type { TopoLeg, TopoPoint, TopoSheetInput } from './plan';

/** Datos de la hoja a partir de un track o de una ruta planificada. */

const MAX_DRAWN_POINTS = 4000;
const norm360 = (v: number) => ((v % 360) + 360) % 360;
const decimate = <T,>(pts: T[]): T[] => (pts.length <= MAX_DRAWN_POINTS ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / MAX_DRAWN_POINTS) === 0 || i === pts.length - 1));

const center = (pts: LatLon[]): LatLon => ({
  lat: (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2,
  lon: (Math.min(...pts.map((p) => p.lon)) + Math.max(...pts.map((p) => p.lon))) / 2,
});

const meta = (title: string, pts: LatLon[]) => {
  const c = center(pts);
  const now = new Date();
  return { title, date: now.toLocaleDateString('es-AR'), declinationDeg: declinationAt(c.lat, c.lon, 0, now), declinationYear: now.getFullYear() };
};

/** Índice del punto de la línea más cercano. */
function nearestIndex(line: LatLon[], p: LatLon): number {
  let best = 0;
  let bestD = Infinity;
  line.forEach((q, i) => {
    const d = (q.lat - p.lat) ** 2 + (q.lon - p.lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Hoja de un track: el recorrido, con Inicio, los waypoints del track en el orden en que se pasan y Fin.
 * Cada tramo mide por el recorrido (no en línea recta) y el rumbo es el de la recta entre sus dos puntos.
 */
export function trackSheetInput(track: Track): TopoSheetInput {
  const raw = track.segments.flat();
  const full: LatLon[] = raw.map(([lat, lon]) => ({ lat, lon }));
  if (!full.length) throw new Error('NO_ROUTE');
  const heights = raw.map((p) => p[2]);
  const named = track.waypoints
    .map((w) => ({ name: w.name, lat: w.lat, lon: w.lon, i: nearestIndex(full, w) }))
    .filter((w) => w.i > 0 && w.i < full.length - 1)
    .sort((a, b) => a.i - b.i);
  const stops = [{ name: 'Inicio', i: 0, ...full[0]! }, ...named, { name: 'Fin', i: full.length - 1, ...full[full.length - 1]! }];
  const points: TopoPoint[] = stops.map((p, k) => ({ n: k + 1, name: p.name || `Punto ${k + 1}`, lat: p.lat, lon: p.lon }));
  const decl = meta(track.name, full).declinationDeg;
  const legs: TopoLeg[] = stops.slice(1).map((b, k) => {
    const a = stops[k]!;
    let dist = 0;
    for (let j = a.i; j < b.i; j++) dist += distanceMeters(full[j]!, full[j + 1]!);
    const hs = heights.slice(a.i, b.i + 1).filter((h): h is number => h !== null);
    const c = hs.length > 1 ? climb(hs) : null;
    const t = bearingDeg(a, b);
    return { from: k + 1, to: k + 2, distanceM: dist, bearingTrueDeg: t, bearingMagDeg: norm360(t - decl), ascentM: c?.ascent, descentM: c?.descent };
  });
  return { ...meta(track.name, full), subtitle: track.source && track.source !== 'Ruta' ? track.source : undefined, line: decimate(full), points, legs };
}

/** Hoja de una ruta planificada: sus puntos numerados y sus piernas con rumbo geográfico y magnético. */
export function plannedRouteSheetInput(route: Route): TopoSheetInput {
  const line = route.line ?? [];
  if (!line.length) throw new Error('NO_ROUTE');
  const points: TopoPoint[] = line.map((p, i) => ({ n: i + 1, name: '', lat: p.lat, lon: p.lon }));
  const legs: TopoLeg[] = legsOf(line).map((l) => ({ from: l.n, to: l.n + 1, distanceM: l.distanceM, bearingTrueDeg: l.trueBearing, bearingMagDeg: l.magneticBearing }));
  return { ...meta(route.name, line), subtitle: 'Ruta planificada', line, points, legs };
}

/** Hoja de una ruta hecha con waypoints: los puntos con su nombre y las rectas entre ellos (el desnivel sale de la altura de cada waypoint). */
export function waypointRouteSheetInput(route: Route, waypoints: Map<string, Waypoint>): TopoSheetInput {
  const stops = route.waypointIds.map((id) => waypoints.get(id)).filter((w): w is Waypoint => !!w);
  if (!stops.length) throw new Error('NO_ROUTE');
  const line = stops.map((w) => ({ lat: w.lat, lon: w.lon }));
  const decl = meta(route.name, line).declinationDeg;
  const points: TopoPoint[] = stops.map((w, i) => ({ n: i + 1, name: w.name, lat: w.lat, lon: w.lon }));
  const legs: TopoLeg[] = stops.slice(1).map((b, i) => {
    const a = stops[i]!;
    const t = bearingDeg(a, b);
    const both = a.alt !== null && b.alt !== null;
    return {
      from: i + 1,
      to: i + 2,
      distanceM: distanceMeters(a, b),
      bearingTrueDeg: t,
      bearingMagDeg: norm360(t - decl),
      ascentM: both ? Math.max(0, b.alt! - a.alt!) : undefined,
      descentM: both ? Math.max(0, a.alt! - b.alt!) : undefined,
    };
  });
  return { ...meta(route.name, line), subtitle: 'Ruta de waypoints', line, points, legs };
}

/** Desnivel de cada pierna de una ruta planificada con el relieve que haya en el dispositivo (sin datos: la pierna queda sin desnivel). */
export async function withPlannedClimb(input: TopoSheetInput): Promise<TopoSheetInput> {
  const sums = await Promise.all(input.legs.map((_, i) => summarizePath([input.line[i]!, input.line[i + 1]!]).catch(() => null)));
  return { ...input, legs: input.legs.map((l, i) => ({ ...l, ascentM: sums[i]?.ascent ?? undefined, descentM: sums[i]?.descent ?? undefined })) };
}
