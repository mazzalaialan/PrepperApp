import webpush from 'web-push';
import { getSetting, setSetting, type Db } from './db.ts';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Contenido de la notificación; la app la arma en el idioma del usuario (ver app/src/sw.ts). */
export interface PushPayload {
  type: 'alerts' | 'test';
  alerts?: { itemName: string; kind: string; dueDate: string | null }[];
}

export interface PushSender {
  publicKey: string;
  /** Devuelve `false` si la suscripción ya no existe (el dispositivo desinstaló o revocó el permiso). */
  send(subscription: PushSubscriptionJson, payload: PushPayload): Promise<boolean>;
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
        await webpush.sendNotification(subscription, JSON.stringify(payload), { vapidDetails: details, TTL: 24 * 3600 });
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return false;
        throw err;
      }
    },
  };
}
