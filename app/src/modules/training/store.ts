import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { newEntity, touch } from '@/core/model/entity';
import type { Gear, Id, Outing, Track, WeightEntry, Workout, WorkoutKind } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { calories } from './energy';
import type { RecordedStats } from './stats';

interface TrainingState {
  loaded: boolean;
  workouts: Map<Id, Workout>;
  outings: Map<Id, Outing>;
  gear: Map<Id, Gear>;
  weights: Map<Id, WeightEntry>;
  load: () => Promise<void>;
  clear: () => void;
  saveWorkout: (w: Workout) => Promise<Workout>;
  /** Borra la actividad y, si la grabó la app, su recorrido (Tracks). */
  deleteWorkout: (id: Id) => Promise<void>;
  saveOuting: (o: Outing) => Promise<Outing>;
  /** Borra la salida; sus actividades quedan sueltas. */
  deleteOuting: (id: Id) => Promise<void>;
  saveGear: (g: Gear) => Promise<Gear>;
  deleteGear: (id: Id) => Promise<void>;
  saveWeight: (w: WeightEntry) => Promise<WeightEntry>;
  deleteWeight: (id: Id) => Promise<void>;
}

/** Sesiones de entrenamiento y salidas (cifradas, viajan en el backup). */
export const useTraining = create<TrainingState>((set, get) => ({
  loaded: false,
  workouts: new Map(),
  outings: new Map(),
  gear: new Map(),
  weights: new Map(),

  async load() {
    const [workouts, outings, gear, weights] = await Promise.all([repos.workouts.loadAll(), repos.outings.loadAll(), repos.gear.loadAll(), repos.weights.loadAll()]);
    set({
      loaded: true,
      workouts: new Map(workouts.map((w) => [w.id, w])),
      outings: new Map(outings.map((o) => [o.id, o])),
      gear: new Map(gear.map((g) => [g.id, g])),
      weights: new Map(weights.map((w) => [w.id, w])),
    });
  },

  clear() {
    set({ loaded: false, workouts: new Map(), outings: new Map(), gear: new Map(), weights: new Map() });
  },

  async saveWorkout(w) {
    const saved = touch(w);
    await repos.workouts.put(saved);
    set({ workouts: new Map(get().workouts).set(saved.id, saved) });
    return saved;
  },

  async deleteWorkout(id) {
    const w = get().workouts.get(id);
    await repos.workouts.remove(id);
    const workouts = new Map(get().workouts);
    workouts.delete(id);
    set({ workouts });
    if (w?.trackId) {
      const { useTracks } = await import('@/modules/tracks/store');
      await useTracks.getState().deleteTrack(w.trackId);
    }
  },

  async saveOuting(o) {
    const saved = touch(o);
    await repos.outings.put(saved);
    set({ outings: new Map(get().outings).set(saved.id, saved) });
    return saved;
  },

  async saveGear(g) {
    const saved = touch(g);
    await repos.gear.put(saved);
    set({ gear: new Map(get().gear).set(saved.id, saved) });
    return saved;
  },

  async deleteGear(id) {
    await repos.gear.remove(id);
    const gear = new Map(get().gear);
    gear.delete(id);
    set({ gear });
    // Las actividades que lo usaban quedan sin equipo.
    for (const w of get().workouts.values()) if (w.gearId === id) await get().saveWorkout({ ...w, gearId: null });
  },

  async saveWeight(w) {
    const saved = touch(w);
    await repos.weights.put(saved);
    set({ weights: new Map(get().weights).set(saved.id, saved) });
    return saved;
  },

  async deleteWeight(id) {
    await repos.weights.remove(id);
    const weights = new Map(get().weights);
    weights.delete(id);
    set({ weights });
  },

  async deleteOuting(id) {
    await repos.outings.remove(id);
    const outings = new Map(get().outings);
    outings.delete(id);
    set({ outings });
    for (const w of get().workouts.values()) if (w.outingId === id) await get().saveWorkout({ ...w, outingId: null });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useTraining.getState().loaded) void useTraining.getState().load();
  } else {
    useTraining.getState().clear();
  }
});

const BLANK = {
  trackId: null,
  totalS: 0,
  movingS: 0,
  distanceM: 0,
  ascentM: 0,
  descentM: 0,
  minEle: null,
  maxEle: null,
  avgSpeedKmh: 0,
  paceSPerKm: 0,
  maxSpeedKmh: 0,
  splitsS: [] as number[],
  calories: 0,
  weightKg: null,
  packKg: null,
  inclinePct: null,
  intensity: null,
  avgHr: null,
  maxHr: null,
  notes: '',
  outingId: null,
};

/** Actividad nueva, en blanco, para cargar a mano. */
export function blankWorkout(kind: WorkoutKind, name: string, startedAt = new Date().toISOString()): Workout {
  return newEntity<Workout>({ ...BLANK, kind, name, startedAt, source: 'manual' });
}

/** La actividad que sale de una grabación con GPS: los datos con todos los puntos (antes de simplificar) y el recorrido en Tracks. */
export function workoutFromRecording(kind: WorkoutKind, name: string, track: Track, stats: RecordedStats, startedAtMs: number, weightKg: number | null, packKg: number | null): Workout {
  const kcal = weightKg
    ? calories({ kind, weightKg, packKg: packKg ?? undefined, movingS: stats.movingS || (track.durationS ?? stats.totalS), distanceM: stats.distanceM, ascentM: stats.ascentM })
    : 0;
  return newEntity<Workout>({
    ...BLANK,
    kind,
    name,
    startedAt: new Date(startedAtMs).toISOString(),
    source: 'gps',
    trackId: track.id,
    totalS: track.durationS ?? stats.totalS,
    movingS: stats.movingS,
    distanceM: Math.round(stats.distanceM),
    ascentM: stats.ascentM,
    descentM: stats.descentM,
    minEle: stats.minEle,
    maxEle: stats.maxEle,
    avgSpeedKmh: stats.avgSpeedKmh,
    paceSPerKm: stats.paceSPerKm,
    maxSpeedKmh: stats.maxSpeedKmh,
    splitsS: stats.splitsS,
    calories: kcal,
    weightKg,
    packKg,
  });
}
