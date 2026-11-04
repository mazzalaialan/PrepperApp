/**
 * ¿Llueve ahora, va a llover pronto o no? A partir de la lluvia de las
 * próximas 2 horas en intervalos de 15 minutos.
 *
 * ⚠ Copia de `rainOutlook` en app/src/modules/weather/nowcast.ts: mantener ambas en sincronía.
 */

export interface RainSlot {
  /** Hora "YYYY-MM-DDTHH:MM", en la misma zona que `Nowcast.now`. */
  time: string;
  /** Milímetros en esos 15 minutos. */
  mm: number;
}

export interface Nowcast {
  now: string;
  slots: RainSlot[];
}

export type RainOutlook =
  | { state: 'raining'; mm: number }
  | { state: 'soon'; inMinutes: number; startsAt: string; mm: number }
  | { state: 'dry' };

/** Por debajo de esto (en 15 min) no se considera lluvia: evita avisar por lloviznas de 0,1 mm. */
export const RAIN_MM_PER_SLOT = 0.2;

function minutesBetween(from: string, to: string): number {
  return (Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000;
}

export function rainOutlook(nowcast: Nowcast): RainOutlook {
  const upcoming = nowcast.slots.filter((s) => minutesBetween(nowcast.now.slice(0, 16), s.time) > -15);
  const first = upcoming.findIndex((s) => s.mm >= RAIN_MM_PER_SLOT);
  if (first === -1) return { state: 'dry' };
  const mm = upcoming.slice(first).reduce((sum, s) => sum + s.mm, 0);
  const startsIn = minutesBetween(nowcast.now.slice(0, 16), upcoming[first]!.time);
  if (startsIn <= 0) return { state: 'raining', mm };
  return { state: 'soon', inMinutes: Math.round(startsIn / 5) * 5, startsAt: upcoming[first]!.time, mm };
}
