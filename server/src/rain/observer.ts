import { readIrPartial } from '../satellite/partial.ts';
import { mergeWindows, observeAt, RAIN_MM_H, windowFor, type IrWindow, type ObservedRain } from './goesIr.ts';
import type { RainOutlook } from './outlook.ts';
import type { RainPoint, RainSource } from './source.ts';

/**
 * Lluvia observada (estimada) con el infrarrojo del GOES-19 en los lugares con
 * aviso: cada 10 minutos sale un archivo de la banda 13 y se leen solo las
 * franjas de filas que cubren esos lugares (~400 KB por franja de 50 km).
 */

const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
/** Más viejo que esto, el dato no sirve para decir "está lloviendo ahora". */
const MAX_AGE_MS = 30 * 60_000;

export interface IrFile {
  key: string;
  size: number;
  /** Inicio del barrido, en milisegundos. */
  at: number;
}

const hourPrefix = (d: Date) => {
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `ABI-L2-CMIPF/${d.getUTCFullYear()}/${String(doy).padStart(3, '0')}/${String(d.getUTCHours()).padStart(2, '0')}/`;
};

/** "s20263080330211" → milisegundos UTC. */
export function startOfIrKey(key: string): number | null {
  const m = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d_/.exec(key);
  if (!m) return null;
  const [, y, doy, h, min, s] = m.map(Number) as number[];
  return Date.UTC(y!, 0, doy!, h!, min!, s!);
}

/** El archivo más nuevo de la banda 13 (disco completo), de la hora actual o la anterior. */
export async function latestIrFile(now: Date, fetchImpl: typeof fetch = fetch): Promise<IrFile | null> {
  const files: IrFile[] = [];
  for (const d of [new Date(now.getTime() - 3_600_000), now]) {
    const res = await fetchImpl(`${BUCKET}/?list-type=2&prefix=${hourPrefix(d)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    for (const m of (await res.text()).matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]*M6C13_G19[^<]*\.nc)<\/Key>/.exec(m[1]!)?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1]!)?.[1]);
      const at = key ? startOfIrKey(key) : null;
      if (key && size > 0 && at !== null) files.push({ key, size, at });
    }
  }
  return files.sort((a, b) => a.at - b.at).pop() ?? null;
}

export type IrReader = (url: string, size: number, windows: IrWindow[]) => Promise<{ value: Awaited<ReturnType<typeof readIrPartial>>['value']; bytes: number }>;

export interface IrObserver {
  /** Lluvia estimada en cada punto (en el mismo orden); `null` si no hay dato reciente. */
  observe(points: RainPoint[], now?: Date): Promise<(ObservedRain | null)[]>;
  stats(): { files: number; bytes: number };
}

export function irObserver(read: IrReader = readIrPartial, fetchImpl: typeof fetch = fetch): IrObserver {
  // Lo último leído: si el archivo no cambió, se reusa (el aviso de lluvia corre cada 15 minutos).
  let cache: { key: string; at: number; byPoint: Map<string, ObservedRain | null> } | null = null;
  const totals = { files: 0, bytes: 0 };
  const keyOf = (p: RainPoint) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

  return {
    async observe(points, now = new Date()) {
      if (points.length === 0) return [];
      const file = await latestIrFile(now, fetchImpl);
      if (!file || now.getTime() - file.at > MAX_AGE_MS) return points.map(() => null);
      if (cache?.key !== file.key) cache = { key: file.key, at: file.at, byPoint: new Map() };
      const missing = [...new Map(points.filter((p) => !cache!.byPoint.has(keyOf(p))).map((p) => [keyOf(p), p])).values()];
      if (missing.length) {
        const own = missing.map((p) => ({ p, w: windowFor(p.lat, p.lon) }));
        const merged = mergeWindows(own.flatMap((o) => (o.w ? [o.w] : [])));
        const result = merged.length ? await read(`${BUCKET}/${file.key}`, file.size, merged) : null;
        if (result) {
          totals.files++;
          totals.bytes += result.bytes;
        }
        for (const { p, w } of own) {
          const i = w && result ? merged.findIndex((m) => m[0] <= w[0] && m[1] >= w[1] && m[2] <= w[2] && m[3] >= w[3]) : -1;
          cache.byPoint.set(keyOf(p), i >= 0 ? observeAt(p.lat, p.lon, merged[i]!, result!.value.windows[i]!, result!.value) : null);
        }
      }
      return points.map((p) => cache!.byPoint.get(keyOf(p)) ?? null);
    },
    stats: () => ({ ...totals }),
  };
}

/**
 * Pronóstico + lo observado: si el satélite ve lluvia en el lugar (a menos de
 * 5 km), "está lloviendo" con la intensidad estimada, aunque el pronóstico no
 * la tuviera; si no, decide el pronóstico (que además dice si va a llover
 * pronto). Si el satélite no responde, queda solo el pronóstico.
 */
export function withObservedRain(forecast: RainSource, observer: IrObserver): RainSource {
  return {
    name: `${forecast.name}+goes-ir`,
    async outlooks(points) {
      const [fc, obs] = await Promise.all([forecast.outlooks(points), observer.observe(points).catch(() => points.map(() => null))]);
      return points.map((_, i): RainOutlook | null => {
        const o = obs[i];
        const f = fc[i] ?? null;
        if (o && o.here >= RAIN_MM_H) return { state: 'raining', mm: f && f.state !== 'dry' ? f.mm : o.here, observedMmH: o.here };
        return f;
      });
    },
  };
}
