import { useSettings } from '@/core/settings/settings';
/** Cache Storage de los archivos de `public/data/` (paquetes por país, repetidoras oficiales). */
export const DATA_CACHE = 'vikarg-country';

export class CountryDataError extends Error {
  constructor() {
    super('country-data-unavailable');
    this.name = 'CountryDataError';
  }
}

const keyUrl = (file: string) => new URL(`${import.meta.env.BASE_URL}data/${file}`, location.href).href;
/** Fecha de generación del archivo (`generatedAt`, AAAA-MM-DD); vacía si no tiene. */
const dateOf = (d: unknown): string => (d && typeof d === 'object' && 'generatedAt' in d ? String((d as { generatedAt: unknown }).generatedAt) : '');
const serverBase = () => useSettings.getState().settings.serverUrl?.trim().replace(/\/+$/, '') || null;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Con conexión, busca copias más nuevas: la que viene con la app y la del
 * servidor propio (que vuelve a generar los paquetes cada mes, ver
 * server/src/data/update-data.sh). Guarda la más nueva para la próxima vez.
 */
async function refresh(file: string, current: unknown, cache: Cache | null): Promise<void> {
  if (!cache || !navigator.onLine) return;
  const server = serverBase();
  const [fromApp, fromServer] = await Promise.all([fetchJson(keyUrl(file)), server ? fetchJson(`${server}/api/data/${file}`) : null]);
  let best = current;
  // La de la app reemplaza si es más nueva o si ninguna tiene fecha (archivos viejos, como antes).
  if (fromApp && (dateOf(fromApp) > dateOf(best) || (!dateOf(fromApp) && !dateOf(best)))) best = fromApp;
  // La del servidor, solo si es más nueva.
  if (fromServer && dateOf(fromServer) > dateOf(best)) best = fromServer;
  if (best !== current) await cache.put(keyUrl(file), new Response(JSON.stringify(best), { headers: { 'content-type': 'application/json' } }));
}

/**
 * Un archivo de datos de `data/`: guardado si ya se bajó; si no, se baja y se
 * guarda. Con conexión, en segundo plano, se queda con la copia más nueva
 * (la de la app o la del servidor propio).
 */
export async function loadDataFile<T>(file: string): Promise<T> {
  const url = keyUrl(file);
  const cache = 'caches' in globalThis ? await caches.open(DATA_CACHE) : null;
  const stored = await cache?.match(url);
  if (stored) {
    const data = (await stored.json()) as T;
    void refresh(file, data, cache).catch(() => undefined);
    return data;
  }
  let data: unknown = await fetchJson(url);
  const server = serverBase();
  if (server && navigator.onLine) {
    const fromServer = await fetchJson(`${server}/api/data/${file}`);
    if (fromServer && dateOf(fromServer) > dateOf(data)) data = fromServer;
  }
  if (data === null) throw new CountryDataError();
  await cache?.put(url, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
  return data as T;
}

/**
 * Datos que vienen dentro de la app (por ejemplo, los parques de Argentina):
 * si el servidor propio tiene una copia más nueva, se guarda y se usa esa.
 */
export async function preferNewer<T>(file: string, bundled: T): Promise<T> {
  const cache = 'caches' in globalThis ? await caches.open(DATA_CACHE) : null;
  const stored = await cache?.match(keyUrl(file));
  let best: T = bundled;
  if (stored) {
    const data = (await stored.json().catch(() => null)) as T | null;
    if (data && dateOf(data) > dateOf(bundled)) best = data;
  }
  const server = serverBase();
  if (cache && server && navigator.onLine) {
    void fetchJson(`${server}/api/data/${file}`).then((c) => (c && dateOf(c) > dateOf(best) ? cache.put(keyUrl(file), new Response(JSON.stringify(c), { headers: { 'content-type': 'application/json' } })) : undefined));
  }
  return best;
}
