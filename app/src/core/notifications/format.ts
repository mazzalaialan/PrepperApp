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
    rainObserved: (rate: string) => `El satélite ve lluvia de unos ${rate} mm/h ahora (estimación por infrarrojo, orientativa).`,
    lastFix: (ago: string) => `Según tu última ubicación conocida (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Rayos a ${km} km al ${dir} · ${place}`,
    lightningBody: 'Buscá refugio: un edificio o un auto cerrado. Alejate de árboles, alambrados y lugares altos. Detectado por satélite (±8 km).',
    dirs: ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'],
    informative: 'Aviso informativo, no oficial: las alertas oficiales son del SMN.',
    updateTap: 'Tocá para abrir la app y actualizarla.',
    quake: (mag: string, km: number, dir: string, place: string) => `Sismo de magnitud ${mag} a ${km} km al ${dir} · ${place}`,
    quakeBody: (where: string) => `${where}. Datos de USGS (Servicio Geológico de EE. UU.), sin revisar por el INPRES.`,
    tsunami: 'USGS indica posible tsunami: si estás cerca de la costa, alejate y buscá un lugar alto.',
    hazard: (kind: string, km: number, dir: string, place: string) => `${kind} a ${km} km al ${dir} · ${place}`,
    hazardKinds: { TC: 'Ciclón tropical', FL: 'Inundación', WF: 'Incendio forestal', VO: 'Erupción volcánica' },
    hazardBody: (name: string, level: string) => `${name}. Alerta ${level} de GDACS (ONU y Comisión Europea).`,
    levels: { Green: 'verde', Orange: 'naranja', Red: 'roja' },
    hazardInformative: 'Aviso informativo, no oficial: seguí las indicaciones de los organismos oficiales (INPRES, SMN, Protección Civil).',
    hazardStock: (places: string) => `Tenés reserva cerca: ${places}. Si podés, ponela a resguardo.`,
    gardenFrost: (when: string, min: number) => `Helada ${when}: mínima de ${min} °C`,
    gardenFrostBody: (crops: string, place: string | null) => `Tapá ${crops}${place ? ` (${place})` : ''}.`,
    gardenTonight: 'esta noche',
    gardenWater: (place: string | null) => `Hay que regar la huerta${place ? ` · ${place}` : ''}`,
    gardenWaterBody: (mm: number, rain: number) => `Al suelo le faltan unos ${mm} mm (llovieron ${rain} mm en 10 días).`,
    gardenTasks: (n: number) => (n === 1 ? 'Huerta: 1 tarea para hoy' : `Huerta: ${n} tareas para hoy`),
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
    rainObserved: (rate: string) => `The satellite sees about ${rate} mm/h of rain now (infrared estimate, approximate).`,
    lastFix: (ago: string) => `Based on your last known location (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Lightning ${km} km ${dir} · ${place}`,
    lightningBody: 'Take shelter: a building or a closed car. Stay away from trees, wire fences and high ground. Detected by satellite (±8 km).',
    dirs: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
    informative: 'Informational, not official: official alerts come from the SMN.',
    updateTap: 'Tap to open the app and update it.',
    quake: (mag: string, km: number, dir: string, place: string) => `Magnitude ${mag} earthquake ${km} km ${dir} · ${place}`,
    quakeBody: (where: string) => `${where}. Data from USGS, not reviewed by the national seismic agency.`,
    tsunami: 'USGS reports a possible tsunami: if you are near the coast, move away and to high ground.',
    hazard: (kind: string, km: number, dir: string, place: string) => `${kind} ${km} km ${dir} · ${place}`,
    hazardKinds: { TC: 'Tropical cyclone', FL: 'Flood', WF: 'Wildfire', VO: 'Volcanic eruption' },
    hazardBody: (name: string, level: string) => `${name}. GDACS ${level} alert (UN and European Commission).`,
    levels: { Green: 'green', Orange: 'orange', Red: 'red' },
    hazardInformative: 'Informational, not official: follow the instructions of the official agencies.',
    hazardStock: (places: string) => `You have supplies nearby: ${places}. If you can, move them to safety.`,
    gardenFrost: (when: string, min: number) => `Frost ${when}: low of ${min} °C`,
    gardenFrostBody: (crops: string, place: string | null) => `Cover ${crops}${place ? ` (${place})` : ''}.`,
    gardenTonight: 'tonight',
    gardenWater: (place: string | null) => `Time to water the garden${place ? ` · ${place}` : ''}`,
    gardenWaterBody: (mm: number, rain: number) => `The soil is short about ${mm} mm (${rain} mm of rain in 10 days).`,
    gardenTasks: (n: number) => (n === 1 ? 'Garden: 1 task for today' : `Garden: ${n} tasks for today`),
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

