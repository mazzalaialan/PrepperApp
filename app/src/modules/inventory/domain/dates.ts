import type { IsoDay } from '@/core/model/types';

/**
 * Aritmética de días calendario sobre 'YYYY-MM-DD'. Se opera en UTC para que
 * los cambios de horario o de zona no muevan un vencimiento de día.
 */

function parse(day: IsoDay): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function format(date: Date): IsoDay {
  return date.toISOString().slice(0, 10);
}

/** Hoy en la zona horaria local del dispositivo. */
export function today(now = new Date()): IsoDay {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(day: IsoDay, days: number): IsoDay {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Suma meses; si el día no existe en el mes destino, usa el último (31-ene + 1 mes = 28/29-feb). */
export function addMonths(day: IsoDay, months: number): IsoDay {
  const d = parse(day);
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return format(d);
}

export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}
