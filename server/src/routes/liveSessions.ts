import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db.ts';
import { routeSvg } from './sharedOutings.ts';

/**
 * Seguimiento en vivo para la familia: mientras la persona graba una sesión, la
 * app manda cada tanto los últimos puntos y los datos, y la página pública
 * (HTML sin scripts, que se recarga sola) muestra el recorrido y la última
 * posición exacta con la hora en que llegó. Es opcional y vence: 15 minutos,
 * 1, 4, 12 o 24 horas. Al terminar o vencer se borra todo. Sin fotos ni datos
 * de salud. Quien lo crea recibe un código (solo se guarda su hash) para
 * mandar posiciones y para cortarlo.
 */

export const DURATIONS_MIN = [15, 60, 240, 720, 1440] as const;
const MAX_POINTS = 4000;
const MAX_CHUNK_POINTS = 120;
const MAX_CHUNKS = 10;
const MIN_UPDATE_GAP_MS = 5000;
const MAX_CREATES_PER_HOUR = 20;
const REFRESH_S = 30;

type Pt = [number, number, number];

interface Stats {
  distanceM: number;
  elapsedS: number;
  ascentM: number;
  paceSPerKm: number;
  speedKmh: number;
}

/** Hora límite de regreso de la salida en curso (solo horas: nada de integrantes ni contactos). */
export interface LiveDeadline {
  returnBy: number;
  lastCheckIn: number | null;
}

export interface LiveData {
  /** Si la persona dejó una hora límite de regreso, la familia la ve en la página. */
  deadline?: LiveDeadline;
  name: string;
  lang: 'es' | 'en';
  kind: string;
  status: 'active' | 'paused';
  segments: Pt[][];
  stats: Stats;
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const hash = (token: string) => createHash('sha256').update(token).digest();

export function parseCreate(raw: unknown): { name: string; lang: 'es' | 'en'; kind: string; durationMin: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
  const durationMin = typeof r.durationMin === 'number' ? r.durationMin : 0;
  if (!name || !(DURATIONS_MIN as readonly number[]).includes(durationMin)) return null;
  return { name, lang: r.lang === 'en' ? 'en' : 'es', kind: typeof r.kind === 'string' ? r.kind.slice(0, 20) : '', durationMin };
}

function parseStats(raw: unknown): Stats | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const distanceM = num(s.distanceM, 0, 2_000_000);
  const elapsedS = num(s.elapsedS, 0, 7 * 86_400);
  const ascentM = num(s.ascentM, 0, 100_000);
  const paceSPerKm = num(s.paceSPerKm, 0, 100_000);
  const speedKmh = num(s.speedKmh, 0, 500);
  if (distanceM === null || elapsedS === null || ascentM === null || paceSPerKm === null || speedKmh === null) return null;
  return { distanceM: Math.round(distanceM), elapsedS: Math.round(elapsedS), ascentM: Math.round(ascentM), paceSPerKm: Math.round(paceSPerKm), speedKmh: round(speedKmh, 1) };
}

/** Un envío: datos y trozos de recorrido a sumar. `newSegment` empieza un tramo nuevo (después de un corte o de una zona privada). */
function parseDeadline(raw: unknown): LiveDeadline | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const returnBy = num(d.returnBy, 0, 4_102_444_800_000);
  const lastCheckIn = d.lastCheckIn === null || d.lastCheckIn === undefined ? null : num(d.lastCheckIn, 0, 4_102_444_800_000);
  if (returnBy === null || (d.lastCheckIn !== null && d.lastCheckIn !== undefined && lastCheckIn === null)) return null;
  return { returnBy: Math.round(returnBy), lastCheckIn: lastCheckIn === null ? null : Math.round(lastCheckIn) };
}

