import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeFit, FitError, isFit, kindFromFit, parseFitActivity } from './fit';
import { activityFromFit } from './fitActivity';

// ---- Un generador de archivos FIT para probar el lector (la misma estructura que escribe un reloj) ----
const T = { enum: 0x00, u8: 0x02, u16: 0x84, s32: 0x85, u32: 0x86 } as const;
const SIZE: Record<number, number> = { [T.enum]: 1, [T.u8]: 1, [T.u16]: 2, [T.s32]: 4, [T.u32]: 4 };
interface F {
  id: number;
  type: number;
}
const concat = (...parts: number[][]) => parts.flat();
const num = (n: number, size: number, little: boolean) => {
  const out: number[] = [];
  const v = n < 0 ? n + 2 ** (8 * size) : n;
  for (let i = 0; i < size; i++) out.push(Math.floor(v / 2 ** (8 * i)) & 0xff);
  return little ? out : out.reverse();
};
const def = (local: number, globalNum: number, fields: F[], opts: { little?: boolean; dev?: number[] } = {}) => {
  const little = opts.little ?? true;
  const dev = opts.dev ?? [];
  return concat(
    [0x40 | (dev.length ? 0x20 : 0) | local, 0, little ? 0 : 1],
    num(globalNum, 2, little),
    [fields.length],
    ...fields.map((f) => [f.id, SIZE[f.type]!, f.type]),
    dev.length ? [dev.length, ...dev.flatMap((size, i) => [i, size, 0x0d])] : [],
  );
};
const row = (local: number, fields: F[], values: number[], little = true, devBytes: number[] = []) =>
  concat([local], ...fields.map((f, i) => num(values[i]!, SIZE[f.type]!, little)), devBytes);
const file = (...body: number[][]) => {
  const data = body.flat();
  const header = [14, 0x20, 0x64, 0x08, ...num(data.length, 4, true), 0x2e, 0x46, 0x49, 0x54, 0, 0];
  return new Uint8Array([...header, ...data, 0, 0]);
};

const FIT_EPOCH = 631_065_600;
const semi = (deg: number) => Math.round(deg / (180 / 2 ** 31));
const fitT = (unix: number) => unix - FIT_EPOCH;
const ALT = (m: number) => Math.round((m + 500) * 5);
const T0 = 1_800_000_000; // inicio (hora Unix)

const RECORD: F[] = [{ id: 253, type: T.u32 }, { id: 0, type: T.s32 }, { id: 1, type: T.s32 }, { id: 2, type: T.u16 }, { id: 3, type: T.u8 }];
const LAP: F[] = [{ id: 253, type: T.u32 }, { id: 7, type: T.u32 }, { id: 8, type: T.u32 }, { id: 9, type: T.u32 }];
const SESSION: F[] = [{ id: 253, type: T.u32 }, { id: 2, type: T.u32 }, { id: 5, type: T.enum }, { id: 6, type: T.enum }, { id: 7, type: T.u32 }, { id: 8, type: T.u32 }, { id: 9, type: T.u32 }, { id: 11, type: T.u16 }, { id: 16, type: T.u8 }, { id: 17, type: T.u8 }, { id: 22, type: T.u16 }];

/** Una salida corriendo con 5 registros (uno cada 10 s hacia el norte) y dos vueltas. */
const running = () =>
  file(
    def(0, 20, RECORD),
    ...[0, 1, 2, 3, 4].map((i) => row(0, RECORD, [fitT(T0 + i * 10), semi(-41 + i * 0.0005), semi(-71), ALT(800 + i), 140 + i * 5])),
    def(1, 19, LAP),
    row(1, LAP, [fitT(T0 + 20), 20_000, 20_000, 11_000]),
    row(1, LAP, [fitT(T0 + 40), 20_000, 20_000, 11_000]),
    def(2, 18, SESSION),
    row(2, SESSION, [fitT(T0 + 40), fitT(T0), 1, 3, 40_000, 38_000, 22_100, 310, 150, 160, 12]),
  );

