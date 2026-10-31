/**
 * Qué alertas merecen una notificación hoy: solo lo nuevo desde el último
 * aviso, o lo que vence hoy.
 *
 * ⚠ Copia idéntica de app/src/core/notifications/notifiable.ts: mantener ambas en sincronía.
 */

export interface NotifiableAlert {
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock';
  dueDate: string | null;
  notifyFrom: string;
}

export function selectNotifiable<T extends NotifiableAlert>(alerts: T[], today: string, lastNotifiedDay: string | null): T[] {
  return alerts.filter(
    (a) => a.notifyFrom <= today && (lastNotifiedDay === null || a.notifyFrom > lastNotifiedDay || a.dueDate === today),
  );
}
