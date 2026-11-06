import type { OfficialAlert } from './cap.ts';

/**
 * Nubes de ceniza volcánica: SIGMET de ceniza (VA) de la región, que emiten
 * las oficinas meteorológicas de aviación de cada país (en Argentina, el SMN,
 * con el análisis del VAAC Buenos Aires). Se leen de la API abierta de la NOAA
 * (aviationweather.gov, dominio público), porque la página del VAAC tiene
 * protección anti-robots. Son avisos para la aviación: dicen dónde está la
 * nube y entre qué alturas.
 */

export const SIGMET_URL = 'https://aviationweather.gov/api/data/isigmet?format=json&hazard=va';
/** Argentina, Chile, Uruguay y alrededores. */
const REGION = { west: -82, east: -48, south: -60, north: -14 };

interface Sigmet {
  firId?: string;
  firName?: string;
  hazard?: string;
  qualifier?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  receiptTime?: string;
  base?: number | null;
  top?: number | null;
  dir?: string | null;
  spd?: string | null;
  coords?: { lat: number; lon: number }[];
  rawSigmet?: string;
}

const DIRS: Record<string, string> = { N: 'norte', NE: 'noreste', E: 'este', SE: 'sudeste', S: 'sur', SW: 'sudoeste', W: 'oeste', NW: 'noroeste' };

/** "ERUPTION MT SANGAY" → "Sangay"; "FUEGO" → "Fuego". */
function volcanoName(q = ''): string {
  const name = q.replace(/^(VA\s+)?(ERUPTION\s+)?(MT|VOLCAN|VOLCANO)?\s*/i, '').trim();
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function parseSigmets(list: Sigmet[]): OfficialAlert[] {
  return list.flatMap((s, i) => {
    if (s.hazard !== 'VA' || !s.coords || s.coords.length < 3 || !s.validTimeTo) return [];
    const inRegion = s.coords.some((c) => c.lon >= REGION.west && c.lon <= REGION.east && c.lat >= REGION.south && c.lat <= REGION.north);
    if (!inRegion) return [];
    const toGround = (s.base ?? 0) === 0;
    const topM = s.top ? Math.round((s.top * 0.3048) / 100) * 100 : null;
    const volcano = volcanoName(s.qualifier);
    const moving = s.dir && DIRS[s.dir] ? ` Se mueve hacia el ${DIRS[s.dir]}${s.spd ? ` a ${s.spd} nudos` : ''}.` : '';
    return [
      {
        key: `SIGMET:${s.firId}:${s.validTimeFrom}:${i}`,
        source: 'SIGMET' as const,
        senderName: `${s.firName ?? s.firId ?? ''} (SIGMET de aviación)`.trim(),
        event: 'Ceniza volcánica',
        headline: volcano ? `Ceniza volcánica del ${volcano}` : 'Ceniza volcánica',
        description:
          `Nube de ceniza ${toGround ? 'desde el suelo' : `desde ${Math.round(((s.base ?? 0) * 0.3048) / 100) * 100} m`}${topM ? ` hasta unos ${topM} m de altura` : ''}.${moving}` +
          (s.rawSigmet ? `\n\n${s.rawSigmet.trim()}` : ''),
        instruction: toGround ? 'Si cae ceniza: quedate adentro, cerrá puertas y ventanas, protegé el agua y usá barbijo y antiparras si tenés que salir.' : '',
        severity: toGround ? ('Severe' as const) : ('Moderate' as const),
        onset: new Date((s.validTimeFrom ?? 0) * 1000).toISOString(),
        expires: new Date(s.validTimeTo * 1000).toISOString(),
        sent: s.receiptTime ?? new Date().toISOString(),
        web: 'https://aviationweather.gov/gfa/#sigmet',
        areas: [{ desc: s.firName ?? '', polygons: [s.coords.map((c) => [c.lat, c.lon] as [number, number])] }],
      },
    ];
  });
}

export async function fetchAshSigmets(fetchImpl: typeof fetch = fetch): Promise<OfficialAlert[]> {
  const res = await fetchImpl(SIGMET_URL, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'VikArg (servidor propio; ceniza volcánica)' } });
  if (!res.ok) throw new Error(`SIGMET: ${res.status}`);
  return parseSigmets((await res.json()) as Sigmet[]);
}
