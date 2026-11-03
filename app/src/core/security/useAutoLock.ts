import { useEffect } from 'react';
import { useLockHold } from './lockHold';
import { useVault } from './useVault';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const CHECK_INTERVAL_MS = 15_000;

/**
 * Bloquea la bóveda tras `minutes` sin interacción (también si la app quedó en
 * segundo plano). Mientras se navega (seguir un track, grabar) no corre.
 */
export function useAutoLock(minutes: number): void {
  const status = useVault((s) => s.status);
  const lock = useVault((s) => s.lock);
  const held = useLockHold((s) => s.count > 0);

  useEffect(() => {
    if (status !== 'unlocked' || held) return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const check = () => {
      if (Date.now() - last >= minutes * 60_000) lock();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    // Al volver de segundo plano los timers pueden haber estado congelados: revisar enseguida.
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [status, minutes, lock, held]);
}
