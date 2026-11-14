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

/** Los recorridos que grabaste vos (el resto son los cargados desde un archivo: Wikiloc, GPX…). */
export const isMine = (t: Track): boolean => !!t.recorded;

/**
 * Los que se dibujan. Se manejan por separado:
 *  - **cargados** (de archivos): se ven todos o ninguno (`showImported`);
 *  - **mis recorridos**: según el modo (automático = el que se graba o el último, elegir, todos o ninguno).
 * `recordingActive`: hay una grabación en curso o en pausa (se ve aparte, siempre).
 * `focus`: los que se abrieron desde su ficha («Ver en el mapa»): se ven siempre, con cualquier modo.
 */
export function tracksToShow(
  tracks: Iterable<Track>,
  mode: TrackShowMode,
  chosen: Id[],
  recordingActive: boolean,
  focus: Id[] = [],
  showImported = true,
): Track[] {
  const everything = selectableTracks(tracks);
  const all = everything.filter(isMine);
  const imported = showImported ? everything.filter((t) => !isMine(t)) : [];
  const pick = (ids: Set<Id>) => all.filter((t) => ids.has(t.id));
  let mine: Track[];
  if (mode === 'all') mine = all;
  else if (mode === 'none') mine = [];
  else if (mode === 'chosen') mine = pick(new Set(chosen));
  else mine = recordingActive || !all[0] ? [] : [all[0]];
  let shown = [...imported, ...mine];
  if (focus.length) {
    const have = new Set(shown.map((t) => t.id));
    const rest = new Set(focus.filter((id) => !have.has(id)));
    shown = [...shown, ...everything.filter((t) => rest.has(t.id))];
  }
  return shown;
}
