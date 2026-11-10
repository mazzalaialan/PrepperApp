import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import type { BedSide, GardenBed, SunObstacle } from '@/core/model/types';
import { normalizeDeg } from '@/core/geo/geo';
import { startOfLocalDay, sunDay, type Place } from '@/modules/astronomy/sky';

/**
 * Horas de sol directo de un cantero: se recorre el día cada 10 minutos, se mira
 * dónde está el sol (rumbo y altura) y no se cuenta si algo lo tapa. Todo se
 * reduce a lo mismo, un perfil del horizonte: una pared pegada o un árbol lejano
 * son un sector de rumbos con una altura aparente. La media sombra frena un
 * porcentaje de lo que llega.
 */

const STEP_MIN = 10;

/** Observador del lugar; una altura ausente o absurda (un GPS de PC puede dar valores locos) se toma como 0. */
export function observerAt(place: Place): Observer {
  const alt = place.alt;
  return new Observer(place.lat, place.lon, typeof alt === 'number' && Number.isFinite(alt) && alt > -500 && alt < 9000 ? alt : 0);
}
/** Con el sol más bajo que esto (rasante) no se cuenta como sol directo útil. */
export const MIN_SUN_ALTITUDE = 5;

/** Rumbo hacia el que mira cada lado, desde el rumbo del frente. */
const SIDE_OFFSET: Record<BedSide, number> = { front: 0, right: 90, back: 180, left: 270 };
export const BED_SIDES: BedSide[] = ['front', 'right', 'back', 'left'];

/** Cuántos grados cubre un tramo hacia cada lado de su centro: un sector de rumbos. */
export interface Sector {
  fromDeg: number;
  toDeg: number;
  /** Altura aparente del borde de arriba, en grados. */
  heightDeg: number;
}

/** ¿El rumbo `az` cae dentro del sector (sentido horario de `from` a `to`)? */
export function inSector(az: number, from: number, to: number): boolean {
  const a = normalizeDeg(az);
  const f = normalizeDeg(from);
  const t = normalizeDeg(to);
  if (f === t) return true; // sector completo (360°) o de un solo rumbo: se toma como completo
  return f < t ? a >= f && a <= t : a >= f || a <= t;
}

/**
 * Sector que tapa una pared pegada a un lado: la altura aparente es atan(altura / distancia
 * al centro del cantero) y a lo ancho cubre lo que mide el lado visto desde el centro.
 */
export function wallSector(bed: Pick<GardenBed, 'widthCm' | 'lengthCm' | 'bearingDeg'>, side: BedSide, wallCm: number): Sector {
  const alongLength = side === 'front' || side === 'back';
  // Distancia del centro al lado y largo del lado.
  const dist = Math.max(10, (alongLength ? bed.lengthCm : bed.widthCm) / 2);
  const len = alongLength ? bed.widthCm : bed.lengthCm;
  const heightDeg = (Math.atan(wallCm / dist) * 180) / Math.PI;
  const half = Math.min(85, (Math.atan(len / 2 / dist) * 180) / Math.PI);
  const centre = (bed.bearingDeg ?? 0) + SIDE_OFFSET[side];
  return { fromDeg: normalizeDeg(centre - half), toDeg: normalizeDeg(centre + half), heightDeg };
}

/** Todo lo que tapa el sol de un cantero, como sectores del horizonte. */
export function bedSectors(bed: GardenBed): Sector[] {
  const out: Sector[] = [];
  if (bed.bearingDeg !== null && bed.bearingDeg !== undefined) {
    for (const side of BED_SIDES) {
      const cm = bed.walls?.[side];
      if (cm && cm > 0) out.push(wallSector({ ...bed, bearingDeg: bed.bearingDeg }, side, cm));
    }
  }
  for (const o of bed.obstacles ?? []) out.push(o satisfies SunObstacle);
  return out;
}

export interface SunHours {
  /** Horas de sol directo ese día, con todo lo que lo tapa. */
  hours: number;
  /** Lo mismo sin obstáculos ni malla (el techo posible ese día). */
  open: number;
}

/** Sol directo en un día (el que contiene `date`), para un lugar y lo que tapa. */
export function sunHoursOnDay(place: Place, date: Date, sectors: Sector[], shadePct = 0): SunHours {
  const o = observerAt(place);
  // Se arranca 12 h antes del mediodía solar: cubre el día entero en cualquier huso horario.
  const noon = sunDay(place, startOfLocalDay(date)).solarNoon.getTime();
  let seen = 0;
  let open = 0;
  const steps = (24 * 60) / STEP_MIN;
  for (let i = 0; i < steps; i++) {
    const when = new Date(noon - 12 * 3_600_000 + (i + 0.5) * STEP_MIN * 60_000);
    const eq = Equator(Body.Sun, when, o, true, true);
    const h = Horizon(when, o, eq.ra, eq.dec, 'normal');
    if (h.altitude < MIN_SUN_ALTITUDE) continue;
    open++;
    const blocked = sectors.some((s) => inSector(h.azimuth, s.fromDeg, s.toDeg) && h.altitude < s.heightDeg);
    if (!blocked) seen++;
  }
  const k = STEP_MIN / 60;
  return { hours: seen * k * (1 - Math.min(100, Math.max(0, shadePct)) / 100), open: open * k };
}

export interface BedSun {
  today: SunHours;
  /** Solsticio de verano y de invierno del hemisferio del lugar, y el equinoccio de otoño-primavera. */
  summer: SunHours;
  winter: SunHours;
  equinox: SunHours;
}

/** Sol del cantero hoy, en pleno verano, en pleno invierno y en equinoccio (lo que se usa para recomendar cultivos). */
export function bedSun(bed: GardenBed, place: Place, now = new Date()): BedSun {
  const sectors = bedSectors(bed);
  const shade = bed.shadePct ?? 0;
  const y = now.getFullYear();
  const day = (m: number, d: number) => new Date(y, m, d, 12);
  const dec = day(11, 21);
  const jun = day(5, 21);
  const south = place.lat < 0;
  const calc = (date: Date) => sunHoursOnDay(place, date, sectors, shade);
  return {
    today: calc(now),
    summer: calc(south ? dec : jun),
    winter: calc(south ? jun : dec),
    equinox: calc(day(2, 20)),
  };
}

/** Redondea a media hora, que es lo que tiene sentido para esta estimación. */
export function roundHalf(h: number): number {
  return Math.round(h * 2) / 2;
}
