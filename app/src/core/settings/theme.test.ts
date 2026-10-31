import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { inSchedule, isAfterDusk, roundForDusk, scheduledRed } from './theme';

const at = (hh: number, mm = 0) => new Date(2026, 9, 30, hh, mm);

describe('rojo nocturno automático', () => {
  it('horario que cruza la medianoche', () => {
    expect([at(20, 59), at(21), at(23, 30), at(3), at(6, 59), at(7)].map((d) => inSchedule(d, '21:00', '07:00'))).toEqual([
      false, true, true, true, true, false,
    ]);
  });

  it('horario dentro del mismo día', () => {
    expect([at(12), at(13), at(17)].map((d) => inSchedule(d, '13:00', '17:00'))).toEqual([false, true, false]);
    expect(inSchedule(at(10), '10:00', '10:00')).toBe(false);
  });

  it('anochecer en Buenos Aires (30/10): de noche sí, de día y al atardecer todavía no', () => {
    const ba = { lat: -34.5, lon: -58.5 };
    expect(isAfterDusk(new Date('2026-10-30T23:30:00Z'), ba.lat, ba.lon)).toBe(true); // 20:30, fin del crepúsculo ~19:47
    expect(isAfterDusk(new Date('2026-10-30T22:25:00Z'), ba.lat, ba.lon)).toBe(false); // 19:25, recién se puso el sol
    expect(isAfterDusk(new Date('2026-10-30T15:00:00Z'), ba.lat, ba.lon)).toBe(false); // mediodía
    expect(isAfterDusk(new Date('2026-10-31T08:00:00Z'), ba.lat, ba.lon)).toBe(true); // 05:00, antes del alba civil
  });

  it('según la opción elegida', () => {
    const night = new Date('2026-10-30T23:30:00Z');
    expect(scheduledRed({ ...DEFAULT_SETTINGS, redSchedule: 'off' }, night)).toBe(false);
    expect(scheduledRed({ ...DEFAULT_SETTINGS, redSchedule: 'dusk', duskPlace: null }, night)).toBe(false);
    expect(scheduledRed({ ...DEFAULT_SETTINGS, redSchedule: 'dusk', duskPlace: { lat: -34.5, lon: -58.5 } }, night)).toBe(true);
  });

  it('la ubicación del anochecer se redondea a medio grado', () => {
    expect(roundForDusk(-34.6037, -58.3816)).toEqual({ lat: -34.5, lon: -58.5 });
  });
});
