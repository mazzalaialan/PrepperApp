import { simplifyRing } from './store.ts';
import type { CapSeverity, OfficialAlert } from './cap.ts';

/**
 * Alertas de los servicios meteorológicos de Bolivia y Perú. Ninguno publica
 * CAP (no están en el registro de la OMM), así que se leen sus datos abiertos
 * y se pasan al mismo formato que las CAP. Se reproducen tal cual, con el
 * organismo como fuente: la app no emite alertas propias.
 *
 * - SENAMHI Bolivia: el JSON de alertas vigentes que usa su página
 *   (sin clave): color, evento, fechas, texto y la zona en GeoJSON.
 * - SENAMHI Perú: la tabla de avisos de su página (número, título, fechas,
 *   nivel) y las zonas de cada aviso, por día y nivel, de su servicio de mapas
 *   (GeoServer WFS de la IDE del SENAMHI).
 */

const UA = { 'user-agent': 'VikArg (servidor propio; alertas oficiales)' };

async function get(url: string, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000), headers: UA });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
}

/** Zonas más livianas (~1 km): los polígonos originales pesan varios MB por aviso. */
const lighten = (rings: [number, number][][]) => rings.map((r) => simplifyRing(r, 0.01)).filter((r) => r.length >= 4);

/** "LLUVIA CON TORMENTA ELÉCTRICA" → "Lluvia con tormenta eléctrica" (los dos publican en mayúsculas). */
export function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}

// ---------- Bolivia ----------

export const SENAMHI_BO_URL = 'https://senamhi.gob.bo/index.php/api/alertas/active-alerts';
export const SENAMHI_BO_WEB = 'https://senamhi.gob.bo';
const BO_SENDER = 'Servicio Nacional de Meteorología e Hidrología (SENAMHI Bolivia)';

const BO_SEVERITY: Record<string, CapSeverity> = { VERDE: 'Minor', AMARILLA: 'Moderate', NARANJA: 'Severe', ROJA: 'Extreme' };

interface BoAlert {
  id: number;
  code?: string;
  date?: [string, string];
  status?: string;
  description?: string;
  publicationDate?: string;
  ForecastTypeAlert?: { alertType?: string };
  ForecastTypeEvent?: { eventType?: string };
  ForecastArea?: { description?: string }[];
  dropArea?: { type: string; coordinates: number[][][] | number[][][][] };
}

/** Anillos [lat, lon] de un Polygon o MultiPolygon de GeoJSON ([lon, lat]); solo el borde de cada polígono. */
function geoRings(g: BoAlert['dropArea']): [number, number][][] {
  if (!g) return [];
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
  return polys.map((p) => (p[0] ?? []).map(([lon, lat]) => [lat!, lon!] as [number, number]));
}

export function parseSenamhiBo(json: unknown): OfficialAlert[] {
  const list = ((json as { data?: { data?: BoAlert[] } })?.data?.data ?? []) as BoAlert[];
  return list.flatMap((a) => {
    if (a.status && a.status !== 'Aprobado') return [];
    const [from, to] = a.date ?? [];
    if (!from || !to) return [];
    const color = (a.ForecastTypeAlert?.alertType ?? '').toUpperCase().trim();
    const event = sentence(a.ForecastTypeEvent?.eventType ?? 'Alerta');
    const areas = (a.ForecastArea ?? []).map((x) => (x.description ?? '').trim()).filter(Boolean);
    return [
      {
        key: `SENAMHI_BO:${a.id}`,
        source: 'SENAMHI_BO' as const,
        senderName: BO_SENDER,
        event,
        headline: `Alerta ${color.toLowerCase()} ${a.code ? `N.° ${a.code} ` : ''}· ${event}`,
        description: [a.description?.trim(), ...areas].filter(Boolean).join('\n'),
        instruction: '',
        severity: BO_SEVERITY[color] ?? 'Unknown',
        // Las fechas son días completos en la hora de Bolivia (UTC−4).
        onset: new Date(`${from}T00:00:00-04:00`).toISOString(),
        expires: new Date(`${to}T23:59:59-04:00`).toISOString(),
        sent: a.publicationDate ?? new Date().toISOString(),
        web: SENAMHI_BO_WEB,
        areas: [{ desc: areas.join(' ').slice(0, 300), polygons: lighten(geoRings(a.dropArea)) }],
      },
    ];
  });
}

export async function fetchSenamhiBo(fetchImpl: typeof fetch = fetch): Promise<OfficialAlert[]> {
  const now = Date.now();
  return parseSenamhiBo(await (await get(SENAMHI_BO_URL, fetchImpl)).json()).filter((a) => Date.parse(a.expires) > now);
}

// ---------- Perú ----------

const PE_BASE = 'https://www.senamhi.gob.pe/';
export const SENAMHI_PE_LIST = `${PE_BASE}?p=aviso-meteorologico`;
const PE_WFS = 'https://idesep.senamhi.gob.pe/geoserver/g_aviso/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_aviso:view_aviso&outputFormat=application/json';
const PE_SENDER = 'Servicio Nacional de Meteorología e Hidrología del Perú (SENAMHI)';
/** Nivel del SENAMHI: 1 verde (sin peligro), 2 amarillo, 3 naranja, 4 rojo. */
const PE_SEVERITY: Record<number, CapSeverity> = { 2: 'Moderate', 3: 'Severe', 4: 'Extreme' };
const PE_COLOR: Record<number, string> = { 2: 'amarillo', 3: 'naranja', 4: 'rojo' };

export interface PeAviso {
  number: number;
  title: string;
  issued: string;
  web: string;
  /** Mapas del aviso (uno por día, o por tramo). */
  maps: number[];
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-z]+);/gi, (m, n: string) => ({ oacute: 'ó', aacute: 'á', eacute: 'é', iacute: 'í', uacute: 'ú', ntilde: 'ñ', amp: '&', nbsp: ' ' })[n.toLowerCase()] ?? m)
    .trim();

