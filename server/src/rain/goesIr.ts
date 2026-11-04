import h5wasm from 'h5wasm/node';

/**
 * Lluvia estimada propia con el infrarrojo del GOES-19 (ABI banda 13, 10,3 µm,
 * dominio público): NOAA retiró su producto de lluvia (RRQPE) el 2026-11-02 y
 * el reemplazo no está en el bucket abierto. A partir de la temperatura de
 * brillo del tope de las nubes se estima la lluvia con el Auto-Estimator de
 * NESDIS (Vicente, Scofield y Menzel, 1998). Es orientativa: los topes muy
 * fríos que no llueven (yunques de cirros) dan falsas alarmas, y la lluvia de
 * nubes bajas y tibias no se ve.
 */

// ---------- Geometría: grilla fija del GOES-R (PUG, vol. 4, §4.2.8) ----------

const A = 6_378_137;
const B = 6_356_752.31414;
const H = 35_786_023 + A;
const E2 = (A * A - B * B) / (A * A);
/** GOES-19 (GOES-East). */
export const SUB_LON = -75;
/** Ángulo de barrido de cada píxel de 2 km (rad) y del primero (ver los atributos `x` e `y` del archivo). */
const STEP = 0.000056000000768108293;
const ORIGIN = 0.15184399485588074;
export const GRID = 5424;

/** Fila y columna del disco completo para una latitud y longitud, o `null` si el satélite no ve ese punto. */
export function irIndex(lat: number, lon: number): { row: number; col: number } | null {
  const la = (lat * Math.PI) / 180;
  const dl = ((lon - SUB_LON) * Math.PI) / 180;
  const pc = Math.atan(((B * B) / (A * A)) * Math.tan(la));
  const rc = B / Math.sqrt(1 - E2 * Math.cos(pc) ** 2);
  const sx = H - rc * Math.cos(pc) * Math.cos(dl);
  const sy = -rc * Math.cos(pc) * Math.sin(dl);
  const sz = rc * Math.sin(pc);
  // Del otro lado de la Tierra (o en el borde): no se ve.
  if (H * (H - sx) < sy * sy + ((A * A) / (B * B)) * sz * sz) return null;
  const y = Math.atan(sz / sx);
  const x = Math.asin(-sy / Math.hypot(sx, sy, sz));
  const row = Math.round((ORIGIN - y) / STEP);
  const col = Math.round((x + ORIGIN) / STEP);
  if (row < 0 || col < 0 || row >= GRID || col >= GRID) return null;
  return { row, col };
}

/** Kilómetros por píxel en filas y columnas alrededor de un punto (los píxeles se estiran hacia el sur). */
export function kmPerPixel(lat: number, lon: number): { row: number; col: number } {
  const here = irIndex(lat, lon);
  const north = irIndex(lat + 0.2, lon);
  const east = irIndex(lat, lon + 0.2);
  if (!here || !north || !east) return { row: 2, col: 2 };
  const kmLat = 0.2 * 111.2;
  const kmLon = 0.2 * 111.2 * Math.cos((lat * Math.PI) / 180);
  return { row: kmLat / Math.max(1, Math.abs(here.row - north.row)), col: kmLon / Math.max(1, Math.abs(east.col - here.col)) };
}

// ---------- De temperatura a lluvia ----------

/** Por debajo de esto no se considera lluvia (equivale a topes de unos −38 °C). */
export const RAIN_MM_H = 1;
const MAX_MM_H = 72;

/** Auto-Estimator: R (mm/h) = 1,1183·10¹¹ · exp(−3,6382·10⁻² · T^1,2), con T en kelvin. */
export function rainRate(kelvin: number): number {
  if (!(kelvin > 150) || kelvin > 260) return 0;
  const r = 1.1183e11 * Math.exp(-3.6382e-2 * kelvin ** 1.2);
  return Math.min(MAX_MM_H, r);
}

// ---------- Lectura de ventanas del archivo ----------

/** Filas [r0, r1) y columnas [c0, c1) del disco completo. */
export type IrWindow = [r0: number, r1: number, c0: number, c1: number];

