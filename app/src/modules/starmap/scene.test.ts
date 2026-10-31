import { describe, expect, it } from 'vitest';
import { buildScene, loadSkyData } from './scene';
import { vectorToHorizontal, type Vec3 } from './sky';

const angleDeg = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
const minDistance = (line: Vec3[], v: Vec3) => Math.min(...line.map((p) => angleDeg(p, v)));

describe('escena del cielo', () => {
  it('Buenos Aires: la prolongación de la Cruz del Sur pasa por Acrux y llega al polo sur celeste', async () => {
    const data = await loadSkyData();
    const scene = buildScene(data, new Date('2026-05-15T02:00:00Z'), -34.6, -58.38, 'es');
    expect(scene.hemisphere).toBe('south');
    expect(vectorToHorizontal(scene.pole)).toMatchObject({ az: 180 });
    expect(vectorToHorizontal(scene.pole).alt).toBeCloseTo(34.6);

    const acrux = scene.stars.find((s) => s.name === 'Acrux')!;
    const gacrux = scene.stars.find((s) => s.name === 'Gacrux')!;
    const [crossAxis, pointers, bisector, toHorizon] = scene.guide;
    // La regla práctica (4,5 veces el eje) no es exacta: el polo queda a pocos grados de esa línea.
    expect(minDistance(crossAxis!, acrux.v)).toBeLessThan(2);
    expect(angleDeg(crossAxis![0]!, gacrux.v)).toBeLessThan(0.01);
    expect(angleDeg(bisector!.at(-1)!, scene.pole)).toBeLessThan(0.01);
    expect(pointers).toHaveLength(25);
    expect(vectorToHorizontal(toHorizon!.at(-1)!)).toMatchObject({ az: 180, alt: 0 });
    // La Cruz del Sur es circumpolar en Buenos Aires: siempre arriba del horizonte.
    expect(vectorToHorizontal(acrux.v).alt).toBeGreaterThan(0);
  });

  it('hemisferio norte: la guía va de la Osa Mayor a la Polar y al Norte', async () => {
    const data = await loadSkyData();
    const scene = buildScene(data, new Date('2026-05-15T02:00:00Z'), 40.4, -3.7, 'es');
    expect(scene.hemisphere).toBe('north');
    const dubhe = scene.stars.find((s) => s.name === 'Dubhe')!;
    const polaris = scene.stars.find((s) => s.name?.startsWith('Polaris'))!;
    expect(minDistance(scene.guide[0]!, dubhe.v)).toBeLessThan(1.5);
    expect(angleDeg(polaris.v, scene.pole)).toBeLessThan(1.5);
    expect(vectorToHorizontal(scene.guide[1]!.at(-1)!)).toMatchObject({ az: 0, alt: 0 });
  });

  it('nombres de constelaciones según el idioma', async () => {
    const data = await loadSkyData();
    const es = buildScene(data, new Date(), -34.6, -58.38, 'es');
    const en = buildScene(data, new Date(), -34.6, -58.38, 'en');
    expect(es.constellations.find((c) => c.id === 'Cru')!.name).toBe('Cruz del Sur');
    expect(en.constellations.find((c) => c.id === 'Ori')!.name).toBe('Orion');
  });
});
