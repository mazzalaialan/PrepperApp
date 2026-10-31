import { describe, expect, it } from 'vitest';
import { forecastUrl, parseForecast, skyOf, warningsOf, type Forecast } from './forecast';

describe('forecastUrl', () => {
  it('usa la URL configurada (con o sin barra final) y pide 7 días en la zona del lugar', () => {
    const url = new URL(forecastUrl('https://clima.mio.ar/', -34.60372, -58.38159));
    expect(url.origin + url.pathname).toBe('https://clima.mio.ar/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('-34.6037');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('7');
  });
});

describe('skyOf', () => {
  it('agrupa los códigos WMO', () => {
    expect([0, 2, 3, 45, 53, 63, 81, 73, 86, 95, 99].map(skyOf)).toEqual([
      'clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm',
    ]);
  });
});

describe('parseForecast', () => {
  it('convierte la respuesta y rechaza datos faltantes', () => {
    const api = {
      latitude: -34.6,
      longitude: -58.4,
      timezone: 'America/Argentina/Buenos_Aires',
      current: {
        time: '2026-10-30T14:00', temperature_2m: 22.5, relative_humidity_2m: 60, apparent_temperature: 23, precipitation: 0,
        weather_code: 2, wind_speed_10m: 15, wind_direction_10m: 90, wind_gusts_10m: 30, pressure_msl: 1012,
      },
      hourly: { time: ['2026-10-30T14:00'], temperature_2m: [22.5], precipitation_probability: [null], weather_code: [2], wind_speed_10m: [15] },
      daily: {
        time: ['2026-10-30'], weather_code: [2], temperature_2m_max: [25], temperature_2m_min: [14], precipitation_sum: [0],
        precipitation_probability_max: [10], wind_speed_10m_max: [20], wind_gusts_10m_max: [40], uv_index_max: [7],
      },
    };
    const f = parseForecast(api, new Date('2026-10-30T17:00:00Z'));
    expect(f.fetchedAt).toBe('2026-10-30T17:00:00.000Z');
    expect(f.current.temperature).toBe(22.5);
    expect(f.hourly[0]!.precipProbability).toBeNull();
    expect(f.daily[0]!.uvMax).toBe(7);
    expect(() => parseForecast({ ...api, current: { ...api.current, temperature_2m: 'x' as unknown as number } })).toThrow();
  });
});

describe('warningsOf', () => {
  const day = (over: Partial<Forecast['daily'][number]>): Forecast['daily'][number] => ({
    date: '2026-11-01', code: 1, max: 25, min: 12, precipitation: 0, precipProbability: 0, windMax: 20, gustMax: 30, uvMax: 5, ...over,
  });

  it('día tranquilo: sin avisos', () => {
    expect(warningsOf([day({})])).toEqual([]);
  });

  it('tormenta, ráfagas, lluvia intensa, helada, calor y UV', () => {
    const kinds = warningsOf([
      day({ code: 95, gustMax: 85, precipitation: 45 }),
      day({ date: '2026-11-02', min: -2 }),
      day({ date: '2026-11-03', max: 38, uvMax: 11 }),
      day({ date: '2026-11-04', code: 73 }),
    ]).map((w) => w.kind);
    expect(kinds).toEqual(['storm', 'gusts', 'heavyRain', 'frost', 'heat', 'uv', 'snow']);
  });
});
