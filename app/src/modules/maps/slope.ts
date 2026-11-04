import { slopeZone, type SlopeZone } from '@/core/sensors/tilt';

/**
 * Pendiente del terreno para la capa de riesgo de avalancha, calculada en el
 * celular con las teselas de elevación (Terrarium) que ya se bajan con cada
 * zona: funciona sin conexión. Solo por encima de la línea de nieve
 * (snowline.ts), donde puede haber nieve acumulada. Mismas zonas que el inclinómetro
 * (core/sensors/tilt.ts): menos de 25°, verde; de 25 a 30°, amarillo; de
 * 30 a 45°, rojo óxido (rango típico de avalanchas); más de 45°, rojo.
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

/** Pendiente en grados de cada píxel (método de Horn, con los bordes repetidos). */
export function slopeDegrees(elev: Float32Array, z: number, y: number, size = SLOPE_TILE): Float32Array {
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
    }
  }
  return out;
}

export interface SlopeColors {
  low: string;
  caution: string;
  avalanche: string;
  steep: string;
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Pinta la pendiente con el color de cada zona del inclinómetro (también el
 * verde de riesgo bajo), solo por encima de la línea de nieve (`minElevation`,
 * con `elev`): abajo no hay nieve y queda sin color.
 */
export function paintSlope(slope: Float32Array, colors: SlopeColors, alpha = 190, elev?: Float32Array, minElevation = 0): Uint8ClampedArray {
  const table: Record<SlopeZone, [number, number, number] | null> = {
    low: rgb(colors.low),
    caution: rgb(colors.caution),
    avalanche: rgb(colors.avalanche),
    steep: rgb(colors.steep),
  };
  const out = new Uint8ClampedArray(slope.length * 4);
  for (let p = 0; p < slope.length; p++) {
    if (elev && elev[p]! < minElevation) continue;
    const c = table[slopeZone(slope[p]!)];
    if (!c) continue;
    out[p * 4] = c[0];
    out[p * 4 + 1] = c[1];
    out[p * 4 + 2] = c[2];
    out[p * 4 + 3] = alpha;
  }
  return out;
}

/** De una tesela Terrarium (PNG) a la tesela pintada (PNG). */
export async function slopeTile(png: ArrayBuffer, z: number, y: number, colors: SlopeColors, minElevation = 0): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([png]));
  const canvas = new OffscreenCanvas(SLOPE_TILE, SLOPE_TILE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, SLOPE_TILE, SLOPE_TILE);
  bitmap.close();
  const src = ctx.getImageData(0, 0, SLOPE_TILE, SLOPE_TILE).data;
  const elev = new Float32Array(SLOPE_TILE * SLOPE_TILE);
  for (let p = 0; p < elev.length; p++) elev[p] = terrarium(src[p * 4]!, src[p * 4 + 1]!, src[p * 4 + 2]!);
  const painted = paintSlope(slopeDegrees(elev, z, y), colors, 190, elev, minElevation);
  ctx.putImageData(new ImageData(painted as Uint8ClampedArray<ArrayBuffer>, SLOPE_TILE, SLOPE_TILE), 0, 0);
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}
