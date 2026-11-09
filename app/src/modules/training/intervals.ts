import type { IntervalPlanData } from '@/core/model/types';

/**
 * Entrenamiento por intervalos: entrada en calor, N repeticiones de trabajo y
 * descanso, y vuelta a la calma. El trabajo y el descanso se miden en tiempo o,
 * si el plan trae `workM` o `restM`, en metros (por ejemplo 8 × 400 m). El
 * tiempo es el de la grabación (sin las pausas): pausar congela el intervalo.
 */

export type IntervalPlan = IntervalPlanData;

export type PhaseKind = 'warmup' | 'work' | 'rest' | 'cooldown';

export interface Phase {
  kind: PhaseKind;
  /** Duración en segundos; 0 si la etapa se mide en metros. */
  durationS: number;
  /** Largo en metros si la etapa se mide por distancia. */
  distanceM?: number;
  /** Repetición (1 a N) para trabajo y descanso. */
  round?: number;
}

/** Las etapas en orden; las vacías no están. El último descanso (después de la última repetición) se omite. */
export function phases(plan: IntervalPlan): Phase[] {
  const out: Phase[] = [];
  if (plan.warmupS > 0) out.push({ kind: 'warmup', durationS: plan.warmupS });
  for (let i = 1; i <= plan.repeats; i++) {
    if (plan.workM && plan.workM > 0) out.push({ kind: 'work', durationS: 0, distanceM: plan.workM, round: i });
    else if (plan.workS > 0) out.push({ kind: 'work', durationS: plan.workS, round: i });
    if (i < plan.repeats) {
      if (plan.restM && plan.restM > 0) out.push({ kind: 'rest', durationS: 0, distanceM: plan.restM, round: i });
      else if (plan.restS > 0) out.push({ kind: 'rest', durationS: plan.restS, round: i });
    }
  }
  if (plan.cooldownS > 0) out.push({ kind: 'cooldown', durationS: plan.cooldownS });
  return out;
}

/** Si alguna etapa depende de la distancia, hace falta GPS. */
export const usesDistance = (plan: IntervalPlan): boolean => Boolean((plan.workM && plan.workM > 0) || (plan.restM && plan.restM > 0));

/** Duración total en segundos de las etapas por tiempo (las de distancia no tienen una duración conocida). */
export const planDurationS = (plan: IntervalPlan): number => phases(plan).reduce((n, p) => n + p.durationS, 0);

/** Dónde va la sesión: etapa actual y desde cuándo (tiempo y distancia de la grabación al empezarla). */
export interface RunState {
  index: number;
  startedS: number;
  startedM: number;
}

export const START_STATE: RunState = { index: 0, startedS: 0, startedM: 0 };

export interface PhaseNow {
  state: RunState;
  phase: Phase | null;
  /** Lo que falta de la etapa: segundos o metros según `unit`. */
  remaining: number;
  unit: 's' | 'm';
  done: boolean;
}

/**
 * Avanza el estado con el tiempo (s) y la distancia (m) de la grabación: pasa a
 * la etapa siguiente cuando se cumplió la actual (puede pasar varias de una vez
 * si hubo un salto). Es una función pura: el que la llama guarda el estado.
 */
export function advance(plan: IntervalPlan, state: RunState, nowS: number, nowM: number): PhaseNow {
  const list = phases(plan);
  let s = { ...state };
  while (s.index < list.length) {
    const p = list[s.index]!;
    const byDistance = p.distanceM !== undefined;
    const used = byDistance ? nowM - s.startedM : nowS - s.startedS;
    const target = byDistance ? p.distanceM! : p.durationS;
    if (used >= target) {
      // Una etapa por tiempo termina justo en su borde (así un salto grande no corre las siguientes); una por distancia, cuando se cumple.
      s = { index: s.index + 1, startedS: byDistance ? nowS : s.startedS + p.durationS, startedM: nowM };
      continue;
    }
    return { state: s, phase: p, remaining: Math.ceil(target - used), unit: byDistance ? 'm' : 's', done: false };
  }
  return { state: s, phase: null, remaining: 0, unit: 's', done: true };
}

/** "8 × 400 m / 1:30", con la entrada en calor y la vuelta a la calma si las hay. */
export function describePlan(plan: IntervalPlan, clock: (s: number) => string): string {
  const work = plan.workM && plan.workM > 0 ? `${plan.workM} m` : clock(plan.workS);
  const rest = plan.restM && plan.restM > 0 ? `${plan.restM} m` : clock(plan.restS);
  const core = `${plan.repeats} × ${work} / ${rest}`;
  const extra = [plan.warmupS > 0 ? `+ ${clock(plan.warmupS)}` : '', plan.cooldownS > 0 ? `+ ${clock(plan.cooldownS)}` : ''].filter(Boolean).join(' ');
  return extra ? `${core} ${extra}` : core;
}

/** Planes para empezar rápido. */
export const PRESETS: { id: string; plan: IntervalPlan }[] = [
  { id: 'run1', plan: { warmupS: 300, workS: 60, restS: 60, repeats: 8, cooldownS: 300 } },
  { id: 'run2', plan: { warmupS: 300, workS: 180, restS: 90, repeats: 5, cooldownS: 300 } },
  { id: 'walkRun', plan: { warmupS: 0, workS: 60, restS: 120, repeats: 10, cooldownS: 0 } },
  { id: 'tabata', plan: { warmupS: 120, workS: 20, restS: 10, repeats: 8, cooldownS: 120 } },
  { id: 'track400', plan: { warmupS: 300, workS: 0, workM: 400, restS: 90, repeats: 8, cooldownS: 300 } },
  { id: 'km1', plan: { warmupS: 300, workS: 0, workM: 1000, restS: 120, repeats: 5, cooldownS: 300 } },
  { id: 'm200', plan: { warmupS: 300, workS: 0, workM: 200, restS: 60, repeats: 10, cooldownS: 300 } },
];

/** Un plan válido: al menos una repetición y un trabajo de al menos 5 s o 20 m, nada negativo ni absurdo (máx. 99 repeticiones). */
export function validPlan(p: IntervalPlan): boolean {
  const times = [p.warmupS, p.workS, p.restS, p.cooldownS].every((n) => Number.isFinite(n) && n >= 0 && n <= 6 * 3600);
  const dist = [p.workM ?? 0, p.restM ?? 0].every((n) => Number.isFinite(n) && n >= 0 && n <= 100_000);
  const work = (p.workM ?? 0) >= 20 || p.workS >= 5;
  return times && dist && work && Number.isInteger(p.repeats) && p.repeats >= 1 && p.repeats <= 99;
}

/** "1:30" o "90" → segundos; null si no es un tiempo. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(t) ? Number(t) : null;
}
