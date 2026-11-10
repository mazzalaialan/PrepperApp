import { describe, expect, it } from 'vitest';
import { forecastUrl, parseForecast, periodSummaries, placeNow, skyOf, stormRisk, warningsOf, type Forecast } from './forecast';

describe('forecastUrl con altura', () => {
  it('pasa la altura real del lugar para corregir la temperatura, y se salta una absurda o ausente', () => {
    expect(new URL(forecastUrl('https://x.org', -41.1, -71.3, 1850.4)).searchParams.get('elevation')).toBe('1850');
    expect(new URL(forecastUrl('https://x.org', -41.1, -71.3)).searchParams.has('elevation')).toBe(false);
    expect(new URL(forecastUrl('https://x.org', -41.1, -71.3, null)).searchParams.has('elevation')).toBe(false);
    expect(new URL(forecastUrl('https://x.org', -41.1, -71.3, -Number.MAX_VALUE)).searchParams.has('elevation')).toBe(false);
  });
});

describe('forecastUrl', () => {
  it('usa la URL configurada (con o sin barra final) y pide 16 días en la zona del lugar', () => {
    const url = new URL(forecastUrl('https://clima.mio.ar/', -34.60372, -58.38159));
    expect(url.origin + url.pathname).toBe('https://clima.mio.ar/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('-34.6037');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('16');
  });
});

describe('periodSummaries', () => {
  const hour = (h: number, over: Partial<Forecast['hourly'][number]> = {}): Forecast['hourly'][number] => ({
    time: `2026-11-04T${String(h).padStart(2, '0')}:00`,
    temperature: 10 + h,
    precipProbability: 0,
    code: 1,
    windSpeed: 10,
    windDirection: 180,
    windGusts: 20,
    apparent: null,
    humidity: 60,
    precipitation: 0,
    snowfall: 0,
    cloudCover: 30,
    visibility: 20_000,
    cape: 50,
    freezingLevel: 3000,
    ...over,
  });

  it('madrugada, mañana, tarde y noche con mínimos, máximos y totales', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      hour(h, h >= 13 && h <= 15 ? { code: 61, precipProbability: 70, precipitation: 2.5, cape: 1200 } : h === 3 ? { visibility: 400 } : {}),
    );
    const [night, morning, afternoon, evening] = periodSummaries(hours);
    expect(night).toMatchObject({ period: 'night', min: 10, max: 15, visibility: 400 });
    expect(morning).toMatchObject({ period: 'morning', code: 1, precipitation: 0 });
    // 3 horas de lluvia: el período se resume como lluvia, con el total y la peor probabilidad.
    expect(afternoon).toMatchObject({ period: 'afternoon', code: 61, precipProbability: 70, precipitation: 7.5, cape: 1200 });
    expect(evening!.windDirection).toBeCloseTo(180);
  });

  it('una sola hora de lluvia no define el período; nada de datos, no hay período', () => {
    const hours = Array.from({ length: 6 }, (_, h) => hour(h + 6, h === 0 ? { code: 61 } : {}));
    expect(periodSummaries(hours)).toEqual([expect.objectContaining({ period: 'morning', code: 1 })]);
  });

  it('dirección predominante sin saltar en el norte (350° y 10° → 0°)', () => {
    const hours = [hour(0, { windDirection: 350 }), hour(1, { windDirection: 10 })];
    const d = periodSummaries(hours)[0]!.windDirection!;
    expect(Math.min(d, 360 - d)).toBeLessThan(0.5);
  });
});

describe('placeNow', () => {
  it('hora actual en la zona del lugar, no la de descarga ni la del equipo', () => {
    const at = new Date('2026-10-31T05:20:00Z');
    expect(placeNow('America/Argentina/Buenos_Aires', at)).toBe('2026-10-31T02:20');
    expect(placeNow('Europe/Madrid', at)).toBe('2026-10-31T06:20');
    expect(placeNow('Asia/Kolkata', at)).toBe('2026-10-31T10:50');
  });

  it('zona inválida: usa la hora del dispositivo', () => {
    expect(placeNow('Marte/Olimpo', new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('stormRisk', () => {
  it('umbrales de CAPE', () => {
    expect([0, 299, 300, 999, 1000, 2499, 2500, 4000].map(stormRisk)).toEqual([
      'low', 'low', 'moderate', 'moderate', 'high', 'high', 'veryHigh', 'veryHigh',
    ]);
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
    // Pronósticos sin viento por hora (guardados por versiones anteriores) no rompen.
    expect(f.hourly[0]!.windDirection).toBeNull();
    expect(f.daily[0]!.windDirection).toBeNull();
    expect(f.daily[0]!.uvMax).toBe(7);
    expect(() => parseForecast({ ...api, current: { ...api.current, temperature_2m: 'x' as unknown as number } })).toThrow();
  });

  it('al final del rango (día 16) vienen vacíos: se saltean, no se descarta todo', () => {
    const api = {
      latitude: -34.6,
      longitude: -58.4,
      timezone: 'America/Argentina/Buenos_Aires',
      current: {
        time: '2026-10-30T14:00', temperature_2m: 22.5, relative_humidity_2m: 60, apparent_temperature: 23, precipitation: 0,
        weather_code: 2, wind_speed_10m: 15, wind_direction_10m: 90, wind_gusts_10m: 30, pressure_msl: 1012,
      },
      hourly: {
        time: ['2026-11-14T22:00', '2026-11-14T23:00'],
        temperature_2m: [20, null],
        weather_code: [3, null],
        wind_speed_10m: [10, null],
      },
      daily: {
        time: ['2026-11-14', '2026-11-15'],
        weather_code: [3, null],
        temperature_2m_max: [26, null],
        temperature_2m_min: [15, null],
        precipitation_sum: [0, null],
        wind_speed_10m_max: [null, null],
        wind_gusts_10m_max: [30, null],
      },
    };
    const f = parseForecast(api as never);
    expect(f.hourly.map((h) => h.time)).toEqual(['2026-11-14T22:00']);
    expect(f.daily.map((d) => d.date)).toEqual(['2026-11-14']);
    expect(f.daily[0]!.windMax).toBe(0);
  });
});

describe('warningsOf', () => {
  const day = (over: Partial<Forecast['daily'][number]>): Forecast['daily'][number] => ({
    date: '2026-11-01', code: 1, max: 25, min: 12, precipitation: 0, precipProbability: 0, windMax: 20, gustMax: 30, windDirection: null, uvMax: 5, ...over,
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
