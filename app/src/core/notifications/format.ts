/**
 * Texto de las notificaciones. Lo usa el service worker, que no carga
 * i18next: por eso los textos viven acá y no en locales/*.json.
 */

export interface AlertSummary {
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock' | string;
  dueDate: string | null;
}

type Lang = 'es' | 'en';

const TEXT = {
  es: {
    title: (n: number) => (n === 1 ? '1 alerta pendiente' : `${n} alertas pendientes`),
    expired: 'vencido',
    today: 'vence hoy',
    on: (d: string) => `vence el ${d}`,
    capacity: 'por agotarse',
    shortage: 'falta stock según tus recomendaciones',
    minStock: 'debajo del stock mínimo',
    more: (n: number) => `y ${n} más`,
    testTitle: 'VikArg Prepping Tools',
    testBody: 'Las notificaciones funcionan correctamente.',
    here: 'Donde estás',
    rainSoon: (min: number, place: string) => `Lluvia en unos ${min} min · ${place}`,
    raining: (place: string) => `Está lloviendo · ${place}`,
    rainBody: (mm: string) => `Se esperan ${mm} mm en las próximas 2 horas.`,
    lastFix: (ago: string) => `Según tu última ubicación conocida (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Rayos a ${km} km al ${dir} · ${place}`,
    lightningBody: 'Buscá refugio: un edificio o un auto cerrado. Alejate de árboles, alambrados y lugares altos. Detectado por satélite (±8 km).',
    dirs: ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'],
  },
  en: {
    title: (n: number) => (n === 1 ? '1 pending alert' : `${n} pending alerts`),
    expired: 'expired',
    today: 'expires today',
    on: (d: string) => `expires ${d}`,
    capacity: 'running low',
    shortage: 'short of your recommended stock',
    minStock: 'below minimum stock',
    more: (n: number) => `and ${n} more`,
    testTitle: 'VikArg Prepping Tools',
    testBody: 'Notifications are working.',
    here: 'Where you are',
    rainSoon: (min: number, place: string) => `Rain in about ${min} min · ${place}`,
    raining: (place: string) => `It's raining · ${place}`,
    rainBody: (mm: string) => `${mm} mm expected in the next 2 hours.`,
    lastFix: (ago: string) => `Based on your last known location (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Lightning ${km} km ${dir} · ${place}`,
    lightningBody: 'Take shelter: a building or a closed car. Stay away from trees, wire fences and high ground. Detected by satellite (±8 km).',
    dirs: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
  },
} as const;

const MAX_LISTED = 3;

function shortDate(day: string, lang: Lang): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export function alertsNotification(alerts: AlertSummary[], lang: Lang, today: string): { title: string; body: string } {
  const tx = TEXT[lang];
  const describe = (a: AlertSummary) => {
    if (a.kind === 'shortage') return `${a.itemName}: ${tx.shortage}`;
    if (a.kind === 'minStock') return `${a.itemName}: ${tx.minStock}`;
    if (a.kind === 'capacity' || !a.dueDate) return `${a.itemName}: ${tx.capacity}`;
    if (a.dueDate < today) return `${a.itemName}: ${tx.expired}`;
    if (a.dueDate === today) return `${a.itemName}: ${tx.today}`;
    return `${a.itemName}: ${tx.on(shortDate(a.dueDate, lang))}`;
  };
  // Lo más urgente primero: vencidos y los que vencen antes.
  const sorted = [...alerts].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const lines = sorted.slice(0, MAX_LISTED).map(describe);
  if (sorted.length > MAX_LISTED) lines.push(tx.more(sorted.length - MAX_LISTED));
  return { title: tx.title(alerts.length), body: lines.join('\n') };
}

export function testNotification(lang: Lang): { title: string; body: string } {
  return { title: TEXT[lang].testTitle, body: TEXT[lang].testBody };
}

/** Aviso de lluvia que manda el servidor (ver server/src/rain/watch.ts). */
export interface RainPush {
  placeId: string;
  /** null = "donde estoy". */
  label: string | null;
  state: 'raining' | 'soon';
  inMinutes: number;
  mm: number;
  /** De cuándo es la ubicación de "donde estoy". */
  fixAt: string | null;
}

/** Aviso de rayos cercanos que manda el servidor (ver server/src/lightning/watch.ts). */
export interface LightningPush {
  placeId: string;
  label: string | null;
  distanceKm: number;
  /** Rumbo del lugar hacia el rayo, en grados. */
  bearing: number;
  fixAt: string | null;
}

function lastFixNote(fixAt: string | null, lang: Lang, now: number): string {
  // Con la app cerrada no hay GPS: si la ubicación tiene más de media hora, se aclara.
  const minutes = fixAt ? Math.round((now - Date.parse(fixAt)) / 60_000) : 0;
  if (minutes < 30) return '';
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  return `\n${TEXT[lang].lastFix(minutes < 90 ? rtf.format(-minutes, 'minute') : rtf.format(-Math.round(minutes / 60), 'hour'))}`;
}

export function lightningNotification(l: LightningPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((l.bearing % 360) + 360) % 360) / 45) % 8]!;
  return { title: tx.lightning(Math.max(1, l.distanceKm), dir, l.label ?? tx.here), body: tx.lightningBody + lastFixNote(l.fixAt, lang, now) };
}

export function rainNotification(rain: RainPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const place = rain.label ?? tx.here;
  const title = rain.state === 'raining' ? tx.raining(place) : tx.rainSoon(rain.inMinutes, place);
  const body = tx.rainBody(new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(rain.mm)) + lastFixNote(rain.fixAt, lang, now);
  return { title, body };
}
