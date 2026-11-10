import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CameraIcon, CameraOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CARDINALS } from '@/core/geo/geo';
import { declinationAt } from '@/core/sensors/heading';
import { useCamera, visibleFov } from '@/core/sensors/useCamera';
import { useDeviceAngles } from '@/core/sensors/useDeviceAngles';
import { cameraFromDevice, horizontalToVector, offscreenDirection, projectCamera, type Camera, type Vec3 } from '@/modules/starmap/sky';

/**
 * Vista 3D sobre fondo negro (o sobre la cámara, si se elige): con la brújula y la inclinación del
 * celular se arma un entorno simulado con horizonte artificial, puntos
 * cardinales cada 15°, un camino sobre el suelo hacia el punto y un faro en su
 * dirección. Con el celular parado frente a vos, lo que ves es lo que tenés adelante.
 */

const DEFAULT_FOV = 62;
const SMOOTHING = 0.3;
/** Altura de los ojos sobre el suelo, m: da la perspectiva del camino. */
const EYE_M = 1.6;
const GROUND_DISTANCES = [3, 5, 8, 13, 21, 34, 55, 90, 150, 250];

const add = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function HorizonGuide({
  bearing,
  place,
  name,
  distanceLabel,
  elevationDeg,
  turnText,
}: {
  /** Rumbo geográfico al punto, grados. */
  bearing: number;
  place: { lat: number; lon: number };
  name: string;
  distanceLabel: string;
  /** Ángulo sobre el horizonte al que se ve el punto (según desnivel y distancia); null si falta la altura. */
  elevationDeg: number | null;
  turnText: string | null;
}) {
  const { t } = useTranslation();
  const angles = useDeviceAngles(true);
  const smoothed = useRef<Camera | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Por defecto, fondo negro; la cámara es opcional y se pide solo al activarla.
  const [withCamera, setWithCamera] = useState(false);
  const cam = useCamera(video, withCamera);
  const [fov, setFov] = useState(DEFAULT_FOV);
  useEffect(() => {
    if (withCamera && cam.ready && video.current) setFov(visibleFov(video.current).v);
    if (!withCamera) setFov(DEFAULT_FOV);
  }, [withCamera, cam.ready]);
  const elev = elevationDeg === null ? 0 : Math.max(-80, Math.min(80, elevationDeg));
  const [size, setSize] = useState({ w: 360, h: 560 });
  const declination = useMemo(() => declinationAt(Math.round(place.lat * 10) / 10, Math.round(place.lon * 10) / 10), [place.lat, place.lon]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const apply = () => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(240, el.clientHeight) });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let camera: Camera | null = null;
  if (angles) {
    const raw = cameraFromDevice(angles.alpha, angles.beta, angles.gamma, declination, angles.screenAngle, fov);
    const prev = smoothed.current;
    const forward = prev ? norm(add(prev.forward, raw.forward, SMOOTHING)) : raw.forward;
    const up0 = prev ? norm(add(prev.up, raw.up, SMOOTHING)) : raw.up;
    const right = norm(cross(forward, up0));
    camera = { forward, right, up: cross(right, forward), fov };
    smoothed.current = camera;
  }

  const { w, h } = size;
  // El FOV es vertical en la pantalla; el horizontal sale de la proporción.
  const px = (v: Vec3): { x: number; y: number } | null => {
    if (!camera) return null;
    const p = projectCamera(v, camera, h);
    return p && { x: w / 2 + p.x, y: h / 2 + p.y };
  };
  const inside = (p: { x: number; y: number }) => p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40;
  const dir = (az: number, alt: number) => horizontalToVector({ az, alt });

  const lines: { d: string; cls: string }[] = [];
  const labels: { x: number; y: number; text: string; cls: string }[] = [];
  let beacon: { x: number; y: number } | null = null;
  let edge: { angle: number } | null = null;

  if (camera) {
    // Horizonte y escalas de altura (±10°, ±20°, ±30°): líneas que acompañan el giro del celular.
    for (const alt of [0, 10, -10, 20, -20, 30, -30]) {
      let d = '';
      let pen = false;
      for (let az = 0; az <= 360; az += 3) {
        const p = px(dir(az, alt));
        if (p && inside(p)) {
          d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          pen = true;
        } else pen = false;
      }
      if (d) lines.push({ d, cls: alt === 0 ? 'hg-horizon' : 'hg-ladder' });
      if (alt !== 0) {
        const p = px(dir(bearing, alt));
        if (p && inside(p)) labels.push({ x: p.x + 6, y: p.y - 4, text: `${alt > 0 ? '+' : ''}${alt}°`, cls: 'hg-small' });
      }
    }
    // Marcas cada 15° sobre el horizonte, con N/E/S/O cada 45°.
    for (let az = 0; az < 360; az += 15) {
      const a = px(dir(az, 0));
      const b = px(dir(az, az % 45 === 0 ? 4 : 2));
      if (!a || !b || !inside(a)) continue;
      lines.push({ d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`, cls: 'hg-tick' });
      if (az % 45 === 0) labels.push({ x: a.x, y: a.y + 18, text: t(`geo.cardinal.${CARDINALS[az / 45]!}`), cls: 'hg-card' });
      else if (az % 30 === 0) labels.push({ x: a.x, y: a.y + 14, text: String(az), cls: 'hg-small' });
    }
    // Camino sobre el suelo hacia el punto: marcas que se achican con la distancia.
    GROUND_DISTANCES.forEach((m, i) => {
      const alt = -(Math.atan(EYE_M / m) * 180) / Math.PI;
      const spread = Math.max(0.6, 5 / Math.sqrt(m));
      const c = px(dir(bearing, alt));
      const l = px(dir(bearing - spread, alt));
      const r = px(dir(bearing + spread, alt));
      if (!c || !l || !r || !inside(c)) return;
      const hgt = Math.max(3, 26 - i * 2.4);
      lines.push({
        d: `M${l.x.toFixed(1)} ${(l.y + hgt).toFixed(1)}L${c.x.toFixed(1)} ${c.y.toFixed(1)}L${r.x.toFixed(1)} ${(r.y + hgt).toFixed(1)}`,
        cls: 'hg-path',
      });
    });
    // El punto, a la altura que le corresponde según el desnivel y la distancia; una línea baja hasta el horizonte.
    const mark = px(dir(bearing, elev));
    if (mark && inside(mark)) {
      beacon = { x: mark.x, y: mark.y };
      const ground = px(dir(bearing, 0));
      if (ground && Math.abs(elev) > 1) lines.push({ d: `M${mark.x.toFixed(1)} ${mark.y.toFixed(1)}L${ground.x.toFixed(1)} ${ground.y.toFixed(1)}`, cls: 'hg-beacon' });
      else lines.push({ d: `M${mark.x.toFixed(1)} ${mark.y.toFixed(1)}L${mark.x.toFixed(1)} ${(mark.y - 60).toFixed(1)}`, cls: 'hg-beacon' });
      const tilt = elevationDeg === null ? '' : ` · ${elev > 0 ? '+' : ''}${Math.round(elev)}°`;
      labels.push({ x: mark.x, y: mark.y - (Math.abs(elev) > 1 ? 14 : 72), text: `${name} · ${distanceLabel}${tilt}`, cls: 'hg-name' });
    } else {
      // Fuera de cuadro: flecha en el borde hacia donde girar (y subir o bajar la vista).
      edge = { angle: offscreenDirection(dir(bearing, elev), camera) };
    }
  }

  const ex = edge ? w / 2 + Math.cos(edge.angle) * (w / 2 - 34) : 0;
  const ey = edge ? h / 2 + Math.sin(edge.angle) * (h / 2 - 34) : 0;

  return (
    <div ref={box} className={`hg${withCamera ? ' hg-cam' : ''}`} data-testid="horizon-guide">
      {withCamera && <video ref={video} className="hg-video" playsInline muted aria-hidden />}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={t('goto.view3dLabel')}>
        {lines.map((l, i) => (
          <path key={i} d={l.d} className={l.cls} fill="none" />
        ))}
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} className={l.cls} textAnchor="middle">
            {l.text}
          </text>
        ))}
        {beacon && <circle cx={beacon.x} cy={beacon.y} r={6} className="hg-dot" data-testid="hg-beacon" />}
        {edge && (
          <g transform={`translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${((edge.angle * 180) / Math.PI).toFixed(1)})`} data-testid="hg-edge">
            <path d="M-14 -16L16 0L-14 16Z" className="hg-dot" />
          </g>
        )}
      </svg>
      <button
        type="button"
        className="icon-btn hg-camera"
        onClick={() => setWithCamera(!withCamera)}
        aria-pressed={withCamera}
        aria-label={withCamera ? t('goto.cameraOff') : t('goto.cameraOn')}
        title={withCamera ? t('goto.cameraOff') : t('goto.cameraOn')}
        data-testid="hg-camera"
      >
        {withCamera ? <CameraOff size={22} /> : <CameraIcon size={22} />}
      </button>
      {withCamera && cam.error && <p className="hg-turn" role="alert">{t(`goto.camera.${cam.error}`)}</p>}
      {turnText && <p className="hg-turn">{turnText}</p>}
      {!angles && <p className="hg-turn">{t('compass.waiting')}</p>}
    </div>
  );
}
