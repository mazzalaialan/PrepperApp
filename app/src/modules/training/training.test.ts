import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '@/modules/tracks/gpx';
import { ACTIVITIES, ACTIVITY_KINDS, GROUPS, kindsOf } from './activities';
import { calories } from './energy';
import type { Workout } from '@/core/model/types';
import { byWeek, inOuting, recalculated, recordsOf, totalsOf, weekStart } from './history';
import { buildSharePayload, trimEnds } from './share';
import { analyzeRecording, formatClock, formatPace } from './stats';

describe('actividades', () => {
  it('cada actividad tiene su grupo y las de bajo techo no usan GPS', () => {
    expect(ACTIVITY_KINDS).toHaveLength(16);
    for (const k of ACTIVITY_KINDS) expect(ACTIVITIES[k].kind).toBe(k);
    expect(kindsOf('indoor')).toEqual(['treadmill', 'elliptical', 'stairClimber']);
    expect(kindsOf('rowing')).toEqual(['kayak', 'canoe', 'rowboat', 'sup', 'rafting']);
    expect(kindsOf('cycling')).toHaveLength(5);
    expect(GROUPS.flatMap(kindsOf).sort()).toEqual([...ACTIVITY_KINDS].sort());
    expect(ACTIVITY_KINDS.filter((k) => !ACTIVITIES[k].gps)).toEqual(['treadmill', 'elliptical', 'stairClimber']);
    // A pie, ritmo; en bici y remo, velocidad.
    expect(ACTIVITIES.trek.measure).toBe('pace');
    expect(ACTIVITIES.kayak.measure).toBe('speed');
  });
});

describe('calorías', () => {
  it('caminar 5 km/h una hora en llano, 70 kg: unas 250 kcal (ACSM)', () => {
    const k = calories({ kind: 'walk', weightKg: 70, movingS: 3600, distanceM: 5000 });
    expect(k).toBeGreaterThan(235);
    expect(k).toBeLessThan(265);
  });

  it('correr 10 km/h una hora, 70 kg: unas 770 kcal', () => {
    const k = calories({ kind: 'run', weightKg: 70, movingS: 3600, distanceM: 10_000 });
    expect(k).toBeGreaterThan(740);
    expect(k).toBeLessThan(800);
  });

  it('subir cuesta más: el mismo trekking con desnivel y mochila gasta más', () => {
    const flat = calories({ kind: 'trek', weightKg: 75, movingS: 7200, distanceM: 8000 });
    const climb = calories({ kind: 'trek', weightKg: 75, movingS: 7200, distanceM: 8000, ascentM: 800 });
    const pack = calories({ kind: 'trek', weightKg: 75, packKg: 12, movingS: 7200, distanceM: 8000, ascentM: 800 });
    expect(climb).toBeGreaterThan(flat * 1.5);
    expect(pack).toBeGreaterThan(climb * 1.1);
  });

  it('cinta: la inclinación suma; sin movimiento o sin peso, cero', () => {
    const flat = calories({ kind: 'treadmill', weightKg: 80, movingS: 1800, distanceM: 4000 });
    const incline = calories({ kind: 'treadmill', weightKg: 80, movingS: 1800, distanceM: 4000, inclinePct: 8 });
    expect(incline).toBeGreaterThan(flat * 1.25); // a 8 km/h corre: la pendiente pesa menos que al caminar
    expect(calories({ kind: 'run', weightKg: 80, movingS: 0, distanceM: 0 })).toBe(0);
    expect(calories({ kind: 'run', weightKg: 0, movingS: 600, distanceM: 1000 })).toBe(0);
  });

  it('bici: más rápido, más calorías; la de montaña y la de ruta, más que la eléctrica; subir suma', () => {
    const road25 = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 25_000 });
    const road15 = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 15_000 });
    expect(road25).toBeGreaterThan(road15);
    expect(road25).toBeGreaterThan(650); // MET 10 × 70 kg × 1 h
    const e = calories({ kind: 'ebike', weightKg: 70, movingS: 3600, distanceM: 25_000 });
    expect(e).toBeLessThan(road25);
    const climb = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 25_000, ascentM: 600 });
    // 70 kg × 9,81 × 600 m / (4184 × 0,22) ≈ 447 kcal de trabajo de subida
    expect(climb - road25).toBeGreaterThan(400);
    expect(climb - road25).toBeLessThan(500);
    expect(calories({ kind: 'mtb', weightKg: 70, movingS: 3600, distanceM: 12_000 })).toBeGreaterThanOrEqual(595);
  });

  it('remo, elíptica y escalador: por MET e intensidad', () => {
    expect(calories({ kind: 'kayak', weightKg: 70, movingS: 3600, distanceM: 5000 })).toBe(350); // 5 MET
    expect(calories({ kind: 'rafting', weightKg: 80, movingS: 7200, distanceM: 9000 })).toBe(800); // 5 MET
    const mod = calories({ kind: 'elliptical', weightKg: 70, movingS: 3600, distanceM: 0 });
    const hard = calories({ kind: 'elliptical', weightKg: 70, movingS: 3600, distanceM: 0, intensity: 'vigorous' });
    expect(mod).toBe(350);
    expect(hard).toBeGreaterThan(mod);
    expect(calories({ kind: 'stairClimber', weightKg: 70, movingS: 1800, distanceM: 0 })).toBe(315); // 9 MET × 70 × 0,5 h
  });
});

