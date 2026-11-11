import { bearingDeg, distanceMeters, type LatLon } from '@/core/geo/geo';
import { fromUtm, toUtm } from '@/core/geo/utm';
import { fitsScale, type Orientation, type SheetLayout, SCALES, sheetLayout } from './geometry';

/**
 * Planificación de la hoja (sin dibujar nada ni cargar el motor de mapas): qué escalas y orientaciones entran para una ruta.
 * Sirve para el cuadro de opciones del botón «Imprimir mapa topográfico».
 */

export interface TopoPoint {
  n: number;
  name: string;
  lat: number;
  lon: number;
}
export interface TopoLeg {
  from: number;
  to: number;
  distanceM: number;
  /** Rumbo geográfico (respecto del norte verdadero), en grados. */
  bearingTrueDeg: number | null;
  /** Rumbo magnético (el que marca la brújula), en grados. */
  bearingMagDeg: number | null;
  ascentM?: number;
  descentM?: number;
}
export interface TopoSheetInput {
  title: string;
  subtitle?: string;
  /** Fecha (ISO) que se imprime. */
  date: string;
  /** La ruta, en orden. */
  line: LatLon[];
  points: TopoPoint[];
  legs: TopoLeg[];
  /** Declinación magnética en el centro (este positivo) y su año. */
  declinationDeg: number;
  declinationYear: number;
  /** Escala (denominador); sin valor, la de más detalle a la que entra la ruta. */
  scale?: number;
  /** Sin valor o 'auto': la que mejor aprovecha la hoja para la escala elegida. */
  orientation?: Orientation | 'auto';
  /** Además de la cuadrícula UTM, marcas de latitud y longitud dentro del marco (apagado por defecto). */
  latLonTicks?: boolean;
}

export interface SheetPlan {
  scale: number | null;
  layout: SheetLayout;
  center: LatLon;
  zone: number;
  /** Tamaño de la zona de la ruta en metros (este y norte). */
  extentM: { east: number; north: number };
}

/** Escala por defecto de la hoja. */
export const DEFAULT_SCALE = 50_000;

/** Zona de la ruta en metros UTM (este y norte), su centro y la zona UTM. */
function routeExtent(input: TopoSheetInput) {
  const all: LatLon[] = [...input.line, ...input.points.map((p) => ({ lat: p.lat, lon: p.lon }))];
  if (!all.length) throw new Error('NO_ROUTE');
  const mid = { lat: (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2, lon: (Math.min(...all.map((p) => p.lon)) + Math.max(...all.map((p) => p.lon))) / 2 };
  const zone = toUtm(mid).zone;
  const u = all.map((p) => toUtm(p, zone));
  const minE = Math.min(...u.map((p) => p.easting));
  const maxE = Math.max(...u.map((p) => p.easting));
  const minN = Math.min(...u.map((p) => p.northing));
  const maxN = Math.max(...u.map((p) => p.northing));
  const center = fromUtm({ zone, hemisphere: mid.lat < 0 ? 'S' : 'N', easting: (minE + maxE) / 2, northing: (minN + maxN) / 2 });
  return { zone, center, extentM: { east: maxE - minE, north: maxN - minN } };
}

export interface ScaleChoice {
  scale: number;
  /** Si la ruta entra en la hoja a esta escala. */
  fits: boolean;
  /** Orientación con la que entra (la preferida, o la otra si solo así entra). */
  orientation: Orientation;
}

/**
 * Todas las escalas con su disponibilidad para esta ruta: sirve para grisar en el cuadro de opciones las que no entran.
 * Con orientación automática se prueba primero la que sigue la forma de la ruta y después la otra.
 */
export function scaleChoices(input: TopoSheetInput): ScaleChoice[] {
  const { extentM } = routeExtent(input);
  const natural: Orientation = extentM.east > extentM.north ? 'landscape' : 'portrait';
  const pref = input.orientation && input.orientation !== 'auto' ? [input.orientation] : [natural, natural === 'portrait' ? 'landscape' : 'portrait'];
  return SCALES.map((scale) => {
    for (const orientation of pref as Orientation[]) {
      const frame = sheetLayout(orientation, input.legs.length + 1).map;
      if (fitsScale(extentM.east, extentM.north, frame, scale)) return { scale, fits: true, orientation };
    }
    return { scale, fits: false, orientation: pref[0] as Orientation };
  });
}

/** Decide escala, diseño y centro de la hoja sin dibujar nada. */
export function planSheet(input: TopoSheetInput): SheetPlan {
  const { zone, center, extentM } = routeExtent(input);
  const choices = scaleChoices(input);
  // Por defecto 1:50.000 (la más usada en montaña); más lejos solo si la ruta no entra a esa escala, y nunca con más detalle salvo que se pida.
  // Una escala pedida que no entra deja la hoja sin escala (NO_FIT).
  const chosen = input.scale ? choices.find((c) => c.scale === input.scale && c.fits) : choices.find((c) => c.fits && c.scale >= DEFAULT_SCALE);
  const orientation = chosen?.orientation ?? choices[0]?.orientation ?? 'portrait';
  return { scale: chosen?.scale ?? null, layout: sheetLayout(orientation, input.legs.length + 1), center, zone, extentM };
}

/** Piernas de una lista de puntos en orden: distancia y rumbo magnético (rumbo verdadero menos la declinación). */
export function legsBetween(points: TopoPoint[], declinationDeg: number): TopoLeg[] {
  return points.slice(1).map((b, i) => {
    const a = points[i]!;
    const true_ = bearingDeg(a, b);
    return { from: a.n, to: b.n, distanceM: distanceMeters(a, b), bearingTrueDeg: true_, bearingMagDeg: (((true_ - declinationDeg) % 360) + 360) % 360 };
  });
}
