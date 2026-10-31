import { useEffect, useState } from 'react';
import { useSensorActive } from '@/core/power/saver';
import type { LatLon } from './geo';

export interface GeoFix extends LatLon {
  /** Altitud sobre el nivel del mar, si el GPS la informa. */
  alt: number | null;
  /** Radio de incertidumbre, en metros. */
  accuracy: number;
  timestamp: number;
}

export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

function toFix(p: GeolocationPosition): GeoFix {
  return {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    alt: p.coords.altitude,
    accuracy: p.coords.accuracy,
    timestamp: p.timestamp,
  };
}

function toError(e: GeolocationPositionError): GeoError {
  return e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable';
}

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 };

/** Sigue la posición mientras el componente está montado y `enabled` es verdadero (el GPS gasta batería). */
export function useGeolocation(enabled = true): { fix: GeoFix | null; error: GeoError | null } {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<GeoError | null>(null);
  const { active } = useSensorActive(enabled);

  useEffect(() => {
    if (!active) return;
    if (!('geolocation' in navigator)) {
      setError('unsupported');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setFix(toFix(p));
        setError(null);
      },
      (e) => setError(toError(e)),
      OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return { fix, error };
}

/**
 * Una sola lectura (para "marcar acá"). Se usa `watchPosition` y se corta en la
 * primera respuesta: `getCurrentPosition` sin caché puede quedar esperando si
 * ya hay otro seguimiento activo en la página.
 */
export function currentPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoPositionError('unsupported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        navigator.geolocation.clearWatch(id);
        resolve(toFix(p));
      },
      (e) => {
        navigator.geolocation.clearWatch(id);
        reject(new GeoPositionError(toError(e)));
      },
      { ...OPTIONS, maximumAge: 0 },
    );
  });
}

export class GeoPositionError extends Error {
  constructor(public readonly code: GeoError) {
    super(code);
    this.name = 'GeoPositionError';
  }
}
