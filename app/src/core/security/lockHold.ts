import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Pausa del bloqueo automático mientras se navega (seguir un track o grabar
 * el recorrido): caminando no se toca la pantalla y la bóveda no debe
 * cerrarse en medio del camino. El bloqueo a mano sigue andando.
 */
export const useLockHold = create<{ count: number }>(() => ({ count: 0 }));

export function holdLock(): () => void {
  useLockHold.setState((s) => ({ count: s.count + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useLockHold.setState((s) => ({ count: s.count - 1 }));
  };
}

export function useHoldLock(enabled = true) {
  useEffect(() => (enabled ? holdLock() : undefined), [enabled]);
}
