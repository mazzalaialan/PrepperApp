import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { newEntity, touch } from '@/core/model/entity';
import type { Id, Track } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { parseGpx, simplify, trackStats } from './gpx';

interface TracksState {
  loaded: boolean;
  tracks: Map<Id, Track>;
  load: () => Promise<void>;
  clear: () => void;
  saveTrack: (t: Track) => Promise<void>;
  deleteTrack: (id: Id) => Promise<void>;
}

/** Tracks importados de GPX (cifrados, viajan en el backup). */
export const useTracks = create<TracksState>((set, get) => ({
  loaded: false,
  tracks: new Map(),

  async load() {
    const all = await repos.tracks.loadAll();
    set({ loaded: true, tracks: new Map(all.map((t) => [t.id, t])) });
  },

  clear() {
    set({ loaded: false, tracks: new Map() });
  },

  async saveTrack(t) {
    const saved = touch(t);
    await repos.tracks.put(saved);
    set({ tracks: new Map(get().tracks).set(saved.id, saved) });
  },

  async deleteTrack(id) {
    await repos.tracks.remove(id);
    const tracks = new Map(get().tracks);
    tracks.delete(id);
    set({ tracks });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useTracks.getState().loaded) void useTracks.getState().load();
  } else {
    useTracks.getState().clear();
  }
});

/**
 * Arma el track a partir del archivo: estadísticas con todos los puntos
 * originales y el recorrido simplificado para guardarlo (ocupa mucho menos).
 */
export function trackFromGpx(text: string, fileName: string): Track {
  const parsed = parseGpx(text, fileName);
  const stats = trackStats(parsed.segments);
  const wikiloc = /wikiloc/i.test(text.slice(0, 2000)) || /wikiloc/i.test(parsed.link ?? '');
  return newEntity<Track>({
    // Wikiloc antepone "Wikiloc - " al nombre de la metadata.
    name: parsed.name.replace(/^Wikiloc\s*-\s*/i, ''),
    desc: parsed.desc,
    source: wikiloc ? 'Wikiloc' : fileName,
    link: parsed.link,
    segments: parsed.segments.map((s) => simplify(s)),
    waypoints: parsed.waypoints,
    ...stats,
    notes: '',
  });
}
