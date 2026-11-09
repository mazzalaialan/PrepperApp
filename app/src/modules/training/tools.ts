/**
 * Cuentas de las herramientas de Entrenamiento: ritmo y velocidad, predicción
 * de tiempos para otras distancias y zonas de frecuencia cardíaca. Todo local,
 * sin conexión.
 */

/** "1:05:30", "25:10" o "90" (segundos) → segundos; null si no es un tiempo. */
export function parseDuration(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length > 1 && nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** Segundos → "1:05:30" o "25:10" (con un decimal opcional en los segundos no; se redondea). */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export interface PaceResult {
  /** Segundos por km. */
  paceSPerKm: number;
  speedKmh: number;
}

/** Ritmo y velocidad a partir de una distancia (km) y un tiempo (s); null si falta algo. */
export function paceOf(distanceKm: number, timeS: number): PaceResult | null {
  if (!(distanceKm > 0) || !(timeS > 0)) return null;
  return { paceSPerKm: timeS / distanceKm, speedKmh: (distanceKm / timeS) * 3600 };
}

/** Tiempo (s) para una distancia (km) a un ritmo (s/km). */
export const timeAtPace = (distanceKm: number, paceSPerKm: number): number => distanceKm * paceSPerKm;

/** Distancias de carrera típicas (km). */
export const RACES = [
  { id: '5k', km: 5 },
  { id: '10k', km: 10 },
  { id: 'half', km: 21.0975 },
  { id: 'marathon', km: 42.195 },
] as const;

/**
 * Predicción de Riegel: T2 = T1 × (D2 / D1)^1,06. Es una estimación para
 * alguien entrenado en esa distancia; para distancias muy distintas (de 5 km al
 * maratón) tiende a ser optimista.
 */
export function riegel(distanceKm: number, timeS: number, targetKm: number): number | null {
  if (!(distanceKm > 0) || !(timeS > 0) || !(targetKm > 0)) return null;
  return timeS * (targetKm / distanceKm) ** 1.06;
}

export interface HrZone {
  n: number;
  /** Porcentajes de la reserva (Karvonen) o del máximo, en 0–1. */
  fromPct: number;
  toPct: number;
  fromBpm: number;
  toBpm: number;
}

/** Frecuencia máxima estimada por la edad (Tanaka: 208 − 0,7 × edad); null con una edad que no sirve. */
export function maxHrFromAge(age: number): number | null {
  return age >= 10 && age <= 100 ? Math.round(208 - 0.7 * age) : null;
}

const ZONE_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

/**
 * Cinco zonas de frecuencia cardíaca. Con el pulso en reposo se usa la reserva
 * (Karvonen: reposo + porcentaje × (máxima − reposo)); sin él, el porcentaje de
 * la máxima.
 */
export function hrZones(maxHr: number, restHr?: number | null): HrZone[] | null {
  if (!(maxHr > 100 && maxHr < 230)) return null;
  const rest = restHr && restHr > 30 && restHr < maxHr - 20 ? restHr : null;
  const bpm = (pct: number) => Math.round(rest !== null ? rest + pct * (maxHr - rest) : pct * maxHr);
  return ZONE_EDGES.slice(0, 5).map((from, i) => ({ n: i + 1, fromPct: from, toPct: ZONE_EDGES[i + 1]!, fromBpm: bpm(from), toBpm: bpm(ZONE_EDGES[i + 1]!) }));
}

/** Milisegundos → "12:05.37" o "1:02:03.40" (con centésimas), para el cronómetro. */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h > 0 ? `${h}:${pad(m)}` : String(m)}:${pad(s)}.${pad(cs)}`;
}

/** Vueltas del cronómetro: las marcas son acumuladas (ms); se devuelve cada parcial. */
export function stopwatchLaps(marks: number[]): { n: number; splitMs: number; totalMs: number }[] {
  return marks.map((total, i) => ({ n: i + 1, splitMs: total - (marks[i - 1] ?? 0), totalMs: total }));
}

/** Patrón de respiración al correr: cuántos pasos dura la inhalación y cuántos la exhalación (por ejemplo 3:2). */
export interface BreathPattern {
  id: 'p32' | 'p22' | 'p21' | 'p11';
  inhale: number;
  exhale: number;
}

export const BREATH_PATTERNS: BreathPattern[] = [
  { id: 'p32', inhale: 3, exhale: 2 },
  { id: 'p22', inhale: 2, exhale: 2 },
  { id: 'p21', inhale: 2, exhale: 1 },
  { id: 'p11', inhale: 1, exhale: 1 },
];

export type Effort = 'easy' | 'moderate' | 'hard' | 'max';

/** El patrón que se suele recomendar según el esfuerzo: 3:2 suave, 2:2 moderado, 2:1 fuerte y 1:1 al máximo. */
export const PATTERN_FOR_EFFORT: Record<Effort, BreathPattern['id']> = { easy: 'p32', moderate: 'p22', hard: 'p21', max: 'p11' };

export const patternById = (id: BreathPattern['id']): BreathPattern => BREATH_PATTERNS.find((p) => p.id === id)!;

export interface Breathing {
  /** Pasos por respiración completa (inhalar + exhalar). */
  stepsPerBreath: number;
  /** Respiraciones por minuto con esa cadencia. */
  breathsPerMin: number;
}

/** Con una cadencia (pasos por minuto) y un patrón: cuántas respiraciones por minuto hay que hacer. */
export function breathing(cadence: number, pattern: BreathPattern): Breathing {
  const stepsPerBreath = pattern.inhale + pattern.exhale;
  return { stepsPerBreath, breathsPerMin: Math.round((cadence / stepsPerBreath) * 10) / 10 };
}

/** En qué parte de la respiración cae el paso número `step` (0, 1, 2…): 'inhale' o 'exhale', y si es el primero de esa fase. */
export function breathPhaseAt(step: number, pattern: BreathPattern): { phase: 'inhale' | 'exhale'; first: boolean } {
  const i = ((step % (pattern.inhale + pattern.exhale)) + (pattern.inhale + pattern.exhale)) % (pattern.inhale + pattern.exhale);
  return i < pattern.inhale ? { phase: 'inhale', first: i === 0 } : { phase: 'exhale', first: i === pattern.inhale };
}
