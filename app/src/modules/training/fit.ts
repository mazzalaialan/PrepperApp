import { gunzipSync } from 'fflate';
import type { LapMark, WorkoutKind } from '@/core/model/types';
import type { TrackPoint } from '@/modules/tracks/gpx';

/**
 * Lector de archivos FIT (el formato binario de los relojes Garmin, Wahoo,
 * Coros, Suunto y similares). Se lee entero en el teléfono, sin enviar nada a
 * ningún lado y sin dependencias. Solo se interpretan los mensajes que sirven
 * para una actividad: registros (posición, altura, pulso), sesión, vueltas.
 * Referencia: FIT SDK de Garmin (protocolo 1 y 2, mensajes de definición y de
 * datos, cabecera con marca de tiempo comprimida y campos de desarrollador).
 */

export class FitError extends Error {
  constructor(public readonly code: 'not-fit' | 'empty') {
    super(code);
    this.name = 'FitError';
  }
}

/** Segundos entre el 1/1/1970 y el 31/12/1989 (el origen de las horas del FIT). */
const FIT_EPOCH_S = 631_065_600;
const SEMICIRCLES = 180 / 2 ** 31;

type Value = number | string | number[] | null;
interface FieldDef {
  id: number;
  size: number;
  type: number;
}
interface Def {
  num: number;
  little: boolean;
  fields: FieldDef[];
  devSize: number;
}
export interface FitMessage {
  num: number;
  fields: Record<number, Value>;
}

/** Tamaño de cada tipo base y su valor inválido (el FIT marca "sin dato" con un valor fijo). */
const BASE: Record<number, { size: number; invalid: number | null }> = {
  0: { size: 1, invalid: 0xff }, // enum
  1: { size: 1, invalid: 0x7f }, // sint8
  2: { size: 1, invalid: 0xff }, // uint8
  3: { size: 2, invalid: 0x7fff }, // sint16
  4: { size: 2, invalid: 0xffff }, // uint16
  5: { size: 4, invalid: 0x7fffffff }, // sint32
  6: { size: 4, invalid: 0xffffffff }, // uint32
  7: { size: 1, invalid: null }, // string
  8: { size: 4, invalid: null }, // float32
  9: { size: 8, invalid: null }, // float64
  10: { size: 1, invalid: 0 }, // uint8z
  11: { size: 2, invalid: 0 }, // uint16z
  12: { size: 4, invalid: 0 }, // uint32z
  13: { size: 1, invalid: 0xff }, // byte
  14: { size: 8, invalid: null }, // sint64
  15: { size: 8, invalid: null }, // uint64
  16: { size: 8, invalid: null }, // uint64z
};

function readOne(view: DataView, pos: number, type: number, little: boolean): number | null {
  const base = BASE[type & 0x1f];
  if (!base) return null;
  let v: number;
  switch (type & 0x1f) {
    case 1:
      v = view.getInt8(pos);
      break;
    case 3:
      v = view.getInt16(pos, little);
      break;
    case 5:
      v = view.getInt32(pos, little);
      break;
    case 4:
    case 11:
      v = view.getUint16(pos, little);
      break;
    case 6:
    case 12:
      v = view.getUint32(pos, little);
      break;
    case 8:
      v = view.getFloat32(pos, little);
      return Number.isFinite(v) ? v : null;
    case 9:
      v = view.getFloat64(pos, little);
      return Number.isFinite(v) ? v : null;
    case 14:
      v = Number(view.getBigInt64(pos, little));
      return v;
    case 15:
    case 16:
      v = Number(view.getBigUint64(pos, little));
      return v;
    default:
      v = view.getUint8(pos);
  }
  return base.invalid !== null && v === base.invalid ? null : v;
}

function readField(view: DataView, bytes: Uint8Array, pos: number, f: FieldDef, little: boolean): Value {
  const type = f.type & 0x1f;
  if (type === 7) {
    let end = pos;
    while (end < pos + f.size && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(pos, end));
  }
  const size = BASE[type]?.size ?? 1;
  if (f.size < size) return null;
  const count = Math.floor(f.size / size);
  if (count === 1) return readOne(view, pos, f.type, little);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = readOne(view, pos + i * size, f.type, little);
    if (v !== null) out.push(v);
  }
  return out.length ? out : null;
}

