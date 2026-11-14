/**
 * Niveles medidos de los mareógrafos del IOC (Sea Level Station Monitoring Facility, VLIZ): `GET /api/ioc/:code`.
 * La clave (`IOC_API_KEY`) vive solo en el servidor; la app nunca la ve. Los términos del IOC piden registro y uso no comercial.
 * Se pide a la API v2 (`/v2/stations/{code}/data`, encabezado X-API-KEY) y se devuelve un solo sensor, cada 10 minutos.
 */
export interface IocLevels {
  code: string;
  sensor: string;
  /** Cuándo lo leyó el servidor (ms). */
  fetchedAt: number;
  /** [instante en ms, nivel en m sobre el cero propio del sensor]. Sin relación con el nivel medio de la marea calculada. */
  points: [number, number][];
}

interface Raw {
  slevel: number | null;
  stime: string;
  sensor: string;
}

const API = 'https://api.ioc-sealevelmonitoring.org';
/** Sensores de nivel del mar por preferencia: radar (y su secundario), presión de agua, flotador, presión. */
const PREFER = ['rad', 'ra2', 'pwl', 'flt', 'prs', 'ecs', 'enc'];
export const WINDOW_MS = 30 * 3_600_000;
export const STEP_MS = 10 * 60_000;

/** Elige el sensor con más lecturas válidas (a igualdad, el de mejor preferencia) y lo adelgaza a un punto cada 10 minutos. */
export function reduceReadings(raw: Raw[]): { sensor: string; points: [number, number][] } | null {
  const bySensor = new Map<string, [number, number][]>();
  for (const r of raw) {
    if (r.slevel == null || !Number.isFinite(r.slevel) || r.slevel < -50 || r.slevel > 50) continue;
    const ms = Date.parse(r.stime.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ms)) continue;
    const list = bySensor.get(r.sensor) ?? [];
    list.push([ms, r.slevel]);
    bySensor.set(r.sensor, list);
  }
  let best: string | null = null;
  for (const [sensor, list] of bySensor) {
    if (list.length < 6) continue;
    const cur = best ? bySensor.get(best)!.length : -1;
    const rank = (s: string) => (PREFER.includes(s) ? PREFER.indexOf(s) : 99);
    if (list.length > cur * 1.2 || (list.length >= cur * 0.8 && rank(sensor) < rank(best!))) best = sensor;
  }
  if (!best) return null;
  const sorted = bySensor.get(best)!.sort((a, b) => a[0] - b[0]);
  // Promedio de cada tramo de 10 minutos: quita el ruido de las olas sin perder la marea.
  const buckets = new Map<number, number[]>();
  for (const [ms, v] of sorted) {
    const b = Math.floor(ms / STEP_MS) * STEP_MS;
    (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(v);
  }
  const points = [...buckets].map(([b, vs]) => [b + STEP_MS / 2, Number((vs.reduce((a, c) => a + c, 0) / vs.length).toFixed(3))] as [number, number]);
  return { sensor: best, points };
}

function isoMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export async function fetchIocLevels(code: string, apiKey: string, now = Date.now(), fetcher: typeof fetch = fetch): Promise<IocLevels> {
  const url = `${API}/v2/stations/${encodeURIComponent(code)}/data?timestart=${isoMinute(now - WINDOW_MS)}&timestop=${isoMinute(now)}&limit=20000`;
  const res = await fetcher(url, { headers: { 'X-API-KEY': apiKey, 'user-agent': 'VikArg-Survival-Tools/1.0' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`IOC respondió ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('IOC devolvió algo inesperado');
  const reduced = reduceReadings(body as Raw[]);
  if (!reduced) throw new Error('sin lecturas recientes');
  return { code, sensor: reduced.sensor, fetchedAt: now, points: reduced.points };
}
