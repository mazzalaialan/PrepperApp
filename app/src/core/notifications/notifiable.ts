/**
 * Qué alertas merecen una notificación hoy (ARQUITECTURA §6.3).
 * Se avisa solo por lo nuevo desde el último aviso, o por lo que vence hoy:
 * repetir la lista completa todos los días haría que el usuario las apague.
 *
 * ⚠ Copia idéntica en server/src/notifiable.ts: mantener ambas en sincronía.
 */

export interface NotifiableAlert {
  itemName: string;
  kind: 'expiry' | 'capacity';
  dueDate: string | null;
  notifyFrom: string;
}

export function selectNotifiable<T extends NotifiableAlert>(alerts: T[], today: string, lastNotifiedDay: string | null): T[] {
  return alerts.filter(
    (a) => a.notifyFrom <= today && (lastNotifiedDay === null || a.notifyFrom > lastNotifiedDay || a.dueDate === today),
  );
}
