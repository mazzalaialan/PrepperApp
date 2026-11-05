/** Cache Storage de los archivos de `public/data/` (paquetes por país, repetidoras oficiales). */
export const DATA_CACHE = 'vikarg-country';

export class CountryDataError extends Error {
  constructor() {
    super('country-data-unavailable');
    this.name = 'CountryDataError';
  }
}

/**
 * Un archivo de datos de `data/`: guardado si ya se bajó; si no, se baja y se
 * guarda. Con conexión se renueva en segundo plano.
 */
export async function loadDataFile<T>(file: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${file}`;
  const cache = 'caches' in globalThis ? await caches.open(DATA_CACHE) : null;
  const stored = await cache?.match(url);
  if (stored) {
    if (navigator.onLine) {
      void fetch(url)
        .then((res) => (res.ok ? cache?.put(url, res) : undefined))
        .catch(() => undefined);
    }
    return (await stored.json()) as T;
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new CountryDataError();
  }
  if (!res.ok) throw new CountryDataError();
  await cache?.put(url, res.clone());
  return (await res.json()) as T;
}