export function parseUpdate(raw: unknown): { status: 'active' | 'paused'; stats: Stats; chunks: { newSegment: boolean; points: Pt[] }[]; deadline?: LiveDeadline } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const stats = parseStats(r.stats);
  if (!stats || (r.status !== 'active' && r.status !== 'paused') || !Array.isArray(r.chunks) || r.chunks.length > MAX_CHUNKS) return null;
  const chunks: { newSegment: boolean; points: Pt[] }[] = [];
  let total = 0;
  for (const c of r.chunks) {
    if (typeof c !== 'object' || c === null || !Array.isArray((c as { points?: unknown }).points)) return null;
    const pts: Pt[] = [];
    for (const p of (c as { points: unknown[] }).points) {
      if (!Array.isArray(p) || p.length !== 3) return null;
      const lat = num(p[0], -90, 90);
      const lon = num(p[1], -180, 180);
      const t = num(p[2], 0, 4_102_444_800);
      if (lat === null || lon === null || t === null) return null;
      pts.push([round(lat, 5), round(lon, 5), Math.round(t)]);
    }
    total += pts.length;
    if (total > MAX_CHUNK_POINTS) return null;
    chunks.push({ newSegment: (c as { newSegment?: unknown }).newSegment === true, points: pts });
  }
  const deadline = parseDeadline(r.deadline);
  if (deadline === null) return null;
  return { status: r.status, stats, chunks, ...(deadline ? { deadline } : {}) };
}

/** Suma los trozos al recorrido guardado y, si pasa del tope, descarta lo más viejo. */
export function applyUpdate(data: LiveData, update: NonNullable<ReturnType<typeof parseUpdate>>): LiveData {
  const segments = data.segments.map((s) => [...s]);
  for (const c of update.chunks) {
    if (c.points.length === 0) continue;
    if (c.newSegment || segments.length === 0) segments.push([...c.points]);
    else segments[segments.length - 1]!.push(...c.points);
  }
  let count = segments.reduce((n, s) => n + s.length, 0);
  while (count > MAX_POINTS && segments.length > 0) {
    const first = segments[0]!;
    const drop = Math.min(first.length, count - MAX_POINTS);
    first.splice(0, drop);
    count -= drop;
    if (first.length === 0) segments.shift();
  }
  // Cada envío trae la hora límite de ese momento: sin ella (cerró la salida o la sacó), la página deja de mostrarla.
  const { deadline: _old, ...rest } = data;
  return { ...rest, status: update.status, stats: update.stats, segments, ...(update.deadline ? { deadline: update.deadline } : {}) };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TEXT = {
  es: { live: 'En vivo', paused: 'En pausa', ago: 'Última posición hace', now: 'hace instantes', distance: 'Distancia', time: 'Tiempo', pace: 'Ritmo', speed: 'Velocidad', ascent: 'Subida', route: 'Recorrido', start: 'Salida', end: 'Última posición', refresh: 'Esta página se actualiza sola cada medio minuto.', stale: 'Hace rato que no llegan posiciones: puede haber perdido señal o tener la app cerrada.', by: 'Seguimiento en vivo de VikArg, una app de preparación y supervivencia.', gone: 'Este seguimiento terminó o venció.', noPoints: 'Todavía no llegó ninguna posición.', min: 'min', h: 'h', dueIn: 'Hora límite de regreso: faltan', overdue: 'Pasó la hora límite de regreso hace', lastOk: 'Último «estoy bien»: hace', noOk: 'Todavía no dio ningún «estoy bien».', advice: 'Si no hay noticias, llamá a los servicios de emergencia y pasales la última posición de abajo.' },
  en: { live: 'Live', paused: 'Paused', ago: 'Last position', now: 'just now', distance: 'Distance', time: 'Time', pace: 'Pace', speed: 'Speed', ascent: 'Ascent', route: 'Route', start: 'Start', end: 'Last position', refresh: 'This page refreshes itself every half minute.', stale: 'No positions have arrived for a while: they may have lost signal or closed the app.', by: 'Live tracking by VikArg, an offline preparedness and survival app.', gone: 'This tracking has ended or expired.', noPoints: 'No position has arrived yet.', min: 'min', h: 'h', dueIn: 'Return deadline: in', overdue: 'The return deadline passed', lastOk: "Last 'I'm OK':", noOk: "No 'I'm OK' yet.", advice: 'If there is no news, call the emergency services and give them the last position below.' },
};

const KIND_NAMES: Record<'es' | 'en', Record<string, string>> = {
  es: { walk: 'Caminata', run: 'Correr', trek: 'Trekking', kayak: 'Kayak', canoe: 'Canoa', rowboat: 'Bote a remo', sup: 'Paddle surf', rafting: 'Rafting', roadBike: 'Ciclismo de ruta', mtb: 'Mountain bike', gravel: 'Gravel', cityBike: 'Bici urbana', ebike: 'Bici eléctrica' },
  en: { walk: 'Walk', run: 'Run', trek: 'Trekking', kayak: 'Kayak', canoe: 'Canoe', rowboat: 'Rowing boat', sup: 'Stand-up paddle', rafting: 'Rafting', roadBike: 'Road cycling', mtb: 'Mountain bike', gravel: 'Gravel', cityBike: 'City bike', ebike: 'E-bike' },
};

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmt = (n: number, lang: 'es' | 'en', d = 0) => new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'en', { maximumFractionDigits: d }).format(n);