/** ¿Los bytes empiezan como un archivo FIT? (la marca ".FIT" va en la posición 8). */
export function isFit(bytes: Uint8Array): boolean {
  return bytes.length > 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
}

/** Todos los mensajes del archivo, en orden. Si está cortado, devuelve lo que alcanzó a leer. */
export function decodeFit(input: Uint8Array): FitMessage[] {
  const bytes = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  const headerSize = bytes[0] ?? 0;
  if (headerSize < 12 || bytes.length < headerSize + 2 || bytes[8] !== 0x2e || bytes[9] !== 0x46 || bytes[10] !== 0x49 || bytes[11] !== 0x54) throw new FitError('not-fit');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataSize = view.getUint32(4, true);
  const end = Math.min(headerSize + dataSize, bytes.length);
  const defs = new Map<number, Def>();
  const messages: FitMessage[] = [];
  let pos = headerSize;
  let lastTs = 0;
  while (pos < end) {
    const h = bytes[pos++]!;
    let local: number;
    let compressed: number | null = null;
    if (h & 0x80) {
      // Marca de tiempo comprimida: los 5 bits bajos son el desplazamiento desde la última hora completa.
      local = (h >> 5) & 0x03;
      const offset = h & 0x1f;
      compressed = (lastTs & ~0x1f) + offset + (offset < (lastTs & 0x1f) ? 0x20 : 0);
    } else if (h & 0x40) {
      // Definición.
      local = h & 0x0f;
      const hasDev = (h & 0x20) !== 0;
      if (pos + 5 > end) break;
      pos++; // reservado
      const little = bytes[pos++] === 0;
      const num = view.getUint16(pos, little);
      pos += 2;
      const n = bytes[pos++]!;
      const fields: FieldDef[] = [];
      for (let i = 0; i < n; i++) {
        fields.push({ id: bytes[pos]!, size: bytes[pos + 1]!, type: bytes[pos + 2]! });
        pos += 3;
      }
      let devSize = 0;
      if (hasDev) {
        const nd = bytes[pos++]!;
        for (let i = 0; i < nd; i++) {
          devSize += bytes[pos + 1]!;
          pos += 3;
        }
      }
      defs.set(local, { num, little, fields, devSize });
      continue;
    } else {
      local = h & 0x0f;
    }
    const def = defs.get(local);
    if (!def) break; // sin definición no se sabe cuánto mide: se corta acá
    const size = def.fields.reduce((n, f) => n + f.size, 0) + def.devSize;
    if (pos + size > end) break;
    const fields: Record<number, Value> = {};
    let p = pos;
    for (const f of def.fields) {
      fields[f.id] = readField(view, bytes, p, f, def.little);
      p += f.size;
    }
    pos += size;
    if (compressed !== null && fields[253] === undefined) fields[253] = compressed;
    if (typeof fields[253] === 'number') lastTs = fields[253];
    messages.push({ num: def.num, fields });
  }
  return messages;
}

/** Deporte (y subdeporte) del FIT a una actividad de VikArg; null si no hay equivalente. */
export function kindFromFit(sport: number | null | undefined, sub: number | null | undefined): WorkoutKind | null {
  switch (sport) {
    case 1:
      return sub === 1 ? 'treadmill' : 'run';
    case 11:
      return sub === 1 ? 'treadmill' : 'walk';
    case 17:
    case 16:
      return 'trek';
    case 2:
      return sub === 8 || sub === 9 ? 'mtb' : sub === 46 ? 'gravel' : 'roadBike';
    case 21:
      return 'ebike';
    case 4:
      return sub === 15 ? 'elliptical' : sub === 16 ? 'stairClimber' : sub === 1 ? 'treadmill' : null;
    case 15:
      return 'rowboat';
    case 41:
      return 'kayak';
    case 19:
      return 'canoe';
    case 37:
      return 'sup';
    case 42:
      return 'rafting';
    default:
      return null;
  }
}

