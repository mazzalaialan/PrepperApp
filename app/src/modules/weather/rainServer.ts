import { useEffect } from 'react';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import { useWaypoints } from '@/modules/waypoints/store';
import { HERE_ID, useRainWatch } from './rainWatch';

/**
 * Avisos de lluvia con la app cerrada (opcional, `rainAlertsBackground`): la
 * app le manda al servidor propio los lugares con aviso, y para "donde estoy"
 * la última ubicación leída con la app abierta. Las coordenadas van
 * redondeadas a ~1 km: alcanzan para el pronóstico. Apagarlo borra la lista
 * en el servidor.
 */

interface RainPlace {
  id: string;
  /** null = "donde estoy" (el aviso lo traduce el service worker). */
  label: string | null;
  lat: number;
  lon: number;
  fixAt: string | null;
}

const coarse = (x: number) => Math.round(x * 100) / 100;

export function rainPlaces(): RainPlace[] {
  const { rainAlertsHere, rainAlertsBackground } = useSettings.getState().settings;
  if (!rainAlertsBackground) return [];
  const places: RainPlace[] = [...useWaypoints.getState().waypoints.values()]
    .filter((w) => w.rainAlerts)
    .map((w) => ({ id: w.id, label: w.name.slice(0, 200), lat: coarse(w.lat), lon: coarse(w.lon), fixAt: null }));
  const last = useRainWatch.getState().lastHere;
  if (rainAlertsHere && last) places.unshift({ id: HERE_ID, label: null, lat: coarse(last.lat), lon: coarse(last.lon), fixAt: new Date(last.at).toISOString() });
  return places;
}

/**
 * Lo que se manda. Si "donde estoy" está activado pero todavía no hay GPS en
 * esta sesión, el servidor conserva la última ubicación que ya tiene (y el
 * episodio de lluvia, para no repetir el aviso).
 */
export function rainBody(): { places: RainPlace[]; keepHere: boolean } {
  const { rainAlertsHere, rainAlertsBackground } = useSettings.getState().settings;
  const keepHere = rainAlertsBackground && rainAlertsHere && !useRainWatch.getState().lastHere;
  return { places: rainPlaces(), keepHere };
}

/** Manda la lista actual al servidor. Sin servidor registrado no hace nada. */
export async function syncRainPlaces(): Promise<void> {
  const { push } = await readNotificationState();
  if (!push || !navigator.onLine) return;
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}/rain`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${push.token}` },
    body: JSON.stringify(rainBody()),
  }).catch(() => null);
  // 401: el servidor ya no conoce este dispositivo: hay que volver a activar las notificaciones.
  if (res?.status === 401) await updateNotificationState({ push: null });
}

/** Se monta una vez en la app desbloqueada: sincroniza cuando cambia algo que importa. */
export function useRainServerSync() {
  const background = useSettings((s) => s.settings.rainAlertsBackground);
  const here = useSettings((s) => s.settings.rainAlertsHere);
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  const lastHere = useRainWatch((s) => s.lastHere);
  const waypoints = useWaypoints((s) => s.waypoints);
  const watchKey = [...waypoints.values()]
    .filter((w) => w.rainAlerts)
    .map((w) => `${w.id}:${coarse(w.lat)}:${coarse(w.lon)}:${w.name}`)
    .join('|');
  const hereKey = here && lastHere ? `${coarse(lastHere.lat)}:${coarse(lastHere.lon)}:${Math.floor(lastHere.at / 600_000)}` : '';

  useEffect(() => {
    // Agrupa cambios seguidos en un solo envío.
    const timer = setTimeout(() => void syncRainPlaces(), 2000);
    return () => clearTimeout(timer);
  }, [background, here, notificationsEnabled, watchKey, hereKey]);

  useEffect(() => {
    const online = () => void syncRainPlaces();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
}
