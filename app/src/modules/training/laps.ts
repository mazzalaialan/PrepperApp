import type { LapMark } from '@/core/model/types';

export interface LapRow {
  n: number;
  /** Segundos y metros de esa vuelta (la diferencia con la anterior marca). */
  timeS: number;
  distanceM: number;
  /** Segundos por km de esa vuelta; 0 si no hay distancia. */
  paceSPerKm: number;
}

/** De las marcas acumuladas (tiempo y distancia de toda la sesión) a las vueltas sueltas. */
export function lapRows(marks: LapMark[] | undefined): LapRow[] {
  let prevS = 0;
  let prevM = 0;
  return (marks ?? []).map((m, i) => {
    const timeS = Math.max(0, m.elapsedS - prevS);
    const distanceM = Math.max(0, m.distanceM - prevM);
    prevS = m.elapsedS;
    prevM = m.distanceM;
    return { n: i + 1, timeS, distanceM, paceSPerKm: distanceM > 0 ? (timeS / distanceM) * 1000 : 0 };
  });
}

/** La más rápida (menor tiempo) y la más lenta, para resaltarlas; null con menos de dos vueltas. */
export function fastestSlowest(rows: LapRow[]): { fastest: number; slowest: number } | null {
  if (rows.length < 2) return null;
  const byTime = [...rows].sort((a, b) => a.timeS - b.timeS);
  return { fastest: byTime[0]!.n, slowest: byTime.at(-1)!.n };
}
