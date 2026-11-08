import type { Id, Workout } from '@/core/model/types';
import { calories as estimate } from './energy';

/** Totales de un conjunto de actividades (una semana, una salida). */
export interface Totals {
  count: number;
  totalS: number;
  movingS: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  calories: number;
  maxEle: number | null;
  minEle: number | null;
}

export function totalsOf(workouts: Workout[]): Totals {
  const t: Totals = { count: workouts.length, totalS: 0, movingS: 0, distanceM: 0, ascentM: 0, descentM: 0, calories: 0, maxEle: null, minEle: null };
  for (const w of workouts) {
    t.totalS += w.totalS;
    t.movingS += w.movingS;
    t.distanceM += w.distanceM;
    t.ascentM += w.ascentM;
    t.descentM += w.descentM;
    t.calories += w.calories;
    if (w.maxEle !== null) t.maxEle = t.maxEle === null ? w.maxEle : Math.max(t.maxEle, w.maxEle);
    if (w.minEle !== null) t.minEle = t.minEle === null ? w.minEle : Math.min(t.minEle, w.minEle);
  }
  return t;
}

/** Lunes (hora local) de la semana de una fecha, como "2026-11-02". */
export function weekStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Week {
  /** Lunes de la semana. */
  start: string;
  workouts: Workout[];
  totals: Totals;
}

/** Las actividades agrupadas por semana, de la más nueva a la más vieja (y dentro, también). */
export function byWeek(workouts: Workout[]): Week[] {
  const sorted = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const weeks = new Map<string, Workout[]>();
  for (const w of sorted) {
    const key = weekStart(new Date(w.startedAt));
    weeks.set(key, [...(weeks.get(key) ?? []), w]);
  }
  return [...weeks].map(([start, list]) => ({ start, workouts: list, totals: totalsOf(list) }));
}

/** Las actividades de cada salida, de la más vieja a la más nueva (el orden en que se hicieron). */
export function inOuting(workouts: Workout[], outingId: Id): Workout[] {
  return workouts.filter((w) => w.outingId === outingId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Récords personales de las actividades con GPS. */
export interface Records {
  longestM: number | null;
  mostAscentM: number | null;
  longestS: number | null;
}

export function recordsOf(workouts: Workout[]): Records {
  const gps = workouts.filter((w) => w.source !== 'manual' || w.distanceM > 0);
  const max = (f: (w: Workout) => number) => (gps.length ? Math.max(...gps.map(f)) : null);
  const positive = (n: number | null) => (n !== null && n > 0 ? n : null);
  return { longestM: positive(max((w) => w.distanceM)), mostAscentM: positive(max((w) => w.ascentM)), longestS: positive(max((w) => w.totalS)) };
}

/** Recalcula las calorías de una actividad con otro peso o mochila (por ejemplo, si el peso se cargó después). */
export function recalculated(w: Workout, weightKg: number | null, packKg: number | null): Workout {
  const kcal = weightKg ? estimate({ kind: w.kind, weightKg, packKg: packKg ?? undefined, movingS: w.movingS || w.totalS, distanceM: w.distanceM, ascentM: w.ascentM, inclinePct: w.inclinePct ?? undefined, intensity: w.intensity ?? undefined }) : 0;
  return { ...w, weightKg, packKg, calories: kcal };
}

export interface Goals {
  distanceKm: number;
  minutes: number;
  sessions: number;
}

export interface GoalProgress {
  key: keyof Goals;
  done: number;
  target: number;
  /** 0 a 1 (se queda en 1 aunque se pase del objetivo). */
  fraction: number;
  reached: boolean;
}

/** Avance de la semana hacia cada objetivo puesto (los que están en 0 no cuentan). */
export function goalProgress(week: Totals, goals: Goals): GoalProgress[] {
  const done: Goals = { distanceKm: week.distanceM / 1000, minutes: week.totalS / 60, sessions: week.count };
  return (Object.keys(goals) as (keyof Goals)[])
    .filter((k) => goals[k] > 0)
    .map((key) => ({ key, done: done[key], target: goals[key], fraction: Math.min(1, done[key] / goals[key]), reached: done[key] >= goals[key] }));
}
