import webpush from 'web-push';
import { getSetting, setSetting, type Db } from './db.ts';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Contenido de la notificación; la app la arma en el idioma del usuario (ver app/src/sw.ts). */
export interface PushPayload {
  type: 'alerts' | 'rain' | 'lightning' | 'test' | 'update' | 'hazard';
  alerts?: { itemName: string; kind: string; dueDate: string | null }[];
  /** Aviso de lluvia en un lugar; `label` null = "donde estoy", y `fixAt` es de cuándo es esa ubicación. */
  rain?: { placeId: string; label: string | null; state: 'raining' | 'soon'; inMinutes: number; mm: number; fixAt: string | null; observedMmH?: number };
  /** Rayo cercano: distancia (km) y rumbo (grados desde el lugar hacia el rayo). */
  lightning?: { placeId: string; label: string | null; distanceKm: number; bearing: number; fixAt: string | null };
  /** Peligro natural cerca: sismo (USGS) o evento de GDACS, con distancia y rumbo desde el lugar. */
  hazard?: {
    placeId: string;
    label: string | null;
    fixAt: string | null;
    kind: 'quake' | 'TC' | 'FL' | 'WF' | 'VO';
    name: string;
    distanceKm: number;
    bearing: number;
    magnitude?: number;
    tsunami?: boolean;
    level?: 'Green' | 'Orange' | 'Red';
    url: string;
  };
  /** Actualización importante: la app muestra el texto en su idioma (ver announce.ts). */
  update?: { version: string; title: { es: string; en: string }; body: { es: string; en: string } };
}

export interface PushSender {
  publicKey: string;
  /** Devuelve `false` si la suscripción ya no existe (el dispositivo desinstaló o revocó el permiso). */
  send(subscription: PushSubscriptionJson, payload: PushPayload): Promise<boolean>;
}

/** Prioridad del push (RFC 8030): alta para lo que no puede esperar. */
export function urgencyOf(payload: PushPayload): 'high' | 'normal' {
  return payload.type === 'hazard' || payload.type === 'lightning' || payload.type === 'rain' ? 'high' : 'normal';
}

/** Claves VAPID: se generan en el primer arranque y se guardan en la base. */
export function createPushSender(db: Db, subject: string): PushSender {
  let publicKey = getSetting(db, 'vapid_public');
  let privateKey = getSetting(db, 'vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    setSetting(db, 'vapid_public', publicKey);
    setSetting(db, 'vapid_private', privateKey);
  }
  const details = { subject, publicKey, privateKey };

  return {
    publicKey,
    async send(subscription, payload) {
      try {
        // El contenido viaja cifrado de punta a punta (RFC 8291): el servicio push no lo puede leer.
        // Lo urgente con prioridad alta: si no, Android puede demorarlo mientras el celular está en reposo.
        await webpush.sendNotification(subscription, JSON.stringify(payload), { vapidDetails: details, TTL: 24 * 3600, urgency: urgencyOf(payload) });
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return false;
        throw err;
      }
    },
  };
}
