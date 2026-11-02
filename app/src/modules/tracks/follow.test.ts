import { describe, expect, it } from 'vitest';
import { followState, isOffTrack, prepareFollow, walkingMinutes } from './follow';

/** Recorrido en L: 1 km al norte subiendo 200 m, después 1 km al este bajando 50 m. */
const lat0 = -41;
const lon0 = -71;
const dLat = 1000 / 111_320;
const dLon = 1000 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const track = {
  segments: [
    [
      [lat0, lon0, 1000],
      [lat0 + dLat, lon0, 1200],
    ],
    [
      [lat0 + dLat, lon0, 1200],
      [lat0 + dLat, lon0 + dLon, 1150],
    ],
  ] as [number, number, number | null][][],
  waypoints: [
    { name: 'Esquina', lat: lat0 + dLat, lon: lon0, ele: 1200, desc: '' },
    { name: 'Arroyo', lat: lat0 + dLat, lon: lon0 + dLon / 2, ele: null, desc: '' },
  ],
};

describe('seguir un track', () => {
  const line = prepareFollow(track);

  it('arma el recorrido entero con el largo y el desnivel', () => {
    expect(line.totalM).toBeCloseTo(2000, -1);
    expect(line.up.at(-1)).toBe(200);
    expect(line.down.at(-1)).toBe(50);
    expect(line.waypoints.map((w) => w.name)).toEqual(['Esquina', 'Arroyo']);
  });

  it('encima del track: cuánto recorrí, cuánto falta y el próximo punto', () => {
    const s = followState(line, lat0 + dLat / 2, lon0);
    expect(s.offTrackM).toBeLessThan(1);
    expect(s.alongM).toBeCloseTo(500, -1);
    expect(s.remainingM).toBeCloseTo(1500, -1);
    expect(s.upLeftM).toBe(100);
    expect(s.downLeftM).toBe(50);
    expect(s.next).toMatchObject({ name: 'Esquina' });
    expect(s.next!.aheadM).toBeCloseTo(500, -1);
    expect(s.arrived).toBe(false);
  });

  it('desviado: a cuánto estoy y el punto del track para volver', () => {
    // 100 m al oeste de la mitad del primer tramo.
    const s = followState(line, lat0 + dLat / 2, lon0 - dLon / 10);
    expect(s.offTrackM).toBeCloseTo(100, -1);
    expect(s.nearest.lon).toBeCloseTo(lon0, 6);
    expect(isOffTrack(s.offTrackM, 10, false)).toBe(true);
  });

  it('el aviso no titila: sale pasando el umbral y vuelve recién a 2/3', () => {
    expect(isOffTrack(35, 10, false)).toBe(false);
    expect(isOffTrack(45, 10, false)).toBe(true);
    expect(isOffTrack(35, 10, true)).toBe(true);
    expect(isOffTrack(20, 10, true)).toBe(false);
    // Con un GPS impreciso (80 m) no avisa por estar a 60 m.
    expect(isOffTrack(60, 80, false)).toBe(false);
  });

  it('llegada y sentido inverso', () => {
    expect(followState(line, lat0 + dLat, lon0 + dLon).arrived).toBe(true);
    const back = prepareFollow(track, true);
    const s = followState(back, lat0 + dLat, lon0 + dLon);
    expect(s.alongM).toBeLessThan(1);
    expect(s.upLeftM).toBe(50);
    expect(s.next).toMatchObject({ name: 'Arroyo' });
  });

  it('tiempo a pie: el mayor entre distancia (6 km/h) y altura (300 m/h subiendo, 600 m/h bajando) más la mitad del menor', () => {
    expect(walkingMinutes(6000, 0, 0)).toBe(60);
    expect(walkingMinutes(0, 300, 0)).toBe(60);
    expect(walkingMinutes(0, 0, 600)).toBe(60);
    // 1 h de distancia y 1 h de subida: 1 + 0,5.
    expect(walkingMinutes(6000, 300, 0)).toBe(90);
    // 2 h de distancia contra 1 h de altura (150 m arriba y 300 m abajo): 2 + 0,5.
    expect(walkingMinutes(12000, 150, 300)).toBe(150);
    // La altura manda: 3 h de subida contra 1 h de distancia.
    expect(walkingMinutes(6000, 900, 0)).toBe(210);
  });
});