/** Actualización importante que manda el servidor (ver server/src/announce.ts). */
export interface UpdatePush {
  version: string;
  title: { es: string; en: string };
  body: { es: string; en: string };
}

export function updateNotification(u: UpdatePush, lang: Lang): { title: string; body: string } {
  return { title: u.title[lang] || u.title.es, body: `${u.body[lang] || u.body.es}\n${TEXT[lang].updateTap}` };
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
  /** Lluvia vista por el satélite en el lugar (mm/h), si la hubo. */
  observedMmH?: number;
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

/** Peligro natural cerca que manda el servidor (ver server/src/hazards/watch.ts). */
export interface HazardPush {
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
  /** Ubicaciones con reserva dentro del radio (ver server/src/hazards/watch.ts). */
  stock?: string[];
  url: string;
}

export function hazardNotification(h: HazardPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((h.bearing % 360) + 360) % 360) / 45) % 8]!;
  const place = h.label ?? tx.here;
  const km = Math.max(1, h.distanceKm);
  const fix = lastFixNote(h.fixAt, lang, now) + (h.stock?.length ? `\n${tx.hazardStock(h.stock.join(', '))}` : '');
  if (h.kind === 'quake') {
    const mag = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(h.magnitude ?? 0);
    const tsunami = h.tsunami ? `\n${tx.tsunami}` : '';
    return { title: tx.quake(mag, km, dir, place), body: tx.quakeBody(h.name) + tsunami + fix + `\n${tx.hazardInformative}` };
  }
  return {
    title: tx.hazard(tx.hazardKinds[h.kind], km, dir, place),
    body: tx.hazardBody(h.name, tx.levels[h.level ?? 'Green']) + fix + `\n${tx.hazardInformative}`,
  };
}

export function lightningNotification(l: LightningPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((l.bearing % 360) + 360) % 360) / 45) % 8]!;
  return { title: tx.lightning(Math.max(1, l.distanceKm), dir, l.label ?? tx.here), body: tx.lightningBody + lastFixNote(l.fixAt, lang, now) + `\n${tx.informative}` };
}

export function rainNotification(rain: RainPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const place = rain.label ?? tx.here;
  const title = rain.state === 'raining' ? tx.raining(place) : tx.rainSoon(rain.inMinutes, place);
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const main = rain.observedMmH !== undefined ? tx.rainObserved(fmt.format(rain.observedMmH)) : tx.rainBody(fmt.format(rain.mm));
  const body = main + lastFixNote(rain.fixAt, lang, now) + `\n${tx.informative}`;
  return { title, body };
}

/** Aviso de la huerta del servidor (helada, riego o tareas). ⚠ Mismo tipo que GardenPush en server/src/push.ts. */
export type GardenPush =
  | { kind: 'frost'; placeId: string; label: string | null; date: string; min: number; crops: string[] }
  | { kind: 'water'; placeId: string; label: string | null; mm: number; rain: number }
  | { kind: 'tasks'; tasks: string[] };

export function gardenNotification(g: GardenPush, lang: Lang): { title: string; body: string } {
  const tx = TEXT[lang];
  if (g.kind === 'frost') {
    // La helada es la de la madrugada del día `date`: se avisa la tarde anterior.
    return { title: tx.gardenFrost(tx.gardenTonight, g.min), body: tx.gardenFrostBody(g.crops.join(', '), g.label) };
  }
  if (g.kind === 'water') return { title: tx.gardenWater(g.label), body: tx.gardenWaterBody(g.mm, g.rain) };
  const lines = g.tasks.slice(0, MAX_LISTED);
  if (g.tasks.length > MAX_LISTED) lines.push(tx.more(g.tasks.length - MAX_LISTED));
  return { title: tx.gardenTasks(g.tasks.length), body: lines.join('\n') };
}
