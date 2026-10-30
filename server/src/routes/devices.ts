import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import { isValidTimeZone } from '../time.ts';

const MAX_ALERTS = 5000;

const subscriptionSchema = {
  type: 'object',
  required: ['endpoint', 'keys'],
  properties: {
    endpoint: { type: 'string', format: 'uri', maxLength: 2048 },
    keys: {
      type: 'object',
      required: ['p256dh', 'auth'],
      properties: { p256dh: { type: 'string', maxLength: 256 }, auth: { type: 'string', maxLength: 256 } },
    },
  },
} as const;

const prefsProperties = {
  timezone: { type: 'string', maxLength: 64 },
  notifyHour: { type: 'integer', minimum: 0, maximum: 23 },
  language: { type: 'string', enum: ['es', 'en'] },
} as const;

const alertSchema = {
  type: 'object',
  required: ['lotId', 'itemName', 'kind', 'notifyFrom'],
  properties: {
    lotId: { type: 'string', maxLength: 64 },
    itemName: { type: 'string', maxLength: 200 },
    kind: { type: 'string', enum: ['expiry', 'capacity'] },
    dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    notifyFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

interface Prefs {
  timezone: string;
  notifyHour: number;
  language: 'es' | 'en';
}

interface AlertInput {
  lotId: string;
  itemName: string;
  kind: 'expiry' | 'capacity';
  dueDate: string | null;
  notifyFrom: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest();

export function deviceRoutes(app: FastifyInstance, db: Db, push: PushSender): void {
  /** Valida `Authorization: Bearer <token>` contra el dispositivo; responde 401 si no corresponde. */
  function authorize(req: FastifyRequest<{ Params: { id: string } }>): boolean {
    const row = db.prepare('SELECT token_hash FROM devices WHERE id = ?').get(req.params.id) as { token_hash: string } | undefined;
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!row || !token) return false;
    return timingSafeEqual(Buffer.from(row.token_hash, 'hex'), hashToken(token));
  }

  app.post<{ Body: { subscription: PushSubscriptionJson } & Prefs }>(
    '/api/devices',
    {
      schema: {
        body: {
          type: 'object',
          required: ['subscription', 'timezone', 'notifyHour', 'language'],
          properties: { subscription: subscriptionSchema, ...prefsProperties },
        },
      },
    },
    async (req, reply) => {
      const { subscription, timezone, notifyHour, language } = req.body;
      if (!isValidTimeZone(timezone)) return reply.code(400).send({ error: 'invalid-timezone' });
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, hashToken(token).toString('hex'), JSON.stringify(subscription), timezone, notifyHour, language, now, now);
      // El token se devuelve una sola vez; el servidor solo guarda su hash.
      return reply.code(201).send({ deviceId: id, token });
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<Prefs> & { subscription?: PushSubscriptionJson; alerts: AlertInput[] } }>(
    '/api/devices/:id',
    {
      bodyLimit: 2 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['alerts'],
          properties: {
            subscription: subscriptionSchema,
            ...prefsProperties,
            alerts: { type: 'array', maxItems: MAX_ALERTS, items: alertSchema },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const { id } = req.params;
      const { subscription, timezone, notifyHour, language, alerts } = req.body;
      if (timezone && !isValidTimeZone(timezone)) return reply.code(400).send({ error: 'invalid-timezone' });

      db.exec('BEGIN');
      try {
        db.prepare(
          `UPDATE devices SET
             subscription = COALESCE(?, subscription),
             timezone = COALESCE(?, timezone),
             notify_hour = COALESCE(?, notify_hour),
             language = COALESCE(?, language),
             updated_at = ?
           WHERE id = ?`,
        ).run(subscription ? JSON.stringify(subscription) : null, timezone ?? null, notifyHour ?? null, language ?? null, new Date().toISOString(), id);
        // El índice se reemplaza completo: la app siempre manda el estado actual.
        db.prepare('DELETE FROM alerts WHERE device_id = ?').run(id);
        const insert = db.prepare(
          'INSERT INTO alerts (device_id, lot_id, item_name, kind, due_date, notify_from) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const a of alerts) insert.run(id, a.lotId, a.itemName, a.kind, a.dueDate ?? null, a.notifyFrom);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>('/api/devices/:id', async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/devices/:id/test', async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
    const row = db.prepare('SELECT subscription FROM devices WHERE id = ?').get(req.params.id) as { subscription: string };
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, { type: 'test' });
    if (!delivered) {
      db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
      return reply.code(410).send({ error: 'subscription-gone' });
    }
    return reply.code(204).send();
  });
}
