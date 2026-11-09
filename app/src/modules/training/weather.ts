import { useSettings } from '@/core/settings/settings';
import { fetchForecast } from '@/modules/weather/forecast';
import type { Workout } from '@/core/model/types';

/**
 * El clima al terminar la sesión, del pronóstico de Open-Meteo (lo "actual"
 * del lugar donde empezó). Es opcional: sin internet o si falla, la actividad
 * queda sin clima y no pasa nada.
 */
export async function weatherAt(lat: number, lon: number): Promise<Workout['weather']> {
  try {
    const { weatherUrl } = useSettings.getState().settings;
    const f = await fetchForecast(weatherUrl, lat, lon);
    return { tempC: Math.round(f.current.temperature), code: f.current.code, windKmh: Math.round(f.current.windSpeed), humidity: Math.round(f.current.humidity) };
  } catch {
    return null;
  }
}
