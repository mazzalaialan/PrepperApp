import { describe, expect, it } from 'vitest';
import { compass8, hasWaves, knots, marineBase, marineUrl, parseForecast, pointAt, seaState, windUrl } from './waves';

describe('oleaje y viento', () => {
  it('el pronóstico marino está en el servidor marino de Open-Meteo, o en el propio si la base es otra', () => {
    expect(marineBase('https://api.open-meteo.com/')).toBe('https://marine-api.open-meteo.com');
    expect(marineBase('https://clima.ejemplo.org')).toBe('https://clima.ejemplo.org');
    const u = marineUrl('https://api.open-meteo.com', -38.1, -57.45);
    expect(u).toContain('https://marine-api.open-meteo.com/v1/marine?');
    expect(u).toContain('latitude=-38.1000&longitude=-57.4500');
    expect(u).toContain('wave_height');
    expect(u).toContain('timeformat=unixtime');
    expect(windUrl('https://api.open-meteo.com', -38.1, -57.45)).toContain('wind_gusts_10m');
  });

  it('junta olas y viento por hora; sin viento queda vacío', () => {
    const marine = { latitude: -38.125, longitude: -57.458, hourly: { time: [1000, 4600], wave_height: [1.9, 2.1], wave_period: [7, 7.5], wave_direction: [200, 210], swell_wave_height: [1.2, 1.3], swell_wave_period: [9, 9] } };
    const wind = { hourly: { time: [1000, 4600], wind_speed_10m: [20, 30], wind_gusts_10m: [35, 45], wind_direction_10m: [180, 190] } };
    const f = parseForecast(marine, wind, 5)!;
    expect(f.points).toHaveLength(2);
    expect(f.points[0]).toMatchObject({ time: 1_000_000, waveHeight: 1.9, wavePeriod: 7, swellHeight: 1.2, windKmh: 20, gustKmh: 35, windDirection: 180 });
    expect(hasWaves(f)).toBe(true);
    expect(parseForecast(marine, null)!.points[0]).toMatchObject({ waveHeight: 1.9, windKmh: null });
    expect(parseForecast({ hourly: { time: [] } }, null)).toBeNull();
  });

  it('un río o un lago (todo null) no tiene oleaje', () => {
    const f = parseForecast({ hourly: { time: [1, 2], wave_height: [null, null] } }, null)!;
    expect(hasWaves(f)).toBe(false);
  });

  it('el punto más cercano a un instante', () => {
    const f = parseForecast({ hourly: { time: [0, 3600, 7200], wave_height: [1, 2, 3] } }, null)!;
    expect(pointAt(f, 3_500_000)!.waveHeight).toBe(2);
    expect(pointAt(f, 99_000_000)!.waveHeight).toBe(3);
  });

  it('estado del mar (escala Douglas)', () => {
    expect([0.05, 0.3, 1, 2, 3, 5, 7, 10, 15].map(seaState)).toEqual(['calm', 'smooth', 'slight', 'moderate', 'rough', 'veryRough', 'high', 'veryHigh', 'phenomenal']);
    expect(seaState(0.5)).toBe('slight');
    expect(seaState(1.25)).toBe('moderate');
  });

  it('punto cardinal y nudos', () => {
    expect(compass8(0)).toBe('N');
    expect(compass8(359)).toBe('N');
    expect(compass8(135)).toBe('SE');
    expect(compass8(225)).toBe('SW');
    expect(compass8(-45)).toBe('NW');
    expect(knots(18.52)).toBeCloseTo(10, 5);
  });
});
