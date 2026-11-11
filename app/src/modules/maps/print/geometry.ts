/**
 * Geometría de la hoja del mapa topográfico impreso: escalas, cuadrícula, barra de escala, zoom del mapa
 * para una escala real y diseño de la hoja A4. Todo en milímetros de papel o metros del terreno.
 */
export const MM_PER_INCH = 25.4;
/** Papeles que se pueden elegir: A4 y Oficio (el de la Argentina: 216 × 330 mm). Medidas en milímetros, en vertical. */
export const PAPERS = { a4: { w: 210, h: 297, label: 'A4' }, oficio: { w: 216, h: 330, label: 'Oficio' } } as const;
export type PaperId = keyof typeof PAPERS;
export const SCALES = [10_000, 15_000, 25_000, 50_000, 75_000, 100_000, 150_000, 250_000] as const;
export const DEFAULT_DPI = 300;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const M_PER_DEG_LAT = 111_320;

/** Metros del terreno que representa una distancia en el papel. */
export const groundMeters = (paperMm: number, scale: number) => (paperMm * scale) / 1000;
/** Milímetros de papel que ocupa una distancia del terreno. */
export const paperMm = (meters: number, scale: number) => (meters * 1000) / scale;

/** Separación de las líneas de la cuadrícula UTM: 500 m a 1:10.000, 1 km hasta 1:50.000, 2 km hasta 1:100.000 y 5 km más allá. */
export function gridStepM(scale: number): number {
  if (scale <= 12_500) return 500;
  if (scale <= 60_000) return 1000;
  if (scale <= 120_000) return 2000;
  return 5000;
}

/** Rótulo de la cuadrícula, por ejemplo «1 km × 1 km». */
export function gridLabel(scale: number): string {
  const step = gridStepM(scale);
  const txt = step >= 1000 ? `${step / 1000} km` : `${step} m`;
  return `${txt} × ${txt}`;
}

/** Equivalencia de la escala: «1 cm = 250 m». */
export function scaleEquivalence(scale: number): string {
  const m = groundMeters(10, scale);
  return `1 cm = ${m >= 1000 ? `${+(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`}`;
}

/** Largo redondo (1, 2 o 5 × 10^k metros) para la barra de escala, de unos 40 a 70 mm en el papel. */
export function scaleBar(scale: number): { meters: number; mm: number } {
  const target = groundMeters(55, scale);
  const pow = 10 ** Math.floor(Math.log10(target));
  const candidates = [1, 2, 5, 10].map((k) => k * pow);
  const meters = candidates.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best));
  return { meters, mm: paperMm(meters, scale) };
}

/** Paso de las marcas de latitud y longitud en el borde (grados): el menor de la lista con al menos `minMm` entre marcas. */
export function latLonStepDeg(scale: number, minMm = 30): number {
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 30].map((min) => min / 60);
  const degPerMm = groundMeters(1, scale) / M_PER_DEG_LAT;
  return steps.find((s) => s / degPerMm >= minMm) ?? steps[steps.length - 1]!;
}

/** Zoom de MapLibre (teselas de 512 px) para que un píxel de pantalla mida lo que corresponde a `scale` impreso a `dpi`. */
export function zoomForScale(lat: number, scale: number, dpi = DEFAULT_DPI, pixelRatio = dpi / 96): number {
  const metersPerDevicePx = (scale * MM_PER_INCH) / 1000 / dpi;
  const metersPerCssPx = metersPerDevicePx * pixelRatio;
  return Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * metersPerCssPx));
}

/** Valores de este y norte (múltiplos de `step`) que caen dentro del rectángulo. */
export function gridLines(minE: number, maxE: number, minN: number, maxN: number, step: number): { eastings: number[]; northings: number[] } {
  const range = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  };
  return { eastings: range(minE, maxE), northings: range(minN, maxN) };
}

export type Orientation = 'portrait' | 'landscape';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  orientation: Orientation;
  paper: { w: number; h: number };
  margin: number;
  /** Franja del título, arriba. */
  header: Rect;
  /** El mapa, con su marco. */
  map: Rect;
  /** Tabla de piernas: abajo en vertical, a la derecha en horizontal. */
  table: Rect;
  /** Franja con escala, cuadrícula, norte y atribuciones, abajo. */
  footer: Rect;
}

