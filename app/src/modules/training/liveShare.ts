import { useEffect, useRef } from 'react';
import { useSettings } from '@/core/settings/settings';
import { normalizeServerUrl } from '@/core/notifications/notifications';
import type { WorkoutKind } from '@/core/model/types';
import { elapsedS, useRecorder } from '@/modules/tracks/recorder';
import { useWaypoints } from '@/modules/waypoints/store';
import { currentSpeedMs } from './live';
import { activeOuting } from './outingPlan';
import { useTraining } from './store';
import { buildChunks, type LiveUpdate } from './liveChunks';
import type { PrivateZone } from './share';
import { analyzeRecording } from './stats';

/**
 * Seguimiento en vivo para la familia: mientras se graba una sesión, se manda
 * al servidor cada ~30 s (cada ~60 s si estás parado) lo nuevo del recorrido y
 * los datos; al terminar la sesión o al vencer, se corta y el servidor borra
 * todo. Las zonas privadas nunca se mandan. Sin conexión, se acumula y se manda
 * cuando vuelve (la página avisa "sin señal"). En la web solo anda con la app
 * abierta y la pantalla encendida.
 */

export const LIVE_DURATIONS_MIN = [15, 60, 240, 720, 1440] as const;
const MOVING_EVERY_MS = 30_000;
const STOPPED_EVERY_MS = 60_000;

export class LiveError extends Error {
  constructor(public readonly code: 'offline' | 'full' | 'too-many' | 'invalid' | 'failed' | 'gone') {
    super(code);
  }
}

export interface LiveCreated {
  id: string;
  url: string;
  token: string;
  expiresAt: string;
}

export async function createLive(serverUrl: string, input: { name: string; lang: 'es' | 'en'; kind: WorkoutKind | ''; durationMin: number }): Promise<LiveCreated> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}/api/live`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).catch(() => null);
  if (!res) throw new LiveError('offline');
  if (res.status === 503) throw new LiveError('full');
  if (res.status === 429) throw new LiveError('too-many');
  if (res.status === 400) throw new LiveError('invalid');
  if (!res.ok) throw new LiveError('failed');
  const body = (await res.json()) as { id: string; path: string; token: string; expiresAt: string };
  return { id: body.id, url: `${base}${body.path}`, token: body.token, expiresAt: body.expiresAt };
}

export async function pushLive(serverUrl: string, id: string, token: string, update: LiveUpdate): Promise<void> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/live/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(update) }).catch(() => null);
  if (!res) throw new LiveError('offline');
  if (res.status === 401) throw new LiveError('gone');
  if (res.status === 429) return; // muy seguido: el próximo envío lo lleva
  if (!res.ok) throw new LiveError('failed');
}

export async function endLive(serverUrl: string, id: string, token: string): Promise<void> {
  await fetch(`${normalizeServerUrl(serverUrl)}/api/live/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null);
}

/** La hora límite de la salida en curso (si hay una con plan), para mostrarla en la página de la familia. */
function liveDeadline(): Pick<LiveUpdate, 'deadline'> {
  const active = activeOuting(useTraining.getState().outings.values(), new Date());
  const plan = active?.outing.plan;
  if (!plan?.returnBy) return {};
  const last = plan.checkIns.at(-1)?.at;
  return { deadline: { returnBy: Date.parse(plan.returnBy), lastCheckIn: last ? Date.parse(last) : null } };
}

/** Monta el envío periódico (va una sola vez, en la estructura de la app). */
export function useLiveSender(): void {
  const live = useSettings((s) => s.settings.liveShare);
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const update = useSettings((s) => s.update);
  const status = useRecorder((s) => s.status);
  const busy = useRef(false);
  const lastStatus = useRef<string>('idle');

  useEffect(() => {
    if (!live) return;
    // Vencido: se corta solo.
    if (Date.parse(live.expiresAt) <= Date.now()) {
      void update({ liveShare: null });
      return;
    }
    // La sesión terminó: se corta el seguimiento y el servidor borra todo.
    if (status === 'idle' && lastStatus.current !== 'idle') {
      void endLive(serverUrl, live.id, live.token).finally(() => void update({ liveShare: null }));
    }
    lastStatus.current = status;
  }, [live, status, serverUrl, update]);

  useEffect(() => {
    if (!live) return;
    async function tick(force: boolean) {
      const current = useSettings.getState().settings.liveShare;
      const rec = useRecorder.getState();
      if (!current || busy.current || !rec.track || rec.status === 'idle') return;
      const nowMs = Date.now();
      const moving = currentSpeedMs(rec.track.segments) > 0;
      const every = moving ? MOVING_EVERY_MS : STOPPED_EVERY_MS;
      if (!force && current.lastSentAt !== null && nowMs - current.lastSentAt < every) return;
      busy.current = true;
      try {
        const waypoints = useWaypoints.getState().waypoints;
        const zones: PrivateZone[] = [...waypoints.values()].filter((w) => (w.privateRadiusM ?? 0) > 0).map((w) => ({ lat: w.lat, lon: w.lon, radiusM: w.privateRadiusM! }));
        const { chunks, next } = buildChunks(rec.track.segments, { seg: current.sentSeg, pt: current.sentPt }, zones, Math.round(nowMs / 1000));
        const stats = analyzeRecording(rec.track.segments.map((s) => (s.length > 1 ? s : [])));
        await pushLive(useSettings.getState().settings.serverUrl, current.id, current.token, {
          status: rec.status === 'recording' ? 'active' : 'paused',
          stats: { distanceM: stats.distanceM, elapsedS: elapsedS(rec), ascentM: stats.ascentM, paceSPerKm: stats.paceSPerKm, speedKmh: stats.avgSpeedKmh },
          chunks,
          ...liveDeadline(),
        });
        await useSettings.getState().update({ liveShare: { ...current, sentSeg: next.seg, sentPt: next.pt, lastSentAt: nowMs, failing: false } });
      } catch (err) {
        if (err instanceof LiveError && err.code === 'gone') await useSettings.getState().update({ liveShare: null });
        else await useSettings.getState().update({ liveShare: { ...current, failing: true } });
      } finally {
        busy.current = false;
      }
    }
    void tick(true);
    const id = setInterval(() => void tick(false), 5000);
    // Al pausar o seguir, se manda enseguida para que la familia vea el cambio.
    const unsub = useRecorder.subscribe((s, prev) => {
      if (s.status !== prev.status && s.status !== 'idle') void tick(true);
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
