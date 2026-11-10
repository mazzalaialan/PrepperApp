import { distanceMeters, bearingDeg } from '@/core/geo/geo';
import type { Waypoint, WaypointRole } from '@/core/model/types';

/** Los tipos de lugar que importan en una emergencia, en el orden en que se ofrecen. */
export const WAYPOINT_ROLES: WaypointRole[] = ['escape', 'shelter', 'water', 'danger'];

/** El lugar de ese tipo más cercano a una posición, con la distancia y el rumbo desde la posición hacia él. */
export function nearestWithRole(waypoints: Iterable<Waypoint>, role: WaypointRole, from: { lat: number; lon: number }, maxM = 100_000): { waypoint: Waypoint; distanceM: number; bearing: number } | null {
  let best: { waypoint: Waypoint; distanceM: number; bearing: number } | null = null;
  for (const w of waypoints) {
    if (w.role !== role || w.deletedAt) continue;
    const d = distanceMeters(from, w);
    if (d <= maxM && (!best || d < best.distanceM)) best = { waypoint: w, distanceM: d, bearing: bearingDeg(from, w) };
  }
  return best;
}
