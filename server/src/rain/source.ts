import { rainOutlook, type RainOutlook, type RainSlot } from './outlook.ts';

/**
 * De dónde sale la lluvia. Es intercambiable: hoy el pronóstico de Open-Meteo;
 * más adelante, la lluvia observada (GOES-19 RRQPE o el radar del SMN donde
 * cubra) puede ir primero y dejar el pronóstico de respaldo.
 */
export interface RainPoint {
  lat: number;
  lon: number;
}

export interface RainSource {
  name: string;
  /** Pronóstico para cada punto, en el mismo orden; `null` si ese punto no se pudo consultar. */
  outlooks(points: RainPoint[]): Promise<(RainOutlook | null)[]>;
}

/** Puntos por consulta: Open-Meteo acepta varias coordenadas separadas por coma. */
const BATCH = 50;
const SLOTS = 8;

interface OpenMeteoLocation {
  current?: { time?: string };
  minutely_15?: { time?: unknown[]; precipitation?: unknown[] };
}

function slotsOf(minutely: OpenMeteoLocation['minutely_15']): RainSlot[] {
  if (!minutely?.time || !minutely.precipitation) return [];
  return minutely.time.map((time, i) => ({
    time: String(time),
    mm: typeof minutely.precipitation![i] === 'number' ? (minutely.precipitation![i] as number) : 0,
  }));
}

/** Open-Meteo `minutely_15`: lluvia pronosticada cada 15 minutos para las próximas 2 horas. */
export function openMeteoSource(baseUrl: string, fetchImpl: typeof fetch = fetch): RainSource {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    name: 'open-meteo',
    async outlooks(points) {
      const result: (RainOutlook | null)[] = [];
      for (let i = 0; i < points.length; i += BATCH) {
        const batch = points.slice(i, i + BATCH);
        const params = new URLSearchParams({
          latitude: batch.map((p) => p.lat.toFixed(2)).join(','),
          longitude: batch.map((p) => p.lon.toFixed(2)).join(','),
          current: 'precipitation',
          minutely_15: 'precipitation',
          forecast_minutely_15: String(SLOTS),
          // Todo en UTC: la hora de cada lugar no hace falta para saber cuánto falta.
          timezone: 'GMT',
        });
        let locations: OpenMeteoLocation[] = [];
        try {
          const res = await fetchImpl(`${base}/v1/forecast?${params}`, { signal: AbortSignal.timeout(20_000) });
          if (res.ok) {
            const data = (await res.json()) as OpenMeteoLocation | OpenMeteoLocation[];
            // Con un solo punto responde un objeto; con varios, una lista.
            locations = Array.isArray(data) ? data : [data];
          }
        } catch {
          // Sin respuesta: estos puntos quedan sin dato y se reintentan en la próxima pasada.
        }
        for (let j = 0; j < batch.length; j++) {
          const loc = locations[j];
          result.push(loc?.current?.time ? rainOutlook({ now: loc.current.time, slots: slotsOf(loc.minutely_15) }) : null);
        }
      }
      return result;
    },
  };
}
