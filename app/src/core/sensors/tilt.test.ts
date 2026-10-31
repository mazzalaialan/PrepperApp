import { describe, expect, it } from 'vitest';
import { slopeZone, tiltFromGravity } from './tilt';

const G = 9.81;
const rad = (d: number) => (d * Math.PI) / 180;

describe('tiltFromGravity', () => {
  it('acostado: 0° de pendiente', () => {
    expect(tiltFromGravity(0, 0, G)).toEqual({ surface: 0, sight: 0 });
  });

  it('apoyado en una pendiente de 35° (inclinado hacia adelante o de costado)', () => {
    expect(tiltFromGravity(0, G * Math.sin(rad(35)), G * Math.cos(rad(35)))!.surface).toBeCloseTo(35);
    expect(tiltFromGravity(G * Math.sin(rad(35)), 0, G * Math.cos(rad(35)))!.surface).toBeCloseTo(35);
    // Boca abajo da lo mismo: importa el ángulo del plano.
    expect(tiltFromGravity(0, G * Math.sin(rad(35)), -G * Math.cos(rad(35)))!.surface).toBeCloseTo(35);
  });

  it('apuntando: elevación del borde superior', () => {
    expect(tiltFromGravity(0, G * Math.sin(rad(40)), G * Math.cos(rad(40)))!.sight).toBeCloseTo(40);
    expect(tiltFromGravity(0, -G * Math.sin(rad(20)), G * Math.cos(rad(20)))!.sight).toBeCloseTo(-20);
  });

  it('sin gravedad no hay lectura', () => {
    expect(tiltFromGravity(0, 0, 0.2)).toBeNull();
  });
});

describe('slopeZone', () => {
  it('zonas de avalancha', () => {
    expect([10, 27, 30, 38, 45, 50, -35].map(slopeZone)).toEqual(['low', 'caution', 'avalanche', 'avalanche', 'avalanche', 'steep', 'avalanche']);
  });
});
