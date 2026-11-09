/**
 * Entrenamiento por intervalos: entrada en calor, N repeticiones de trabajo y
 * descanso, y vuelta a la calma, todo por tiempo. Se mide con el tiempo de la
 * grabación (sin las pausas), así que pausar congela el intervalo.
 */

export interface IntervalPlan {
  warmupS: number;
  workS: number;
  restS: number;
  repeats: number;
  cooldownS: number;
}

export type PhaseKind = 'warmup' | 'work' | 'rest' | 'cooldown';

export interface Phase {
  kind: PhaseKind;
  durationS: number;
  /** Repetición (1 a N) para trabajo y descanso. */
  round?: number;
}

/** Las etapas en orden; las de duración 0 no están. El último descanso (después de la última repetición) se omite. */
export function phases(plan: IntervalPlan): Phase[] {
  const out: Phase[] = [];
  if (plan.warmupS > 0) out.push({ kind: 'warmup', durationS: plan.warmupS });
  for (let i = 1; i <= plan.repeats; i++) {
    if (plan.workS > 0) out.push({ kind: 'work', durationS: plan.workS, round: i });
    if (plan.restS > 0 && i < plan.repeats) out.push({ kind: 'rest', durationS: plan.restS, round: i });
  }
  if (plan.cooldownS > 0) out.push({ kind: 'cooldown', durationS: plan.cooldownS });
  return out;
}

export const planDurationS = (plan: IntervalPlan): number => phases(plan).reduce((n, p) => n + p.durationS, 0);

export interface PhaseNow {
  /** Posición en `phases(plan)`; igual a su largo cuando ya terminó todo. */
  index: number;
  phase: Phase | null;
  /** Segundos que faltan para que termine la etapa. */
  remainingS: number;
  /** Ya pasó el tiempo de todo el plan. */
  done: boolean;
}

/** En qué etapa se está a los `elapsedS` segundos de grabación. */
export function phaseAt(plan: IntervalPlan, elapsedS: number): PhaseNow {
  const list = phases(plan);
  let t = Math.max(0, elapsedS);
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (t < p.durationS) return { index: i, phase: p, remainingS: Math.ceil(p.durationS - t), done: false };
    t -= p.durationS;
  }
  return { index: list.length, phase: null, remainingS: 0, done: true };
}

/** "8 × 1:00 / 1:00", con la entrada en calor y la vuelta a la calma si las hay. */
export function describePlan(plan: IntervalPlan, clock: (s: number) => string): string {
  const core = `${plan.repeats} × ${clock(plan.workS)} / ${clock(plan.restS)}`;
  const extra = [plan.warmupS > 0 ? `+ ${clock(plan.warmupS)}` : '', plan.cooldownS > 0 ? `+ ${clock(plan.cooldownS)}` : ''].filter(Boolean).join(' ');
  return extra ? `${core} ${extra}` : core;
}

/** Planes para empezar rápido. */
export const PRESETS: { id: string; plan: IntervalPlan }[] = [
  { id: 'run1', plan: { warmupS: 300, workS: 60, restS: 60, repeats: 8, cooldownS: 300 } },
  { id: 'run2', plan: { warmupS: 300, workS: 180, restS: 90, repeats: 5, cooldownS: 300 } },
  { id: 'walkRun', plan: { warmupS: 0, workS: 60, restS: 120, repeats: 10, cooldownS: 0 } },
  { id: 'tabata', plan: { warmupS: 120, workS: 20, restS: 10, repeats: 8, cooldownS: 120 } },
];

/** Un plan válido: al menos una repetición y trabajo de al menos 5 s, nada negativo ni absurdo (máx. 99 repeticiones). */
export function validPlan(p: IntervalPlan): boolean {
  return [p.warmupS, p.workS, p.restS, p.cooldownS].every((n) => Number.isFinite(n) && n >= 0 && n <= 6 * 3600) && Number.isInteger(p.repeats) && p.repeats >= 1 && p.repeats <= 99 && p.workS >= 5;
}

/** "1:30" o "90" → segundos; null si no es un tiempo. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(t) ? Number(t) : null;
}
