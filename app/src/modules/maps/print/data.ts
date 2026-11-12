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

/** Margen (m) para preferir la primera pasada cuando el recorrido pasa dos veces por el mismo lugar (ida y vuelta). */
const FIRST_PASS_MARGIN_M = 30;

/**
 * Índice del punto de la línea donde está un waypoint. Se mide contra los tramos de la línea (no solo contra sus vértices, que en una
 * línea simplificada están muy separados) y, si el recorrido pasa dos veces por ahí (ida y vuelta), se toma la primera pasada,
 * que es donde se suele marcar el punto.
 */
function nearestIndex(line: LatLon[], p: LatLon): number {
  if (line.length < 2) return 0;
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320;
  const xy = (q: LatLon) => [(q.lon - p.lon) * kx, (q.lat - p.lat) * 110540] as const;
  const dist: number[] = [];
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, ay] = xy(line[k]!);
    const [bx, by] = xy(line[k + 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    dist.push(Math.hypot(ax + t * dx, ay + t * dy));
  }
  const min = Math.min(...dist);
  const k = dist.findIndex((d) => d <= min + FIRST_PASS_MARGIN_M);
  const da = Math.hypot(...xy(line[k]!));
  const db = Math.hypot(...xy(line[k + 1]!));
  return da <= db ? k : k + 1;
}

