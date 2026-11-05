import { slopeZone, type SlopeZone } from '@/core/sensors/tilt';
import { isLee } from './wind';

/**
 * Pendiente del terreno para la capa de riesgo de avalancha, calculada en el
 * celular con las teselas de elevación (Terrarium) que ya se bajan con cada
 * zona: funciona sin conexión. Solo por encima de la línea de nieve
 * (snowline.ts), donde puede haber nieve acumulada. Mismas zonas que el inclinómetro
 * (core/sensors/tilt.ts): menos de 25°, verde; de 25 a 30°, amarillo; de
 * 30 a 45°, rojo óxido (rango típico de avalanchas); más de 45°, rojo.
 * Las laderas de sotavento (cargadas por el viento, ver wind.ts) van rayadas.
 */

export const SLOPE_TILE = 256;
const EARTH = 40_075_016.686;

/** Altura en metros de un píxel Terrarium. */
export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** Metros por píxel de una tesela en la fila `py` (Mercator: se achica hacia los polos). */
export function metersPerPixel(z: number, y: number, py: number, size = SLOPE_TILE): number {
  const n = Math.PI - (2 * Math.PI * (y + (py + 0.5) / size)) / 2 ** z;
  const lat = Math.atan(Math.sinh(n));
  return (EARTH * Math.cos(lat)) / (size * 2 ** z);
}

/**
 * Pendiente en grados de cada píxel (método de Horn). Si se pasa `aspect`,
 * también hacia dónde mira la ladera (rumbo de 0 a 360°, 0 = norte).
 * `elev` puede traer `pad` píxeles de más alrededor (de las teselas vecinas);
 * sin margen, los bordes se repiten.
 */
export function slopeDegrees(elev: Float32Array, z: number, y: number, size = SLOPE_TILE, aspect?: Float32Array, pad = 0): Float32Array {
  const out = new Float32Array(size * size);
  const n = size + 2 * pad;
  const at = (px: number, py: number) => elev[Math.min(n - 1, Math.max(0, py + pad)) * n + Math.min(n - 1, Math.max(0, px + pad))]!;
  for (let py = 0; py < size; py++) {
    const m = metersPerPixel(z, y, py, size);
    for (let px = 0; px < size; px++) {
      const a = at(px - 1, py - 1), b = at(px, py - 1), c = at(px + 1, py - 1);
      const d = at(px - 1, py), f = at(px + 1, py);
      const g = at(px - 1, py + 1), h = at(px, py + 1), i = at(px + 1, py + 1);
      const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * m);
      const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * m);
      out[py * size + px] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      // Baja hacia el lado contrario al gradiente; dzdy crece hacia el sur.
      if (aspect) aspect[py * size + px] = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
    }
  }
  return out;
}

export interface SlopeColors {
  low: string;
  caution: string;
  avalanche: string;
  steep: string;
  extreme: string;
  /** Rayas de las laderas cargadas por viento en los últimos días. */
  hatch?: string;
  /** Rayas (en la otra diagonal) del sotavento habitual. */
  hatchUsual?: string;
}

export interface PaintOptions {
  alpha?: number;
  /** Altura de cada píxel y línea de nieve: debajo queda sin color. */
  elev?: Float32Array;
  minElevation?: number;
  /** Orientación de cada píxel y orientaciones de sotavento a rayar: de los últimos días y el habitual. */
  aspect?: Float32Array;
  lee?: number[];
  leeUsual?: number[];
  /** Posición de la tesela en píxeles, para que las rayas sigan de una tesela a otra. */
  originX?: number;
  originY?: number;
  size?: number;
}

/** Rayas en colores de nieve, iguales en todos los temas: blanca la carga reciente, azul la habitual. */
export const HATCH_RECENT = '#ffffff';
export const HATCH_USUAL = '#2f7de1';

/** Cada cuántos píxeles una raya, y su ancho. */
export const HATCH_EVERY = 6;
const HATCH_WIDTH = 2;
/** Solo se rayan las laderas donde la placa puede desprenderse. */
const HATCH_MIN_DEG = 25;

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Pinta la pendiente con el color de cada zona del inclinómetro (también el
 * verde de riesgo bajo), solo por encima de la línea de nieve (`minElevation`,
 * con `elev`): abajo no hay nieve y queda sin color. Las laderas de 25° o más
 * que miran a sotavento (`lee`, con `aspect`) llevan rayas diagonales.
 */
