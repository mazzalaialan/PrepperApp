import { describe, expect, it } from 'vitest';
import { avalancheRisk, lateralTilt, slopeZone, tiltFromGravity } from './tilt';

const G = 9.81;
const rad = (d: number) => (d * Math.PI) / 180;

describe('tiltFromGravity', () => {
  it('acostado: 0° de pendiente', () => {
    expect(tiltFromGravity(0, 0, G)).toMatchObject({ surface: 0, sight: 0 });
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

  it('parado: giro lateral (horario positivo) y con la pantalla rotada', () => {
    // Derecho.
    expect(tiltFromGravity(0, G, 0)!.roll).toBeCloseTo(0);
    // Girado 10° en sentido horario: el eje x apunta un poco hacia abajo.
    const cw = tiltFromGravity(-G * Math.sin(rad(10)), G * Math.cos(rad(10)), 0)!;
    expect(cw.roll).toBeCloseTo(10);
    expect(tiltFromGravity(G * Math.sin(rad(5)), G * Math.cos(rad(5)), 0)!.roll).toBeCloseTo(-5);
    // De costado (90° antihorario) con la pantalla rotada a horizontal: derecho.
    const side = tiltFromGravity(G, 0, 0)!;
    expect(side.roll).toBeCloseTo(-90);
    expect(lateralTilt(side.roll, 90)).toBeCloseTo(0);
    expect(lateralTilt(-87, 90)).toBeCloseTo(3);
    expect(lateralTilt(179, 0)).toBeCloseTo(179);
    expect(lateralTilt(181, 0)).toBeCloseTo(-179);
  });

  it('sin gravedad no hay lectura', () => {
    expect(tiltFromGravity(0, 0, 0.2)).toBeNull();
  });
});

describe('slopeZone', () => {
  it('zonas de avalancha', () => {
    expect([10, 27, 30, 38, 45, 50, 55, 56, 70, -35].map(slopeZone)).toEqual(['low', 'caution', 'avalanche', 'avalanche', 'avalanche', 'steep', 'steep', 'extreme', 'extreme', 'avalanche']);
  });

  it('el riesgo nunca baja al aumentar la pendiente', () => {
    const order = { low: 0, moderate: 1, high: 2 };
    const risks = Array.from({ length: 91 }, (_, a) => order[avalancheRisk(slopeZone(a))]);
    expect(risks.every((r, i) => i === 0 || r >= risks[i - 1]!)).toBe(true);
    expect([10, 27, 38, 60].map((a) => avalancheRisk(slopeZone(a)))).toEqual(['low', 'moderate', 'high', 'high']);
  });
});
