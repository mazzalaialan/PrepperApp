import type { Id, Track } from '@/core/model/types';

/**
 * Qué recorridos se dibujan en el mapa. Con tres salidas por semana, dibujarlos todos deja una maraña que no se entiende:
 * por defecto (`auto`) se ve el que se está grabando y, si no hay ninguno, el último; se puede elegir cuáles, ver todos o ninguno.
 */
export type TrackShowMode = 'auto' | 'none' | 'chosen' | 'all';

export const TRACK_SHOW_MODES: TrackShowMode[] = ['auto', 'chosen', 'all', 'none'];

/** Colores para distinguir recorridos cuando se ven varios a la vez (el primero es el color de siempre de los tracks). */
export const TRACK_PALETTE = ['#4f8fd8', '#e0a23a', '#a06ad8', '#3bb3a6', '#d9647f', '#93b24a'];

/** Los recorridos que se pueden mostrar: los guardados (no el que se está grabando ni los armados desde una ruta), del más nuevo al más viejo. */
export function selectableTracks(tracks: Iterable<Track>): Track[] {
  return [...tracks].filter((t) => !t.recording && !t.routeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Los que se dibujan según el modo. `recordingActive`: hay una grabación en curso o en pausa (se ve aparte, siempre).
 * `focus`: los que se abrieron desde su ficha («Ver en el mapa»): se ven siempre, con cualquier modo.
 */
export function tracksToShow(tracks: Iterable<Track>, mode: TrackShowMode, chosen: Id[], recordingActive: boolean, focus: Id[] = []): Track[] {
  const all = selectableTracks(tracks);
  const pick = (ids: Set<Id>) => all.filter((t) => ids.has(t.id));
  let shown: Track[];
  if (mode === 'all') shown = all;
  else if (mode === 'none') shown = [];
  else if (mode === 'chosen') shown = pick(new Set(chosen));
  else shown = recordingActive || !all[0] ? [] : [all[0]];
  if (focus.length) {
    const have = new Set(shown.map((t) => t.id));
    shown = [...shown, ...pick(new Set(focus.filter((id) => !have.has(id))))];
  }
  return shown;
}
