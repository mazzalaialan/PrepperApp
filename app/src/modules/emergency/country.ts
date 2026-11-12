import { useEffect } from 'react';
import { useSettings, type Country } from '@/core/settings/settings';
import { loadEmergencyData, loadParksCL, loadParksFile, type EmergencyData } from './data';
import { prefetchServices } from './services';
import { DATA_CACHE as CACHE, loadDataFile } from './dataFile';
export { CountryDataError } from './dataFile';
import { loadOfficialRepeaters } from './officialRepeaters';
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


const packageUrl = (country: Country) => `${import.meta.env.BASE_URL}data/${country}.json`;


const loadPackage = (country: Country) => loadDataFile<CountryPackage>(`${country}.json`);

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
    const fetchIt = () => {
      if (country !== 'AR') void loadCountryData(country).catch(() => undefined);
      // Servicios del país (estaciones, farmacias, agua, refugios…; también Argentina: van aparte para no agrandar la descarga inicial).
      void prefetchServices(country).catch(() => undefined);
      // Repetidoras oficiales de Chile: también con Argentina (en la cordillera se está cerca).
      void loadOfficialRepeaters(country).catch(() => undefined);
      // Áreas protegidas de Chile (CONAF): también con Argentina, por la cordillera.
      if (country === 'AR' || country === 'CL') void loadParksCL().catch(() => undefined);
      // Bolivia y Perú: las suyas (SERNAP, SERNANP).
      if (country === 'BO' || country === 'PE') void loadParksFile(country).catch(() => undefined);
    };
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
