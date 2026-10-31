import { useEffect, useState } from 'react';
import { sensorFrameMs, useSensorActive } from '@/core/power/saver';
import { tiltFromGravity, type Tilt } from './tilt';

const FRAME_MS = 80;
/** Suavizado del acelerómetro: filtra el temblor de la mano sin hacerlo lento. */
const SMOOTHING = 0.2;

/** Inclinación del celular mientras `enabled`; `null` hasta la primera lectura. */
export function useTilt(enabled = true): Tilt | null {
  const [tilt, setTilt] = useState<Tilt | null>(null);
  const { active, saver } = useSensorActive(enabled);

  useEffect(() => {
    if (!active || !('ondevicemotion' in window)) return;
    const frameMs = sensorFrameMs(FRAME_MS, saver);
    let g: [number, number, number] | null = null;
    let lastEmit = 0;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      g = g ? [g[0] + (a.x - g[0]) * SMOOTHING, g[1] + (a.y - g[1]) * SMOOTHING, g[2] + (a.z - g[2]) * SMOOTHING] : [a.x, a.y, a.z];
      const now = performance.now();
      if (now - lastEmit < frameMs) return;
      lastEmit = now;
      setTilt(tiltFromGravity(...g));
    };
    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [active, saver]);

  return tilt;
}
