import type { WeightEntry } from '@/core/model/types';

/** Historial de peso ordenado por día (el más viejo primero; a igual día, el último que se cargó). */
export function sortedWeights(entries: Iterable<WeightEntry>): WeightEntry[] {
  return [...entries].sort((a, b) => a.day.localeCompare(b.day) || a.updatedAt.localeCompare(b.updatedAt));
}

export interface WeightSummary {
  /** El último peso cargado, o null si no hay. */
  current: number | null;
  /** Diferencia con el primero del historial (kg), o null con menos de dos registros. */
  sinceStart: number | null;
  /** Diferencia con el de hace unos 30 días (el último registro de hace 30 días o más), o null si no hay tan viejo. */
  last30: number | null;
  min: number | null;
  max: number | null;
}

const DAY_MS = 86_400_000;

export function summarize(list: WeightEntry[], today = new Date()): WeightSummary {
  if (list.length === 0) return { current: null, sinceStart: null, last30: null, min: null, max: null };
  const current = list.at(-1)!.kg;
  const cutoff = new Date(today.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);
  const old = [...list].reverse().find((e) => e.day <= cutoff);
  const kgs = list.map((e) => e.kg);
  return {
    current,
    sinceStart: list.length > 1 ? Math.round((current - list[0]!.kg) * 10) / 10 : null,
    last30: old ? Math.round((current - old.kg) * 10) / 10 : null,
    min: Math.min(...kgs),
    max: Math.max(...kgs),
  };
}

/** Un peso válido: de 20 a 400 kg (acepta coma decimal); null si no lo es. */
export function parseKg(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 20 && n <= 400 ? Math.round(n * 10) / 10 : null;
}

/** Hoy como AAAA-MM-DD en hora local. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type BmiCategory = 'low' | 'normal' | 'overweight' | 'obese';

/** Índice de masa corporal (kg/m²) con un decimal; null si falta el peso o la altura (50 a 250 cm). */
export function bmi(kg: number | null, heightCm: number | null): number | null {
  if (!kg || !heightCm || heightCm < 50 || heightCm > 250) return null;
  const m = heightCm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
}

/** Categoría de la OMS para adultos (menos de 18,5 bajo; hasta 24,9 normal; hasta 29,9 sobrepeso; desde 30 obesidad). */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return 'low';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  return 'obese';
}
