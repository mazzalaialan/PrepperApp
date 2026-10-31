import { useEffect, useState } from 'react';
import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import { create } from 'zustand';
import { useSettings, type Settings, type Theme } from './settings';

/**
 * Tema efectivo = elección momentánea de una pantalla (p. ej. el mapa estelar
 * prende el rojo) → rojo nocturno automático (horario o anochecer) → tema elegido.
 */

interface ThemeOverrideState {
  override: Theme | null;
  setOverride: (theme: Theme | null) => void;
}

export const useThemeOverride = create<ThemeOverrideState>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** ¿`now` cae dentro del horario? Si "desde" es mayor que "hasta", cruza la medianoche (21:00 → 07:00). */
export function inSchedule(now: Date, from: string, to: string): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === b) return false;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** Anochecer = fin del crepúsculo civil: el sol más de 6° bajo el horizonte. */
export function isAfterDusk(now: Date, lat: number, lon: number): boolean {
  const observer = new Observer(lat, lon, 0);
  const eq = Equator(Body.Sun, now, observer, true, true);
  return Horizon(now, observer, eq.ra, eq.dec, 'normal').altitude < -6;
}

export function scheduledRed(settings: Settings, now: Date): boolean {
  switch (settings.redSchedule) {
    case 'custom':
      return inSchedule(now, settings.redFrom, settings.redTo);
    case 'dusk':
      return settings.duskPlace !== null && isAfterDusk(now, settings.duskPlace.lat, settings.duskPlace.lon);
    default:
      return false;
  }
}

/** Tema que se aplica ahora; se reevalúa cada minuto para seguir el horario. */
export function useEffectiveTheme(): Theme {
  const settings = useSettings((s) => s.settings);
  const override = useThemeOverride((s) => s.override);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (settings.redSchedule === 'off') return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [settings.redSchedule]);

  if (override) return override;
  return scheduledRed(settings, now) ? 'red' : settings.theme;
}

/** Ubicación aproximada para el anochecer: ~50 km es suficiente (unos minutos de diferencia). */
export function roundForDusk(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2 };
}
