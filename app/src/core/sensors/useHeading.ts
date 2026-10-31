import { useMemo } from 'react';
import type { GeoFix } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { normalizeDeg } from '@/core/geo/geo';
import { declinationAt, type HoldMode } from './heading';
import { useOrientation } from './useOrientation';

export interface Heading {
  /** Rumbo en la referencia que se muestra (verdadero si hay declinación, si no magnético). */
  heading: number;
  /** Rumbo verdadero, para comparar con rumbos geográficos (waypoints). `null` sin ubicación. */
  trueHeading: number | null;
  /** Declinación usada (este positivo), o `null` si no hay ubicación para calcularla. */
  declination: number | null;
  reference: 'true' | 'magnetic';
  mode: HoldMode;
  pitch: number;
}

/**
 * Brújula con la corrección de declinación (WMM) para la posición actual.
 * La declinación cambia muy poco con la distancia: se recalcula por celdas de ~10 km.
 */
export function useHeading(fix: GeoFix | null, enabled = true): Heading | null {
  const orientation = useOrientation(enabled);
  const preferred = useSettings((s) => s.settings.northReference);
  const cellLat = fix ? Math.round(fix.lat * 10) / 10 : null;
  const cellLon = fix ? Math.round(fix.lon * 10) / 10 : null;
  const declination = useMemo(
    () => (cellLat === null || cellLon === null ? null : declinationAt(cellLat, cellLon)),
    [cellLat, cellLon],
  );

  if (!orientation) return null;
  const trueHeading = declination === null ? null : normalizeDeg(orientation.heading + declination);
  const reference = preferred === 'true' && trueHeading !== null ? 'true' : 'magnetic';
  return {
    heading: reference === 'true' ? trueHeading! : orientation.heading,
    trueHeading,
    declination,
    reference,
    mode: orientation.mode,
    pitch: orientation.pitch,
  };
}
