import { useEffect, useRef } from 'react';

/**
 * Para un botón que repite su acción mientras se lo mantiene apretado (flechas
 * de un valor): un toque cuenta una vez; manteniendo, después de 400 ms repite
 * cada 120 ms. Devuelve los eventos para poner en el botón.
 */
export function useHoldRepeat(action: () => void) {
  const act = useRef(action);
  act.current = action;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (repeat.current) clearInterval(repeat.current);
    timer.current = null;
    repeat.current = null;
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      act.current();
      stop();
      timer.current = setTimeout(() => {
        repeat.current = setInterval(() => act.current(), 120);
      }, 400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Con el teclado (Enter o espacio) no llega el puntero: cuenta una vez.
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) act.current();
    },
  };
}
