import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db.ts';

/**
 * Salidas compartidas con un enlace público (para redes sociales). La app
 * sube una copia chica de la salida: título, recorrido simplificado, totales y
 * perfil de altura; SIN fotos, notas ni datos de salud, para que el espacio
 * del servidor no pueda crecer sin control (tope de tamaño, de cantidad y de
 * pedidos por IP, y vencimiento). Quien la creó recibe un código de borrado
 * (solo se guarda su hash). La página es HTML sin scripts.
 */

export interface SharedOuting {
  name: string;
  lang: 'es' | 'en';
  /** Día de la salida (aaaa-mm-dd). */
  date: string;
  kinds: string[];
  activities: number;
  distanceM: number;
  totalS: number;
  ascentM: number;
  descentM: number;
  calories: number | null;
  maxEle: number | null;
  minEle: number | null;
  /** Tramos del recorrido: [lat, lon]. */
  route: [number, number][][];
  /** Perfil de altura: [distancia acumulada (m), altura (m)]. */
  profile: [number, number][];
}

export const MAX_BODY_BYTES = 100 * 1024;
const MAX_POINTS = 1500;
const MAX_SEGMENTS = 50;
const MAX_PROFILE = 400;
const MAX_CREATES_PER_HOUR = 10;

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Valida y limpia lo que manda la app (nunca se guarda ni se muestra algo que no pase por acá). */
export function parseSharedOuting(raw: unknown): SharedOuting | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
  if (!name) return null;
  const lang = b.lang === 'en' ? 'en' : 'es';
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const kinds = Array.isArray(b.kinds) ? b.kinds.filter((k): k is string => typeof k === 'string' && /^[a-zA-Z]{2,20}$/.test(k)).slice(0, 8) : [];
  const activities = num(b.activities, 0, 500);
  const distanceM = num(b.distanceM, 0, 5_000_000);
  const totalS = num(b.totalS, 0, 90 * 86_400);
  const ascentM = num(b.ascentM, 0, 100_000);
  const descentM = num(b.descentM, 0, 100_000);
  if (!date || activities === null || distanceM === null || totalS === null || ascentM === null || descentM === null) return null;
  if (!Array.isArray(b.route) || b.route.length > MAX_SEGMENTS) return null;
  const route: [number, number][][] = [];
  let points = 0;
  for (const seg of b.route) {
    if (!Array.isArray(seg)) return null;
    const out: [number, number][] = [];
    for (const p of seg) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const lat = num(p[0], -90, 90);
      const lon = num(p[1], -180, 180);
      if (lat === null || lon === null) return null;
      out.push([round(lat, 5), round(lon, 5)]);
    }
    points += out.length;
    if (points > MAX_POINTS) return null;
    if (out.length > 1) route.push(out);
  }
  if (!Array.isArray(b.profile) || b.profile.length > MAX_PROFILE) return null;
  const profile: [number, number][] = [];
  for (const p of b.profile) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const d = num(p[0], 0, 5_000_000);
    const e = num(p[1], -500, 9000);
    if (d === null || e === null) return null;
    profile.push([round(d, 0), round(e, 0)]);
  }
  return {
    name,
    lang,
    date,
    kinds,
    activities,
    distanceM: round(distanceM, 0),
    totalS: round(totalS, 0),
    ascentM: round(ascentM, 0),
    descentM: round(descentM, 0),
    calories: num(b.calories, 0, 100_000),
    maxEle: num(b.maxEle, -500, 9000),
    minEle: num(b.minEle, -500, 9000),
    route,
    profile,
  };
}

// ---------- La página ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const KIND_NAMES: Record<'es' | 'en', Record<string, string>> = {
  es: { walk: 'Caminata', run: 'Correr', trek: 'Trekking', kayak: 'Kayak', canoe: 'Canoa', rowboat: 'Bote a remo', sup: 'Paddle surf', rafting: 'Rafting', roadBike: 'Ciclismo de ruta', mtb: 'Mountain bike', gravel: 'Gravel', cityBike: 'Bici urbana', ebike: 'Bici eléctrica', treadmill: 'Cinta', elliptical: 'Elíptica', stairClimber: 'Escalador' },
  en: { walk: 'Walk', run: 'Run', trek: 'Trekking', kayak: 'Kayak', canoe: 'Canoe', rowboat: 'Rowing boat', sup: 'Stand-up paddle', rafting: 'Rafting', roadBike: 'Road cycling', mtb: 'Mountain bike', gravel: 'Gravel', cityBike: 'City bike', ebike: 'E-bike', treadmill: 'Treadmill', elliptical: 'Elliptical', stairClimber: 'Stair climber' },
};

