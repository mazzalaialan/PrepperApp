/**
 * Pronóstico marítimo oficial del Servicio Meteorológico de la Armada de Chile (Directemar), por zonas de la costa: viento, mar
 * oceánico, mar en bahías, visibilidad y situación sinóptica. JSON público, con CORS abierto: la app lo pide directo con conexión
 * y guarda el último para verlo sin conexión. https://meteoarmada.directemar.cl/
 */
export interface ChileZone {
  /** Número de zona: «1», «2», …, «8.1», «8.2». */
  id: string;
  name: string;
  wind: string;
  ocean: string;
  bay: string;
  visibility: string;
  clouds: string;
  synoptic: string;
}

export interface ChileForecast {
  /** «141200 UTC» a «151200 UTC», tal como los escribe la Armada. */
  from: string;
  to: string;
  zones: ChileZone[];
  fetchedAt: number;
}

export const CHILE_MARINE_URL = 'https://meteoarmada.directemar.cl/meteo/stat/download/regionalMaritimo.json';

interface RawZone {
  'id-zona'?: number | string;
  zona?: string;
  viento?: string;
  mar_oceanico?: string;
  mar_bahia?: string;
  visibilidad?: string;
  nubosidad?: string;
  situacion_sinoptica?: string;
}

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** «MAREJADILLA A MAREJADA (1.0/2.0 M)» → «Marejadilla a marejada (1.0/2.0 m)»: la Armada lo escribe todo en mayúsculas. */
export function sentenceCase(s: string): string {
  const t = clean(s).toLowerCase();
  return t
    .replace(/(^|[.]\s+)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(kt|km|m)\b/g, (u) => u)
    .replace(/\b([nsew]{1,3})(\/[nsew]{1,3})*\b/g, (m) => m.toUpperCase());
}

export function parseChileForecast(raw: unknown, fetchedAt = Date.now()): ChileForecast | null {
  const p = (raw as { pronostico?: { periodo_validez?: { inicio?: string; fin?: string }; pronostico_detallado?: RawZone[] } } | null)?.pronostico;
  if (!p || !Array.isArray(p.pronostico_detallado)) return null;
  const zones = p.pronostico_detallado
    .filter((z) => z.zona)
    .map<ChileZone>((z) => ({
      id: String(z['id-zona'] ?? ''),
      name: clean(z.zona),
      wind: sentenceCase(z.viento ?? ''),
      ocean: sentenceCase(z.mar_oceanico ?? ''),
      bay: sentenceCase(z.mar_bahia ?? ''),
      visibility: sentenceCase(z.visibilidad ?? ''),
      clouds: sentenceCase(z.nubosidad ?? ''),
      synoptic: sentenceCase(z.situacion_sinoptica ?? ''),
    }));
  return zones.length ? { from: clean(p.periodo_validez?.inicio), to: clean(p.periodo_validez?.fin), zones, fetchedAt } : null;
}

/**
 * La zona de la costa de Chile a la que corresponde una latitud (aproximada: los límites son puntos de la costa como Coquimbo,
 * Valparaíso, Constitución, isla Mocha y Puerto Montt; el resto, hacia el sur, es solo orientativo).
 */
export function zoneIdFor(lat: number): string {
  if (lat > -29.95) return '1';
  if (lat > -33.03) return '2';
  if (lat > -35.33) return '3';
  if (lat > -38.35) return '4';
  if (lat > -41.47) return '5';
  if (lat > -46.5) return '6';
  if (lat > -52.5) return '7';
  return '8.1';
}

export async function fetchChileForecast(): Promise<ChileForecast | null> {
  const res = await fetch(CHILE_MARINE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Armada de Chile ${res.status}`);
  return parseChileForecast(await res.json());
}

const STORE = 'vikarg.chilemarine.last';
export function loadSavedChile(): ChileForecast | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as ChileForecast) : null;
  } catch {
    return null;
  }
}
export function saveChile(f: ChileForecast): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(f));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