describe('FIT: lector', () => {
  it('reconoce el formato y rechaza lo que no es', () => {
    expect(isFit(running())).toBe(true);
    expect(isFit(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(() => decodeFit(new Uint8Array(40))).toThrow(FitError);
  });

  it('lee los registros: posición (semicírculos a grados), altura con su escala, hora y pulso', () => {
    const a = parseFitActivity(running());
    expect(a.hasGps).toBe(true);
    expect(a.segments).toHaveLength(1);
    const pts = a.segments[0]!;
    expect(pts).toHaveLength(5);
    expect(pts[0]![0]).toBeCloseTo(-41, 5);
    expect(pts[0]![1]).toBeCloseTo(-71, 5);
    expect(pts[4]![0]).toBeCloseTo(-41 + 4 * 0.0005, 5);
    expect(pts[0]![2]).toBeCloseTo(800, 0);
    expect(pts[0]![3]).toBe(T0);
    expect(pts[4]![3]).toBe(T0 + 40);
  });

  it('toma el resumen del reloj: deporte, calorías, pulso, distancia, tiempo y vueltas acumuladas', () => {
    const a = parseFitActivity(running());
    expect(a.kind).toBe('run'); // correr por sendero
    expect(a.startedAt).toBe(new Date(T0 * 1000).toISOString());
    expect(a.session).toMatchObject({ totalS: 40, movingS: 38, distanceM: 221, calories: 310, avgHr: 150, maxHr: 160, ascentM: 12 });
    expect(a.laps).toEqual([{ elapsedS: 20, distanceM: 110 }, { elapsedS: 40, distanceM: 220 }]);
  });

  it('las horas comprimidas (un byte de cabecera) también dan la hora', () => {
    const body = [
      def(0, 20, RECORD),
      row(0, RECORD, [fitT(T0), semi(-41), semi(-71), ALT(800), 100]),
      // Cabecera comprimida: bit 7, tipo local 0 (bits 5–6) y desplazamiento de 5 bits; el registro no trae la hora (253).
      ...[3, 6, 9].map((off) => concat([0x80 | ((fitT(T0) + off) & 0x1f)], num(semi(-41 + off * 0.0001), 4, true), num(semi(-71), 4, true), num(ALT(800), 2, true), [110])),
    ];
    // Los registros comprimidos usan otra definición, sin el campo de hora.
    const recNoTime: F[] = RECORD.slice(1);
    const data = file(body[0]!, body[1]!, def(0, 20, recNoTime), body[2]!, body[3]!, body[4]!);
    const a = parseFitActivity(data);
    const ts = a.segments[0]!.map((p) => p[3]);
    expect(ts[0]).toBe(T0);
    expect(ts.slice(1).every((t, i) => t! > ts[i]!)).toBe(true);
    expect(ts.at(-1)! - T0).toBeLessThan(31);
  });

  it('salta los campos de desarrollador sin perder el hilo', () => {
    const data = file(
      def(0, 20, RECORD, { dev: [3, 2] }),
      row(0, RECORD, [fitT(T0), semi(-41), semi(-71), ALT(800), 120], true, [9, 9, 9, 8, 8]),
      row(0, RECORD, [fitT(T0 + 10), semi(-41.001), semi(-71), ALT(801), 125], true, [9, 9, 9, 8, 8]),
    );
    const a = parseFitActivity(data);
    expect(a.segments[0]).toHaveLength(2);
    expect(a.session.avgHr).toBe(123); // sin mensaje de sesión, sale de los registros
  });

  it('entiende archivos de orden de bytes grande (big endian)', () => {
    const data = file(def(0, 20, RECORD, { little: false }), row(0, RECORD, [fitT(T0), semi(-41), semi(-71), ALT(800), 100], false), row(0, RECORD, [fitT(T0 + 5), semi(-41.001), semi(-71), ALT(800), 100], false));
    expect(parseFitActivity(data).segments[0]![1]![0]).toBeCloseTo(-41.001, 5);
  });

  it('un valor inválido (sin señal GPS) no es una posición', () => {
    const data = file(
      def(0, 20, RECORD),
      row(0, RECORD, [fitT(T0), 0x7fffffff, 0x7fffffff, ALT(800), 100]),
      row(0, RECORD, [fitT(T0 + 5), semi(-41), semi(-71), ALT(800), 100]),
      row(0, RECORD, [fitT(T0 + 10), semi(-41.001), semi(-71), ALT(800), 100]),
    );
    expect(parseFitActivity(data).segments[0]).toHaveLength(2);
  });

  it('una pausa larga parte el recorrido y un archivo cortado devuelve lo que alcanzó a leer', () => {
    const data = file(def(0, 20, RECORD), ...[0, 1, 2].map((i) => row(0, RECORD, [fitT(T0 + i * 10), semi(-41 + i * 0.0005), semi(-71), ALT(800), 100])), ...[0, 1, 2].map((i) => row(0, RECORD, [fitT(T0 + 1000 + i * 10), semi(-40 + i * 0.0005), semi(-71), ALT(800), 100])));
    expect(parseFitActivity(data).segments).toHaveLength(2);
    const cut = running().slice(0, 14 + 24 + 3 * 15);
    expect(parseFitActivity(cut).segments[0]!.length).toBeGreaterThanOrEqual(2);
  });

  it('abre el archivo comprimido (.fit.gz) de Strava y Garmin', () => {
    expect(parseFitActivity(gzipSync(running())).segments[0]).toHaveLength(5);
  });

  it('sin posiciones ni resumen no hay actividad', () => {
    expect(() => parseFitActivity(file(def(0, 20, RECORD), row(0, RECORD, [fitT(T0), 0x7fffffff, 0x7fffffff, ALT(800), 100])))).toThrow(FitError);
  });
});

describe('FIT: deporte y actividad', () => {
  it('traduce el deporte del reloj a la actividad de VikArg', () => {
    expect(kindFromFit(1, 0)).toBe('run');
    expect(kindFromFit(1, 1)).toBe('treadmill');
    expect(kindFromFit(11, 0)).toBe('walk');
    expect(kindFromFit(17, 0)).toBe('trek');
    expect(kindFromFit(2, 8)).toBe('mtb');
    expect(kindFromFit(2, 0)).toBe('roadBike');
    expect(kindFromFit(21, 0)).toBe('ebike');
    expect(kindFromFit(4, 15)).toBe('elliptical');
    expect(kindFromFit(4, 16)).toBe('stairClimber');
    expect(kindFromFit(15, 0)).toBe('rowboat');
    expect(kindFromFit(41, 0)).toBe('kayak');
    expect(kindFromFit(37, 0)).toBe('sup');
    expect(kindFromFit(5, 0)).toBeNull(); // natación: no está
    expect(kindFromFit(undefined, undefined)).toBeNull();
  });

  it('con GPS: recorrido y actividad, con el pulso, las vueltas y las calorías del reloj', () => {
    const { track, workout } = activityFromFit(parseFitActivity(running()), 'run', 'Salida del reloj', 70);
    expect(track).not.toBeNull();
    expect(track!.segments[0]!.length).toBeGreaterThanOrEqual(2); // el recorrido se guarda simplificado
    expect(workout).toMatchObject({ source: 'watch', avgHr: 150, maxHr: 160, calories: 310, kind: 'run', trackId: track!.id });
    expect(workout.laps).toHaveLength(2);
    expect(workout.distanceM).toBeGreaterThan(150); // 4 × 0,0005° al norte ≈ 222 m
  });

  it('sin GPS (cinta): sale del resumen del reloj, sin recorrido', () => {
    const treadmill = file(def(0, 18, SESSION), row(0, SESSION, [fitT(T0 + 1800), fitT(T0), 1, 1, 1_800_000, 1_790_000, 5_000_00, 380, 145, 170, 0]));
    const a = parseFitActivity(treadmill);
    expect(a.hasGps).toBe(false);
    expect(a.kind).toBe('treadmill');
    const { track, workout } = activityFromFit(a, 'treadmill', 'Cinta', 70);
    expect(track).toBeNull();
    expect(workout).toMatchObject({ source: 'watch', distanceM: 5000, movingS: 1790, totalS: 1800, calories: 380, avgHr: 145, maxHr: 170, trackId: null });
    expect(workout.paceSPerKm).toBeCloseTo(358, 0);
  });
});
