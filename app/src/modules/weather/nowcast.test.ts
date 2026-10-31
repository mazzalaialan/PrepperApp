import { describe, expect, it } from 'vitest';
import { rainOutlook, type RainSlot } from './nowcast';

const slots = (mm: number[], start = '2026-10-30T14:00'): RainSlot[] =>
  mm.map((v, i) => {
    const d = new Date(`${start}:00Z`);
    d.setUTCMinutes(d.getUTCMinutes() + i * 15);
    return { time: d.toISOString().slice(0, 16), mm: v };
  });

describe('rainOutlook', () => {
  it('seco si nada supera 0,2 mm por intervalo', () => {
    expect(rainOutlook({ now: '2026-10-30T14:00', slots: slots([0, 0.1, 0, 0.1, 0, 0, 0, 0]) })).toEqual({ state: 'dry' });
  });

  it('empieza en 45 minutos y suma lo que cae desde ahí', () => {
    expect(rainOutlook({ now: '2026-10-30T14:00', slots: slots([0, 0, 0, 1.2, 2, 0.5, 0, 0]) })).toEqual({
      state: 'soon',
      inMinutes: 45,
      startsAt: '2026-10-30T14:45',
      mm: 3.7,
    });
  });

  it('lloviendo si el intervalo actual ya tiene lluvia', () => {
    expect(rainOutlook({ now: '2026-10-30T14:07', slots: slots([0.8, 0.4, 0, 0, 0, 0, 0, 0]) })).toMatchObject({ state: 'raining' });
  });

  it('ignora intervalos ya pasados', () => {
    expect(rainOutlook({ now: '2026-10-30T15:00', slots: slots([3, 3, 3, 0, 0, 0, 0, 0]) })).toEqual({ state: 'dry' });
  });
});
