import { useEffect, useRef, useState } from 'react';
import { horizontalToVector, offscreenDirection, projectCamera, projectDome, vectorToHorizontal, type Camera, type PlanetId, type Vec3 } from './sky';
import type { StarmapLayers } from '@/core/settings/settings';
import type { Scene } from './scene';

export type SkyView = { kind: 'dome'; top: number } | { kind: 'camera'; camera: Camera };

export interface SkyTarget {
  v: Vec3;
  label: string;
}

interface Props {
  scene: Scene;
  view: SkyView;
  red: boolean;
  layers: StarmapLayers;
  target: SkyTarget | null;
  /** Nombres de planetas y puntos cardinales ya traducidos. */
  labels: { planets: Record<PlanetId, string>; cardinals: string[]; pole: string; horizonPoint: string };
}

const PLANET_COLORS: Record<PlanetId, string> = {
  sun: '#ffd34d',
  moon: '#f2efe4',
  mercury: '#c8c0b0',
  venus: '#fff4c8',
  mars: '#ff7a4d',
  jupiter: '#f0d7a8',
  saturn: '#e8cf8a',
};

/** Color aproximado de la estrella por su índice B−V (azuladas a rojizas). */
function starColor(bv: number): string {
  if (bv < 0) return '#c9d8ff';
  if (bv < 0.4) return '#ffffff';
  if (bv < 0.8) return '#fff2d6';
  if (bv < 1.3) return '#ffd9a8';
  return '#ffb27a';
}

/** Carta del cielo en canvas: cúpula completa o vista de cámara. */
export function SkyCanvas({ scene, view, red, layers, target, labels }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry!.contentRect.width, h: entry!.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    const ctx = el.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, size.w, size.h, { scene, view, red, layers, target, labels });
  }, [size, scene, view, red, layers, target, labels]);

  return <canvas ref={canvas} className="sky-canvas" data-testid="sky-canvas" style={{ width: size.w, height: size.h }} />;
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Props) {
  const { scene, view, red } = p;
  const cx = w / 2;
  const cy = h / 2;
  const tint = (normal: string, alpha = 1) => (red ? `rgba(255, 60, 40, ${alpha})` : normal);
  const radius = Math.min(w, h) / 2 - 18;

  // Proyección común: devuelve coordenadas de pantalla o null si no se ve.
  const project = (v: Vec3): { x: number; y: number } | null => {
    if (view.kind === 'camera') {
      const pt = projectCamera(v, view.camera, h);
      return pt && { x: cx + pt.x, y: cy + pt.y };
    }
    const pt = projectDome(vectorToHorizontal(v), radius, view.top);
    return pt && { x: cx + pt.x, y: cy + pt.y };
  };

  ctx.fillStyle = red ? '#000' : '#05070d';
  ctx.fillRect(0, 0, w, h);

  // Horizonte y puntos cardinales.
  ctx.strokeStyle = tint('rgba(150, 170, 200, 0.6)', 0.6);
  ctx.lineWidth = 1.5;
  if (view.kind === 'dome') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    polyline(ctx, Array.from({ length: 73 }, (_, i) => horizontalToVector({ az: i * 5, alt: 0 })), project);
    if (p.layers.grid) drawDegreeScale(ctx, project, view.camera.fov, tint);
  }
  const layers = p.layers;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Con la guía activa, el punto cardinal del polo lo marca la guía ("SUR"/"NORTE"): no se repite.
  const guideCardinal = layers.guide ? (scene.hemisphere === 'south' ? 4 : 0) : -1;
  p.labels.cardinals.forEach((label, i) => {
    if (i === guideCardinal) return;
    const pt = project(horizontalToVector({ az: i * 45, alt: view.kind === 'dome' ? 0 : 1.5 }));
    if (!pt) return;
    ctx.fillStyle = tint(i === 0 ? '#ff6b5b' : 'rgba(200, 210, 230, 0.9)');
    // En la cúpula, la letra va apenas por fuera del círculo.
    const dx = view.kind === 'dome' ? (pt.x - cx) * 0.06 : 0;
    const dy = view.kind === 'dome' ? (pt.y - cy) * 0.06 : 0;
    ctx.fillText(label, pt.x + dx, pt.y + dy);
  });

  if (layers.constellationLines) {
    ctx.strokeStyle = tint('rgba(110, 150, 220, 0.45)', 0.35);
    ctx.lineWidth = 1;
    // Lo que está bajo el horizonte no se ve: el trazo se corta ahí.
    const aboveHorizon = (v: Vec3) => (v[2] < -0.005 ? null : project(v));
    for (const c of scene.constellations) for (const line of c.lines) polyline(ctx, line, aboveHorizon);
  }
  // En el cielo completo los 88 nombres se pisan entre sí: solo se escriben al apuntar a una porción.
  if (layers.constellationNames && view.kind === 'camera') {
    ctx.fillStyle = tint('rgba(140, 170, 230, 0.75)', 0.55);
    ctx.font = '11px system-ui, sans-serif';
    for (const c of scene.constellations) {
      const pt = project(c.center);
      if (pt && vectorToHorizontal(c.center).alt > 0) ctx.fillText(c.name, pt.x, pt.y);
    }
  }

  // Estrellas: las más brillantes vienen primero en el catálogo, se dibujan al final para quedar encima.
  const zoom = view.kind === 'camera' ? Math.min(2, 60 / view.camera.fov) : 1;
  for (let i = scene.stars.length - 1; i >= 0; i--) {
    const s = scene.stars[i]!;
    if (s.v[2] < -0.02) continue;
    const pt = project(s.v);
    if (!pt || pt.x < -5 || pt.y < -5 || pt.x > w + 5 || pt.y > h + 5) continue;
    const r = Math.max(0.5, (3.4 - 0.55 * s.mag) * (view.kind === 'dome' ? 0.8 : zoom));
    ctx.fillStyle = tint(starColor(s.bv), Math.min(1, 1.1 - s.mag * 0.12));
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nombres de las más brillantes (con zoom, más).
  const nameLimit = view.kind === 'dome' ? 0.6 : view.camera.fov < 40 ? 2.5 : 1.3;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = tint('rgba(235, 235, 245, 0.85)', 0.8);
  for (const s of layers.starNames ? scene.stars : []) {
    if (!s.name || s.mag > nameLimit || s.v[2] < 0) continue;
    const pt = project(s.v);
    if (pt) ctx.fillText(s.name, pt.x + 5, pt.y - 6);
  }

  // Sol, Luna y planetas.
  for (const planet of layers.planets ? scene.planets : []) {
    if (planet.v[2] < -0.02) continue;
    const pt = project(planet.v);
    if (!pt) continue;
    const r = planet.id === 'sun' || planet.id === 'moon' ? 7 : 4;
    ctx.fillStyle = tint(PLANET_COLORS[planet.id]);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(p.labels.planets[planet.id], pt.x + r + 4, pt.y);
  }

  if (layers.guide) {
    ctx.strokeStyle = tint('#e8a33d');
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (const line of scene.guide) polyline(ctx, line, project);
    ctx.setLineDash([]);
    marker(ctx, project(scene.pole), p.labels.pole, tint('#e8a33d'));
    marker(ctx, project(scene.horizonPoint), p.labels.horizonPoint, tint('#ff6b5b'), true);
  }

  if (p.target) drawTarget(ctx, p.target, project, view, w, h, tint('#7fe08a'));
}