export function paintSlope(slope: Float32Array, colors: SlopeColors, options: PaintOptions = {}): Uint8ClampedArray {
  const { alpha = 190, elev, minElevation = 0, aspect, lee = [], leeUsual = [], originX = 0, originY = 0, size = Math.round(Math.sqrt(slope.length)) } = options;
  const hatch = colors.hatch && aspect && lee.length > 0 ? rgb(colors.hatch) : null;
  const hatchUsual = colors.hatchUsual && aspect && leeUsual.length > 0 ? rgb(colors.hatchUsual) : null;
  const table: Record<SlopeZone, [number, number, number] | null> = {
    low: rgb(colors.low),
    caution: rgb(colors.caution),
    avalanche: rgb(colors.avalanche),
    steep: rgb(colors.steep),
    extreme: rgb(colors.extreme),
  };
  const out = new Uint8ClampedArray(slope.length * 4);
  for (let p = 0; p < slope.length; p++) {
    if (elev && elev[p]! < minElevation) continue;
    let c = table[slopeZone(slope[p]!)];
    if (!c) continue;
    let a = alpha;
    if ((hatch || hatchUsual) && slope[p]! >= HATCH_MIN_DEG) {
      const gx = originX + (p % size);
      const gy = originY + Math.floor(p / size);
      // Reciente en una diagonal y habitual en la otra: donde coinciden, se cruzan.
      if (hatch && (gx + gy) % HATCH_EVERY < HATCH_WIDTH && isLee(aspect![p]!, lee)) {
        c = hatch;
        a = 255;
      } else if (hatchUsual && (((gx - gy) % HATCH_EVERY) + HATCH_EVERY) % HATCH_EVERY < HATCH_WIDTH && isLee(aspect![p]!, leeUsual)) {
        c = hatchUsual;
        a = 255;
      }
    }
    out[p * 4] = c[0];
    out[p * 4 + 1] = c[1];
    out[p * 4 + 2] = c[2];
    out[p * 4 + 3] = a;
  }
  return out;
}

/** Altura de cada píxel de una tesela Terrarium (PNG). */
export async function decodeTerrarium(png: ArrayBuffer): Promise<Float32Array> {
  const bitmap = await createImageBitmap(new Blob([png]));
  const canvas = new OffscreenCanvas(SLOPE_TILE, SLOPE_TILE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, SLOPE_TILE, SLOPE_TILE);
  bitmap.close();
  const src = ctx.getImageData(0, 0, SLOPE_TILE, SLOPE_TILE).data;
  const elev = new Float32Array(SLOPE_TILE * SLOPE_TILE);
  for (let p = 0; p < elev.length; p++) elev[p] = terrarium(src[p * 4]!, src[p * 4 + 1]!, src[p * 4 + 2]!);
  return elev;
}

/** Pesos de Catmull-Rom para los 4 vecinos de un punto a `t` (0..1) del segundo. */
function catmullRom(t: number, w: Float32Array, o: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  w[o] = (-t3 + 2 * t2 - t) / 2;
  w[o + 1] = (3 * t3 - 5 * t2 + 2) / 2;
  w[o + 2] = (-3 * t3 + 4 * t2 + t) / 2;
  w[o + 3] = (t3 - t2) / 2;
}

/**
 * Altura de una tesela de zoom mayor que el de la elevación, interpolada
 * (bicúbica) de la tesela de menor zoom: la superficie queda suave, sin
 * escalones, y la pendiente cambia de a poco en lugar de en cuadrados.
 * `sample(gx, gy)` da la altura de un píxel de la elevación (en píxeles
 * globales de su zoom); `originX/Y` es dónde empieza la tesela en esos píxeles
 * y `scale` cuántos píxeles de la tesela caben en uno de la elevación.
 * Devuelve (size + 2·pad)² alturas, con `pad` de margen alrededor.
 */
export function upsampleElevation(sample: (gx: number, gy: number) => number, originX: number, originY: number, scale: number, size = SLOPE_TILE, pad = 1): Float32Array {
  const n = size + 2 * pad;
  const base = new Int32Array(n);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = (i - pad + 0.5) / scale - 0.5;
    const f = Math.floor(s);
    base[i] = f;
    catmullRom(s - f, w, i * 4);
  }
  const out = new Float32Array(n * n);
  for (let py = 0; py < n; py++) {
    const gy = originY + base[py]! - 1;
    for (let px = 0; px < n; px++) {
      const gx = originX + base[px]! - 1;
      let v = 0;
      for (let j = 0; j < 4; j++) {
        const wy = w[py * 4 + j]!;
        let row = 0;
        for (let i = 0; i < 4; i++) row += w[px * 4 + i]! * sample(gx + i, gy + j);
        v += wy * row;
      }
      out[py * n + px] = v;
    }
  }
  return out;
}

