import { newEntity } from '@/core/model/entity';
import type { Outing, Track, Workout } from '@/core/model/types';
import { totalsOf } from './history';

export function blankOuting(name: string): Outing {
  return newEntity<Outing>({ name, notes: '' });
}

/**
 * Un track virtual con los recorridos de todas las actividades de la salida,
 * en el orden en que se hicieron: sirve para el perfil de altura y el mapa de
 * toda la salida.
 */
export function outingTrack(workouts: Workout[], tracks: Map<string, Track>): Track | null {
  const segments = [...workouts]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((w) => (w.trackId ? tracks.get(w.trackId)?.segments ?? [] : []))
    .filter((s) => s.length > 1);
  if (!segments.length) return null;
  const t = totalsOf(workouts);
  return { id: 'outing', name: '', desc: '', source: '', link: null, segments, waypoints: [], distanceM: t.distanceM, ascentM: t.ascentM, descentM: t.descentM, minEle: t.minEle, maxEle: t.maxEle, notes: '' } as unknown as Track;
}
