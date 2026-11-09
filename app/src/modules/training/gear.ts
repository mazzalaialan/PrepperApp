import type { Gear, Id, Workout, WorkoutKind } from '@/core/model/types';

/** Kilómetros de un equipo: los que ya traía más los de las actividades donde se usó. */
export function gearKm(g: Gear, workouts: Iterable<Workout>): number {
  let m = 0;
  for (const w of workouts) if (w.gearId === g.id) m += w.distanceM;
  return Math.round((g.startKm + m / 1000) * 10) / 10;
}

export interface GearWear {
  km: number;
  /** 0 a 1; null si no tiene vida útil cargada. */
  fraction: number | null;
  /** Pasó de la vida útil recomendada. */
  worn: boolean;
  /** Llegó al 90 %: conviene ir pensando en cambiarlo. */
  nearEnd: boolean;
}

export function wear(g: Gear, workouts: Iterable<Workout>): GearWear {
  const km = gearKm(g, workouts);
  if (!(g.retireKm > 0)) return { km, fraction: null, worn: false, nearEnd: false };
  const fraction = Math.min(1, km / g.retireKm);
  return { km, fraction, worn: km >= g.retireKm, nearEnd: km >= g.retireKm * 0.9 };
}

/** El equipo que se ofrece para una actividad (sin los retirados). */
export function gearFor(kind: WorkoutKind, gear: Iterable<Gear>): Gear[] {
  return [...gear].filter((g) => !g.retired && (g.kinds.length === 0 || g.kinds.includes(kind))).sort((a, b) => a.name.localeCompare(b.name));
}

/** Los km del equipo vinculado a un artículo del Inventario (null si no hay ninguno vinculado). */
export function kmForInventoryItem(itemId: Id, gear: Iterable<Gear>, workouts: Iterable<Workout>): number | null {
  const ws = [...workouts];
  const linked = [...gear].filter((g) => g.inventoryItemId === itemId);
  if (linked.length === 0) return null;
  return Math.round(linked.reduce((n, g) => n + gearKm(g, ws), 0) * 10) / 10;
}
