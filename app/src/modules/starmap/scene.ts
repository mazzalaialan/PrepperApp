import {
  equatorialToVector,
  GUIDE_STARS,
  horizontalToVector,
  localSiderealDeg,
  planetPositions,
  visiblePole,
  type PlanetId,
  type Vec3,
} from './sky';

/** Fila del catálogo: [AR°, dec°, magnitud, B−V, nombre?, HIP?]. */
export type StarRow = [number, number, number, number, string?, number?];

export interface SkyData {
  source: string;
  stars: StarRow[];
  constellations: { id: string; es: string; en: string; center: [number, number]; lines: [number, number][][] }[];
}

let cache: Promise<SkyData> | null = null;

/** El catálogo (~140 KB) se carga solo al abrir el mapa estelar. */
export function loadSkyData(): Promise<SkyData> {
  cache ??= import('./sky-data.json').then((m) => m.default as unknown as SkyData);
  return cache;
}

export interface SceneStar {
  v: Vec3;
  mag: number;
  bv: number;
  name?: string;
}

export interface Scene {
  stars: SceneStar[];
  planets: { id: PlanetId; v: Vec3 }[];
  constellations: { id: string; name: string; center: Vec3; lines: Vec3[][] }[];
  hemisphere: 'south' | 'north';
  /** Polo celeste visible y el punto del horizonte debajo (el Sur o el Norte). */
  pole: Vec3;
  horizonPoint: Vec3;
  /** Líneas de la guía para hallar el polo (Cruz del Sur y Punteros, u Osa Mayor). */
  guide: Vec3[][];
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Arco entre dos direcciones como polilínea (se ve curvo en las dos proyecciones). */
export function arc(a: Vec3, b: Vec3, steps = 24): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  });
}

export function buildScene(data: SkyData, date: Date, lat: number, lon: number, lang: string): Scene {
  const lst = localSiderealDeg(date, lon);
  const toV = (ra: number, dec: number) => equatorialToVector(ra, dec, lst, lat);
  const byHip = new Map<number, Vec3>();

  const stars: SceneStar[] = data.stars.map(([ra, dec, mag, bv, name, hip]) => {
    const v = toV(ra, dec);
    if (hip) byHip.set(hip, v);
    return { v, mag, bv, name };
  });

  const { hemisphere, pole: poleH } = visiblePole(lat);
  const pole = horizontalToVector(poleH);
  const horizonPoint = horizontalToVector({ az: poleH.az, alt: 0 });
  const star = (hip: number) => byHip.get(hip)!;

  let guide: Vec3[][];
  if (hemisphere === 'south') {
    const g = GUIDE_STARS;
    const pointersMid = norm(star(g.alphaCen).map((x, i) => x + star(g.betaCen)[i]!) as Vec3);
    guide = [
      arc(star(g.gacrux), pole), // eje largo de la Cruz, prolongado
      arc(star(g.alphaCen), star(g.betaCen)), // los Punteros
      arc(pointersMid, pole), // su mediatriz
      arc(pole, horizonPoint), // del polo al Sur en el horizonte
    ];
  } else {
    const g = GUIDE_STARS;
    guide = [arc(star(g.merak), star(g.polaris)), arc(star(g.polaris), horizonPoint)];
  }

  return {
    stars,
    planets: planetPositions(date, lat, lon).map((p) => ({ id: p.id, v: toV(p.ra, p.dec) })),
    constellations: data.constellations.map((c) => ({
      id: c.id,
      name: lang.startsWith('es') ? c.es : c.en,
      center: toV(c.center[0], c.center[1]),
      lines: c.lines.map((line) => line.map(([ra, dec]) => toV(ra, dec))),
    })),
    hemisphere,
    pole,
    horizonPoint,
    guide,
  };
}
