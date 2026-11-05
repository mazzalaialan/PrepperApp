import type { Country } from '@/core/settings/settings';
import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from './dataFile';
import type { Repeater } from './repeaters';

/**
 * Listados oficiales de repetidoras de radioaficionados publicados por el
 * Estado (información pública): por ahora Chile, el "Listado oficial de
 * repetidoras" de SUBTEL (tools/country-data/repeaters-cl.py). Viene como
 * archivo aparte que se guarda en el dispositivo y funciona sin conexión.
 */

export interface OfficialRepeater {
  call: string;
  club: string;
  band: string;
  output: number;
  offset: number;
  tone: number | null;
  region: string;
  comuna: string;
  site: string;
  /** null: el listado trae coordenadas imposibles. */
  lat: number | null;
  lon: number | null;
  granted: string;
  expires: string;
}

export interface OfficialRepeaterList {
  country: Country;
  source: string;
  url: string;
  /** Fecha del listado. */
  listedAt: string;
  items: OfficialRepeater[];
}

/** De qué países hay listado oficial, y para qué país elegido se muestra cada uno. */
const LISTS: { country: Country; for: Country[] }[] = [{ country: 'CL', for: ['CL', 'AR'] }];

/** Con otro país elegido, solo las cercanas (en la cordillera el otro país está a pocos km). */
export const NEIGHBOR_KM = 150;

export async function loadOfficialRepeaters(country: Country): Promise<OfficialRepeaterList[]> {
  const lists = LISTS.filter((l) => l.for.includes(country));
  return Promise.all(lists.map((l) => loadDataFile<OfficialRepeaterList>(`repeaters-${l.country}.json`)));
}

/** Como repetidora de la lista común, con los datos oficiales. */
export function officialAsRepeater(r: OfficialRepeater, list: OfficialRepeaterList): Repeater {
  return {
    call: r.call,
    location: [r.site, r.comuna].filter(Boolean).join(', '),
    output: r.output,
    offset: r.offset || null,
    tone: r.tone,
    mode: 'FM',
    status: '',
    lat: r.lat,
    lon: r.lon,
    region: r.region,
    official: { club: r.club, expires: r.expires, listedAt: list.listedAt, country: list.country },
  };
}

/**
 * Las oficiales que corresponden mostrar: todas las del país elegido; las de un
 * país vecino, solo a menos de `NEIGHBOR_KM` del lugar.
 */
export function officialFor(lists: OfficialRepeaterList[], country: Country, place: { lat: number; lon: number } | null): Repeater[] {
  return lists.flatMap((list) =>
    list.items
      .filter(
        (r) =>
          list.country === country ||
          (place !== null && r.lat !== null && r.lon !== null && distanceMeters(place, { lat: r.lat, lon: r.lon }) <= NEIGHBOR_KM * 1000),
      )
      .map((r) => officialAsRepeater(r, list)),
  );
}

/** Las importadas que repiten una oficial (mismo indicativo base y frecuencia) no se muestran dos veces. */
export function withoutDuplicates(imported: Repeater[], official: Repeater[]): Repeater[] {
  const base = (call: string) => call.toUpperCase().replace(/[\s/].*$/, '');
  const key = (r: Repeater) => `${base(r.call)}|${r.output.toFixed(3)}`;
  const seen = new Set(official.map(key));
  return [...official, ...imported.filter((r) => !seen.has(key(r)))];
}