export interface SlopeStyle {
  colors: SlopeColors;
  minElevation?: number;
  lee?: number[];
  leeUsual?: number[];
}

/** Pinta una tesela a partir de su altura (con `pad` de margen) y la devuelve como PNG. */
export async function paintSlopeTile(elev: Float32Array, z: number, x: number, y: number, style: SlopeStyle, pad = 0): Promise<ArrayBuffer> {
  const { colors, minElevation = 0, lee = [], leeUsual = [] } = style;
  const size = SLOPE_TILE;
  const aspect = lee.length > 0 || leeUsual.length > 0 ? new Float32Array(size * size) : undefined;
  const slope = slopeDegrees(elev, z, y, size, aspect, pad);
  let inner = elev;
  if (pad > 0) {
    const n = size + 2 * pad;
    inner = new Float32Array(size * size);
    for (let py = 0; py < size; py++) inner.set(elev.subarray((py + pad) * n + pad, (py + pad) * n + pad + size), py * size);
  }
  const painted = paintSlope(slope, colors, { elev: inner, minElevation, aspect, lee, leeUsual, originX: x * size, originY: y * size, size });
  const canvas = new OffscreenCanvas(size, size);
  canvas.getContext('2d')!.putImageData(new ImageData(painted as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}

/** De una tesela Terrarium (PNG) a la tesela pintada (PNG), en el mismo zoom. */
export async function slopeTile(png: ArrayBuffer, z: number, x: number, y: number, colors: SlopeColors, minElevation = 0, lee: number[] = [], leeUsual: number[] = []): Promise<ArrayBuffer> {
  return paintSlopeTile(await decodeTerrarium(png), z, x, y, { colors, minElevation, lee, leeUsual });
}

/**
 * Altura de una tesela de zoom `z` mayor que el de la elevación (`demZoom`),
 * interpolada de la tesela que la contiene. Si la tesela toca un borde, usa
 * también las vecinas (para que no se noten las costuras); si alguna vecina
 * falta, repite el borde. `null` si falta la tesela que la contiene.
 */
export async function overzoomElevation(
  z: number,
  x: number,
  y: number,
  demZoom: number,
  load: (x: number, y: number) => Promise<Float32Array | null>,
  pad = 1,
  size = SLOPE_TILE,
): Promise<Float32Array | null> {
  const k = 2 ** (z - demZoom);
  const cx = Math.floor(x / k);
  const cy = Math.floor(y / k);
  const originX = (x * size) / k;
  const originY = (y * size) / k;
  // Píxeles de la elevación que hacen falta: los de la tesela, el margen y los 2 vecinos de la interpolación.
  const lo = Math.floor((0.5 - pad) / k - 0.5) - 1;
  const hi = Math.floor((size + pad - 0.5) / k - 0.5) + 2;
  const n = 2 ** demZoom;
  const wanted = new Map<string, [number, number]>();
  for (let ty = Math.floor((originY + lo) / size); ty <= Math.floor((originY + hi) / size); ty++) {
    for (let tx = Math.floor((originX + lo) / size); tx <= Math.floor((originX + hi) / size); tx++) {
      if (ty >= 0 && ty < n) wanted.set(`${tx},${ty}`, [tx, ty]);
    }
  }
  const tiles = new Map<string, Float32Array>();
  await Promise.all(
    [...wanted].map(async ([key, [tx, ty]]) => {
      const t = await load(((tx % n) + n) % n, ty).catch(() => null);
      if (t) tiles.set(key, t);
    }),
  );
  const center = tiles.get(`${cx},${cy}`);
  if (!center) return null;
  const sample = (gx: number, gy: number) => {
    const tx = Math.floor(gx / size);
    const ty = Math.floor(gy / size);
    const t = tiles.get(`${tx},${ty}`);
    if (t) return t[(gy - ty * size) * size + (gx - tx * size)]!;
    const px = Math.min(size - 1, Math.max(0, gx - cx * size));
    const py = Math.min(size - 1, Math.max(0, gy - cy * size));
    return center[py * size + px]!;
  };
  return upsampleElevation(sample, originX, originY, k, size, pad);
}
