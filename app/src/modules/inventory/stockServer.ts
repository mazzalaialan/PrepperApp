import { useEffect } from 'react';
import type { Location, Lot, Waypoint } from '@/core/model/types';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import { useWaypoints } from '@/modules/waypoints/store';
import { useInventory } from './store';

/**
 * Avisos de peligros naturales cerca de la reserva (inundación, incendio,
 * sismo…), desde el servidor propio: se le manda un punto por cada waypoint
 * donde hay algo guardado (ubicaciones con waypoint propio o heredado de la
 * de arriba), redondeado a ~1 km, con el nombre de las ubicaciones. Nada más
 * del inventario sale del dispositivo.
 */

export interface StockPlace {
  id: string;
  label: string | null;
  lat: number;
  lon: number;
}

const coarse = (x: number) => Math.round(x * 100) / 100;

/** Waypoint de una ubicación: el suyo o el de la más cercana hacia arriba. */
export function locationWaypoint(loc: Location, locations: Map<string, Location>): string | null {
  for (let l: Location | undefined = loc, i = 0; l && i < 8; l = l.parentId ? locations.get(l.parentId) : undefined, i++) {
    if (l.waypointId) return l.waypointId;
  }
  return null;
}

export function stockPlaces(locations: Map<string, Location>, lots: Iterable<Lot>, waypoints: Map<string, Waypoint>): StockPlace[] {
  const names = new Map<string, Set<string>>();
  for (const lot of lots) {
    if (lot.deletedAt || lot.quantity <= 0) continue;
    const loc = locations.get(lot.locationId);
    if (!loc) continue;
    const wpId = locationWaypoint(loc, locations);
    if (!wpId || !waypoints.has(wpId)) continue;
    // Se nombra la ubicación que tiene el waypoint (la casa, no el estante).
    let owner: Location = loc;
    while (!owner.waypointId && owner.parentId && locations.get(owner.parentId)) owner = locations.get(owner.parentId)!;
    names.set(wpId, (names.get(wpId) ?? new Set()).add(owner.name));
  }
  return [...names.entries()].map(([id, set]) => {
    const w = waypoints.get(id)!;
    return { id, label: [...set].sort().join(', ').slice(0, 200) || null, lat: coarse(w.lat), lon: coarse(w.lon) };
  });
}

export async function syncStockPlaces(): Promise<void> {
  const { push } = await readNotificationState();
  const inv = useInventory.getState();
  if (!push || !navigator.onLine || !inv.loaded) return;
  const places = stockPlaces(inv.locations, inv.lots.values(), useWaypoints.getState().waypoints);
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}/stock`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${push.token}` },
    body: JSON.stringify({ places }),
  }).catch(() => null);
  if (res?.status === 401) await updateNotificationState({ push: null });
}

/** Se monta una vez en la app desbloqueada. */
export function useStockServerSync() {
  const locations = useInventory((s) => s.locations);
  const lots = useInventory((s) => s.lots);
  const waypoints = useWaypoints((s) => s.waypoints);
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  const key = useInventory.getState().loaded ? JSON.stringify(stockPlaces(locations, lots.values(), waypoints)) : '';
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => void syncStockPlaces(), 2000);
    return () => clearTimeout(timer);
  }, [key, notificationsEnabled]);
}
