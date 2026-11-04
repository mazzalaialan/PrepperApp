import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import h5wasm from 'h5wasm/node';

/**
 * Rayos del GOES-19 (GLM, NOAA, dominio público): un archivo NetCDF4 cada 20
 * segundos con los "flashes" detectados en todo el disco (unos 8 km de error,
 * ~1 minuto de demora). Se lee con h5wasm (WebAssembly, sin binarios nativos).
 */

export interface Flash {
  lat: number;
  lon: number;
  /** Milisegundos (época) del inicio del archivo. */
  at: number;
}

/** Solo se guardan los rayos de esta zona: Argentina, Chile, Uruguay y alrededores. */
export const REGION = { south: -60, north: -15, west: -82, east: -45 };

const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
const PREFIX = 'GLM-L2-LCFA';

/** "s20263080211400" → milisegundos UTC (año, día del año, hora, minuto, segundo y décima). */
export function startOfKey(key: string): number | null {
  const m = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)_/.exec(key);
  if (!m) return null;
  const [, y, doy, h, min, s, tenth] = m.map(Number) as number[];
  return Date.UTC(y!, 0, doy!, h!, min!, s!, tenth! * 100);
}

const hourPrefix = (d: Date) => {
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `${PREFIX}/${d.getUTCFullYear()}/${String(doy).padStart(3, '0')}/${String(d.getUTCHours()).padStart(2, '0')}/`;
};

export interface GlmFile {
  key: string;
  size: number;
}

/** Los archivos más nuevos (de la hora actual y la anterior), del más viejo al más nuevo. */
export async function listRecent(now: Date, fetchImpl: typeof fetch = fetch): Promise<GlmFile[]> {
  const files: GlmFile[] = [];
  for (const d of [new Date(now.getTime() - 3_600_000), now]) {
    const res = await fetchImpl(`${BUCKET}/?list-type=2&prefix=${hourPrefix(d)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]+\.nc)<\/Key>/.exec(m[1]!)?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1]!)?.[1]);
      if (key && size > 0) files.push({ key, size });
    }
  }
  return files.sort((a, b) => (startOfKey(a.key) ?? 0) - (startOfKey(b.key) ?? 0));
}

let ready: Promise<unknown> | null = null;

/** h5wasm se inicializa una vez (carga el WebAssembly). */
export async function glmReady(): Promise<void> {
  ready ??= h5wasm.ready;
  await ready;
}

/** Lee los rayos de buena calidad de la región de un archivo GLM local (h5wasm ya inicializado). */
export function readGlmFile(path: string, at: number): Flash[] {
  const file = new h5wasm.File(path, 'r');
  try {
    const lat = file.get('flash_lat') as { value: ArrayLike<number> } | null;
    const lon = file.get('flash_lon') as { value: ArrayLike<number> } | null;
    const quality = file.get('flash_quality_flag') as { value: ArrayLike<number> } | null;
    if (!lat || !lon) return [];
    const lats = lat.value;
    const lons = lon.value;
    const flags = quality?.value;
    const flashes: Flash[] = [];
    for (let i = 0; i < lats.length; i++) {
      const y = lats[i]!;
      const x = lons[i]!;
      if (flags && flags[i] !== 0) continue;
      if (y < REGION.south || y > REGION.north || x < REGION.west || x > REGION.east) continue;
      flashes.push({ lat: y, lon: x, at });
    }
    return flashes;
  } finally {
    try {
      file.close();
    } catch {
      // Tras una lectura parcial cortada el archivo puede quedar a medio abrir.
    }
  }
}

/** Los rayos de un archivo GLM completo ya bajado. */
export async function parseGlm(bytes: Uint8Array, at: number): Promise<Flash[]> {
  await glmReady();
  // h5wasm abre archivos por ruta: se escribe uno temporal y se borra enseguida.
  const path = join(tmpdir(), `glm-${randomUUID()}.nc`);
  await writeFile(path, bytes);
  try {
    return readGlmFile(path, at);
  } finally {
    await rm(path, { force: true });
  }
}

export interface GlmFeed {
  /** Baja y lee los archivos nuevos desde la última vez (como mucho `maxFiles`, los más nuevos). */
  poll(now: Date): Promise<Flash[]>;
  /** Bytes bajados de archivos (sin los listados), para el log. */
  stats(): { files: number; bytes: number; partialFailures: number };
}

/** Lectura parcial: de cada archivo baja solo las coordenadas de los rayos (ver partial.ts). */
export type PartialReader = (url: string, size: number, at: number) => Promise<{ flashes: Flash[]; bytes: number }>;

export interface GlmFeedOptions {
  /** Archivos de 20 s por pasada: con 3 cada 60 s no se pierde ninguno. */
  maxFiles: number;
  /** `null` = bajar cada archivo completo (~380 KB en vez de ~36 KB). */
  partial: PartialReader | null;
  fetchImpl?: typeof fetch;
}

/**
 * Con la lectura parcial, los tres archivos de cada minuto son ~155 MB por
 * día; completos serían ~1,6 GB. Si una lectura parcial falla, ese archivo se
 * baja completo.
 */
export function glmFeed({ maxFiles, partial, fetchImpl = fetch }: GlmFeedOptions): GlmFeed {
  let last: string | null = null;
  const totals = { files: 0, bytes: 0, partialFailures: 0 };

  async function readOne(file: GlmFile, at: number): Promise<Flash[] | null> {
    const url = `${BUCKET}/${file.key}`;
    if (partial) {
      try {
        const r = await partial(url, file.size, at);
        totals.bytes += r.bytes;
        return r.flashes;
      } catch {
        totals.partialFailures++;
      }
    }
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    totals.bytes += bytes.length;
    return parseGlm(bytes, at);
  }

  return {
    async poll(now) {
      const files = await listRecent(now, fetchImpl);
      const fresh = (last ? files.filter((f) => f.key > last!) : files).slice(-maxFiles);
      const flashes: Flash[] = [];
      for (const file of fresh) {
        const at = startOfKey(file.key);
        if (at === null) continue;
        const got = await readOne(file, at);
        if (!got) continue;
        flashes.push(...got);
        totals.files++;
      }
      // Si se saltearon archivos (por `maxFiles`), se sigue desde el más nuevo.
      if (files.length) last = files.reduce((a, f) => (f.key > a ? f.key : a), last ?? files[0]!.key);
      return flashes;
    },
    stats: () => ({ ...totals }),
  };
}