describe('estadísticas de lo grabado', () => {
  // Una caminata hacia el sur a 1,5 m/s: un punto cada 15 s (≈ 22,5 m); ~111 m por cada 0,001°.
  const walk = (n: number, startT = 1_000_000, startLat = -41): TrackPoint[] =>
    Array.from({ length: n }, (_, i) => [startLat - i * 0.0002, -71, 800 + i * 0.5, startT + i * 15] as TrackPoint);

  it('tiempo, distancia, desnivel, ritmo y parciales por kilómetro', () => {
    const seg = walk(101); // 100 pasos de 22,24 m ≈ 2,2 km en 1500 s
    const s = analyzeRecording([seg]);
    expect(s.totalS).toBe(1500);
    expect(s.movingS).toBe(1500);
    expect(s.distanceM).toBeGreaterThan(2200);
    expect(s.distanceM).toBeLessThan(2250);
    expect(s.avgSpeedKmh).toBeCloseTo(5.4, 0);
    expect(s.paceSPerKm).toBeGreaterThan(640);
    expect(s.paceSPerKm).toBeLessThan(680);
    expect(s.splitsS).toHaveLength(2);
    expect(s.splitsS[0]).toBeGreaterThan(660);
    expect(s.splitsS[0]).toBeLessThan(690);
    expect(s.maxSpeedKmh).toBeGreaterThan(5);
    expect(s.ascentM).toBe(50);
  });

  it('las paradas no cuentan como movimiento ni las pausas como tiempo', () => {
    const first = walk(21, 1_000_000); // 300 s caminando
    // Parada de 10 minutos en el mismo lugar: un punto igual al último 600 s después.
    const last = first.at(-1)!;
    const stop: TrackPoint[] = [[last[0], last[1], last[2], (last[3] as number) + 600]];
    const second = walk(21, 1_000_000 + 900, last[0] - 0.0002);
    const s = analyzeRecording([[...first, ...stop, ...second]]);
    expect(s.totalS).toBe(1200);
    expect(s.movingS).toBe(600);
    // Dos tramos (una pausa): el tiempo entre ellos no suma.
    const apart = analyzeRecording([first, walk(21, 2_000_000)]);
    expect(apart.totalS).toBe(600);
    expect(apart.movingS).toBe(600);
  });

  it('un salto del GPS no cuenta, y sin horas no hay ritmo', () => {
    const jump: TrackPoint[] = [
      [-41, -71, null, 100],
      [-40, -71, null, 110], // 111 km en 10 s
      [-40.0002, -71, null, 125],
    ];
    expect(analyzeRecording([jump]).maxSpeedKmh).toBeLessThan(10);
    const noTime = analyzeRecording([[[-41, -71, null], [-41.001, -71, null]]]);
    expect(noTime.movingS).toBe(0);
    expect(noTime.paceSPerKm).toBe(0);
    expect(noTime.distanceM).toBeGreaterThan(100);
  });
});

describe('formatos', () => {
  it('ritmo y reloj', () => {
    expect(formatPace(332)).toBe('5:32');
    expect(formatPace(0)).toBe('—');
    expect(formatClock(3909)).toBe('1:05:09');
    expect(formatClock(2712)).toBe('45:12');
  });
});

