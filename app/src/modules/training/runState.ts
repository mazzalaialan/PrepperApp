import { START_STATE, type RunState } from './intervals';

/**
 * Dónde va el plan de intervalos de la sesión que se graba, para no perderlo
 * si se recarga la app (las etapas por distancia no se pueden recalcular desde
 * cero). Es solo del navegador y se pisa en cada sesión nueva.
 */
const KEY = 'vikarg-interval-run';

export function loadRun(trackId: string): RunState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { trackId: string; state: RunState } | null;
    if (raw && raw.trackId === trackId && Number.isFinite(raw.state.index)) return raw.state;
  } catch {
    /* sin almacenamiento */
  }
  return { ...START_STATE };
}

export function saveRun(trackId: string, state: RunState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ trackId, state }));
  } catch {
    /* sin almacenamiento */
  }
}
