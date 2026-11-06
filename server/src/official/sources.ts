import { decode, parseCap, type CapSource, type OfficialAlert } from './cap.ts';

/**
 * Alertas oficiales de los servicios meteorológicos, en CAP (las fuentes que
 * cada país registró en la OMM, alert-hub-sources):
 * - SMN (Argentina): página RSS CAP con un enlace por alerta.
 * - DMC (Chile): RSS con el CAP de cada aviso, alerta o alarma (dominio público).
 * - INUMET (Uruguay): RSS de advertencias (dominio público).
 * Se reproducen sin cambios, con el organismo como fuente: la app no emite
 * alertas propias (ver docs/ARQUITECTURA.md, "Aclaración del SMN").
 */

export const FEEDS: Record<CapSource, { url: string; web: string }> = {
  SMN: { url: 'https://ssl.smn.gob.ar/CAP/AR.php', web: 'https://www.smn.gob.ar/alertas' },
  DMC: { url: 'https://archivos.meteochile.gob.cl/portaldmc/rss/rss.php', web: 'https://www.meteochile.gob.cl' },
  INUMET: { url: 'https://www.inumet.gub.uy/reportes/riesgo/rss.xml', web: 'https://www.inumet.gub.uy/alerta' },
};

/** Enlaces a los CAP de cada fuente: el SMN publica un RSS (o una página con "Ver XML CAP"); DMC e INUMET, un RSS. */
export function capLinks(source: CapSource, body: string): string[] {
  const links =
    source === 'SMN'
      ? // Al navegador le devuelve una página HTML; a un programa, el RSS: se toman los enlaces a los CAP de cualquiera de los dos.
        [...body.matchAll(/https:\/\/ssl\.smn\.gob\.ar\/feeds\/CAP\/[^"<\s]+\.xml/g)].map((m) => m[0])
      : [...body.matchAll(/<item>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g)].map((m) => decode(m[1]!));
  return [...new Set(links.filter((l) => /^https:\/\//.test(l)))];
}

export interface OfficialCache {
  /** CAP ya leídos (los archivos no cambian: una actualización es un archivo nuevo). */
  byUrl: Map<string, OfficialAlert[]>;
}

export const createOfficialCache = (): OfficialCache => ({ byUrl: new Map() });

const UA = { 'user-agent': 'VikArg (servidor propio; alertas oficiales)' };

async function text(url: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: UA });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/**
 * Alertas vigentes de una fuente. Baja solo los CAP nuevos (de a uno, sin
 * apuro) y olvida los que ya no figuran en el listado.
 */
export async function fetchOfficial(source: CapSource, cache: OfficialCache, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<OfficialAlert[]> {
  const feed = FEEDS[source];
  const links = capLinks(source, await text(feed.url, fetchImpl));
  const prefix = `${source}|`;
  for (const k of [...cache.byUrl.keys()]) if (k.startsWith(prefix) && !links.includes(k.slice(prefix.length))) cache.byUrl.delete(k);
  const out: OfficialAlert[] = [];
  for (const link of links) {
    let alerts = cache.byUrl.get(prefix + link);
    if (!alerts) {
      try {
        alerts = parseCap(await text(link, fetchImpl), source, feed.web);
      } catch {
        continue; // se reintenta en la próxima vuelta
      }
      cache.byUrl.set(prefix + link, alerts);
    }
    out.push(...alerts.filter((a) => Date.parse(a.expires) > now));
  }
  return out;
}
