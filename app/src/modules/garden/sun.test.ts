import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { GardenBed } from '@/core/model/types';
import { bedSun, inSector, sunHoursOnDay, wallSector } from './sun';

const BA = { lat: -34.6, lon: -58.4 };
const bed = (f: Partial<GardenBed> = {}) =>
  newEntity<GardenBed>({ name: 'b', kind: 'bed', greenhouse: false, widthCm: 120, lengthCm: 240, sunHours: 8, waypointId: null, notes: '', order: 0, ...f });

describe('sector', () => {
  it('cruza el norte', () => {
    expect(inSector(10, 340, 30)).toBe(true);
    expect(inSector(180, 340, 30)).toBe(false);
    expect(inSector(100, 90, 180)).toBe(true);
  });
  it('una pared alta y pegada tapa más', () => {
    const low = wallSector(bed({ bearingDeg: 0 }), 'front', 100);
    const high = wallSector(bed({ bearingDeg: 0 }), 'front', 300);
    expect(high.heightDeg).toBeGreaterThan(low.heightDeg);
    expect(inSector(0, low.fromDeg, low.toDeg)).toBe(true);
  });
});

describe('horas de sol', () => {
  const summer = new Date(2026, 11, 21, 12);
  it('sin nada que lo tape, el día largo de verano', () => {
    const r = sunHoursOnDay(BA, summer, []);
    expect(r.hours).toBeGreaterThan(12);
    expect(r.hours).toBe(r.open);
  });
  it('una pared al norte en el hemisferio sur le saca sol en invierno', () => {
    const winter = new Date(2026, 5, 21, 12);
    const wall = wallSector(bed({ bearingDeg: 0, widthCm: 200, lengthCm: 200 }), 'front', 250);
    const open = sunHoursOnDay(BA, winter, []).hours;
    const shaded = sunHoursOnDay(BA, winter, [wall]).hours;
    expect(shaded).toBeLessThan(open - 2);
  });
  it('la media sombra resta el porcentaje', () => {
    const a = sunHoursOnDay(BA, summer, []).hours;
    expect(sunHoursOnDay(BA, summer, [], 50).hours).toBeCloseTo(a / 2, 5);
  });
  it('bedSun: el verano da más que el invierno', () => {
    const s = bedSun(bed(), BA, new Date(2026, 10, 10));
    expect(s.summer.hours).toBeGreaterThan(s.winter.hours);
  });
});

describe('altura rara del GPS', () => {
  it('una altura absurda no rompe el cálculo', () => {
    const r = sunHoursOnDay({ ...BA, alt: -Number.MAX_VALUE }, new Date(2026, 11, 21, 12), []);
    expect(r.hours).toBeGreaterThan(12);
  });
});
