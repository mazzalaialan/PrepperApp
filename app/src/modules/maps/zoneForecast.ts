import { useEffect } from 'react';
import { useSettings } from '@/core/settings/settings';
import { fetchFreezingSeries, pruneSeries } from './snowline';
import { useMapZones, type MapZone } from './store';

/**
 * Pronóstico guardado de las zonas descargadas (isoterma de 0 °C para la capa
 * de avalanchas sin conexión): cada vez que la app se abre con conexión, se
 * renueva el de las zonas que lo tengan con más de un día. Así, aunque el
 * mapa se haya bajado meses antes, alcanza con abrir la app con señal antes de
 * salir para llevarse los próximos 14 días.
 */

export const ZONE_FORECAST_MAX_AGE_MS = 24 * 3_600_000;

export function staleZones(zones: MapZone[], now = Date.now()): MapZone[] {
  return zones.filter((z) => !z.freezing || now - z.freezing.at > ZONE_FORECAST_MAX_AGE_MS);
}

let running = false;

export async function refreshZoneForecasts(base: string): Promise<number> {
  if (running || !navigator.onLine) return 0;
  running = true;
  let done = 0;
  try {
    await pruneZoneForecasts();
    // De a una: son pocas y cada consulta es de ~1 KB.
    for (const zone of staleZones(useMapZones.getState().zones)) {
      try {
        const freezing = await fetchFreezingSeries(base, zone.lat, zone.lon);
        // Se lee de nuevo por si la zona cambió o se borró mientras tanto.
        const current = useMapZones.getState().zones.find((z) => z.id === zone.id);
        if (current) await useMapZones.getState().add({ ...current, freezing });
        done++;
      } catch {
        // Sin respuesta: se reintenta la próxima vez.
      }
    }
  } finally {
    running = false;
  }
  return done;
}

/** Limpieza de lo viejo (también sin conexión): horas que ya pasaron hace más de 3 días y pronósticos vencidos. */
export async function pruneZoneForecasts(now = Date.now()): Promise<void> {
  for (const zone of useMapZones.getState().zones) {
    if (!zone.freezing) continue;
    const pruned = pruneSeries(zone.freezing, now);
    if (pruned === zone.freezing) continue;
    const { freezing: _old, ...rest } = zone;
    await useMapZones.getState().add(pruned ? { ...rest, freezing: pruned } : rest);
  }
}

/** Se monta una vez en la app desbloqueada. */
export function useZoneForecastRefresh() {
  const base = useSettings((s) => s.settings.weatherUrl);
  const loaded = useMapZones((s) => s.loaded);
  useEffect(() => {
    if (!loaded) return;
    // Un rato después de abrir, para no competir con lo que se está mirando.
    const timer = setTimeout(() => void (navigator.onLine ? refreshZoneForecasts(base) : pruneZoneForecasts()), 5000);
    const online = () => void refreshZoneForecasts(base);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', online);
    };
  }, [loaded, base]);
}
