import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { currentPosition } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { useWaypoints } from '@/modules/waypoints/store';
import { fetchNowcast, rainOutlook, type RainOutlook } from './nowcast';

/**
 * Avisos de lluvia mientras la app está abierta: cada 15 minutos revisa "mi
 * ubicación" (si está activado) y los waypoints con aviso. Con la app cerrada
 * una PWA no puede leer el GPS ni consultar a tiempo: eso lo hará el servidor
 * propio con la última ubicación conocida (ARQUITECTURA §9).
 */

const CHECK_MS = 15 * 60_000;
export const HERE_ID = 'here';

export interface RainStatus {
  placeId: string;
  label: string;
  outlook: RainOutlook;
  checkedAt: number;
}

interface RainWatchState {
  statuses: Map<string, RainStatus>;
  /** Avisos de esta sesión que el usuario todavía no cerró. */
  notices: RainStatus[];
  /** Última posición GPS leída con la app abierta (para el servidor, cuando esté). */
  lastHere: { lat: number; lon: number; at: number } | null;
  dismiss: (placeId: string) => void;
}

export const useRainWatch = create<RainWatchState>((set, get) => ({
  statuses: new Map(),
  notices: [],
  lastHere: null,
  dismiss(placeId) {
    set({ notices: get().notices.filter((n) => n.placeId !== placeId) });
  },
}));

/** Lugares ya avisados en este episodio de lluvia; se limpian cuando el pronóstico vuelve a estar seco. */
const notified = new Set<string>();

async function systemNotify(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, { body, tag, icon: 'brand/icon-192.png', badge: 'brand/icon-192.png', data: { url: '#/weather/forecast' } });
}

/** Se monta una vez en la app desbloqueada. */
export function useRainWatcher() {
  const { t, i18n } = useTranslation();
  const here = useSettings((s) => s.settings.rainAlertsHere);
  const base = useSettings((s) => s.settings.weatherUrl);
  const waypoints = useWaypoints((s) => s.waypoints);
  // La lista se reduce a lo que importa para no reiniciar el ciclo por cambios ajenos (nombre, notas…).
  const watched = [...waypoints.values()].filter((w) => w.rainAlerts);
  const watchKey = watched.map((w) => `${w.id}:${w.lat}:${w.lon}:${w.name}`).join('|');

  useEffect(() => {
    if (!here && watched.length === 0) return;
    let cancelled = false;
    const mm = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

    async function check() {
      if (!navigator.onLine) return;
      const places: { id: string; label: string; lat: number; lon: number }[] = watched.map((w) => ({ id: w.id, label: w.name, lat: w.lat, lon: w.lon }));
      if (here) {
        try {
          const fix = await currentPosition();
          useRainWatch.setState({ lastHere: { lat: fix.lat, lon: fix.lon, at: Date.now() } });
        } catch {
          // Sin GPS en este momento: se usa la última posición conocida, si la hay.
        }
        const last = useRainWatch.getState().lastHere;
        if (last) places.unshift({ id: HERE_ID, label: t('place.myLocation'), lat: last.lat, lon: last.lon });
      }

      for (const place of places) {
        if (cancelled) return;
        let outlook: RainOutlook;
        try {
          outlook = rainOutlook(await fetchNowcast(base, place.lat, place.lon));
        } catch {
          continue;
        }
        const status: RainStatus = { placeId: place.id, label: place.label, outlook, checkedAt: Date.now() };
        const state = useRainWatch.getState();
        useRainWatch.setState({ statuses: new Map(state.statuses).set(place.id, status) });

        if (outlook.state === 'dry') {
          notified.delete(place.id);
          continue;
        }
        if (notified.has(place.id)) continue;
        notified.add(place.id);
        useRainWatch.setState({ notices: [...state.notices.filter((n) => n.placeId !== place.id), status] });
        const title =
          outlook.state === 'raining'
            ? t('rainAlerts.rainingTitle', { place: place.label })
            : t('rainAlerts.soonTitle', { place: place.label, minutes: outlook.inMinutes });
        await systemNotify(title, t('rainAlerts.body', { mm: mm.format(outlook.mm) }), `rain-${place.id}`);
      }
    }

    void check();
    const timer = setInterval(() => void check(), CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // `watchKey` resume los waypoints vigilados (la lista `watched` cambia de identidad en cada render).
  }, [here, base, watchKey, i18n.language, t]);
}
