import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Outing } from '@/core/model/types';
import { activeOuting, blankPlan, formatLeft, fromLocalInput, planMessage, planStatus, toLocalInput } from './outingPlan';

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m).toISOString();
const now = new Date(2026, 10, 10, 12, 0);
const outing = (plan: Partial<ReturnType<typeof blankPlan>>, name = 'Cerro'): Outing => newEntity<Outing>({ name, notes: '', plan: { ...blankPlan(), ...plan } });

describe('estado del plan', () => {
  it('sin hora límite no hay nada que vigilar', () => {
    expect(planStatus(undefined, now).state).toBe('none');
    expect(planStatus(blankPlan(), now).state).toBe('none');
  });
  it('en curso, por vencer, vencido y cerrado', () => {
    expect(planStatus({ ...blankPlan(), returnBy: at(18) }, now)).toMatchObject({ state: 'active', minutesLeft: 360 });
    expect(planStatus({ ...blankPlan(), returnBy: at(12, 20) }, now).state).toBe('dueSoon');
    expect(planStatus({ ...blankPlan(), returnBy: at(11, 0) }, now)).toMatchObject({ state: 'overdue', minutesLeft: -60 });
    expect(planStatus({ ...blankPlan(), returnBy: at(11, 0), closedAt: at(11, 30) }, now).state).toBe('closed');
  });
  it('todavía no salió', () => {
    expect(planStatus({ ...blankPlan(), startsAt: at(14), returnBy: at(18) }, now).state).toBe('planned');
  });
  it('un "estoy bien" se ve como último contacto', () => {
    expect(planStatus({ ...blankPlan(), returnBy: at(18), checkIns: [{ at: at(10), note: '' }, { at: at(11), note: '' }] }, now).lastCheckIn).toBe(at(11));
  });
});

describe('salida en curso', () => {
  it('elige la de hora límite más cercana y salta las cerradas', () => {
    const a = outing({ returnBy: at(18) }, 'A');
    const b = outing({ returnBy: at(13) }, 'B');
    const c = outing({ returnBy: at(9), closedAt: at(9, 30) }, 'C');
    expect(activeOuting([a, b, c], now)?.outing.name).toBe('B');
    expect(activeOuting([c], now)).toBeNull();
  });
});

describe('horas y texto', () => {
  it('ida y vuelta con datetime-local', () => {
    const iso = fromLocalInput('2026-11-10T18:30')!;
    expect(toLocalInput(iso)).toBe('2026-11-10T18:30');
    expect(fromLocalInput('')).toBeNull();
  });
  it('formatea lo que falta', () => {
    expect(formatLeft(35)).toBe('35 min');
    expect(formatLeft(-125)).toBe('2 h 05 min');
  });
  it('el mensaje para la familia lleva lo acordado', () => {
    const o = outing({ returnBy: at(18), leader: 'Ana', members: 'Ana\nLuis', contact: 'Mamá 11 5555', contingency: 'Bajar por el mismo camino' });
    const labels = { title: 'Plan', leader: 'Responsable', members: 'Somos', start: 'Salida', returnBy: 'Vuelta', contact: 'Avisar a', contingency: 'Si no vuelvo', lastCheckIn: 'Último contacto', tail: '—' };
    const text = planMessage(o, labels, () => 'HORA', 'https://x/l/1');
    expect(text).toContain('Plan: Cerro');
    expect(text).toContain('Vuelta: HORA');
    expect(text).toContain('Somos: Ana, Luis');
    expect(text).toContain('Si no vuelvo: Bajar por el mismo camino');
    expect(text).toContain('https://x/l/1');
  });
});
