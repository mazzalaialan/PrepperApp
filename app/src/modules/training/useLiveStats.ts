import { useEffect, useMemo, useState } from 'react';
import { elapsedS, useRecorder } from '@/modules/tracks/recorder';
import { ACTIVITIES } from './activities';
import { calories } from './energy';
import { useBodyWeight, useTrainingFormat } from './format';
import { currentSpeedMs, kmhFromMs, paceFromMs } from './live';
import { analyzeRecording } from './stats';

/**
 * Los datos de la sesión de Entrenamiento que se está grabando, ya formateados:
 * los usan la pantalla en vivo y el seguimiento de un track o una ruta. Es
 * null si no se graba una sesión (por ejemplo, un track grabado suelto).
 */
export function useLiveStats() {
  const f = useTrainingFormat();
  const weight = useBodyWeight();
  const { status, track, elapsedMs, since } = useRecorder();
  const [, tick] = useState(0);
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  const segments = track?.segments;
  // Las estadísticas se recalculan cuando llega un punto, no cada segundo.
  const stats = useMemo(() => (segments ? analyzeRecording(segments.map((s) => (s.length > 1 ? s : []))) : null), [segments]);
  const kind = track?.activity;
  if (status === 'idle' || !track || !kind || !stats) return null;
  const def = ACTIVITIES[kind];
  const elapsed = elapsedS({ elapsedMs, since });
  const nowMs = segments ? currentSpeedMs(segments) : 0;
  const kcal = weight ? calories({ kind, weightKg: weight, packKg: track.activityPackKg ?? undefined, movingS: stats.movingS || elapsed, distanceM: stats.distanceM, ascentM: stats.ascentM }) : null;
  return {
    status,
    track,
    kind,
    def,
    stats,
    elapsed,
    weight,
    kcal,
    effortNow: nowMs > 0 ? (def.measure === 'pace' ? f.pace(paceFromMs(nowMs)) : f.speed(kmhFromMs(nowMs))) : '—',
    effortAvg: def.measure === 'pace' ? f.pace(stats.paceSPerKm) : f.speed(stats.avgSpeedKmh),
  };
}
