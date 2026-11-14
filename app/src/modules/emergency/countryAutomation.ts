import { useEffect } from 'react';
import { create } from 'zustand';
import { onLocation } from '@/core/geo/locationEvents';
import { useSettings, type Country } from '@/core/settings/settings';
import { loadBorders } from './borders';
import { prefetchCountry } from './country';
import { downloadsSilently, missingDownload, networkInfo } from './countryDownload';
import { createCountryDetector, type DetectedCountries } from './countryDetector';

/**
 * Qué pasa cuando se detecta que estás en otro país (ver `countryDetector.ts`):
 *  1. se guarda el país detectado y los vecinos a menos de 50 km (lo usan las pantallas: números de emergencia, radio, cercanos);
 *  2. se ofrece cambiar el país de la app («Estás en Perú: ¿usar Perú en la app?»); «No, gracias» se recuerda por país;
 *  3. se bajan los datos del país y de los vecinos: con Wi-Fi sin avisar; con datos móviles o conexión desconocida, preguntando antes.
 * Solo reacciona a eventos de ubicación (un punto del GPS, un lugar elegido): no pide el GPS ni corre en segundo plano.
 */

interface NoticesState {
  /** País que se ofrece usar en la app. */
  offer: Country | null;
  /** Descarga pendiente de confirmar (datos móviles o conexión desconocida). */
  ask: { countries: Country[]; bytes: number } | null;
}

export const useCountryNotices = create<NoticesState>(() => ({ offer: null, ask: null }));

/** Las descargas que se dijo «Ahora no» en esta sesión (para no insistir con la misma). */
const declined = new Set<string>();
export const declineDownload = (countries: Country[]) => declined.add(countries.join(','));

/** ¿Hay que ofrecer cambiar el país? Si el detectado es otro, no se dijo «No, gracias» y todavía no es el de la app. */
export function offerFor(detected: Country | null, home: Country, dismissed: Country[]): Country | null {
  return detected && detected !== home && !dismissed.includes(detected) ? detected : null;
}

export function refreshOffer(): void {
  const s = useSettings.getState().settings;
  useCountryNotices.setState({ offer: offerFor(s.detectedCountry, s.country, s.countryOfferDismissed) });
}

/** Baja los datos de los países detectados que falten, o pregunta antes si no hay Wi-Fi seguro. */
export async function downloadFor(d: DetectedCountries): Promise<void> {
  if (!navigator.onLine) return;
  const countries = [d.country, ...d.near];
  const missing = await missingDownload(countries);
  if (missing.files.length === 0) return;
  if (downloadsSilently(networkInfo())) {
    await Promise.all(countries.map(prefetchCountry));
    return;
  }
  if (declined.has(countries.join(','))) return;
  useCountryNotices.setState({ ask: { countries, bytes: missing.bytes } });
}

async function onDetected(d: DetectedCountries): Promise<void> {
  await useSettings.getState().update({ detectedCountry: d.country, detectedNear: d.near });
  refreshOffer();
  await downloadFor(d);
}

/** Se monta una vez en la app: engancha la detección a los eventos de ubicación. */
export function useCountryAutomation(): void {
  useEffect(() => {
    refreshOffer();
    const detector = createCountryDetector({
      load: loadBorders,
      current: () => {
        const s = useSettings.getState().settings;
        return s.detectedCountry ? { country: s.detectedCountry, near: s.detectedNear } : null;
      },
      onChange: (d) => void onDetected(d),
    });
    const off = onLocation(detector.note);
    return () => {
      off();
      detector.cancel();
    };
  }, []);
}
