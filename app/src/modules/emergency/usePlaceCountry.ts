import { useEffect, useMemo, useState } from 'react';
import { COUNTRIES, useSettings, type Country } from '@/core/settings/settings';
import { countryAt, distanceToCountry, loadBorders, type BordersData } from './borders';

/** Cerca de la frontera sirven las radios de los dos lados: hasta esta distancia de otro país se muestran también las suyas. */
export const NEAR_BORDER_M = 50_000;

/**
 * País del lugar elegido (GPS o a mano), por las fronteras, y los países vecinos a menos de 50 km de su frontera.
 * Las emisoras, los parques y las repetidoras tienen que ser las de ahí y no las del país de Ajustes (con Argentina en Ajustes y
 * un lugar en Perú, salían las radios argentinas); y cerca de una frontera, las de los dos lados (como las frecuencias de montaña).
 * Si el lugar no cae en ningún país que la app conozca, o todavía no cargaron las fronteras, vale el de Ajustes.
 */
export function usePlaceCountries(place: { lat: number; lon: number } | null): { country: Country; near: Country[] } {
  const setting = useSettings((s) => s.settings.country);
  const [borders, setBorders] = useState<BordersData | null>(null);
  useEffect(() => {
    void loadBorders().then(setBorders, () => undefined);
  }, []);
  return useMemo(() => {
    const country = (place && borders ? countryAt(borders, place.lat, place.lon) : null) ?? setting;
    const near = [country];
    if (place && borders) {
      for (const c of COUNTRIES) {
        if (c !== country && borders[c] && distanceToCountry(borders, c as Parameters<typeof distanceToCountry>[1], place.lat, place.lon) <= NEAR_BORDER_M) near.push(c);
      }
    }
    return { country, near };
  }, [borders, place?.lat, place?.lon, setting]);
}

/** Solo el país del lugar (ver `usePlaceCountries`). */
export const usePlaceCountry = (place: { lat: number; lon: number } | null): Country => usePlaceCountries(place).country;
