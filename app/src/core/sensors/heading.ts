import { magvar } from 'magvar';
import { normalizeDeg } from '@/core/geo/geo';

/**
 * Rumbo a partir de `deviceorientationabsolute` (W3C: R = Rz(α)·Rx(β)·Ry(γ),
 * marco terrestre x = este, y = norte, z = arriba). En Android el norte de ese
 * marco es el magnético: el rumbo verdadero se obtiene sumando la declinación.
 */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type HoldMode = 'flat' | 'upright';

export interface Orientation {
  /** Rumbo magnético en grados [0, 360). */
  heading: number;
  /**
   * `flat`: celular acostado, el rumbo es hacia donde apunta la parte de arriba (brújula).
   * `upright`: celular parado, el rumbo es hacia donde mira la cámara trasera (realidad aumentada).
   */
  mode: HoldMode;
  /** Elevación de la cámara sobre el horizonte, en grados (0 = mira al horizonte). */
  pitch: number;
}

/** Inclinación a partir de la cual se considera que el celular está parado (cámara al frente). */
const UPRIGHT_FROM_DEG = 50;

export function orientationFrom(alpha: number, beta: number, gamma: number): Orientation {
  const [sA, cA] = [Math.sin(rad(alpha)), Math.cos(rad(alpha))];
  const [sB, cB] = [Math.sin(rad(beta)), Math.cos(rad(beta))];
  const [sG, cG] = [Math.sin(rad(gamma)), Math.cos(rad(gamma))];

  // Dirección de la cámara trasera (eje −z del dispositivo) en el marco terrestre.
  const camE = -(cA * sG + sA * sB * cG);
  const camN = -(sA * sG - cA * sB * cG);
  const camUp = -(cB * cG);
  // Dirección de la parte de arriba del celular (eje +y).
  const topE = -sA * cB;
  const topN = cA * cB;

  const tilt = deg(Math.acos(Math.max(-1, Math.min(1, Math.abs(cB * cG)))));
  const mode: HoldMode = tilt >= UPRIGHT_FROM_DEG ? 'upright' : 'flat';
  const heading = mode === 'upright' ? deg(Math.atan2(camE, camN)) : deg(Math.atan2(topE, topN));
  return { heading: normalizeDeg(heading), mode, pitch: deg(Math.asin(Math.max(-1, Math.min(1, camUp)))) };
}

/** Diferencia angular con signo en (−180, 180]: cuánto girar desde `from` para llegar a `to` (positivo = derecha). */
export function angleDiff(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Suavizado exponencial circular (sin el salto de 359° a 0°). */
export function smoothAngle(previous: number | null, next: number, factor = 0.25): number {
  if (previous === null) return normalizeDeg(next);
  return normalizeDeg(previous + angleDiff(previous, next) * factor);
}

/** Declinación magnética (WMM 2025) en grados, este positivo. */
export function declinationAt(lat: number, lon: number, altMeters: number | null = 0, when = new Date()): number {
  return magvar(lat, lon, (altMeters ?? 0) / 1000, when);
}
