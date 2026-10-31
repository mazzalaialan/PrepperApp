import { describe, expect, it } from 'vitest';
import {
  cameraFromDevice,
  cameraLookingAt,
  equatorialToVector,
  horizontalToVector,
  localSiderealDeg,
  planetPositions,
  projectCamera,
  projectDome,
  vectorToHorizontal,
  visiblePole,
} from './sky';

const close = (a: number[], b: number[], digits = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('coordenadas', () => {
  it('un astro en el meridiano con declinación igual a la latitud está en el cenit', () => {
    const v = equatorialToVector(100, -34.6, 100, -34.6);
    expect(vectorToHorizontal(v).alt).toBeCloseTo(90);
  });

  it('la Polar está a la altura de la latitud, hacia el norte (45° N)', () => {
    const h = vectorToHorizontal(equatorialToVector(37.95, 89.26, 123, 45));
    expect(h.alt).toBeGreaterThan(44);
    expect(h.alt).toBeLessThan(46);
    expect(Math.min(h.az, 360 - h.az)).toBeLessThan(1.5);
  });

  it('el polo sur celeste en Buenos Aires: 34,6° de altura sobre el sur', () => {
    expect(visiblePole(-34.6)).toEqual({ hemisphere: 'south', pole: { az: 180, alt: 34.6 } });
    const h = vectorToHorizontal(equatorialToVector(0, -90, 57, -34.6));
    expect(h.alt).toBeCloseTo(34.6);
    expect(h.az).toBeCloseTo(180);
  });

  it('ida y vuelta horizontal ↔ vector', () => {
    const h = vectorToHorizontal(horizontalToVector({ az: 237, alt: 18 }));
    expect(h.az).toBeCloseTo(237);
    expect(h.alt).toBeCloseTo(18);
  });

  it('tiempo sidéreo en [0, 360)', () => {
    const lst = localSiderealDeg(new Date('2026-10-30T03:00:00Z'), -58.38);
    expect(lst).toBeGreaterThanOrEqual(0);
    expect(lst).toBeLessThan(360);
  });

  it('el Sol de noche está bajo el horizonte y al mediodía arriba (Buenos Aires)', () => {
    const at = (iso: string) => {
      const d = new Date(iso);
      const sun = planetPositions(d, -34.6, -58.38).find((p) => p.id === 'sun')!;
      return vectorToHorizontal(equatorialToVector(sun.ra, sun.dec, localSiderealDeg(d, -58.38), -34.6)).alt;
    };
    expect(at('2026-10-30T04:00:00Z')).toBeLessThan(-20); // 01:00 local
    expect(at('2026-10-30T15:37:00Z')).toBeGreaterThan(60); // mediodía solar
  });
});

describe('cámara del celular', () => {
  it('parado mirando al norte magnético: adelante norte, arriba cenit, derecha este', () => {
    const cam = cameraFromDevice(0, 90, 0, 0, 0, 60);
    close(cam.forward, [0, 1, 0]);
    close(cam.up, [0, 0, 1]);
    close(cam.right, [1, 0, 0]);
  });

  it('con declinación 10° E, el norte magnético está a 10° del verdadero', () => {
    expect(vectorToHorizontal(cameraFromDevice(0, 90, 0, 10, 0, 60).forward).az).toBeCloseTo(10);
  });

  it('acostado boca arriba: la cámara trasera mira al suelo', () => {
    expect(vectorToHorizontal(cameraFromDevice(0, 0, 0, 0, 0, 60).forward).alt).toBeCloseTo(-90);
  });

  it('en horizontal (pantalla girada 90°), la derecha de la pantalla es otro eje', () => {
    const cam = cameraFromDevice(0, 90, 0, 0, 90, 60);
    close(cam.forward, [0, 1, 0]);
    close(cam.right, [0, 0, -1]);
    close(cam.up, [1, 0, 0]);
  });
});

describe('proyecciones', () => {
  it('perspectiva: lo que está adelante cae en el centro; lo de atrás no se dibuja', () => {
    const cam = cameraLookingAt({ az: 90, alt: 20 }, 60);
    close(Object.values(projectCamera(horizontalToVector({ az: 90, alt: 20 }), cam, 800)!), [0, 0]);
    expect(projectCamera(horizontalToVector({ az: 270, alt: 0 }), cam, 800)).toBeNull();
    const higher = projectCamera(horizontalToVector({ az: 90, alt: 30 }), cam, 800)!;
    expect(higher.y).toBeLessThan(0); // más alto en el cielo → más arriba en la pantalla
    const south = projectCamera(horizontalToVector({ az: 100, alt: 20 }), cam, 800)!;
    expect(south.x).toBeGreaterThan(0); // mirando al este, el sur queda a la derecha
  });

  it('cúpula: cenit al centro, horizonte en el borde, este a la izquierda del norte', () => {
    close(Object.values(projectDome({ az: 0, alt: 90 }, 100, 0)!), [0, 0]);
    close(Object.values(projectDome({ az: 0, alt: 0 }, 100, 0)!), [0, -100]);
    close(Object.values(projectDome({ az: 90, alt: 0 }, 100, 0)!), [-100, 0]);
    // Mirando al sur (sur arriba), el oeste queda a la izquierda.
    close(Object.values(projectDome({ az: 270, alt: 0 }, 100, 180)!), [-100, 0]);
    expect(projectDome({ az: 0, alt: -10 }, 100, 0)).toBeNull();
  });
});
