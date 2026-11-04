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

/** Los archivos más nuevos (de la hora actual y la anterior), del más viejo al más nuevo. */
export async function listRecent(now: Date, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const keys: string[] = [];
  for (const d of [new Date(now.getTime() - 3_600_000), now]) {
    const res = await fetchImpl(`${BUCKET}/?list-type=2&prefix=${hourPrefix(d)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+\.nc)<\/Key>/g)) keys.push(m[1]!);
  }
  return keys.sort((a, b) => (startOfKey(a) ?? 0) - (startOfKey(b) ?? 0));
}

let ready: Promise<unknown> | null = null;

/** Los rayos de buena calidad de un archivo GLM, solo los de la región. */
export async function parseGlm(bytes: Uint8Array, at: number): Promise<Flash[]> {
  ready ??= h5wasm.ready;
  await ready;
  // h5wasm abre archivos por ruta: se escribe uno temporal y se borra enseguida.
  const path = join(tmpdir(), `glm-${randomUUID()}.nc`);
  await writeFile(path, bytes);
  try {
    const file = new h5wasm.File(path, 'r');
    try {
      const lat = file.get('flash_lat') as { value: ArrayLike<number> } | null;
      const lon = file.get('flash_lon') as { value: ArrayLike<number> } | null;
      const quality = file.get('flash_quality_flag') as { value: ArrayLike<number> } | null;
      if (!lat || !lon) return [];
      const flashes: Flash[] = [];
      for (let i = 0; i < lat.value.length; i++) {
        const y = lat.value[i]!;
        const x = lon.value[i]!;
        if (quality && quality.value[i] !== 0) continue;
        if (y < REGION.south || y > REGION.north || x < REGION.west || x > REGION.east) continue;
        flashes.push({ lat: y, lon: x, at });
      }
      return flashes;
    } finally {
      file.close();
    }
  } finally {
    await rm(path, { force: true });
  }
}

export interface GlmFeed {
  /** Baja y lee los archivos nuevos desde la última vez (como mucho `maxFiles`, los más nuevos). */
  poll(now: Date): Promise<Flash[]>;
}

/**
 * Para no bajar ~1,6 GB por día se lee por defecto un archivo por pasada (20 s
 * de cada minuto, ~550 MB por día): alcanza para ver una tormenta activa, que
 * da varios rayos por minuto.
 */
export function glmFeed(maxFiles = 1, fetchImpl: typeof fetch = fetch): GlmFeed {
  let last: string | null = null;
  return {
    async poll(now) {
      const keys = await listRecent(now, fetchImpl);
      const fresh = (last ? keys.filter((k) => k > last!) : keys).slice(-maxFiles);
      const flashes: Flash[] = [];
      for (const key of fresh) {
        const at = startOfKey(key);
        if (at === null) continue;
        const res = await fetchImpl(`${BUCKET}/${key}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) continue;
        flashes.push(...(await parseGlm(new Uint8Array(await res.arrayBuffer()), at)));
        last = key;
      }
      // Si se saltearon archivos (por `maxFiles`), se sigue desde el más nuevo.
      if (keys.length) last = keys.reduce((a, b) => (b > a ? b : a), last ?? keys[0]!);
      return flashes;
    },
  };
}