const TEXT = {
  es: { distance: 'Distancia', time: 'Tiempo', ascent: 'Subida', descent: 'Bajada', maxEle: 'Altura máxima', calories: 'Calorías (estimadas)', activities: 'Actividades', route: 'Recorrido', profile: 'Perfil de altura', by: 'Hecho con VikArg, una app de preparación y supervivencia que funciona sin conexión.', open: 'Conocer VikArg', gone: 'Esta salida ya no está disponible.', start: 'Inicio', end: 'Fin' },
  en: { distance: 'Distance', time: 'Time', ascent: 'Ascent', descent: 'Descent', maxEle: 'Max altitude', calories: 'Calories (estimated)', activities: 'Activities', route: 'Route', profile: 'Elevation profile', by: 'Made with VikArg, an offline preparedness and survival app.', open: 'Get to know VikArg', gone: 'This outing is no longer available.', start: 'Start', end: 'End' },
};

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const km = (m: number, lang: 'es' | 'en') => `${new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'en', { maximumFractionDigits: m < 10_000 ? 2 : 1 }).format(m / 1000)} km`;
const meters = (m: number, lang: 'es' | 'en') => `${new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'en', { maximumFractionDigits: 0 }).format(m)} m`;

/** Recorrido como SVG (sin mapa de fondo): proyección plana ajustada al tamaño, con el norte arriba. */
export function routeSvg(route: [number, number][][], labels: { start: string; end: string }): string {
  const pts = route.flat();
  if (pts.length < 2) return '';
  const W = 600;
  const H = 360;
  const pad = 24;
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const k = Math.cos(((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lons) - Math.min(...lons)) * k, 1e-5);
  const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 1e-5);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const at = ([lat, lon]: [number, number]) => `${(ox + (lon - Math.min(...lons)) * k * scale).toFixed(1)},${(H - oy - (lat - Math.min(...lats)) * scale).toFixed(1)}`;
  const lines = route.map((seg) => `<polyline points="${seg.map(at).join(' ')}" fill="none" stroke="#c47d45" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const [sx, sy] = at(route[0]![0]!).split(',');
  const [ex, ey] = at(route.at(-1)!.at(-1)!).split(',');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(labels.start)} → ${esc(labels.end)}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="12" fill="#1b2633"/>${lines}<circle cx="${sx}" cy="${sy}" r="6" fill="#6f9e4c" stroke="#fff" stroke-width="2"/><circle cx="${ex}" cy="${ey}" r="6" fill="#b84a30" stroke="#fff" stroke-width="2"/></svg>`;
}

