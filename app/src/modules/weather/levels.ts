/**
 * Escalas de color para leer los valores de un vistazo. Cada nivel es un
 * color de la escala del tema (`--scale-1` hielo … `--scale-6` extremo) y
 * tiene nombre, para que el color nunca sea la única pista (tooltip y lector).
 * Los umbrales van siempre en unidades métricas.
 */

export type ScaleColor = 1 | 2 | 3 | 4 | 5 | 6;

export interface Level<K extends string> {
  key: K;
  color: ScaleColor;
}

export type TempLevel = 'freezing' | 'cold' | 'mild' | 'warm' | 'hot' | 'extreme';

/** °C: helada, frío, agradable, cálido, caluroso, calor extremo. */
export function tempLevel(c: number): Level<TempLevel> {
  if (c <= 0) return { key: 'freezing', color: 1 };
  if (c <= 10) return { key: 'cold', color: 2 };
  if (c <= 24) return { key: 'mild', color: 3 };
  if (c <= 29) return { key: 'warm', color: 4 };
  if (c <= 34) return { key: 'hot', color: 5 };
  return { key: 'extreme', color: 6 };
}

export type WindLevel = 'light' | 'moderate' | 'strong' | 'gale';

/** km/h, según Beaufort: hasta 19 leve, 20–39 moderado, 40–61 fuerte, desde 62 temporal. Sirve también para ráfagas. */
export function windLevel(kmh: number): Level<WindLevel> {
  if (kmh < 20) return { key: 'light', color: 3 };
  if (kmh < 40) return { key: 'moderate', color: 4 };
  if (kmh < 62) return { key: 'strong', color: 5 };
  return { key: 'gale', color: 6 };
}

export type HumidityLevel = 'dry' | 'comfortable' | 'humid' | 'veryHumid';

/** % de humedad relativa: menos de 30 seco, hasta 60 confortable, hasta 80 húmedo, más muy húmedo. */
export function humidityLevel(pct: number): Level<HumidityLevel> {
  if (pct < 30) return { key: 'dry', color: 4 };
  if (pct <= 60) return { key: 'comfortable', color: 3 };
  if (pct <= 80) return { key: 'humid', color: 1 };
  return { key: 'veryHumid', color: 2 };
}

export type PressureLevel = 'veryLow' | 'low' | 'normal' | 'high';

/**
 * hPa a nivel del mar (la media es 1013). Baja suele anticipar mal tiempo;
 * muy baja, temporal. Alta, tiempo estable.
 */
export function pressureLevel(hpa: number): Level<PressureLevel> & { trend: 'up' | 'down' | null } {
  if (hpa < 990) return { key: 'veryLow', color: 6, trend: 'down' };
  if (hpa < 1005) return { key: 'low', color: 5, trend: 'down' };
  if (hpa <= 1020) return { key: 'normal', color: 3, trend: null };
  return { key: 'high', color: 2, trend: 'up' };
}
