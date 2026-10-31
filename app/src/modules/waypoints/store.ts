import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { Id, Waypoint } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { useInventory } from '@/modules/inventory/store';

interface WaypointsState {
  loaded: boolean;
  waypoints: Map<Id, Waypoint>;
  load: () => Promise<void>;
  clear: () => void;
  saveWaypoint: (w: Waypoint) => Promise<void>;
  deleteWaypoint: (id: Id) => Promise<void>;
}

export const useWaypoints = create<WaypointsState>((set, get) => ({
  loaded: false,
  waypoints: new Map(),

  async load() {
    const waypoints = await repos.waypoints.loadAll();
    set({ loaded: true, waypoints: new Map(waypoints.map((w) => [w.id, w])) });
  },

  clear() {
    set({ loaded: false, waypoints: new Map() });
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
    await repos.waypoints.remove(id);
    const waypoints = new Map(get().waypoints);
    waypoints.delete(id);
    set({ waypoints });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useWaypoints.getState().loaded) void useWaypoints.getState().load();
  } else {
    useWaypoints.getState().clear();
  }
});
