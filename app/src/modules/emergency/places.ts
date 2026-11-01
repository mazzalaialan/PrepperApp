/**
 * Nomenclátor de localidades argentinas (Georef, incluido en la app): ubica un
 * lugar por su nombre, sin conexión. Lo usan las repetidoras importadas sin
 * coordenadas, que solo traen "Localidad - detalle".
 */

export interface PlaceMatch {
  lat: number;
  lon: number;
  /** "Avellaneda, Buenos Aires": para que se vea qué se eligió. */
  label: string;
}

interface PlacesData {
  provinces: string[];
  /** [nombre, provincia, lat, lon, relevancia] ordenados de mayor a menor relevancia. */
  places: [string, number, number, number, number][];
}

export const normPlace = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\bs(ta)?\.\s*/g, (_, a: string | undefined) => (a ? 'santa ' : 'san '))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Palabras que importan ("San Fernando Valle de Catamarca" ≈ "San Fernando del Valle de Catamarca"). */
const words = (n: string) => n.split(' ').filter((w) => !/^(de|del|la|las|los|el)$/.test(w));

export interface PlaceFinder {
  find(text: string): PlaceMatch | null;
  /** Si la región ("Argentina", "Santa Fe", "Texas"…) está cubierta por el nomenclátor. */
  covers(region: string): boolean;
  /**
   * La localidad más cercana con al menos esa relevancia (ver tools/places-data):
   * 2000 = cualquier pueblo (no paraje); 3000 = parte de una ciudad o con población conocida.
   */
  nearestTown(lat: number, lon: number, minRank?: number): PlaceMatch | null;
}

/** Desde esta relevancia es una localidad (pueblo o ciudad), no un paraje. */
const TOWN_RANK = 2000;

/** Arma el buscador a partir de los datos (separado para poder probarlo sin cargar el archivo). */
export function placeFinder(data: PlacesData): PlaceFinder {
  const byName = new Map<string, number[]>();
  const names = data.places.map((p, i) => {
    const n = normPlace(p[0]);
    const list = byName.get(n);
    if (list) list.push(i);
    else byName.set(n, [i]);
    return n;
  });
  const provinces = data.provinces.map(normPlace);

  const covers = (region: string) => {
    const r = normPlace(region);
    return !r || r === 'argentina' || provinces.includes(r);
  };

  function nearestTown(lat: number, lon: number, minRank = TOWN_RANK): PlaceMatch | null {
    let best = -1;
    let bestD = Infinity;
    const k = Math.cos((lat * Math.PI) / 180);
    data.places.forEach((p, i) => {
      if (p[4] < minRank) return;
      const d = (p[2] - lat) ** 2 + ((p[3] - lon) * k) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best < 0 ? null : result(best);
  }

  return { find, covers, nearestTown };

  function find(text: string): PlaceMatch | null {
    const t = normPlace(text);
    if (!t) return null;
    const segments = text.split(/\s+-\s+|,/).map(normPlace).filter(Boolean);
    // "San Justo, Santa Fe": la provincia nombrada desempata.
    const hinted = new Set(provinces.flatMap((p, i) => (t.includes(p) && p !== segments[0] ? [i] : [])));
    const pick = (ids: number[]) => ids.find((i) => hinted.has(data.places[i]![1])) ?? ids[0]!;

    for (const s of [t, ...segments]) {
      // ", Santa Fe" al final es la provincia, no la ciudad.
      if (s !== segments[0] && provinces.includes(s)) continue;
      const ids = byName.get(s);
      if (ids) return result(pick(ids));
    }
    // "Bariloche" → "San Carlos de Bariloche", "Metan" → "San José de Metán" (solo pueblos y ciudades).
    const first = segments[0] ?? t;
    if (first.length >= 5) {
      const wanted = words(first);
      const ids: number[] = [];
      names.forEach((n, i) => {
        if (data.places[i]![4] < 2000) return;
        const have = words(n);
        if (wanted.every((w) => have.includes(w))) ids.push(i);
      });
      if (ids.length) return result(pick(ids));
    }
    return null;
  }

  function result(i: number): PlaceMatch {
    const [name, prov, lat, lon] = data.places[i]!;
    return { lat, lon, label: `${name}, ${data.provinces[prov]}` };
  }
}

let finder: Promise<PlaceFinder> | null = null;

/** Carga el nomenclátor solo cuando hace falta (≈ 550 kB). */
export function loadPlaceFinder() {
  finder ??= import('./places-ar.json').then((m) => placeFinder(m.default as unknown as PlacesData));
  return finder;
}
