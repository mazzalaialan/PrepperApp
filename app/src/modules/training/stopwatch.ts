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
  /** Suma o resta segundos a la duración (solo si no corre): de 1 segundo a 3 horas. */
  adjust: (deltaS: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

export const TIMER_MAX_S = 3 * 3600;

export const clampTimer = (s: number): number => Math.min(TIMER_MAX_S, Math.max(1, Math.round(s)));

export const timerLeftMs = (s: Pick<TimerState, 'endsAt' | 'leftMs'>, now = Date.now()): number => (s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.leftMs);

export const useTimer = create<TimerState>((set, get) => ({
  totalS: 300,
  running: false,
  endsAt: null,
  leftMs: 300_000,
  set: (totalS) => !get().running && set({ totalS: clampTimer(totalS), leftMs: clampTimer(totalS) * 1000 }),
  adjust: (deltaS) => {
    const s = get();
    if (!s.running) set({ totalS: clampTimer(s.totalS + deltaS), leftMs: clampTimer(s.totalS + deltaS) * 1000 });
  },
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