/** Más que esto sin posiciones, se avisa que puede haber perdido la señal. */
const STALE_MS = 5 * 60_000;

/** La hora límite se dice en relativo ("faltan 2 h", "hace 40 min"): la página no sabe en qué zona horaria la lee la familia. */
function renderDeadline(dl: LiveDeadline, lang: 'es' | 'en', now: number): string {
  const t = TEXT[lang];
  const left = Math.round((dl.returnBy - now) / 1000);
  if (left >= 0) return `<p class="due">${esc(t.dueIn)} ${esc(clock(left))}</p>`;
  const lastOk = dl.lastCheckIn === null ? esc(t.noOk) : `${esc(t.lastOk)} ${esc(clock(Math.max(0, Math.round((now - dl.lastCheckIn) / 1000))))}`;
  return `<p class="alarm">${esc(t.overdue)} ${esc(clock(-left))}.<br>${lastOk}<br>${esc(t.advice)}</p>`;
}

export function renderLivePage(d: LiveData, updatedAt: number, now: number): string {
  const t = TEXT[d.lang];
  const ageS = Math.max(0, Math.round((now - updatedAt) / 1000));
  const ago = ageS < 30 ? t.now : `${clock(ageS)}`;
  const stale = now - updatedAt > STALE_MS;
  const effort = d.kind && ['run', 'walk', 'trek'].includes(d.kind) ? `<div><dt>${t.pace}</dt><dd>${d.stats.paceSPerKm > 0 ? `${mmss(d.stats.paceSPerKm)} /km` : '—'}</dd></div>` : `<div><dt>${t.speed}</dt><dd>${d.stats.speedKmh > 0 ? `${fmt(d.stats.speedKmh, d.lang, 1)} km/h` : '—'}</dd></div>`;
  const route = routeSvg(d.segments.map((s) => s.map((p) => [p[0], p[1]] as [number, number])), { start: t.start, end: t.end });
  const kind = KIND_NAMES[d.lang][d.kind] ?? '';
  const deadline = d.deadline ? renderDeadline(d.deadline, d.lang, now) : '';
  return `<!doctype html>
<html lang="${d.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="${REFRESH_S}">
<title>${esc(d.name)} · ${esc(t.live)} · VikArg</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#121a24;color:#e8e2d6;font:16px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:8px 0 4px}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;background:#c0392b;color:#fff;font-size:.85rem;font-weight:700}
.badge.paused{background:#7a8696}
.sub{color:#9aa7b6;margin:4px 0 16px}
.warn{background:#4a3a1a;border-radius:8px;padding:8px 12px;color:#f0d9a8}
.alarm{background:#6b1d14;border:2px solid #ff6b5e;border-radius:8px;padding:10px 12px;color:#fff;font-weight:700}
.due{background:#1f3a2a;border-radius:8px;padding:8px 12px}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:16px 0}
dt{color:#9aa7b6;font-size:.85rem}dd{margin:0;font-size:1.25rem;font-weight:700}
h2{font-size:1rem;color:#9aa7b6;margin:20px 0 8px}
svg{width:100%;height:auto;display:block}
footer{margin-top:24px;color:#9aa7b6;font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>${esc(d.name)}</h1>
<p class="sub"><span class="badge${d.status === 'paused' ? ' paused' : ''}">${esc(d.status === 'paused' ? t.paused : t.live)}</span>${kind ? ` · ${esc(kind)}` : ''}</p>
<p class="sub">${esc(t.ago)} ${esc(ago)}</p>
${deadline}
${stale ? `<p class="warn">${esc(t.stale)}</p>` : ''}
<dl>
<div><dt>${t.distance}</dt><dd>${esc(fmt(d.stats.distanceM / 1000, d.lang, d.stats.distanceM < 10_000 ? 2 : 1))} km</dd></div>
<div><dt>${t.time}</dt><dd>${esc(clock(d.stats.elapsedS))}</dd></div>
${effort}
<div><dt>${t.ascent}</dt><dd>${esc(fmt(d.stats.ascentM, d.lang))} m</dd></div>
</dl>
${route ? `<h2>${esc(t.route)}</h2>${route}` : `<p class="sub">${esc(t.noPoints)}</p>`}
<footer>${esc(t.refresh)} ${esc(t.by)}</footer>
</main>
</body>
</html>`;
}

