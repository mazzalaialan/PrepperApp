import { useEffect, useState } from 'react';
import { sensorFrameMs, useSensorActive } from '@/core/power/saver';

export interface DeviceAngles {
  alpha: number;
  beta: number;
  gamma: number;
  /** Rotación de la pantalla (0 vertical, 90/270 horizontal). */
  screenAngle: number;
}

const FRAME_MS = 33;

/**
 * Ángulos crudos de `deviceorientationabsolute` (norte magnético), para armar
 * una cámara completa. El suavizado se hace sobre los vectores de la cámara,
 * donde no hay saltos de 359° a 0°.
 */
export function useDeviceAngles(enabled: boolean): DeviceAngles | null {
  const [angles, setAngles] = useState<DeviceAngles | null>(null);
  const { active, saver } = useSensorActive(enabled);

  useEffect(() => {
    if (!active || !('ondeviceorientationabsolute' in window)) return;
    const frameMs = sensorFrameMs(FRAME_MS, saver);
    let last = 0;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      const now = performance.now();
      if (now - last < frameMs) return;
      last = now;
      setAngles({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, screenAngle: screen.orientation?.angle ?? 0 });
    };
    window.addEventListener('deviceorientationabsolute', handler);
    return () => window.removeEventListener('deviceorientationabsolute', handler);
  }, [active, saver]);

  return angles;
}
