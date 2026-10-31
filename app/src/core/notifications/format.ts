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
    title: (n: number) => (n === 1 ? '1 alerta en tu inventario' : `${n} alertas en tu inventario`),
    expired: 'vencido',
    today: 'vence hoy',
    on: (d: string) => `vence el ${d}`,
    capacity: 'por agotarse',
    shortage: 'falta stock según tus recomendaciones',
    minStock: 'debajo del stock mínimo',
    more: (n: number) => `y ${n} más`,
    testTitle: 'VikArg Survival',
    testBody: 'Las notificaciones funcionan correctamente.',
  },
  en: {
    title: (n: number) => (n === 1 ? '1 alert in your inventory' : `${n} alerts in your inventory`),
    expired: 'expired',
    today: 'expires today',
    on: (d: string) => `expires ${d}`,
    capacity: 'running low',
    shortage: 'short of your recommended stock',
    minStock: 'below minimum stock',
    more: (n: number) => `and ${n} more`,
    testTitle: 'VikArg Survival',
    testBody: 'Notifications are working.',
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
