import type { RiverLevel } from './watch.ts';

/**
 * Niveles de los ríos del INA (Alerta Hidrológico, API a5): una sola consulta con las series que importan.
 * https://alerta.ina.gob.ar/a5/obs/puntual/observaciones?series_id=85,14&timestart=…&timeend=…
 * Sin licencia declarada (decisión de quien dirige: se usa citando al INA).
 */
const INA = 'https://alerta.ina.gob.ar/a5/obs/puntual/observaciones';
const UA = 'VikArg-Survival-Tools/1.0';

interface Observation {
  series_id: number;
  timestart: string;
  valor: number | null;
}

/** La última lectura con valor de cada serie. */
export function latestLevels(observations: Observation[]): Map<number, RiverLevel> {
  const out = new Map<number, RiverLevel>();
  for (const o of observations) {
    if (o.valor === null || !Number.isFinite(o.valor)) continue;
    const t = Date.parse(o.timestart);
    if (!Number.isFinite(t)) continue;
    const before = out.get(o.series_id);
    if (!before || t > Date.parse(before.at)) out.set(o.series_id, { level: o.valor, at: new Date(t).toISOString() });
  }
  return out;
}

export async function fetchRiverLevels(series: number[], now = new Date()): Promise<Map<number, RiverLevel>> {
  if (!series.length) return new Map();
  const params = new URLSearchParams({
    series_id: series.join(','),
    timestart: new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10),
    timeend: new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10),
  });
  const res = await fetch(`${INA}?${params}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`INA ${res.status}`);
  return latestLevels((await res.json()) as Observation[]);
}
