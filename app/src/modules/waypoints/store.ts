import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { distanceMeters } from '@/core/geo/geo';
import { touch } from '@/core/model/entity';
import type { Id, Route, Waypoint } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { useInventory } from '@/modules/inventory/store';

interface WaypointsState {
  loaded: boolean;
  waypoints: Map<Id, Waypoint>;
  routes: Map<Id, Route>;
  load: () => Promise<void>;
  clear: () => void;
  saveWaypoint: (w: Waypoint) => Promise<void>;
  deleteWaypoint: (id: Id) => Promise<void>;
  saveRoute: (r: Route) => Promise<void>;
  deleteRoute: (id: Id) => Promise<void>;
}

export const useWaypoints = create<WaypointsState>((set, get) => ({
  loaded: false,
  waypoints: new Map(),
  routes: new Map(),

  async load() {
    const [waypoints, routes] = await Promise.all([repos.waypoints.loadAll(), repos.routes.loadAll()]);
    set({
      loaded: true,
      waypoints: new Map(waypoints.map((w) => [w.id, w])),
      routes: new Map(routes.map((r) => [r.id, r])),
    });
  },

  clear() {
    set({ loaded: false, waypoints: new Map(), routes: new Map() });
  },

  async saveWaypoint(w) {
    const saved = touch(w);
    await repos.waypoints.put(saved);
    set({ waypoints: new Map(get().waypoints).set(saved.id, saved) });
  },

  async deleteWaypoint(id) {
    // Las ubicaciones del inventario vinculadas a este punto quedan sin coordenadas.
    const inventory = useInventory.getState();
    for (const location of inventory.locations.values()) {
      if (location.waypointId === id) await inventory.saveLocation({ ...location, waypointId: null });
    }
    // Y las rutas que lo usaban siguen sin él.
    for (const route of get().routes.values()) {
      if (route.waypointIds.includes(id)) await get().saveRoute({ ...route, waypointIds: route.waypointIds.filter((w) => w !== id) });
    }
    await repos.waypoints.remove(id);
    const waypoints = new Map(get().waypoints);
    waypoints.delete(id);
    set({ waypoints });
  },

  async saveRoute(r) {
    const saved = touch(r);
    await repos.routes.put(saved);
    set({ routes: new Map(get().routes).set(saved.id, saved) });
  },

  async deleteRoute(id) {
    await repos.routes.remove(id);
    const routes = new Map(get().routes);
    routes.delete(id);
    set({ routes });
  },
}));

/** Puntos de la ruta en orden, salteando los que ya no existen. */
export function routePoints(route: Route, waypoints: Map<Id, Waypoint>): Waypoint[] {
  return route.waypointIds.flatMap((id) => {
    const wp = waypoints.get(id);
    return wp ? [wp] : [];
  });
}

/** Largo de la ruta en línea recta entre puntos consecutivos, en metros. */
export function routeLength(points: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1]!, points[i]!);
  return total;
}

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useWaypoints.getState().loaded) void useWaypoints.getState().load();
  } else {
    useWaypoints.getState().clear();
  }
});
