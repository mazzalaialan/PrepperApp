import { useEffect } from 'react';
import { useSettings, type Country } from '@/core/settings/settings';
import { loadEmergencyData, type EmergencyData } from './data';
import { loadPlaceFinder, placeFinder, type PlaceFinder, type PlacesData } from './places';

/**
 * Datos sin conexión del país elegido. Los de Argentina vienen con la app; los
 * de Chile y Uruguay son un paquete aparte (tools/country-data) que no va en la
 * descarga inicial: se baja la primera vez que se elige ese país y queda
 * guardado en el dispositivo (Cache Storage), así funciona sin conexión.
 */

export interface CountryData {
  emergency: EmergencyData;
  places: PlaceFinder;
}

interface CountryPackage extends EmergencyData, PlacesData {
  country: Country;
  generatedAt: string;
}

const CACHE = 'vikarg-country';

const packageUrl = (country: Country) => `${import.meta.env.BASE_URL}data/${country}.json`;

export class CountryDataError extends Error {
  constructor() {
    super('country-data-unavailable');
    this.name = 'CountryDataError';
  }
}

/** Guardado si ya se bajó; si no, se baja y se guarda. Con conexión se renueva en segundo plano. */
async function loadPackage(country: Country): Promise<CountryPackage> {
  const url = packageUrl(country);
  const cache = 'caches' in globalThis ? await caches.open(CACHE) : null;
  const stored = await cache?.match(url);
  if (stored) {
    if (navigator.onLine) {
      void fetch(url)
        .then((res) => (res.ok ? cache?.put(url, res) : undefined))
        .catch(() => undefined);
    }
    return (await stored.json()) as CountryPackage;
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new CountryDataError();
  }
  if (!res.ok) throw new CountryDataError();
  await cache?.put(url, res.clone());
  return (await res.json()) as CountryPackage;
}

const loaded = new Map<Country, Promise<CountryData>>();

/** Datos del país (una sola carga por sesión). Lanza `CountryDataError` si no hay paquete ni conexión. */
export function loadCountryData(country: Country): Promise<CountryData> {
  let pending = loaded.get(country);
  if (!pending) {
    pending =
      country === 'AR'
        ? Promise.all([loadEmergencyData(), loadPlaceFinder()]).then(([emergency, places]) => ({ emergency, places }))
        : loadPackage(country).then((pkg) => ({ emergency: pkg, places: placeFinder(pkg) }));
    // Si falla (sin conexión y sin paquete), se reintenta la próxima vez.
    pending.catch(() => loaded.delete(country));
    loaded.set(country, pending);
  }
  return pending;
}

/**
 * Baja el paquete del país elegido en segundo plano apenas hay conexión, para
 * que esté sin conexión cuando haga falta (no espera a abrir una pantalla).
 */
export function useCountryPrefetch(): void {
  const country = useSettings((s) => s.settings.country);
  useEffect(() => {
    if (country === 'AR') return;
    const fetchIt = () => void loadCountryData(country).catch(() => undefined);
    if (navigator.onLine) fetchIt();
    window.addEventListener('online', fetchIt);
    return () => window.removeEventListener('online', fetchIt);
  }, [country]);
}

/** ¿Ya está guardado el paquete del país? (Argentina siempre). */
export async function hasCountryData(country: Country): Promise<boolean> {
  if (country === 'AR') return true;
  if (!('caches' in globalThis)) return false;
  return !!(await (await caches.open(CACHE)).match(packageUrl(country)));
}
