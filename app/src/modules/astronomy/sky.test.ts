import { describe, expect, it } from 'vitest';
import { moonDay, phaseName, sunDay } from './sky';

const BUENOS_AIRES = { lat: -34.6037, lon: -58.3816, alt: 25 };
// Medianoche del 30/10/2026 en Buenos Aires (UTC−3), sin depender de la zona del equipo que corre la prueba.
const OCT_30 = new Date('2026-10-30T03:00:00Z');
const hhmmUtc = (d: Date | null) => d?.toISOString().slice(11, 16);

describe('sunDay', () => {
  it('Buenos Aires, 30/10/2026: sale 5:53 y se pone 19:21 (hora local)', () => {
    const s = sunDay(BUENOS_AIRES, OCT_30);
    expect(hhmmUtc(s.sunrise)).toBe('08:53');
    expect(hhmmUtc(s.sunset)).toBe('22:21');
    expect(hhmmUtc(s.civilDawn)).toBe('08:27');
    expect(s.astronomicalDawn! < s.nauticalDawn!).toBe(true);
    expect(s.nauticalDawn! < s.civilDawn!).toBe(true);
    expect(s.civilDusk! > s.sunset!).toBe(true);
    expect(s.daylightMs / 3_600_000).toBeCloseTo(13.45, 1);
    expect(s.polar).toBeNull();
  });

  it('noche y día polar en Svalbard', () => {
    const winter = sunDay({ lat: 78.2, lon: 15.6 }, new Date('2026-12-21T00:00:00Z'));
    expect(winter).toMatchObject({ sunrise: null, sunset: null, polar: 'night', daylightMs: 0 });
    const summer = sunDay({ lat: 78.2, lon: 15.6 }, new Date('2026-06-21T00:00:00Z'));
    expect(summer).toMatchObject({ sunrise: null, sunset: null, polar: 'day', daylightMs: 86_400_000 });
  });
});

describe('moonDay', () => {
  it('fase del 30/10/2026 (menguante gibosa) y próximas fases', () => {
    const m = moonDay(BUENOS_AIRES, OCT_30);
    expect(m.phase).toBe('waningGibbous');
    expect(m.illumination).toBeGreaterThan(0.6);
    expect(m.illumination).toBeLessThan(0.9);
    expect(m.nextQuarters.map((q) => q.phase)).toEqual(['lastQuarter', 'new', 'firstQuarter', 'full']);
    expect(m.nextQuarters[3]!.date.toISOString().slice(0, 10)).toBe('2026-11-24');
  });
});

describe('phaseName', () => {
  it('ocho fases', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315, 359].map(phaseName)).toEqual([
      'new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent', 'new',
    ]);
  });
});
