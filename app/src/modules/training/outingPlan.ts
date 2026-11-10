import type { Outing, OutingPlan } from '@/core/model/types';

/**
 * Plan de una salida: se deja dicho a qué hora se vuelve y a quién avisar, y la
 * app marca cuánto falta, deja dar "estoy bien" y avisa si se pasa la hora.
 */

/** Falta menos que esto para la hora límite: se avisa que se acerca. */
export const DUE_SOON_MIN = 30;

export function blankPlan(): OutingPlan {
  return { startsAt: null, returnBy: null, leader: '', members: '', contact: '', contingency: '', checkIns: [], closedAt: null };
}

export type PlanState = 'none' | 'planned' | 'active' | 'dueSoon' | 'overdue' | 'closed';

export interface PlanStatus {
  state: PlanState;
  /** Minutos hasta la hora límite (negativo si ya pasó). `null` sin hora límite. */
  minutesLeft: number | null;
  lastCheckIn: string | null;
}

/** En qué está el plan: sin hora límite no hay nada que vigilar. */
export function planStatus(plan: OutingPlan | undefined, now: Date): PlanStatus {
  const last = plan?.checkIns.at(-1)?.at ?? null;
  if (!plan || !plan.returnBy) return { state: 'none', minutesLeft: null, lastCheckIn: last };
  const left = Math.round((Date.parse(plan.returnBy) - now.getTime()) / 60_000);
  if (plan.closedAt) return { state: 'closed', minutesLeft: left, lastCheckIn: last };
  if (plan.startsAt && Date.parse(plan.startsAt) > now.getTime()) return { state: 'planned', minutesLeft: left, lastCheckIn: last };
  if (left < 0) return { state: 'overdue', minutesLeft: left, lastCheckIn: last };
  return { state: left <= DUE_SOON_MIN ? 'dueSoon' : 'active', minutesLeft: left, lastCheckIn: last };
}

/** La salida con el plan en curso que más urgente es (la de hora límite más cercana). */
export function activeOuting(outings: Iterable<Outing>, now: Date): { outing: Outing; status: PlanStatus } | null {
  let best: { outing: Outing; status: PlanStatus } | null = null;
  for (const outing of outings) {
    if (outing.deletedAt) continue;
    const status = planStatus(outing.plan, now);
    if (status.state === 'none' || status.state === 'closed' || status.state === 'planned') continue;
    if (!best || (status.minutesLeft ?? 0) < (best.status.minutesLeft ?? 0)) best = { outing, status };
  }
  return best;
}

/** Datos para "datetime-local": la hora local sin zona ("2026-11-10T18:30"). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "2 h 05 min" o "35 min". */
export function formatLeft(minutes: number): string {
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

export interface PlanLabels {
  title: string;
  leader: string;
  members: string;
  start: string;
  returnBy: string;
  contact: string;
  contingency: string;
  lastCheckIn: string;
  tail: string;
}

/** Texto para mandar a la familia antes de salir (SMS o WhatsApp). */
export function planMessage(outing: Outing, labels: PlanLabels, fmt: (iso: string) => string, liveUrl?: string): string {
  const p = outing.plan;
  if (!p) return outing.name;
  const lines = [`${labels.title}: ${outing.name}`];
  if (p.startsAt) lines.push(`${labels.start}: ${fmt(p.startsAt)}`);
  if (p.returnBy) lines.push(`${labels.returnBy}: ${fmt(p.returnBy)}`);
  if (p.leader.trim()) lines.push(`${labels.leader}: ${p.leader.trim()}`);
  const members = p.members.split('\n').map((x) => x.trim()).filter(Boolean);
  if (members.length) lines.push(`${labels.members}: ${members.join(', ')}`);
  if (p.contact.trim()) lines.push(`${labels.contact}: ${p.contact.trim()}`);
  if (p.contingency.trim()) lines.push(`${labels.contingency}: ${p.contingency.trim()}`);
  const last = p.checkIns.at(-1);
  if (last) lines.push(`${labels.lastCheckIn}: ${fmt(last.at)}`);
  if (liveUrl) lines.push(liveUrl);
  lines.push(labels.tail);
  return lines.join('\n');
}
