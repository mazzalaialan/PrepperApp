import { describe, expect, it } from 'vitest';
import { angleDiff, declinationAt, orientationFrom, smoothAngle } from './heading';

describe('orientationFrom', () => {
  it('acostado: el rumbo es 360 − α', () => {
    expect(orientationFrom(0, 0, 0)).toMatchObject({ mode: 'flat', heading: 0 });
    expect(orientationFrom(90, 0, 0).heading).toBeCloseTo(270);
    expect(orientationFrom(270, 5, -3).heading).toBeCloseTo(90, 0);
  });

  it('parado: el rumbo es hacia donde mira la cámara', () => {
    const north = orientationFrom(0, 90, 0);
    expect(north.mode).toBe('upright');
    expect(north.heading).toBeCloseTo(0);
    expect(north.pitch).toBeCloseTo(0);
    expect(orientationFrom(90, 90, 0).heading).toBeCloseTo(270); // girado a la izquierda → oeste
    expect(orientationFrom(270, 90, 0).heading).toBeCloseTo(90);
  });

  it('parado e inclinado hacia arriba: mismo rumbo, elevación positiva', () => {
    const o = orientationFrom(0, 110, 0);
    expect(o.heading).toBeCloseTo(0);
    expect(o.pitch).toBeCloseTo(20);
  });
});

describe('ángulos', () => {
  it('angleDiff toma el camino corto', () => {
    expect(angleDiff(350, 10)).toBeCloseTo(20);
    expect(angleDiff(10, 350)).toBeCloseTo(-20);
    expect(angleDiff(0, 180)).toBeCloseTo(180);
  });

  it('smoothAngle no salta al cruzar el norte', () => {
    expect(smoothAngle(358, 2, 0.5)).toBeCloseTo(0);
    expect(smoothAngle(null, 370)).toBeCloseTo(10);
  });
});

describe('declinación (WMM 2025)', () => {
  it('Buenos Aires: unos 9–10° al oeste', () => {
    const d = declinationAt(-34.6, -58.38, 25, new Date(Date.UTC(2026, 9, 30)));
    expect(d).toBeLessThan(-8);
    expect(d).toBeGreaterThan(-11);
  });

  it('Ushuaia: da un valor válido en el extremo sur', () => {
    expect(Number.isFinite(declinationAt(-54.8, -68.3))).toBe(true);
  });
});
