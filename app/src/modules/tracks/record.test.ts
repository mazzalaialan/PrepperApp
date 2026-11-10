import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/model/types';
import { addPoint, finishedTrack, firstPoints, joinLastSegments, SAVER_STEP_M, shouldAdd } from './record';
import { trackStats } from './gpx';

const track = (segments: Track['segments']): Track =>
  ({ id: 'r', name: 'R', desc: '', source: '', link: null, segments, waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '', recorded: true, recording: true }) as unknown as Track;

describe('grabación del recorrido', () => {
  it('descarta puntos imprecisos o demasiado cerca del anterior', () => {
    expect(shouldAdd(undefined, { lat: -41, lon: -71, accuracy: 10 })).toBe(true);
    expect(shouldAdd(undefined, { lat: -41, lon: -71, accuracy: 80 })).toBe(false);
    // ~5,5 m: quieto, no suma.
    expect(shouldAdd([-41, -71, null], { lat: -41.00005, lon: -71, accuracy: 5 })).toBe(false);
    // ~11 m con buena precisión, sí; con 30 m de error hace falta más paso.
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 5 })).toBe(true);
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 30 })).toBe(false);
  });

  it('con batería baja pide un paso más largo (menos puntos)', () => {
    // ~11 m: suma con el paso normal, no con el de ahorro (20 m); ~33 m, sí.
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 5 }, SAVER_STEP_M)).toBe(false);
    expect(shouldAdd([-41, -71, null], { lat: -41.0003, lon: -71, accuracy: 5 }, SAVER_STEP_M)).toBe(true);
  });

  it('agrega al último tramo', () => {
    const segs = addPoint([[[-41, -71, null]], []], [-41.001, -71, 900]);
    expect(segs).toEqual([[[-41, -71, null]], [[-41.001, -71, 900]]]);
    expect(addPoint([], [-41, -71, null])).toEqual([[[-41, -71, null]]]);
  });

  it('al terminar deja los tramos con recorrido y calcula los datos', () => {
    const done = finishedTrack(
      track([
        [
          [-41, -71, 1000],
          [-41.001, -71, 1010],
        ],
        [[-41.002, -71, null]],
      ]),
      125,
    )!;
    expect(done.segments).toHaveLength(1);
    expect(done.recording).toBe(false);
    expect(done.durationS).toBe(125);
    expect(Math.round(done.distanceM)).toBe(111);
    expect(done.ascentM).toBe(10);
    expect(finishedTrack(track([[[-41, -71, null]]]), 3)).toBeNull();
  });

  it('para volver al origen toma solo la ida', () => {
    const t = track([
      [
        [1, 1, null],
        [2, 2, null],
      ],
      [
        [3, 3, null],
        [4, 4, null],
        [5, 5, null],
      ],
    ]);
    expect(firstPoints(t, 3).segments).toEqual([[[1, 1, null], [2, 2, null]], [[3, 3, null]]]);
    expect(firstPoints(t, 99).segments).toEqual(t.segments);
  });

  it('un corte con la pantalla apagada: separado no suma distancia; unido con una recta, sí', () => {
    const before: Track['segments'][number] = [[-41, -71, null], [-41.001, -71, null]];
    const after: Track['segments'][number] = [[-41.01, -71, null], [-41.011, -71, null]];
    const apart = trackStats([before, after]).distanceM;
    const joined = joinLastSegments([before, after]);
    expect(joined).toHaveLength(1);
    expect(trackStats(joined).distanceM).toBeGreaterThan(apart + 900);
    expect(joinLastSegments([before])).toEqual([before]);
  });
});