export interface FitActivity {
  startedAt: string | null;
  kind: WorkoutKind | null;
  /** Recorrido con GPS: [lat, lon, altura, hora (s desde 1970)]. Vacío en las sesiones bajo techo. */
  segments: TrackPoint[][];
  /** Lo que resumió el reloj. */
  session: { totalS?: number; movingS?: number; distanceM?: number; calories?: number; avgHr?: number; maxHr?: number; ascentM?: number; descentM?: number };
  /** Vueltas del reloj, con tiempo y distancia acumulados. */
  laps: LapMark[];
  hasGps: boolean;
}

const num = (v: Value | undefined): number | undefined => (typeof v === 'number' ? v : undefined);
/** Tiempo sin conexión de las pausas largas: un salto de más de 5 minutos parte el recorrido. */
const SEGMENT_GAP_S = 300;

export function parseFitActivity(bytes: Uint8Array): FitActivity {
  const messages = decodeFit(bytes);
  const segments: TrackPoint[][] = [];
  let cur: TrackPoint[] = [];
  let lastT = 0;
  const hr: number[] = [];
  for (const m of messages.filter((x) => x.num === 20)) {
    const f = m.fields;
    const t = num(f[253]);
    const h = num(f[3]);
    if (h !== undefined && h > 0) hr.push(h);
    const lat = num(f[0]);
    const lon = num(f[1]);
    if (lat === undefined || lon === undefined || t === undefined) continue;
    const alt = num(f[78]) ?? num(f[2]);
    const point: TrackPoint = [lat * SEMICIRCLES, lon * SEMICIRCLES, alt !== undefined ? alt / 5 - 500 : null, t + FIT_EPOCH_S];
    if (cur.length > 0 && t - lastT > SEGMENT_GAP_S) {
      if (cur.length > 1) segments.push(cur);
      cur = [];
    }
    cur.push(point);
    lastT = t;
  }
  if (cur.length > 1) segments.push(cur);

  const s = messages.find((x) => x.num === 18)?.fields;
  const session: FitActivity['session'] = {};
  if (s) {
    const elapsed = num(s[7]);
    const timer = num(s[8]);
    const dist = num(s[9]);
    if (elapsed !== undefined) session.totalS = elapsed / 1000;
    if (timer !== undefined) session.movingS = timer / 1000;
    if (dist !== undefined) session.distanceM = dist / 100;
    session.calories = num(s[11]);
    session.avgHr = num(s[16]);
    session.maxHr = num(s[17]);
    session.ascentM = num(s[22]);
    session.descentM = num(s[23]);
  }
  if (session.avgHr === undefined && hr.length) session.avgHr = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
  if (session.maxHr === undefined && hr.length) session.maxHr = Math.max(...hr);

  let elapsedAcc = 0;
  let distAcc = 0;
  const laps: LapMark[] = [];
  for (const m of messages.filter((x) => x.num === 19)) {
    const t = num(m.fields[8]) ?? num(m.fields[7]);
    const d = num(m.fields[9]);
    if (t === undefined) continue;
    elapsedAcc += t / 1000;
    distAcc += (d ?? 0) / 100;
    laps.push({ elapsedS: Math.round(elapsedAcc), distanceM: Math.round(distAcc) });
  }
  // Una sola vuelta que abarca toda la sesión no aporta nada.
  const realLaps = laps.length > 1 ? laps : [];

  const startRaw = num(s?.[2]) ?? num(messages.find((x) => x.num === 18)?.fields[253]);
  const firstPoint = segments[0]?.[0]?.[3];
  const startS = startRaw !== undefined ? startRaw + FIT_EPOCH_S : firstPoint;
  if (segments.length === 0 && session.distanceM === undefined && session.movingS === undefined && session.totalS === undefined) throw new FitError('empty');
  return {
    startedAt: startS !== undefined ? new Date(startS * 1000).toISOString() : null,
    kind: kindFromFit(num(s?.[5]), num(s?.[6])),
    segments,
    session,
    laps: realLaps,
    hasGps: segments.length > 0,
  };
}