export interface IrRead {
  /** Valores crudos de cada ventana, fila por fila; T = valor · scale + offset. */
  windows: Int16Array[];
  scale: number;
  offset: number;
  /** Valor crudo que marca "sin dato". */
  fill: number | null;
}

/** Lee ventanas de la temperatura de brillo (variable `CMI`) de un archivo local (h5wasm ya inicializado). */
export function readIrFile(path: string, windows: IrWindow[]): IrRead {
  const file = new h5wasm.File(path, 'r');
  try {
    const cmi = file.get('CMI') as unknown as {
      slice(ranges: [number, number][]): Int16Array;
      attrs: Record<string, { value: unknown }>;
    };
    const attr = (k: string) => {
      const v = cmi.attrs[k]?.value as ArrayLike<number> | number | undefined;
      return v === undefined ? null : typeof v === 'number' ? v : (v[0] ?? null);
    };
    return {
      windows: windows.map(([r0, r1, c0, c1]) => cmi.slice([[r0, r1], [c0, c1]])),
      scale: attr('scale_factor') ?? 1,
      offset: attr('add_offset') ?? 0,
      fill: attr('_FillValue'),
    };
  } finally {
    try {
      file.close();
    } catch {
      // Ya cerrado.
    }
  }
}

// ---------- Lugares: lluvia en el punto y alrededor ----------

export interface ObservedRain {
  /** Lluvia estimada más fuerte a menos de 5 km (mm/h). */
  here: number;
  /** La más fuerte a menos de 10, 25 y 50 km. */
  within10: number;
  within25: number;
  within50: number;
}

const RADII = [5, 10, 25, 50] as const;

/** Ventana de filas y columnas que cubre 50 km alrededor de cada punto. */
export function windowFor(lat: number, lon: number): IrWindow | null {
  const c = irIndex(lat, lon);
  if (!c) return null;
  const k = kmPerPixel(lat, lon);
  const dr = Math.ceil(50 / k.row) + 1;
  const dc = Math.ceil(50 / k.col) + 1;
  return [Math.max(0, c.row - dr), Math.min(GRID, c.row + dr + 1), Math.max(0, c.col - dc), Math.min(GRID, c.col + dc + 1)];
}

/** Lluvia estimada en el punto y alrededor, a partir de la ventana leída (ver `windowFor`). */
export function observeAt(lat: number, lon: number, win: IrWindow, raw: Int16Array, read: Pick<IrRead, 'scale' | 'offset' | 'fill'>): ObservedRain | null {
  const c = irIndex(lat, lon);
  if (!c) return null;
  const k = kmPerPixel(lat, lon);
  const [r0, r1, c0, c1] = win;
  const width = c1 - c0;
  const best = [0, 0, 0, 0];
  let valid = 0;
  for (let r = r0; r < r1; r++) {
    for (let col = c0; col < c1; col++) {
      const v = raw[(r - r0) * width + (col - c0)]!;
      if (read.fill !== null && v === read.fill) continue;
      valid++;
      const rate = rainRate(v * read.scale + read.offset);
      if (rate === 0) continue;
      const km = Math.hypot((r - c.row) * k.row, (col - c.col) * k.col);
      RADII.forEach((radius, i) => {
        if (km <= radius && rate > best[i]!) best[i] = rate;
      });
    }
  }
  if (valid === 0) return null;
  const round = (x: number) => Math.round(x * 10) / 10;
  return { here: round(best[0]!), within10: round(best[1]!), within25: round(best[2]!), within50: round(best[3]!) };
}

/**
 * Junta en franjas de filas las ventanas de varios lugares: el archivo guarda
 * franjas de 24 filas a lo ancho de todo el disco, así que leer filas
 * cercanas juntas no cuesta más.
 */
export function mergeWindows(windows: IrWindow[]): IrWindow[] {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  const out: IrWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w[0] <= last[1] + 24) {
      last[1] = Math.max(last[1], w[1]);
      last[2] = Math.min(last[2], w[2]);
      last[3] = Math.max(last[3], w[3]);
    } else out.push([...w]);
  }
  return out;
}
