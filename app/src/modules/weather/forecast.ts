/**
 * Pronóstico de Open-Meteo (open source, autoalojable; la URL se configura en
 * Ajustes). Se pide siempre en unidades métricas y se convierte al mostrar.
 */

export interface Forecast {
  /** Cuándo se descargó (ISO). */
  fetchedAt: string;
  lat: number;
  lon: number;
  /** Zona horaria del lugar (las horas de `hourly`/`daily` vienen en esa zona). */
  timezone: string;
  current: {
    time: string;
    temperature: number;
    apparent: number;
    humidity: number;
    precipitation: number;
    code: number;
    windSpeed: number;
    windDirection: number;
    windGusts: number;
    pressure: number;
  };
  hourly: { time: string; temperature: number; precipProbability: number | null; code: number; windSpeed: number }[];
  daily: {
    date: string;
    code: number;
    max: number;
    min: number;
    precipitation: number;
    precipProbability: number | null;
    windMax: number;
    gustMax: number;
    uvMax: number | null;
  }[];
}

const CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl';
const HOURLY = 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max';

export function forecastUrl(base: string, lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT,
    hourly: HOURLY,
    daily: DAILY,
    timezone: 'auto',
    forecast_days: '7',
  });
  return `${base.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

export class WeatherError extends Error {
  constructor(public readonly code: 'offline' | 'unreachable' | 'invalid-response') {
    super(code);
    this.name = 'WeatherError';
  }
}

interface ApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: Record<string, number | string>;
  hourly: Record<string, (number | string | null)[]>;
  daily: Record<string, (number | string | null)[]>;
}

export async function fetchForecast(base: string, lat: number, lon: number, now = new Date()): Promise<Forecast> {
  if (!navigator.onLine) throw new WeatherError('offline');
  let res: Response;
  try {
    res = await fetch(forecastUrl(base, lat, lon), { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new WeatherError('unreachable');
  }
  if (!res.ok) throw new WeatherError('invalid-response');
  try {
    return parseForecast((await res.json()) as ApiResponse, now);
  } catch {
    throw new WeatherError('invalid-response');
  }
}

export function parseForecast(data: ApiResponse, now = new Date()): Forecast {
  const c = data.current;
  const h = data.hourly;
  const d = data.daily;
  const num = (v: unknown) => {
    if (typeof v !== 'number') throw new Error('bad number');
    return v;
  };
  const opt = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    fetchedAt: now.toISOString(),
    lat: data.latitude,
    lon: data.longitude,
    timezone: data.timezone,
    current: {
      time: String(c.time),
      temperature: num(c.temperature_2m),
      apparent: num(c.apparent_temperature),
      humidity: num(c.relative_humidity_2m),
      precipitation: num(c.precipitation),
      code: num(c.weather_code),
      windSpeed: num(c.wind_speed_10m),
      windDirection: num(c.wind_direction_10m),
      windGusts: num(c.wind_gusts_10m),
      pressure: num(c.pressure_msl),
    },
    hourly: (h.time ?? []).map((time, i) => ({
      time: String(time),
      temperature: num(h.temperature_2m![i]),
      precipProbability: opt(h.precipitation_probability?.[i]),
      code: num(h.weather_code![i]),
      windSpeed: num(h.wind_speed_10m![i]),
    })),
    daily: (d.time ?? []).map((date, i) => ({
      date: String(date),
      code: num(d.weather_code![i]),
      max: num(d.temperature_2m_max![i]),
      min: num(d.temperature_2m_min![i]),
      precipitation: num(d.precipitation_sum![i]),
      precipProbability: opt(d.precipitation_probability_max?.[i]),
      windMax: num(d.wind_speed_10m_max![i]),
      gustMax: num(d.wind_gusts_10m_max![i]),
      uvMax: opt(d.uv_index_max?.[i]),
    })),
  };
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** Código WMO de Open-Meteo → tipo de cielo (para ícono y texto). */
export function skyOf(code: number): Sky {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

export type WarningKind = 'storm' | 'gusts' | 'heavyRain' | 'snow' | 'frost' | 'heat' | 'uv';

export interface Warning {
  kind: WarningKind;
  date: string;
  /** Valor que disparó el aviso (km/h, mm, °C o índice UV). */
  value: number;
}

/**
 * Avisos calculados a partir del pronóstico (no son alertas oficiales):
 * lo que conviene saber para planificar una salida o preparar la casa.
 */
export function warningsOf(daily: Forecast['daily']): Warning[] {
  const out: Warning[] = [];
  for (const day of daily) {
    if (skyOf(day.code) === 'storm') out.push({ kind: 'storm', date: day.date, value: day.code });
    if (day.gustMax >= 70) out.push({ kind: 'gusts', date: day.date, value: day.gustMax });
    if (day.precipitation >= 30) out.push({ kind: 'heavyRain', date: day.date, value: day.precipitation });
    if (skyOf(day.code) === 'snow') out.push({ kind: 'snow', date: day.date, value: day.code });
    if (day.min <= 0) out.push({ kind: 'frost', date: day.date, value: day.min });
    if (day.max >= 35) out.push({ kind: 'heat', date: day.date, value: day.max });
    if (day.uvMax !== null && day.uvMax >= 8) out.push({ kind: 'uv', date: day.date, value: day.uvMax });
  }
  return out;
}

/** Para mostrar en el sistema elegido. */
export const toFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (v: number) => v / 1.609344;
export const mmToInch = (v: number) => v / 25.4;