describe('historial y salidas', () => {
  const w = (id: string, startedAt: string, over: Partial<Workout> = {}): Workout => ({ id, kind: 'walk', name: id, startedAt, source: 'gps', trackId: null, totalS: 3600, movingS: 3500, distanceM: 5000, ascentM: 100, descentM: 80, minEle: 800, maxEle: 900, avgSpeedKmh: 5, paceSPerKm: 720, maxSpeedKmh: 7, splitsS: [], calories: 250, weightKg: 70, packKg: null, inclinePct: null, intensity: null, avgHr: null, maxHr: null, notes: '', outingId: null, createdAt: startedAt, updatedAt: startedAt, ...over }) as unknown as Workout;

  it('totales: suma y toma la altura más alta y la más baja', () => {
    const t = totalsOf([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-03T10:00:00', { maxEle: 1200, minEle: 700, distanceM: 3000 })]);
    expect(t).toMatchObject({ count: 2, totalS: 7200, distanceM: 8000, ascentM: 200, calories: 500, maxEle: 1200, minEle: 700 });
    expect(totalsOf([]).maxEle).toBeNull();
  });

  it('semanas: de lunes a domingo, la más nueva primero', () => {
    expect(weekStart(new Date('2026-11-08T12:00:00'))).toBe('2026-11-02'); // domingo
    expect(weekStart(new Date('2026-11-09T00:30:00'))).toBe('2026-11-09'); // lunes
    const weeks = byWeek([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-08T20:00:00'), w('c', '2026-11-09T07:00:00')]);
    expect(weeks.map((x) => x.start)).toEqual(['2026-11-09', '2026-11-02']);
    expect(weeks[1]!.workouts.map((x) => x.id)).toEqual(['b', 'a']);
    expect(weeks[1]!.totals.distanceM).toBe(10_000);
  });

  it('salida: sus actividades en orden, con totales juntos', () => {
    const list = [w('baja', '2026-11-08T15:00:00', { outingId: 'o1' }), w('sube', '2026-11-08T08:00:00', { outingId: 'o1', ascentM: 900 }), w('otra', '2026-11-08T09:00:00', { outingId: 'o2' })];
    expect(inOuting(list, 'o1').map((x) => x.id)).toEqual(['sube', 'baja']);
    expect(totalsOf(inOuting(list, 'o1')).ascentM).toBe(1000);
  });

  it('récords y recálculo de calorías con otro peso', () => {
    const r = recordsOf([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-03T10:00:00', { distanceM: 12_000, ascentM: 900 })]);
    expect(r).toMatchObject({ longestM: 12_000, mostAscentM: 900 });
    expect(recordsOf([])).toEqual({ longestM: null, mostAscentM: null, longestS: null });
    const base = w('x', '2026-11-02T10:00:00', { calories: 0, weightKg: null });
    expect(recalculated(base, null, null).calories).toBe(0);
    expect(recalculated(base, 70, null).calories).toBeGreaterThan(200);
    expect(recalculated(base, 90, null).calories).toBeGreaterThan(recalculated(base, 70, null).calories);
  });
});

describe('compartir una salida', () => {
  // Una caminata hacia el sur: un punto cada ~22 m (0,0002°).
  const line = (n: number, lat0 = -41): TrackPoint[] => Array.from({ length: n }, (_, i) => [lat0 - i * 0.0002, -71, 1000 + i, 1_000_000 + i * 15] as TrackPoint);
  const meters = (seg: TrackPoint[]) => (seg.length - 1) * 22.24;

  it('recorta el inicio y el final (la casa) sin tocar el medio', () => {
    const seg = line(101); // 2,2 km
    const [cut] = trimEnds([seg], 300);
    expect(cut!.length).toBeLessThan(seg.length);
    // 300 m son ~14 puntos de cada lado.
    expect(meters(cut!)).toBeGreaterThan(2224 - 2 * 330);
    expect(meters(cut!)).toBeLessThan(2224 - 2 * 280);
    expect(cut![0]![0]).toBeLessThan(seg[0]![0] - 0.002);
    expect(trimEnds([seg], 0)).toEqual([seg]);
  });

  it('un recorrido corto o en tramos: se recorta de tramo en tramo, y si es muy corto no queda nada', () => {
    expect(trimEnds([line(10)], 300)).toEqual([]); // 200 m
    const a = line(30); // 650 m
    const b = line(30, -42); // 650 m
    const out = trimEnds([a, b], 300);
    expect(out).toHaveLength(2);
    expect(meters(out[0]!)).toBeLessThan(meters(a) - 250);
    expect(meters(out[1]!)).toBeLessThan(meters(b) - 250);
  });

  it('el contenido: totales, tipos, día, perfil y tope de puntos; nunca notas ni calorías si no hay', () => {
    const outing = { id: 'o1', name: 'Salida al Platita', notes: 'mi casa está en la calle…', createdAt: '2026-11-08T10:00:00', updatedAt: '2026-11-08T10:00:00' } as never;
    const mk = (id: string, started: string, track: string | null, over: Partial<Workout> = {}) =>
      ({ id, kind: 'trek', name: id, startedAt: started, source: 'gps', trackId: track, totalS: 3600, movingS: 3500, distanceM: 2000, ascentM: 300, descentM: 100, minEle: 1000, maxEle: 1100, calories: 0, outingId: 'o1', ...over }) as unknown as Workout;
    const big = line(2000, -30); // 44 km en 2000 puntos: pasa el tope
    const tracks = new Map([['t1', { segments: [big] }], ['t2', { segments: [line(101)] }]]) as never;
    const all = [mk('b', '2026-11-08T14:00:00', 't2', { kind: 'walk' }), mk('a', '2026-11-08T08:00:00', 't1')];
    const p = buildSharePayload(outing, all, tracks, 'es', 300);
    expect(p).toMatchObject({ name: 'Salida al Platita', lang: 'es', date: '2026-11-08', activities: 2, distanceM: 4000, totalS: 7200, ascentM: 600, calories: null });
    expect(p.kinds.sort()).toEqual(['trek', 'walk']);
    expect(p.route.flat().length).toBeLessThanOrEqual(1200);
    expect(p.profile.length).toBeLessThanOrEqual(301);
    expect(p.profile[0]![0]).toBe(0);
    expect(JSON.stringify(p)).not.toContain('mi casa');
    expect('notes' in p).toBe(false);
    // Sin recorte: el recorrido empieza donde empezó.
    const whole = buildSharePayload(outing, [all[1]!], new Map([['t1', { segments: [line(101)] }]]) as never, 'en', 0);
    expect(whole.route[0]![0]).toEqual([-41, -71]);
    expect(whole.lang).toBe('en');
  });
});
