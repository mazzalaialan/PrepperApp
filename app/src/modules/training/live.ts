import { distanceMeters } from '@/core/geo/geo';
import type { TrackPoint } from '@/modules/tracks/gpx';

/** Ventana para el ritmo "de ahora": los últimos segundos, para que no salte con cada punto del GPS. */
const WINDOW_S = 30;
/** Menos que esto en la ventana es estar parado: no hay ritmo. */
const MIN_WINDOW_M = 8;

/**
 * Velocidad de ahora (m/s) con los puntos de los últimos 30 s del último tramo.
 * 0 si no hay hora en los puntos o si se está parado.
 */
export function currentSpeedMs(segments: TrackPoint[][]): number {
  const seg = segments.at(-1);
  if (!seg || seg.length < 2) return 0;
  const last = seg.at(-1)!;
  if (last[3] === undefined) return 0;
  let i = seg.length - 1;
  while (i > 0 && seg[i - 1]![3] !== undefined && last[3] - seg[i - 1]![3]! <= WINDOW_S) i--;
  if (i === seg.length - 1) return 0;
  const first = seg[i]!;
  const dt = last[3] - (first[3] ?? last[3]);
  if (dt <= 0) return 0;
  let d = 0;
  for (let k = i + 1; k < seg.length; k++) d += distanceMeters({ lat: seg[k - 1]![0], lon: seg[k - 1]![1] }, { lat: seg[k]![0], lon: seg[k]![1] });
  return d < MIN_WINDOW_M ? 0 : d / dt;
}

/** m/s → segundos por km (0 si está parado). */
export const paceFromMs = (ms: number): number => (ms > 0 ? 1000 / ms : 0);
/** m/s → km/h. */
export const kmhFromMs = (ms: number): number => ms * 3.6;

/** Texto que lee la voz al cerrar un kilómetro: "Kilómetro 3. Tiempo 18:05. Ritmo 5:58." */
export function kmAnnouncement(km: number, totalS: number, lastSplitS: number | undefined, t: (key: string, o?: Record<string, unknown>) => string, clock: (s: number) => string, pace: (s: number) => string): string {
  return lastSplitS
    ? t('training.live.voiceKm', { km, time: clock(totalS), pace: pace(lastSplitS) })
    : t('training.live.voiceKmShort', { km, time: clock(totalS) });
}
