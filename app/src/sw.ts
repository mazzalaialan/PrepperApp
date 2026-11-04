/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { db } from '@/core/db/db';
import {
  alertsNotification,
  lightningNotification,
  rainNotification,
  testNotification,
  updateNotification,
  hazardNotification,
  type AlertSummary,
  type HazardPush,
  type LightningPush,
  type RainPush,
  type UpdatePush,
} from '@/core/notifications/format';
import { selectNotifiable } from '@/core/notifications/notifiable';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import type { Settings } from '@/core/settings/settings';
import { today } from '@/modules/inventory/domain/dates';

declare const self: ServiceWorkerGlobalScope;

export const PERIODIC_SYNC_TAG = 'vikarg-alerts';
const ICON = 'brand/icon-192.png';
const ALERTS_URL = '#/inventory/alerts';

// ---------- Offline ----------

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Elevación de los mapas offline: primero lo descargado por zona (curvas de nivel sin conexión).
const MAP_CACHE = 'vikarg-maps';
registerRoute(
  ({ url }) => url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/'),
  async ({ request }) => (await caches.match(request.url, { cacheName: MAP_CACHE })) ?? fetch(request),
);

// La app pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------- Notificaciones ----------

async function language(): Promise<'es' | 'en'> {
  const settings = (await db.settings.get('app'))?.value as Partial<Settings> | undefined;
  return settings?.language === 'en' ? 'en' : 'es';
}

async function show(title: string, body: string, url = ALERTS_URL) {
  await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: 'vikarg-alerts', data: { url } });
}

/** Push del servidor propio: el contenido llega cifrado de punta a punta. */
self.addEventListener('push', (event) => {
  const payload = (event.data?.json() ?? {}) as { type?: string; alerts?: AlertSummary[]; rain?: RainPush; lightning?: LightningPush; update?: UpdatePush; hazard?: HazardPush };
  event.waitUntil(
    (async () => {
      const lang = await language();
      if (payload.type === 'rain' && payload.rain) {
        // Misma etiqueta que el aviso de la app abierta: si ya avisó, lo reemplaza sin volver a sonar.
        const { title, body } = rainNotification(payload.rain, lang);
        await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: `rain-${payload.rain.placeId}`, data: { url: '#/weather/forecast' } });
      } else if (payload.type === 'lightning' && payload.lightning) {
        const { title, body } = lightningNotification(payload.lightning, lang);
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: `lightning-${payload.lightning.placeId}`,
          // Que vibre aunque haya otro aviso igual en la barra: es urgente.
          renotify: true,
          vibrate: [300, 150, 300, 150, 300],
          data: { url: '#/weather/forecast' },
        } as NotificationOptions);
      } else if (payload.type === 'hazard' && payload.hazard) {
        const { title, body } = hazardNotification(payload.hazard, lang);
        const urgent = payload.hazard.tsunami || payload.hazard.level === 'Red' || (payload.hazard.magnitude ?? 0) >= 6;
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: `hazard-${payload.hazard.placeId}-${payload.hazard.kind}`,
          renotify: true,
          ...(urgent ? { vibrate: [500, 200, 500, 200, 500], requireInteraction: true } : {}),
          data: { url: '#/weather/map' },
        } as NotificationOptions);
      } else if (payload.type === 'update' && payload.update) {
        // Al abrir la app, el service worker baja la versión nueva (y la app ofrece actualizar).
        const { title, body } = updateNotification(payload.update, lang);
        await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: 'vikarg-update', data: { url: '' } });
      } else if (payload.type === 'alerts' && payload.alerts?.length) {
        const { title, body } = alertsNotification(payload.alerts, lang, today());
        await show(title, body);
      } else {
        const { title, body } = testNotification(lang);
        await show(title, body, '');
      }
    })(),
  );
});

/**
 * Aviso diario sin servidor (Periodic Background Sync, Chrome en Android).
 * Lee el índice de alertas en claro: no necesita desbloquear la bóveda.
 */
async function checkLocalAlerts() {
  const state = await readNotificationState();
  // Con servidor configurado avisa el servidor: evita notificaciones duplicadas.
  if (state.push) return;
  const day = today();
  if (state.lastLocalNotifiedDay === day) return;
  const pending = selectNotifiable(await db.alertIndex.toArray(), day, state.lastLocalNotifiedDay);
  if (pending.length > 0) {
    const { title, body } = alertsNotification(pending, await language(), day);
    await show(title, body);
  }
  await updateNotificationState({ lastLocalNotifiedDay: day });
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

self.addEventListener('periodicsync' as keyof ServiceWorkerGlobalScopeEventMap, (event) => {
  const e = event as unknown as PeriodicSyncEvent;
  if (e.tag === PERIODIC_SYNC_TAG) e.waitUntil(checkLocalAlerts());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