export function profileSvg(profile: [number, number][]): string {
  if (profile.length < 2) return '';
  const W = 600;
  const H = 140;
  const minE = Math.min(...profile.map((p) => p[1]));
  const maxE = Math.max(...profile.map((p) => p[1]));
  const total = Math.max(1, profile.at(-1)![0]);
  const span = Math.max(10, maxE - minE);
  const line = profile.map(([d, e]) => `${((d / total) * W).toFixed(1)},${(H - 8 - ((e - minE) / span) * (H - 16)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${minE} – ${maxE} m" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="12" fill="#1b2633"/><polygon points="0,${H} ${line} ${W},${H}" fill="#c47d45" fill-opacity="0.25"/><polyline points="${line}" fill="none" stroke="#c47d45" stroke-width="2.5"/></svg>`;
}

/** La página pública de una salida: HTML sin scripts, con los datos para las vistas previas de las redes. */
export function renderOutingPage(o: SharedOuting, url: string, origin: string): string {
  const t = TEXT[o.lang];
  const names = o.kinds.map((k) => KIND_NAMES[o.lang][k]).filter(Boolean).join(' · ');
  const stat = (label: string, value: string) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const stats = [
    stat(t.distance, km(o.distanceM, o.lang)),
    stat(t.time, clock(o.totalS)),
    stat(t.ascent, meters(o.ascentM, o.lang)),
    stat(t.descent, meters(o.descentM, o.lang)),
    o.maxEle !== null ? stat(t.maxEle, meters(o.maxEle, o.lang)) : '',
    o.calories !== null ? stat(t.calories, `${new Intl.NumberFormat(o.lang === 'es' ? 'es-AR' : 'en').format(o.calories)} kcal`) : '',
    stat(t.activities, String(o.activities)),
  ].join('');
  const description = `${km(o.distanceM, o.lang)} · ${clock(o.totalS)} · ↑ ${meters(o.ascentM, o.lang)}${names ? ` · ${names}` : ''}`;
  const route = routeSvg(o.route, t);
  const profile = profileSvg(o.profile);
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(o.name)} · VikArg</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VikArg">
<meta property="og:title" content="${esc(o.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(origin)}/brand/icon-512.png">
<meta name="twitter:card" content="summary">
<style>
:root{color-scheme:dark}
body{margin:0;background:#121a24;color:#e8e2d6;font:16px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:8px 0 4px}
.sub{color:#9aa7b6;margin:0 0 16px}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:16px 0}
dt{color:#9aa7b6;font-size:.85rem}dd{margin:0;font-size:1.25rem;font-weight:700}
h2{font-size:1rem;color:#9aa7b6;margin:20px 0 8px}
svg{width:100%;height:auto;display:block}
footer{margin-top:24px;color:#9aa7b6;font-size:.9rem}
a{color:#d8925a}
</style>
</head>
<body>
<main>
<h1>${esc(o.name)}</h1>
<p class="sub">${esc(o.date)}${names ? ` · ${esc(names)}` : ''}</p>
<dl>${stats}</dl>
${route ? `<h2>${esc(t.route)}</h2>${route}` : ''}
${profile ? `<h2>${esc(t.profile)}</h2>${profile}` : ''}
<footer>${esc(t.by)} <a href="${esc(origin)}/">${esc(t.open)}</a></footer>
</main>
</body>
</html>`;
}

const notFoundPage = (lang: 'es' | 'en') => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>VikArg</title></head><body style="font:16px system-ui;background:#121a24;color:#e8e2d6;padding:24px"><p>${esc(TEXT[lang].gone)}</p></body></html>`;

// ---------- Rutas ----------

const hash = (token: string) => createHash('sha256').update(token).digest();

export function sharedOutingRoutes(app: FastifyInstance, db: Db, config: Config): void {
  const creates = new Map<string, { count: number; resetAt: number }>();

  app.post('/api/outings', { bodyLimit: MAX_BODY_BYTES }, async (req, reply) => {
    const now = Date.now();
    const rate = creates.get(req.ip);
    if (rate && rate.resetAt > now && rate.count >= MAX_CREATES_PER_HOUR) return reply.code(429).send({ error: 'too-many' });
    const data = parseSharedOuting(req.body);
    if (!data) return reply.code(400).send({ error: 'invalid' });
    // Se limpian los vencidos y, si igual se llegó al tope, no se acepta más (el espacio no crece sin control).
    db.prepare('DELETE FROM shared_outings WHERE expires_at < ?').run(now);
    const total = (db.prepare('SELECT COUNT(*) AS n FROM shared_outings').get() as { n: number }).n;
    if (total >= config.sharedOutingsMax) return reply.code(503).send({ error: 'full' });
    const id = randomBytes(8).toString('base64url');
    const token = randomBytes(24).toString('base64url');
    const expiresAt = now + config.sharedOutingsTtlMs;
    db.prepare('INSERT INTO shared_outings (id, token_hash, data, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(id, hash(token).toString('hex'), JSON.stringify(data), now, expiresAt);
    creates.set(req.ip, { count: (rate && rate.resetAt > now ? rate.count : 0) + 1, resetAt: rate && rate.resetAt > now ? rate.resetAt : now + 3_600_000 });
    return reply.code(201).send({ id, path: `/o/${id}`, deleteToken: token, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.delete<{ Params: { id: string } }>('/api/outings/:id', async (req, reply) => {
    const row = db.prepare('SELECT token_hash FROM shared_outings WHERE id = ?').get(req.params.id) as { token_hash: string } | undefined;
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!row || !token || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), hash(token))) return reply.code(401).send({ error: 'unauthorized' });
    db.prepare('DELETE FROM shared_outings WHERE id = ?').run(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/o/:id', async (req, reply) => {
    const row = db.prepare('SELECT data FROM shared_outings WHERE id = ? AND expires_at >= ?').get(req.params.id, Date.now()) as { data: string } | undefined;
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:").header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');
    if (!row) return reply.code(404).type('text/html; charset=utf-8').send(notFoundPage('es'));
    const origin = `${req.protocol}://${req.hostname}`;
    return reply.header('cache-control', 'public, max-age=300').type('text/html; charset=utf-8').send(renderOutingPage(JSON.parse(row.data) as SharedOuting, `${origin}/o/${req.params.id}`, origin));
  });
}
