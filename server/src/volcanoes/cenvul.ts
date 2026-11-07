import type { VolcanoAlert, VolcanoLevel } from './oavv.ts';

/**
 * Nivel de alerta de los volcanes de Perú: Centro Vulcanológico Nacional
 * (CENVUL) del Instituto Geofísico del Perú. Su página trae, en los datos con
 * que se arma (Nuxt, "__NUXT_DATA__"), el color de alerta de cada uno de los
 * volcanes que vigila. Se devuelven los que no están en verde, como el OAVV.
 */

export const CENVUL_URL = 'https://cenvul.igp.gob.pe/';
const UA = { 'user-agent': 'VikArg (servidor propio; alertas volcánicas)' };

/** Volcanes que vigila el CENVUL (Smithsonian GVP). */
const PLACES: Record<string, { lat: number; lon: number; name: string }> = {
  sabancaya: { name: 'Sabancaya', lat: -15.787, lon: -71.857 },
  ubinas: { name: 'Ubinas', lat: -16.345, lon: -70.897 },
  misti: { name: 'Misti', lat: -16.299, lon: -71.406 },
  coropuna: { name: 'Coropuna', lat: -15.52, lon: -72.65 },
  ticsani: { name: 'Ticsani', lat: -16.759, lon: -70.598 },
  chachani: { name: 'Chachani', lat: -16.191, lon: -71.53 },
  yucamane: { name: 'Yucamane', lat: -17.184, lon: -70.196 },
  tutupaca: { name: 'Tutupaca', lat: -17.026, lon: -70.372 },
  'sara sara': { name: 'Sara Sara', lat: -15.33, lon: -73.45 },
  huaynaputina: { name: 'Huaynaputina', lat: -16.614, lon: -70.854 },
  casiri: { name: 'Casiri', lat: -17.485, lon: -69.789 },
  auquihuato: { name: 'Auquihuato', lat: -15.073, lon: -73.191 },
  purupuruni: { name: 'Purupuruni', lat: -17.317, lon: -69.9 },
  quimsachata: { name: 'Quimsachata', lat: -14.131, lon: -71.363 },
};

const LEVELS: Record<string, VolcanoLevel> = { verde: 'green', amarillo: 'yellow', amarilla: 'yellow', naranja: 'orange', rojo: 'red', roja: 'red' };

/** Datos de Nuxt ("devalue"): un arreglo plano donde los objetos apuntan a otros elementos por índice. */
function resolve(flat: unknown[], i: number, depth = 0): unknown {
  const v = flat[i];
  if (depth > 20) return null;
  if (Array.isArray(v)) {
    if (typeof v[0] === 'string' && /^(Shallow)?(Reactive|Ref)$/.test(v[0])) return resolve(flat, v[1] as number, depth + 1);
    return v.map((x) => (typeof x === 'number' ? resolve(flat, x, depth + 1) : x));
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? resolve(flat, x, depth + 1) : x]));
  return v;
}

export function parseCenvul(html: string): VolcanoAlert[] {
  const raw = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error('CENVUL: la página no trae los datos de los volcanes');
  const flat = JSON.parse(raw) as unknown[];
  // Dentro de "data", la entrada "status-volcanos" apunta a { data: [{ name, status: { color } }] }.
  const index = flat.findIndex((v) => v && typeof v === 'object' && !Array.isArray(v) && 'status-volcanos' in v);
  if (index < 0) throw new Error('CENVUL: no se encontró el estado de los volcanes');
  const ref = (flat[index] as Record<string, number>)['status-volcanos']!;
  const list = ((resolve(flat, ref) as { data?: { name?: string; status?: { color?: string } }[] })?.data ?? []) as { name?: string; status?: { color?: string } }[];
  if (!list.length) throw new Error('CENVUL: lista de volcanes vacía');
  return list.flatMap((v) => {
    const level = LEVELS[(v.status?.color ?? '').toLowerCase().trim()];
    const at = PLACES[(v.name ?? '').toLowerCase().trim()];
    if (!level || level === 'green' || !at) return [];
    return [{ name: `VOLCÁN ${at.name.toUpperCase()}`, country: 'Perú', level, lat: at.lat, lon: at.lon, report: CENVUL_URL, source: 'CENVUL' as const }];
  });
}

export async function fetchCenvul(fetchImpl: typeof fetch = fetch): Promise<VolcanoAlert[]> {
  const res = await fetchImpl(CENVUL_URL, { signal: AbortSignal.timeout(30_000), headers: UA });
  if (!res.ok) throw new Error(`CENVUL: ${res.status}`);
  return parseCenvul(await res.text());
}
