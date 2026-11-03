import { useEffect } from 'react';

/** Que la pantalla no se apague mientras `enabled` (si el navegador lo permite). */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (active) lock = l;
          else void l.release();
        },
        () => undefined,
      );
    };
    request();
    // El navegador la suelta al ir a segundo plano: se pide de nuevo al volver.
    document.addEventListener('visibilitychange', request);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [enabled]);
}