/** Avisos emitidos o vigentes de la tabla de la página (los cancelados no figuran como tales). */
export function parsePeList(html: string): PeAviso[] {
  const maps = new Map<number, Set<number>>();
  for (const m of html.matchAll(/mapa-avisos-meteorologicos\/(?:tabMapa|index)\.php\?av=(\d+)&(?:amp;)?nl=\d+&(?:amp;)?mp=(\d+)/g)) {
    const set = maps.get(Number(m[1])) ?? new Set();
    set.add(Number(m[2]));
    maps.set(Number(m[1]), set);
  }
  const out: PeAviso[] = [];
  for (const row of html.matchAll(/<tr>\s*(<td[\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]!);
    if (cells.length < 7) continue;
    const nro = strip(cells[1]!);
    const m = nro.match(/^(\d+)\s*\((emitido|vigente)\)/i);
    if (!m) continue;
    const title = strip(cells[0]!);
    if (/cancelad/i.test(title)) continue;
    const href = cells[0]!.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? '';
    const number = Number(m[1]);
    out.push({
      number,
      title,
      issued: strip(cells[2]!),
      web: href ? new URL(href, PE_BASE).toString() : SENAMHI_PE_LIST,
      maps: [...(maps.get(number) ?? [])].sort((a, b) => a - b),
    });
  }
  return out;
}

interface PeFeature {
  properties: { nivel?: string; fech_ini?: string; fech_fin?: string; nro_mapa?: number };
  geometry: { type: string; coordinates: number[][][] | number[][][][] } | null;
}

/** Zonas de un mapa de un aviso: una alerta por nivel (2, 3 o 4), con su vigencia. */
export function peAlerts(aviso: PeAviso, features: PeFeature[]): OfficialAlert[] {
  const byLevel = new Map<number, { rings: [number, number][][]; from: string; to: string; map: number }>();
  for (const f of features) {
    const level = Number(f.properties.nivel?.match(/\d/)?.[0]);
    if (!PE_SEVERITY[level] || !f.properties.fech_fin) continue;
    const entry = byLevel.get(level) ?? { rings: [], from: f.properties.fech_ini ?? aviso.issued, to: f.properties.fech_fin, map: f.properties.nro_mapa ?? 1 };
    entry.rings.push(...geoRings(f.geometry as BoAlert['dropArea']));
    byLevel.set(level, entry);
  }
  const event = sentence(aviso.title.replace(/\s*\((extensi[oó]n|aviso)[^)]*\)\s*$/i, ''));
  return [...byLevel].map(([level, e]) => ({
    key: `SENAMHI_PE:${aviso.number}:${e.map}:${level}`,
    source: 'SENAMHI_PE' as const,
    senderName: PE_SENDER,
    event,
    headline: `Aviso N.° ${aviso.number}, nivel ${PE_COLOR[level]} · ${event}`,
    description: `${sentence(aviso.title)}. Aviso meteorológico N.° ${aviso.number} del SENAMHI, emitido el ${aviso.issued}. El texto completo está en la página del SENAMHI.`,
    instruction: '',
    severity: PE_SEVERITY[level]!,
    onset: new Date(e.from).toISOString(),
    expires: new Date(e.to).toISOString(),
    sent: new Date(`${aviso.issued}T00:00:00-05:00`).toISOString(),
    web: aviso.web,
    areas: [{ desc: '', polygons: lighten(e.rings) }],
  }));
}

/** Un aviso tiene a lo sumo unos pocos días (mapas). */
const MAX_MAPS = 7;

export interface PeCache {
  /** Zonas ya bajadas por "aviso_mapa_año" (no cambian una vez emitido el aviso). */
  maps: Map<string, PeFeature[]>;
}

export const createPeCache = (): PeCache => ({ maps: new Map() });

export async function fetchSenamhiPe(cache: PeCache, fetchImpl: typeof fetch = fetch): Promise<OfficialAlert[]> {
  const avisos = parsePeList(await (await get(SENAMHI_PE_LIST, fetchImpl)).text());
  const wanted = new Set<string>();
  const out: OfficialAlert[] = [];
  const now = Date.now();
  for (const aviso of avisos) {
    const year = aviso.issued.slice(0, 4);
    // Un mapa por día (o tramo) del aviso: se piden 1, 2, 3… hasta el primero vacío.
    const known = aviso.maps.length ? aviso.maps : null;
    for (let map = 1; map <= (known ? Math.max(...known) : MAX_MAPS); map++) {
      const id = `${aviso.number}_${map}_${year}`;
      wanted.add(id);
      let features = cache.maps.get(id);
      if (!features) {
        try {
          const json = (await (await get(`${PE_WFS}&viewparams=qry:${id}`, fetchImpl)).json()) as { features?: PeFeature[] };
          // Se guardan ya simplificadas: los originales pesan unos 2 MB por mapa.
          features = (json.features ?? []).map((f) => ({
            properties: f.properties,
            geometry: f.geometry && { type: 'MultiPolygon', coordinates: lighten(geoRings(f.geometry as BoAlert['dropArea'])).map((r) => [r.map(([lat, lon]) => [lon, lat])]) },
          }));
        } catch {
          break; // se reintenta en la próxima vuelta
        }
        cache.maps.set(id, features);
      }
      if (!features.length && !known) break;
      out.push(...peAlerts(aviso, features).filter((a) => Date.parse(a.expires) > now));
    }
  }
  for (const k of [...cache.maps.keys()]) if (!wanted.has(k)) cache.maps.delete(k);
  return out;
}
