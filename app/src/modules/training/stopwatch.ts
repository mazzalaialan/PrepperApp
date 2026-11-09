import { create } from 'zustand';

/**
 * Cronómetro y temporizador. Viven en memoria (siguen corriendo al cambiar de
 * pantalla) y calculan con la hora del reloj, así que no se atrasan aunque la
 * pantalla se actualice poco.
 */
interface StopwatchState {
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
  /** Marcas de vuelta: tiempo acumulado (ms). */
  laps: number[];
  start: () => void;
  pause: () => void;
  lap: () => void;
  reset: () => void;
}

export const elapsedMs = (s: Pick<StopwatchState, 'startedAt' | 'accumulatedMs'>, now = Date.now()): number => s.accumulatedMs + (s.startedAt !== null ? now - s.startedAt : 0);

export const useStopwatch = create<StopwatchState>((set, get) => ({
  running: false,
  startedAt: null,
  accumulatedMs: 0,
  laps: [],
  start: () => !get().running && set({ running: true, startedAt: Date.now() }),
  pause: () => {
    const s = get();
    if (s.running) set({ running: false, accumulatedMs: elapsedMs(s), startedAt: null });
  },
  lap: () => {
    const s = get();
    if (s.running) set({ laps: [...s.laps, elapsedMs(s)] });
  },
  reset: () => set({ running: false, startedAt: null, accumulatedMs: 0, laps: [] }),
}));

interface TimerState {
  /** Duración elegida (s). */
  totalS: number;
  running: boolean;
  /** Cuándo termina (ms), si está corriendo. */
  endsAt: number | null;
  /** Lo que quedaba (ms) al pausar. */
  leftMs: number;
  set: (totalS: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

export const timerLeftMs = (s: Pick<TimerState, 'endsAt' | 'leftMs'>, now = Date.now()): number => (s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.leftMs);

export const useTimer = create<TimerState>((set, get) => ({
  totalS: 300,
  running: false,
  endsAt: null,
  leftMs: 300_000,
  set: (totalS) => !get().running && set({ totalS, leftMs: totalS * 1000 }),
  start: () => {
    const s = get();
    if (s.running || s.leftMs <= 0) return;
    set({ running: true, endsAt: Date.now() + s.leftMs });
  },
  pause: () => {
    const s = get();
    if (s.running) set({ running: false, leftMs: timerLeftMs(s), endsAt: null });
  },
  reset: () => set({ running: false, endsAt: null, leftMs: get().totalS * 1000 }),
}));