/**
 * Realidad aumentada: escala de acimut sobre el horizonte (marca cada 5°, número
 * cada 15°, o cada 5° con zoom) y círculos de altura cada 15° con su valor.
 */
function drawDegreeScale(
  ctx: CanvasRenderingContext2D,
  project: (v: Vec3) => { x: number; y: number } | null,
  fov: number,
  tint: (normal: string, alpha?: number) => string,
) {
  const labelEvery = fov < 40 ? 5 : 15;
  ctx.strokeStyle = tint('rgba(150, 170, 200, 0.7)', 0.6);
  ctx.fillStyle = tint('rgba(170, 185, 210, 0.85)', 0.7);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;
  for (let az = 0; az < 360; az += 5) {
    const major = az % labelEvery === 0;
    const base = project(horizontalToVector({ az, alt: 0 }));
    const tip = project(horizontalToVector({ az, alt: major ? 1.2 : 0.6 }));
    if (!base || !tip) continue;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    // Los múltiplos de 45° ya llevan el punto cardinal.
    if (major && az % 45 !== 0) ctx.fillText(`${az}°`, base.x, base.y + 4);
  }

  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = tint('rgba(120, 140, 180, 0.35)', 0.3);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let alt = 15; alt < 90; alt += 15) {
    const ring = Array.from({ length: 73 }, (_, i) => horizontalToVector({ az: i * 5, alt }));
    polyline(ctx, ring, project);
    // El valor se escribe sobre el círculo, en el punto más cercano al centro de la pantalla.
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const v of ring) {
      const pt = project(v);
      if (!pt) continue;
      const d = Math.abs(pt.x - ctx.canvas.width / (2 * (window.devicePixelRatio || 1)));
      if (d < bestDist) {
        bestDist = d;
        best = pt;
      }
    }
    if (best) ctx.fillText(`${alt}°`, best.x + 4, best.y - 6);
  }
  ctx.setLineDash([]);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
}

function polyline(ctx: CanvasRenderingContext2D, points: Vec3[], project: (v: Vec3) => { x: number; y: number } | null) {
  ctx.beginPath();
  let pen = false;
  for (const v of points) {
    const pt = project(v);
    if (!pt) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(pt.x, pt.y);
    else ctx.moveTo(pt.x, pt.y);
    pen = true;
  }
  ctx.stroke();
}

function marker(ctx: CanvasRenderingContext2D, pt: { x: number; y: number } | null, label: string, color: string, big = false) {
  if (!pt) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, big ? 9 : 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = big ? 'bold 16px system-ui, sans-serif' : 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, pt.x, pt.y + (big ? -18 : -14));
  ctx.textAlign = 'left';
}

/** El astro buscado: un anillo si está en pantalla; si no, una flecha en el borde hacia dónde girar. */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  target: SkyTarget,
  project: (v: Vec3) => { x: number; y: number } | null,
  view: SkyView,
  w: number,
  h: number,
  color: string,
) {
  const pt = project(target.v);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  if (pt && pt.x > 0 && pt.y > 0 && pt.x < w && pt.y < h) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(target.label, pt.x, pt.y + 30);
    ctx.textAlign = 'left';
    return;
  }
  if (view.kind !== 'camera') return;
  const angle = offscreenDirection(target.v, view.camera);
  const r = Math.min(w, h) / 2 - 36;
  const ax = w / 2 + Math.cos(angle) * r;
  const ay = h / 2 + Math.sin(angle) * r;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -12);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