/** Si varios puntos se llaman igual («Descanso»), se numeran: «Descanso 1», «Descanso 2»… (los tramos dirían «Descanso → Descanso»). */
export function uniqueNames<T extends { name: string }>(points: T[]): T[] {
  const count = new Map<string, number>();
  for (const p of points) if (p.name) count.set(p.name, (count.get(p.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return points.map((p) => {
    if (!p.name || (count.get(p.name) ?? 0) < 2) return p;
    const n = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, n);
    return { ...p, name: `${p.name} ${n}` };
  });
}

/** Distancia (m) hasta la que un waypoint pegado al inicio o al fin no es un punto aparte: le da el nombre al inicio o al fin. */
const NEAR_END_M = 100;

/**
 * Los puntos numerados de una línea: Inicio, los waypoints del track (siempre), los cambios de rumbo que hagan falta para seguir el recorrido y Fin.
 * Un waypoint a menos de 100 m del inicio o del fin no es un punto aparte: nombra al inicio o al fin («Inicio · Estacionamiento»).
 */
function stopsOf(line: LatLon[], named: { name: string; i: number }[]) {
  const last = line.length - 1;
  const along = (a: number, b: number) => {
    let d = 0;
    for (let j = a; j < b; j++) d += distanceMeters(line[j]!, line[j + 1]!);
    return d;
  };
  let startName = '';
  let endName = '';
  const byIndex = new Map<number, string>();
  for (const w of [...named].sort((x, y) => x.i - y.i)) {
    if (w.i <= 0 || w.i >= last) {
      if (w.i <= 0 && !startName) startName = w.name;
      else if (w.i >= last && !endName) endName = w.name;
      continue;
    }
    if (along(0, w.i) < NEAR_END_M && !startName) startName = w.name;
    else if (along(w.i, last) < NEAR_END_M && !endName) endName = w.name;
    else byIndex.set(w.i, w.name);
  }
  const idx = pickStopIndices(line, [...byIndex.keys()]);
  const stops = idx.map((i) => ({
    name: i === 0 ? (startName ? `Inicio · ${startName}` : 'Inicio') : i === last ? (endName ? `Fin · ${endName}` : 'Fin') : byIndex.get(i) ?? '',
    i,
    ...line[i]!,
  }));
  return uniqueNames(stops);
}

/** Desvío máximo (m) con el que se deja de agregar puntos intermedios: la recta ya sigue el recorrido. */
const STOP_TOLERANCE_M = 40;

/** Largo (m) máximo de un tramo entre dos puntos numerados. */
const MAX_LEG_M = 3000;

/**
 * Índices de los puntos de la línea que son los puntos numerados de la hoja: el inicio, el fin, los obligados
 * y los que hagan falta para que las rectas entre ellos sigan el recorrido real, sin llegar a un punto por cada detalle:
 * se agrega siempre el punto que más se aleja de su recta, hasta un punto cada ~1,2 km (entre 6 y 30) o hasta que ninguno se aleje más de 40 m.
 */
export function pickStopIndices(line: LatLon[], forced: number[] = []): number[] {
  const n = line.length;
  if (n < 2) return [0];
  const lat0 = line[0]!.lat;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const xy = line.map((p) => [(p.lon - line[0]!.lon) * kx, (p.lat - lat0) * 110540] as const);
  let length = 0;
  for (let i = 1; i < n; i++) length += distanceMeters(line[i - 1]!, line[i]!);
  const target = Math.min(30, Math.max(6, Math.round(length / 1200) + 2));
  const chosen = new Set<number>([0, n - 1, ...forced.filter((i) => i > 0 && i < n - 1)]);
  /** El punto más alejado de la recta entre dos elegidos consecutivos. */
  const farthest = (a: number, b: number) => {
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      // En una ida y vuelta la recta es casi un punto: se mide contra el punto, no contra la recta.
      const t = len2 > 1 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    return { i: best, d: bestD };
  };
  while (chosen.size < target) {
    const sorted = [...chosen].sort((a, b) => a - b);
    let pick = { i: -1, d: 0 };
    for (let k = 1; k < sorted.length; k++) {
      const c = farthest(sorted[k - 1]!, sorted[k]!);
      if (c.d > pick.d) pick = c;
    }
    if (pick.i < 0 || pick.d < STOP_TOLERANCE_M) break;
    chosen.add(pick.i);
  }
  // Ningún tramo de más de 3 km (por ejemplo, la vuelta de una ida y vuelta, que repite el camino): se parte por el punto más alejado de su recta o, si es recto, por la mitad.
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + distanceMeters(line[i - 1]!, line[i]!));
  while (chosen.size < 40) {
    const sorted = [...chosen].sort((a, b) => a - b);
    let worst = -1;
    let worstLen = MAX_LEG_M;
    for (let k = 1; k < sorted.length; k++) {
      const len = cum[sorted[k]!]! - cum[sorted[k - 1]!]!;
      if (len > worstLen) {
        worstLen = len;
        worst = k;
      }
    }
    if (worst < 0) break;
    const a = sorted[worst - 1]!;
    const b = sorted[worst]!;
    let cut = farthest(a, b).i;
    if (cut < 0) {
      const half = (cum[a]! + cum[b]!) / 2;
      cut = a + 1;
      while (cut < b - 1 && cum[cut]! < half) cut++;
    }
    if (cut <= a || cut >= b) break;
    chosen.add(cut);
  }
  return [...chosen].sort((a, b) => a - b);
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
  const named = track.waypoints.map((w) => ({ name: w.name, i: nearestIndex(full, w) }));
  const stops = stopsOf(full, named);
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
  if (route.stops) {
    // Ruta que vino de un track: los tramos son entre sus waypoints (Inicio, los del track, Fin), como en la hoja del track.
    const stops = stopsOf(line, route.stops.map((w) => ({ name: w.name, i: nearestIndex(line, w) })));
    const decl = meta(route.name, line).declinationDeg;
    const pts: TopoPoint[] = stops.map((p, k) => ({ n: k + 1, name: p.name || `Punto ${k + 1}`, lat: p.lat, lon: p.lon }));
    const stopLegs: TopoLeg[] = stops.slice(1).map((b, k) => {
      const a = stops[k]!;
      let dist = 0;
      for (let j = a.i; j < b.i; j++) dist += distanceMeters(line[j]!, line[j + 1]!);
      const t = bearingDeg(a, b);
      return { from: k + 1, to: k + 2, distanceM: dist, bearingTrueDeg: t, bearingMagDeg: norm360(t - decl) };
    });
    return { ...meta(route.name, line), subtitle: 'Ruta planificada', line, points: pts, legs: stopLegs, stopIdx: stops.map((s) => s.i) };
  }
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
  const points: TopoPoint[] = uniqueNames(stops.map((w, i) => ({ n: i + 1, name: w.name, lat: w.lat, lon: w.lon })));
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
  const sums = await Promise.all(input.legs.map((_, i) => summarizePath(input.stopIdx ? input.line.slice(input.stopIdx[i]!, input.stopIdx[i + 1]! + 1) : [input.line[i]!, input.line[i + 1]!]).catch(() => null)));
  return { ...input, legs: input.legs.map((l, i) => ({ ...l, ascentM: sums[i]?.ascent ?? undefined, descentM: sums[i]?.descent ?? undefined })) };
}
