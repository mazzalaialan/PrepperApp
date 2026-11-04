import { crc32, deflateSync } from 'node:zlib';
import { readIrPartial } from '../satellite/partial.ts';
import { GRID, irIndex, rainRate, RAIN_MM_H, type IrRead, type IrWindow } from './goesIr.ts';
import { latestIrFile, type IrFile } from './observer.ts';

/**
 * Mapa de lluvia estimada (infrarrojo del GOES-19) para la app: una imagen PNG
 * de la región en Mercator (los mismos límites que el mapa del tiempo), con
 * transparencia donde no llueve. Solo se arma mientras alguien mira el mapa
 * con la capa prendida: leer la región son ~5,4 MB por archivo (cada 10 min).
 */

/** Los mismos límites que el mapa de la app (app/src/modules/weathermap/projection.ts). */
export const MAP_BOUNDS = { west: -76, east: -52, south: -58, north: -21 };
const WIDTH = 720;
const R = 6_378_137;
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOf = (y: number) => (Math.atan(Math.exp(y / R)) * 360) / Math.PI - 90;

/** Colores por intensidad (mm/h), del celeste al rojo, como un radar. */
const SCALE: [number, [number, number, number, number]][] = [
  [1, [120, 200, 255, 150]],
  [2, [40, 140, 240, 175]],
  [5, [30, 190, 80, 190]],
  [10, [250, 220, 40, 200]],
  [20, [250, 140, 20, 210]],
  [40, [230, 30, 30, 220]],
];

export function colorFor(rate: number): [number, number, number, number] | null {
  if (rate < RAIN_MM_H) return null;
  let c = SCALE[0]![1];
  for (const [min, color] of SCALE) if (rate >= min) c = color;
  return c;
}

interface Lut {
  width: number;
  height: number;
  window: IrWindow;
  /** Para cada píxel de la imagen, la posición en la ventana leída (o −1 si el satélite no lo ve). */
  index: Int32Array;
}

let lut: Lut | null = null;

/** La correspondencia imagen → grilla del satélite no cambia nunca: se calcula una vez. */
export function mapLut(): Lut {
  if (lut) return lut;
  const x0 = (R * MAP_BOUNDS.west * Math.PI) / 180;
  const x1 = (R * MAP_BOUNDS.east * Math.PI) / 180;
  const y0 = mercY(MAP_BOUNDS.south);
  const y1 = mercY(MAP_BOUNDS.north);
  const width = WIDTH;
  const height = Math.round((WIDTH * (y1 - y0)) / (x1 - x0));
  const cells = new Int32Array(width * height * 2).fill(-1);
  let r0 = GRID;
  let r1 = 0;
  let c0 = GRID;
  let c1 = 0;
  for (let py = 0; py < height; py++) {
    const lat = latOf(y1 - ((py + 0.5) / height) * (y1 - y0));
    for (let px = 0; px < width; px++) {
      const lon = MAP_BOUNDS.west + ((px + 0.5) / width) * (MAP_BOUNDS.east - MAP_BOUNDS.west);
      const at = irIndex(lat, lon);
      if (!at) continue;
      const i = (py * width + px) * 2;
      cells[i] = at.row;
      cells[i + 1] = at.col;
      r0 = Math.min(r0, at.row);
      r1 = Math.max(r1, at.row + 1);
      c0 = Math.min(c0, at.col);
      c1 = Math.max(c1, at.col + 1);
    }
  }
  const window: IrWindow = [r0, r1, c0, c1];
  const index = new Int32Array(width * height).fill(-1);
  for (let p = 0; p < width * height; p++) {
    const row = cells[p * 2]!;
    if (row >= 0) index[p] = (row - r0) * (c1 - c0) + (cells[p * 2 + 1]! - c0);
  }
  lut = { width, height, window, index };
  return lut;
}

/** PNG RGBA mínimo (sin dependencias): firma, IHDR, IDAT comprimido con zlib e IEND. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // sin filtro
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Arma la imagen a partir de la ventana de la región ya leída. Devuelve también cuántos píxeles tienen lluvia. */
export function renderRainMap(read: IrRead): { png: Buffer; rainyPixels: number } {
  const { width, height, index } = mapLut();
  const raw = read.windows[0]!;
  const rgba = new Uint8Array(width * height * 4);
  let rainy = 0;
  for (let p = 0; p < width * height; p++) {
    const i = index[p]!;
    if (i < 0) continue;
    const v = raw[i]!;
    if (read.fill !== null && v === read.fill) continue;
    const color = colorFor(rainRate(v * read.scale + read.offset));
    if (!color) continue;
    rgba.set(color, p * 4);
    rainy++;
  }
  return { png: encodePng(width, height, rgba), rainyPixels: rainy };
}

export interface RainMapStore {
  /** Inicio del barrido del archivo con el que se armó. */
  at: number | null;
  key: string | null;
  png: Buffer | null;
  requestedAt: number;
}

export const createRainMapStore = (): RainMapStore => ({ at: null, key: null, png: null, requestedAt: 0 });

/** Mientras alguien mire el mapa con la capa prendida (lo pide cada 5 minutos), se sigue armando. */
export const RAIN_MAP_ACTIVE_MS = 15 * 60_000;

/** Si hay un archivo nuevo, baja la región y arma la imagen. */
export async function updateRainMap(store: RainMapStore, now = new Date(), latest: (now: Date) => Promise<IrFile | null> = latestIrFile, read = readIrPartial): Promise<{ bytes: number } | null> {
  const file = await latest(now);
  if (!file || file.key === store.key) return null;
  const { window } = mapLut();
  const result = await read(`https://noaa-goes19.s3.amazonaws.com/${file.key}`, file.size, [window]);
  store.png = renderRainMap(result.value).png;
  store.key = file.key;
  store.at = file.at;
  return { bytes: result.bytes };
}