/**
 * Diseño de la hoja A4 en milímetros. En vertical la tabla va debajo del mapa y su alto depende de la cantidad de filas;
 * en horizontal va a la derecha, con ancho fijo.
 */
export function sheetLayout(orientation: Orientation, legRows: number, paperId: PaperId = 'a4'): SheetLayout {
  const margin = 10;
  const size = PAPERS[paperId];
  const paper = orientation === 'portrait' ? { w: size.w, h: size.h } : { w: size.h, h: size.w };
  const headerH = 14;
  const footerH = 30;
  const rowH = 5.2;
  const innerW = paper.w - 2 * margin;
  const header: Rect = { x: margin, y: margin, w: innerW, h: headerH };
  const footer: Rect = { x: margin, y: paper.h - margin - footerH, w: innerW, h: footerH };
  // 5 mm arriba y abajo del marco para los rótulos de longitud y de la cuadrícula.
  const top = header.y + headerH + 5;
  const bottom = footer.y - 5;
  if (orientation === 'landscape') {
    // A la derecha del mapa quedan 14 mm para los rótulos de latitud antes de la tabla.
    const tableW = 74;
    const map: Rect = { x: margin, y: top, w: innerW - tableW - 14, h: bottom - top };
    return { orientation, paper, margin, header, map, table: { x: map.x + map.w + 14, y: top, w: tableW, h: bottom - top }, footer };
  }
  const tableH = Math.min(95, 12 + Math.max(1, legRows) * rowH);
  // 7 mm entre el mapa y la tabla para los rótulos de longitud.
  const map: Rect = { x: margin, y: top, w: innerW, h: bottom - top - tableH - 7 };
  return { orientation, paper, margin, header, map, table: { x: margin, y: map.y + map.h + 7, w: innerW, h: tableH }, footer };
}

/** Si una zona de `extentEastM × extentNorthM` metros entra en el marco del mapa a una escala, con un margen en el papel. */
export function fitsScale(extentEastM: number, extentNorthM: number, frame: { w: number; h: number }, scale: number, padMm = 8): boolean {
  return paperMm(extentEastM, scale) + 2 * padMm <= frame.w && paperMm(extentNorthM, scale) + 2 * padMm <= frame.h;
}

/**
 * Escala más grande (la de más detalle) de la lista con la que entra una zona de `extentEastM × extentNorthM` metros en el marco del mapa,
 * con un margen en papel. Devuelve null si no entra ni a la escala menor.
 */
export function pickScale(extentEastM: number, extentNorthM: number, frame: { w: number; h: number }, padMm = 8): number | null {
  for (const s of SCALES) {
    if (fitsScale(extentEastM, extentNorthM, frame, s, padMm)) return s;
  }
  return null;
}

/** Equidistancia de las curvas de nivel que dibuja el mapa a un zoom (las mismas que fija protocols.ts): la fina y la destacada, en metros. */
export function contourInterval(zoom: number): { minor: number; major: number } {
  const table: Record<number, [number, number]> = { 9: [500, 1000], 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 14: [10, 50] };
  const z = Math.min(14, Math.max(9, Math.floor(zoom)));
  const [minor, major] = table[z]!;
  return { minor, major };
}

/**
 * Marcas sobre un borde del mapa: dadas muestras ordenadas (posición en el borde y valor de la coordenada ahí), devuelve dónde
 * el valor pasa por un múltiplo de `step` (interpolando). Sirve para las marcas de latitud y longitud cuando el mapa está girado.
 */
export function edgeTicks(samples: { pos: number; value: number }[], step: number): { pos: number; value: number }[] {
  const out: { pos: number; value: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a.value === b.value) continue;
    const lo = Math.min(a.value, b.value);
    const hi = Math.max(a.value, b.value);
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
      if (v < lo - 1e-12) continue;
      const t = (v - a.value) / (b.value - a.value);
      if (t >= 0 && t < 1) out.push({ pos: a.pos + (b.pos - a.pos) * t, value: Math.round(v / step) * step });
    }
  }
  return out;
}
