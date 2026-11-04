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
 * Pendiente en grados de cada píxel (método de Horn, con los bordes
 * repetidos). Si se pasa `aspect`, también hacia dónde mira la ladera (rumbo
 * de 0 a 360°, 0 = norte).
 */
export function slopeDegrees(elev: Float32Array, z: number, y: number, size = SLOPE_TILE, aspect?: Float32Array): Float32Array {
  const out = new Float32Array(size * size);
  const at = (px: number, py: number) => elev[Math.min(size - 1, Math.max(0, py)) * size + Math.min(size - 1, Math.max(0, px))]!;
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
  /** Rayas de las laderas cargadas por viento. */
  hatch?: string;
}

export interface PaintOptions {
  alpha?: number;
  /** Altura de cada píxel y línea de nieve: debajo queda sin color. */
  elev?: Float32Array;
  minElevation?: number;
  /** Orientación de cada píxel y orientaciones de sotavento a rayar. */
  aspect?: Float32Array;
  lee?: number[];
  /** Posición de la tesela en píxeles, para que las rayas sigan de una tesela a otra. */
  originX?: number;
  originY?: number;
  size?: number;
}

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
  const { alpha = 190, elev, minElevation = 0, aspect, lee = [], originX = 0, originY = 0, size = Math.round(Math.sqrt(slope.length)) } = options;
  const hatch = colors.hatch && aspect && lee.length > 0 ? rgb(colors.hatch) : null;
  const table: Record<SlopeZone, [number, number, number] | null> = {
    low: rgb(colors.low),
    caution: rgb(colors.caution),
    avalanche: rgb(colors.avalanche),
    steep: rgb(colors.steep),
  };
  const out = new Uint8ClampedArray(slope.length * 4);
  for (let p = 0; p < slope.length; p++) {
    if (elev && elev[p]! < minElevation) continue;
    let c = table[slopeZone(slope[p]!)];
    if (!c) continue;
    let a = alpha;
    if (hatch && slope[p]! >= HATCH_MIN_DEG && isLee(aspect![p]!, lee)) {
      const gx = originX + (p % size);
      const gy = originY + Math.floor(p / size);
      if ((gx + gy) % HATCH_EVERY < HATCH_WIDTH) {
        c = hatch;
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

/** De una tesela Terrarium (PNG) a la tesela pintada (PNG). */
export async function slopeTile(png: ArrayBuffer, z: number, x: number, y: number, colors: SlopeColors, minElevation = 0, lee: number[] = []): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([png]));
  const canvas = new OffscreenCanvas(SLOPE_TILE, SLOPE_TILE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, SLOPE_TILE, SLOPE_TILE);
  bitmap.close();
  const src = ctx.getImageData(0, 0, SLOPE_TILE, SLOPE_TILE).data;
  const elev = new Float32Array(SLOPE_TILE * SLOPE_TILE);
  for (let p = 0; p < elev.length; p++) elev[p] = terrarium(src[p * 4]!, src[p * 4 + 1]!, src[p * 4 + 2]!);
  const aspect = lee.length > 0 ? new Float32Array(elev.length) : undefined;
  const slope = slopeDegrees(elev, z, y, SLOPE_TILE, aspect);
  const painted = paintSlope(slope, colors, { elev, minElevation, aspect, lee, originX: x * SLOPE_TILE, originY: y * SLOPE_TILE, size: SLOPE_TILE });
  ctx.putImageData(new ImageData(painted as Uint8ClampedArray<ArrayBuffer>, SLOPE_TILE, SLOPE_TILE), 0, 0);
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}
