import { describe, expect, it } from 'vitest';
import { addClimb, alarmReached, EMPTY_CLIMB, mapOffset, median, pushSample, reachAlarm, smoothAltitude } from './altimeter';

describe('altímetro', () => {
  it('mediana y suavizado cortan un salto suelto del GPS', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(smoothAltitude([1000, 1002, 1400, 1001, 1003])).toBe(1002);
  });

  it('calibración con el mapa: solo con buena posición', () => {
    expect(
      mapOffset([
        { gps: 1020, map: 1000, accuracy: 10 },
        { gps: 1022, map: 1001, accuracy: 15 },
        { gps: 900, map: 1000, accuracy: 200 },
      ]),
    ).toBe(-20.5);
    expect(mapOffset([{ gps: 900, map: 1000, accuracy: 200 }])).toBeNull();
  });

  it('desnivel con umbral: el ruido no suma', () => {
    let c = EMPTY_CLIMB;
    for (const a of [1000, 1004, 997, 1003, 998, 1001]) c = addClimb(c, a);
    expect(c.ascent).toBe(0);
    expect(c.descent).toBe(0);
    for (const a of [1015, 1030, 1050, 1035]) c = addClimb(c, a);
    expect(c.ascent).toBe(50);
    expect(c.descent).toBe(15);
  });

  it('alarmas de altura y de subida', () => {
    const up = reachAlarm(2000, 1500);
    expect(up).toEqual({ kind: 'reach', target: 2000, direction: 'up' });
    expect(alarmReached(up, 1999, 0)).toBe(false);
    expect(alarmReached(up, 2000, 0)).toBe(true);
    const down = reachAlarm(1000, 1500);
    expect(alarmReached(down, 1001, 0)).toBe(false);
    expect(alarmReached(down, 990, 0)).toBe(true);
    const climb = { kind: 'climb' as const, meters: 300, startAscent: 120 };
    expect(alarmReached(climb, 0, 400)).toBe(false);
    expect(alarmReached(climb, 0, 420)).toBe(true);
  });

  it('muestras: una cada 5 s y raleo al pasar el máximo', () => {
    let s = pushSample([], { t: 0, alt: 1, source: 'gps' });
    s = pushSample(s, { t: 1_000, alt: 2, source: 'gps' });
    expect(s).toHaveLength(1);
    for (let i = 1; i <= 10; i++) s = pushSample(s, { t: i * 5_000, alt: i, source: 'gps' }, 5_000, 8);
    expect(s.length).toBeLessThanOrEqual(8);
    expect(s.at(-1)!.alt).toBe(10);
    expect(s[0]!.t).toBe(0);
  });
});
