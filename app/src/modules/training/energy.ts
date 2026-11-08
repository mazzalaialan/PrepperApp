import { ACTIVITIES, type ActivityKind } from './activities';

/**
 * Calorías de una actividad: una estimación, no una medición (varía ±20 % de
 * una persona a otra).
 *
 * - A pie (caminar, correr, trekking, cinta): ecuaciones metabólicas del ACSM
 *   (Colegio Americano de Medicina del Deporte): consumo de oxígeno según la
 *   velocidad y la pendiente, para caminar (hasta unos 7 km/h) y para correr.
 *   La pendiente es la subida acumulada sobre la distancia. La mochila suma
 *   al peso que se mueve.
 * - Bicicleta y remo: equivalentes metabólicos (MET) del Compendio de
 *   Actividades Físicas, por tramos de velocidad, más el trabajo de subir
 *   (peso × desnivel) con un rendimiento del 22 %.
 * - Elíptica y escalador: MET fijo del Compendio, según la intensidad.
 */

export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface EnergyInput {
  kind: ActivityKind;
  /** Peso de la persona (kg). */
  weightKg: number;
  /** Mochila o carga (kg), solo a pie. */
  packKg?: number;
  /** Tiempo en movimiento (s). */
  movingS: number;
  distanceM: number;
  /** Subida acumulada (m). */
  ascentM?: number;
  /** Cinta: inclinación promedio (%). */
  inclinePct?: number;
  /** Elíptica y escalador. */
  intensity?: Intensity;
}

const KCAL_PER_L_O2 = 5;
const J_PER_KCAL = 4184;
const G = 9.81;
const CLIMB_EFFICIENCY = 0.22;

/** Kilocalorías por minuto con el consumo de oxígeno (ml/kg/min) para una masa (kg). */
const kcalPerMin = (vo2: number, massKg: number) => (vo2 * massKg * KCAL_PER_L_O2) / 1000;

/** Equivalente metabólico (MET) por tramo de velocidad (km/h): [hasta, MET]. */
type Tiers = [number, number][];
const tier = (tiers: Tiers, kmh: number) => (tiers.find(([upTo]) => kmh < upTo) ?? tiers.at(-1)!)[1];

/** Ciclismo en llano (Compendio: 16, 19, 22, 25,6, 30,6 y más de 32 km/h). */
const ROAD_TIERS: Tiers = [[10, 3.5], [16, 4], [19, 6.8], [22, 8], [25.6, 10], [30.6, 12], [Infinity, 15.8]];
const ROWING_TIERS: Record<'kayak' | 'canoe' | 'rowboat' | 'sup' | 'rafting', Tiers> = {
  kayak: [[4, 3.5], [6, 5], [8, 7], [Infinity, 8.5]],
  canoe: [[3, 2.8], [5, 4.5], [7, 7], [Infinity, 8.5]],
  rowboat: [[3, 2.8], [5, 4.8], [7, 5.8], [Infinity, 8.5]],
  sup: [[3, 3], [5, 6], [Infinity, 8]],
  rafting: [[Infinity, 5]],
};
const INDOOR_MET: Record<'elliptical' | 'stairClimber', number> = { elliptical: 5, stairClimber: 9 };
const INTENSITY_FACTOR: Record<Intensity, number> = { light: 0.8, moderate: 1, vigorous: 1.4 };

/** A pie: ACSM, con la pendiente. Hasta 7 km/h se usa la ecuación de caminar; más rápido, la de correr (y correr despacio, la de caminar). */
function footKcal(kind: ActivityKind, massKg: number, movingS: number, distanceM: number, gradeFraction: number): number {
  const minutes = movingS / 60;
  if (minutes <= 0) return 0;
  const v = distanceM / minutes; // m/min
  const kmh = (v * 60) / 1000;
  const running = kind === 'run' ? kmh >= 6 : kmh > 7;
  const grade = Math.max(0, gradeFraction);
  const vo2 = running ? 0.2 * v + 0.9 * v * grade + 3.5 : 0.1 * v + 1.8 * v * grade + 3.5;
  return kcalPerMin(vo2, massKg) * minutes;
}

export function calories(input: EnergyInput): number {
  const def = ACTIVITIES[input.kind];
  const { weightKg, movingS, distanceM } = input;
  if (!(weightKg > 0) || !(movingS > 0)) return 0;
  const hours = movingS / 3600;
  const kmh = distanceM / 1000 / hours;
  const ascent = Math.max(0, input.ascentM ?? 0);
  if (def.group === 'foot' || input.kind === 'treadmill') {
    const mass = weightKg + (input.packKg ?? 0);
    const grade = input.kind === 'treadmill' ? (input.inclinePct ?? 0) / 100 : distanceM > 0 ? ascent / distanceM : 0;
    return Math.round(footKcal(input.kind, mass, movingS, distanceM, grade));
  }
  if (def.group === 'cycling') {
    const road = tier(ROAD_TIERS, kmh);
    // La bici de montaña es más exigente que la de ruta al mismo ritmo; la eléctrica, menos.
    const met = input.kind === 'mtb' ? Math.max(road, 8.5) : input.kind === 'gravel' ? Math.max(road, 7) : input.kind === 'ebike' ? Math.max(3.5, road * 0.6) : input.kind === 'cityBike' ? Math.min(road, 8) : road;
    const climb = (weightKg * G * ascent) / (J_PER_KCAL * CLIMB_EFFICIENCY);
    return Math.round(met * weightKg * hours + climb * (input.kind === 'ebike' ? 0.5 : 1));
  }
  if (def.group === 'rowing') {
    const met = tier(ROWING_TIERS[input.kind as keyof typeof ROWING_TIERS], kmh);
    return Math.round(met * weightKg * hours);
  }
  // Elíptica y escalador.
  const met = INDOOR_MET[input.kind as 'elliptical' | 'stairClimber'] * INTENSITY_FACTOR[input.intensity ?? 'moderate'];
  return Math.round(met * weightKg * hours);
}
