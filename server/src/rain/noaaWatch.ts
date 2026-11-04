/**
 * NOAA retiró la lluvia estimada del GOES (ABI-L2-RRQPEF) el 2026-11-02; el
 * reemplazo (Enterprise Rainfall Rate, `ABI-L2-FLDK-RRQPE-AWIPS`) por ahora
 * solo se distribuye por PDA, no en el bucket abierto. Una vez por día se
 * revisa si aparece en `noaa-goes19` (o si el producto viejo vuelve) para
 * avisarlo en el log y en /api/health.
 */

const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
const RETIRED = 'ABI-L2-RRQPEF/';

export interface ObservedRainStatus {
  checkedAt: string | null;
  /** Productos de lluvia que hay en el bucket abierto (fuera del retirado), o el retirado si volvió a salir. */
  available: string[];
}

export const createObservedRainStatus = (): ObservedRainStatus => ({ checkedAt: null, available: [] });

const doyPrefix = (d: Date) => {
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `${d.getUTCFullYear()}/${String(doy).padStart(3, '0')}/`;
};

export async function checkObservedRain(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${BUCKET}/?list-type=2&delimiter=/`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`listado de NOAA: ${res.status}`);
  const prefixes = [...(await res.text()).matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]!);
  const found = prefixes.filter((p) => p !== RETIRED && /RRQPE|RAIN|RRATE/i.test(p));
  // ¿Volvió a salir el retirado? (archivos de hoy)
  if (prefixes.includes(RETIRED)) {
    const today = await fetchImpl(`${BUCKET}/?list-type=2&max-keys=1&prefix=${RETIRED}${doyPrefix(now)}`, { signal: AbortSignal.timeout(20_000) });
    if (today.ok && /<Key>/.test(await today.text())) found.push(RETIRED);
  }
  return found;
}
