import { useEffect, useState } from 'react';
import { useSettings } from '@/core/settings/settings';

/**
 * Ahorro de batería. Lo visual (negro puro: en pantallas OLED un píxel negro
 * está apagado) lo da el tema `saver`; acá vive lo que cambia en el trabajo
 * de la app. Depende del tema *elegido*, no del efectivo: si el horario
 * nocturno pone el rojo, el ahorro sigue activo.
 */

export function useBatterySaver(): boolean {
  return useSettings((s) => s.settings.theme === 'saver');
}

/** Cada cuánto se revisa la lluvia con la app abierta. */
export const RAIN_CHECK_MS = { normal: 15 * 60_000, saver: 60 * 60_000 } as const;

/** Redibujo máximo de brújula y realidad aumentada: con ahorro, la mitad. */
export function sensorFrameMs(normalMs: number, saver: boolean): number {
  return saver ? normalMs * 2 : normalMs;
}

/** ¿La página se ve? (con la pantalla apagada o en otra app, no). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/**
 * GPS y sensores: con ahorro se cortan apenas la página deja de verse,
 * sin depender de que el navegador los pause.
 */
export function useSensorActive(enabled: boolean): { active: boolean; saver: boolean } {
  const saver = useBatterySaver();
  const visible = usePageVisible();
  return { active: enabled && (!saver || visible), saver };
}
