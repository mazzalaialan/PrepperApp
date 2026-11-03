import { create } from 'zustand';
import type { GeoError } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Id, Track } from '@/core/model/types';
import { isUnlocked } from '@/core/security/session';
import { trackStats, type TrackPoint } from './gpx';
import { addLocked, clearLocked, newRecKey, prepareLocked, readLocked } from './lockedBuffer';
import { addPoint, finishedTrack, shouldAdd } from './record';
import { useTracks } from './store';

/**
 * Grabación del recorrido propio. Sigue andando al cambiar de pantalla (mapa,
 * seguir un track, lo que sea) y se guarda cifrada a medida que avanza: si la
 * app se cierra o se bloquea, al volver la grabación aparece en pausa.
 */

export type RecStatus = 'idle' | 'recording' | 'paused';

/** Cada cuánto se guarda lo grabado (y siempre al pausar o ir a segundo plano). */
const SAVE_EVERY_MS = 20_000;

interface RecorderState {
  status: RecStatus;
  /** El track que se está grabando (igual al guardado, con los puntos que llegaron después). */
  track: Track | null;
  /** Tiempo grabado antes del tramo actual. */
  elapsedMs: number;
  /** Cuándo arrancó el tramo actual (grabando). */
  since: number | null;
  error: GeoError | null;
  /** Ya leyó el aviso de que con el celular bloqueado no se graba. */
  warned: boolean;
  /** Segundos que estuvo con la pantalla apagada (sin grabar), para avisarlo al volver. */
  gapS: number | null;
  /** Precisión de la última posición del GPS (para mostrar por qué todavía no graba). */
  accuracy: number | null;
  start: (name: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => void;
  /** Termina y guarda (con ese nombre, si se da); devuelve el track, o null si no llegó a grabar nada. */
  finish: (name?: string) => Promise<Id | null>;
}

const IDLE = { status: 'idle', track: null, elapsedMs: 0, since: null, error: null, warned: false, gapS: null, accuracy: null } as const;

/** Más que esto con la pantalla apagada, se avisa que no se grabó. */
const GAP_NOTICE_MS = 20_000;
let hiddenAt: number | null = null;

let watchId: number | null = null;
let lastSaved = 0;

export function elapsedS(s: Pick<RecorderState, 'elapsedMs' | 'since'>, now = Date.now()): number {
  return Math.round((s.elapsedMs + (s.since !== null ? now - s.since : 0)) / 1000);
}

async function persist() {
  const s = useRecorder.getState();
  if (!s.track || !isUnlocked()) return;
  lastSaved = Date.now();
  await useTracks.getState().saveTrack({ ...s.track, durationS: elapsedS(s) });
}

function onPosition(p: GeolocationPosition) {
  const s = useRecorder.getState();
  if (s.status !== 'recording' || !s.track) return;
  const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
  if (s.error || s.accuracy !== fix.accuracy) useRecorder.setState({ error: null, accuracy: fix.accuracy });
  const segments = s.track.segments;
  if (!shouldAdd(segments[segments.length - 1]?.at(-1), fix)) return;
  const point: TrackPoint = [fix.lat, fix.lon, p.coords.altitude ?? null];
  const next = addPoint(segments, point);
  useRecorder.setState({ track: { ...s.track, segments: next, ...trackStats(next) } });
  // Bloqueada no se puede cifrar con la bóveda: va cifrado con la clave de la grabación.
  if (!isUnlocked()) {
    if (s.track.recKey) addLocked(s.track.id, s.track.recKey, point);
  } else if (Date.now() - lastSaved >= SAVE_EVERY_MS) void persist();
}

function startWatch() {
  stopWatch();
  if (!('geolocation' in navigator)) {
    useRecorder.setState({ error: 'unsupported' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    onPosition,
    (e) => useRecorder.setState({ error: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
    // Sin posiciones guardadas: al seguir tras una pausa, la última sería la de donde se pausó.
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export const useRecorder = create<RecorderState>((set, get) => ({
  ...IDLE,

  async start(name) {
    if (get().status !== 'idle') return;
    const track = newEntity<Track>({
      name,
      desc: '',
      source: '',
      link: null,
      segments: [[]],
      waypoints: [],
      distanceM: 0,
      ascentM: 0,
      descentM: 0,
      minEle: null,
      maxEle: null,
      notes: '',
      recorded: true,
      recording: true,
      durationS: 0,
      recKey: await newRecKey(),
    });
    prepareLocked(track.recKey!);
    set({ status: 'recording', track, elapsedMs: 0, since: Date.now(), error: null, warned: false, gapS: null, accuracy: null });
    await persist();
    startWatch();
  },

  async pause() {
    const s = get();
    if (s.status !== 'recording') return;
    stopWatch();
    set({ status: 'paused', elapsedMs: s.elapsedMs + (s.since !== null ? Date.now() - s.since : 0), since: null, error: null });
    await persist();
  },

  resume() {
    const s = get();
    if (s.status !== 'paused' || !s.track) return;
    // Lo que se camine en pausa no se une con una recta: arranca un tramo nuevo.
    const segments = s.track.segments.at(-1)?.length ? [...s.track.segments, []] : s.track.segments;
    set({ status: 'recording', track: { ...s.track, segments }, since: Date.now() });
    startWatch();
  },

  async finish(name) {
    const s = get();
    if (!s.track) return null;
    stopWatch();
    const finished = finishedTrack({ ...s.track, name: name?.trim() || s.track.name }, elapsedS(s));
    // La clave de la grabación ya no hace falta.
    const done = finished && { ...finished, recKey: undefined };
    set(IDLE);
    void clearLocked();
    if (!done) {
      await useTracks.getState().deleteTrack(s.track.id);
      return null;
    }
    await useTracks.getState().saveTrack(done);
    return done.id;
  },
}));

// Al ir a segundo plano se guarda enseguida (el navegador puede cerrar la app sin avisar).
// Con la pantalla apagada el navegador no da posiciones: al volver se avisa cuánto no se grabó.
document.addEventListener('visibilitychange', () => {
  const recording = useRecorder.getState().status === 'recording';
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (recording) void persist();
    return;
  }
  if (recording && hiddenAt !== null && Date.now() - hiddenAt >= GAP_NOTICE_MS) useRecorder.setState({ gapS: Math.round((Date.now() - hiddenAt) / 1000) });
  hiddenAt = null;
});

// Con la app bloqueada se sigue grabando: los puntos van cifrados con la clave
// de la grabación (lockedBuffer) y, al desbloquear, pasan al track.
useTracks.subscribe((s, prev) => {
  if (!s.loaded || prev.loaded) return;
  if (useRecorder.getState().status !== 'idle') {
    // Siguió andando: los puntos ya están en memoria.
    void persist().then(clearLocked);
    return;
  }
  const open = [...s.tracks.values()].find((t) => t.recording);
  if (open) void restore(open);
});

/** La grabación que quedó abierta (la app se cerró) vuelve en pausa, con lo grabado mientras estaba bloqueada. */
async function restore(open: Track) {
  const locked = await readLocked(open.id, open.recKey);
  let segments = open.segments.length ? open.segments : [[]];
  for (const p of locked) segments = addPoint(segments, p);
  const recKey = open.recKey ?? (await newRecKey());
  prepareLocked(recKey);
  if (useRecorder.getState().status !== 'idle') return;
  useRecorder.setState({
    status: 'paused',
    track: { ...open, segments, ...trackStats(segments), recKey },
    elapsedMs: (open.durationS ?? 0) * 1000,
    since: null,
    error: null,
  });
  await persist();
  await clearLocked();
}