const gonePage = (lang: 'es' | 'en') => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>VikArg</title></head><body style="font:16px system-ui;background:#121a24;color:#e8e2d6;padding:24px"><p>${esc(TEXT[lang].gone)}</p></body></html>`;

export function liveSessionRoutes(app: FastifyInstance, db: Db, config: Config): void {
  const creates = new Map<string, { count: number; resetAt: number }>();
  const lastUpdate = new Map<string, number>();

  const authorized = (id: string, header: string | undefined): { token_hash: string; data: string } | null => {
    const row = db.prepare('SELECT token_hash, data FROM live_sessions WHERE id = ? AND expires_at >= ?').get(id, Date.now()) as { token_hash: string; data: string } | undefined;
    const token = header?.replace(/^Bearer /, '') ?? '';
    if (!row || !token || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), hash(token))) return null;
    return row;
  };

  app.post('/api/live', { bodyLimit: 2048 }, async (req, reply) => {
    const now = Date.now();
    const rate = creates.get(req.ip);
    if (rate && rate.resetAt > now && rate.count >= MAX_CREATES_PER_HOUR) return reply.code(429).send({ error: 'too-many' });
    const input = parseCreate(req.body);
    if (!input) return reply.code(400).send({ error: 'invalid' });
    db.prepare('DELETE FROM live_sessions WHERE expires_at < ?').run(now);
    const total = (db.prepare('SELECT COUNT(*) AS n FROM live_sessions').get() as { n: number }).n;
    if (total >= config.liveSessionsMax) return reply.code(503).send({ error: 'full' });
    const id = randomBytes(9).toString('base64url');
    const token = randomBytes(24).toString('base64url');
    const expiresAt = now + input.durationMin * 60_000;
    const data: LiveData = { name: input.name, lang: input.lang, kind: input.kind, status: 'active', segments: [], stats: { distanceM: 0, elapsedS: 0, ascentM: 0, paceSPerKm: 0, speedKmh: 0 } };
    db.prepare('INSERT INTO live_sessions (id, token_hash, data, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, hash(token).toString('hex'), JSON.stringify(data), now, now, expiresAt);
    creates.set(req.ip, { count: (rate && rate.resetAt > now ? rate.count : 0) + 1, resetAt: rate && rate.resetAt > now ? rate.resetAt : now + 3_600_000 });
    return reply.code(201).send({ id, path: `/l/${id}`, token, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.put<{ Params: { id: string } }>('/api/live/:id', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const row = authorized(req.params.id, req.headers.authorization);
    if (!row) return reply.code(401).send({ error: 'unauthorized' });
    const now = Date.now();
    if (now - (lastUpdate.get(req.params.id) ?? 0) < MIN_UPDATE_GAP_MS) return reply.code(429).send({ error: 'too-fast' });
    const update = parseUpdate(req.body);
    if (!update) return reply.code(400).send({ error: 'invalid' });
    lastUpdate.set(req.params.id, now);
    const next = applyUpdate(JSON.parse(row.data) as LiveData, update);
    db.prepare('UPDATE live_sessions SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), now, req.params.id);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/live/:id', async (req, reply) => {
    // Se puede cortar aunque ya haya vencido (el código sigue valiendo para borrar la fila).
    const row = db.prepare('SELECT token_hash FROM live_sessions WHERE id = ?').get(req.params.id) as { token_hash: string } | undefined;
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!row || !token || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), hash(token))) return reply.code(401).send({ error: 'unauthorized' });
    db.prepare('DELETE FROM live_sessions WHERE id = ?').run(req.params.id);
    lastUpdate.delete(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/l/:id', async (req, reply) => {
    const row = db.prepare('SELECT data, updated_at FROM live_sessions WHERE id = ? AND expires_at >= ?').get(req.params.id, Date.now()) as { data: string; updated_at: number } | undefined;
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:").header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer').header('cache-control', 'no-store');
    if (!row) return reply.code(404).type('text/html; charset=utf-8').send(gonePage('es'));
    return reply.type('text/html; charset=utf-8').send(renderLivePage(JSON.parse(row.data) as LiveData, row.updated_at, Date.now()));
  });
}
