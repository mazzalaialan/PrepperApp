import { useEffect, useState, type RefObject } from 'react';

export type CameraError = 'denied' | 'unavailable';

/** Cámara trasera en un <video> mientras `enabled`; se apaga al desmontar (ahorra batería). */
export function useCamera(video: RefObject<HTMLVideoElement | null>, enabled: boolean): { ready: boolean; error: CameraError | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        await el.play().catch(() => undefined);
        setReady(true);
      })
      .catch((e: unknown) => setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [enabled, video]);

  return { ready, error };
}

/**
 * Campo de visión horizontal que se ve en pantalla, en grados. Los celulares
 * no lo informan: se parte de valores típicos de la cámara principal (≈65° en
 * el lado largo, ≈50° en el corto) y se ajusta por el recorte de `object-fit: cover`.
 */
export function visibleFov(video: HTMLVideoElement): { h: number; v: number } {
  const vw = video.videoWidth || 3;
  const vh = video.videoHeight || 4;
  const bw = video.clientWidth || vw;
  const bh = video.clientHeight || vh;
  const nativeH = vw >= vh ? 65 : 50;
  const nativeV = vw >= vh ? 50 : 65;
  const scale = Math.max(bw / vw, bh / vh);
  const fracW = bw / (vw * scale);
  const fracH = bh / (vh * scale);
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  return {
    h: deg(2 * Math.atan(Math.tan(rad(nativeH / 2)) * fracW)),
    v: deg(2 * Math.atan(Math.tan(rad(nativeV / 2)) * fracH)),
  };
}
