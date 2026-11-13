import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Track } from '@/core/model/types';
import { selectableTracks, tracksToShow } from './trackSelect';

const track = (name: string, createdAt: string, over: Partial<Track> = {}): Track => ({
  ...newEntity<Track>({ name, desc: '', source: '', link: null, segments: [[[-41, -71, null]]], waypoints: [], distanceM: 1000, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '' }),
  createdAt,
  ...over,
});

const mon = track('lunes', '2026-11-02T09:00:00Z');
const wed = track('miércoles', '2026-11-04T09:00:00Z');
const fri = track('viernes', '2026-11-06T09:00:00Z');
const grabando = track('en curso', '2026-11-08T09:00:00Z', { recording: true });
const deRuta = track('de una ruta', '2026-11-09T09:00:00Z', { routeId: 'r1' });
const all = [mon, fri, wed, grabando, deRuta];
const names = (ts: Track[]) => ts.map((t) => t.name);

describe('qué recorridos se ven en el mapa', () => {
  it('los elegibles son los guardados, del más nuevo al más viejo (sin el que se graba ni los de una ruta planificada)', () => {
    expect(names(selectableTracks(all))).toEqual(['viernes', 'miércoles', 'lunes']);
  });

  it('automático: el último si no se está grabando; si se graba, ninguno de los guardados (el actual se ve aparte)', () => {
    expect(names(tracksToShow(all, 'auto', [], false))).toEqual(['viernes']);
    expect(names(tracksToShow(all, 'auto', [], true))).toEqual([]);
    expect(names(tracksToShow([], 'auto', [], false))).toEqual([]);
  });

  it('elegir, todos y ninguno', () => {
    expect(names(tracksToShow(all, 'chosen', [mon.id, wed.id], false))).toEqual(['miércoles', 'lunes']);
    expect(names(tracksToShow(all, 'chosen', ['no-existe'], false))).toEqual([]);
    expect(names(tracksToShow(all, 'all', [], true))).toEqual(['viernes', 'miércoles', 'lunes']);
    expect(names(tracksToShow(all, 'none', [mon.id], false))).toEqual([]);
  });

  it('el que se abre desde su ficha se ve siempre, con cualquier modo y sin repetirse', () => {
    expect(names(tracksToShow(all, 'none', [], false, [mon.id]))).toEqual(['lunes']);
    expect(names(tracksToShow(all, 'auto', [], true, [wed.id]))).toEqual(['miércoles']);
    expect(names(tracksToShow(all, 'all', [], false, [mon.id]))).toEqual(['viernes', 'miércoles', 'lunes']);
  });
});
