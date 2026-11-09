import type { Track, Workout, WorkoutKind } from '@/core/model/types';
import { calories } from './energy';
import { activityFromFile } from './interchange';
import type { FitActivity } from './fit';
import { blankWorkout } from './store';

/**
 * Arma la actividad (y su recorrido, si el reloj tenía GPS) de un archivo FIT.
 * Del reloj se toman el pulso, las vueltas y las calorías que él calculó; el
 * resto (distancia, desnivel, ritmo) se calcula como en cualquier recorrido de
 * la app. Las sesiones sin GPS (cinta, elíptica) usan el resumen del reloj.
 */
export function activityFromFit(fit: FitActivity, kind: WorkoutKind, name: string, weightKg: number | null): { track: Track | null; workout: Workout } {
  const s = fit.session;
  const common = {
    source: 'watch' as const,
    avgHr: s.avgHr ?? null,
    maxHr: s.maxHr ?? null,
    laps: fit.laps,
  };
  if (fit.hasGps) {
    const { track, workout } = activityFromFile({ name, desc: '', link: null, segments: fit.segments, waypoints: [], kind: fit.kind, startedAt: fit.startedAt }, kind, weightKg);
    return { track, workout: { ...workout, ...common, calories: s.calories && s.calories > 0 ? s.calories : workout.calories } };
  }
  const moving = s.movingS ?? s.totalS ?? 0;
  const distanceM = Math.round(s.distanceM ?? 0);
  const avgSpeedKmh = moving > 0 && distanceM > 0 ? (distanceM / 1000 / moving) * 3600 : 0;
  const w = blankWorkout(kind, name, fit.startedAt ?? new Date().toISOString());
  const est = weightKg && moving > 0 ? calories({ kind, weightKg, movingS: moving, distanceM, ascentM: s.ascentM ?? 0 }) : 0;
  const workout: Workout = {
    ...w,
    ...common,
    totalS: Math.round(s.totalS ?? moving),
    movingS: Math.round(moving),
    distanceM,
    ascentM: s.ascentM ?? 0,
    descentM: s.descentM ?? 0,
    avgSpeedKmh,
    paceSPerKm: avgSpeedKmh > 0 ? 3600 / avgSpeedKmh : 0,
    calories: s.calories && s.calories > 0 ? s.calories : est,
    weightKg,
  };
  return { track: null, workout };
}
