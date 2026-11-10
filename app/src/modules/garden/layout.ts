import { Body, Equator, Horizon } from 'astronomy-engine';
import type { GardenBed } from '@/core/model/types';
import { normalizeDeg } from '@/core/geo/geo';
import { startOfLocalDay, sunDay, type Place } from '@/modules/astronomy/sky';
import { CROP_BY_ID } from './crops';
import { cropHeightCm } from './heights';
import { gridSize } from './logic';
import { bedSectors, inSector, MIN_SUN_ALTITUDE, observerAt } from './sun';

/**
 * Distribución de varios cultivos en un cantero según el sol: los altos van del
 * lado hacia donde cae su sombra (lejos del sol), así no le tapan el sol a los
 * bajos; los bajos que aguantan sombra quedan pegados a los altos.
 */

export interface SunDirection {
  /** Rumbo geográfico desde donde viene la mayor parte del sol directo (0–359°). */
  fromDeg: number;
  /** Altura del sol al mediodía solar, en grados. */
  noonAltitude: number;
}

const DAY_MS = 86_400_000;

/** De dónde viene el sol directo del cantero (promedio de las horas que le llegan) y qué tan alto pasa al mediodía. */
export function sunDirection(bed: GardenBed, place: Place, date: Date): SunDirection {
  const o = observerAt(place);
  const sectors = bedSectors(bed);
  const noon = sunDay(place, startOfLocalDay(date)).solarNoon.getTime();
  let x = 0;
  let y = 0;
  let noonAlt = 0;
  for (let i = 0; i < 144; i++) {
    const when = new Date(noon - DAY_MS / 2 + (i + 0.5) * 600_000);
    const eq = Equator(Body.Sun, when, o, true, true);
    const h = Horizon(when, o, eq.ra, eq.dec, 'normal');
    if (i === 72) noonAlt = h.altitude;
    if (h.altitude < MIN_SUN_ALTITUDE) continue;
    if (sectors.some((s) => inSector(h.azimuth, s.fromDeg, s.toDeg) && h.altitude < s.heightDeg)) continue;
    const r = (h.azimuth * Math.PI) / 180;
    x += Math.sin(r);
    y += Math.cos(r);
  }
  // Sin sol directo (todo tapado): se toma el norte o el sur según el hemisferio.
  if (x === 0 && y === 0) return { fromDeg: place.lat < 0 ? 0 : 180, noonAltitude: noonAlt };
  return { fromDeg: normalizeDeg((Math.atan2(x, y) * 180) / Math.PI), noonAltitude: noonAlt };
}

export interface LayoutCrop {
  cropId: string;
  /** Cuántos cuadros de 30 cm se le dan. */
  cells: number;
}

export interface LayoutResult {
  /** Cuadro (fila × columnas + columna) → id del cultivo. */
  assignment: Map<number, string>;
  /** Cultivos en el orden en que quedaron del lado de la sombra al lado del sol. */
  order: string[];
  /** Cuánto llega la sombra de cada cultivo alto al mediodía, en cm, por id. */
  shadowCm: Map<string, number>;
  /** Rumbo hacia donde cae la sombra (opuesto al sol). */
  shadowDeg: number;
  /** Cultivos que piden sol pleno y quedaron sin lugar donde no les dé sombra otro, o que no entraron. */
  leftOut: string[];
}

/**
 * Cuánto avanza cada cuadro hacia donde cae la sombra: el frente del cantero mira
 * a `bearingDeg`, el borde de arriba de la grilla es el frente y el derecho, 90° más.
 */
export function cellDepth(bed: Pick<GardenBed, 'widthCm' | 'lengthCm' | 'bearingDeg'>, cell: number, shadowDeg: number): number {
  const { cols, rows } = gridSize(bed);
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  const right = (col + 0.5 - cols / 2) * 30;
  const up = (rows / 2 - (row + 0.5)) * 30;
  const b = ((bed.bearingDeg ?? 0) * Math.PI) / 180;
  const s = (shadowDeg * Math.PI) / 180;
  // Este y norte de la posición del cuadro respecto del centro.
  const east = right * Math.cos(b) + up * Math.sin(b);
  const north = -right * Math.sin(b) + up * Math.cos(b);
  return east * Math.sin(s) + north * Math.cos(s);
}

/** Reparte los cuadros libres entre los cultivos elegidos, altos del lado de la sombra. */
export function planLayout(bed: GardenBed, free: number[], crops: LayoutCrop[], sun: SunDirection): LayoutResult {
  const shadowDeg = normalizeDeg(sun.fromDeg + 180);
  const tall = (id: string) => cropHeightCm(id);
  // Altos primero; entre los bajos, los que aguantan sombra pegados a los altos.
  const ordered = [...crops].sort((a, b) => {
    const ha = tall(a.cropId);
    const hb = tall(b.cropId);
    const lowA = ha <= 60;
    const lowB = hb <= 60;
    if (lowA && lowB) {
      const sa = CROP_BY_ID.get(a.cropId)?.shade ? 0 : 1;
      const sb = CROP_BY_ID.get(b.cropId)?.shade ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    return hb - ha;
  });
  const cells = [...free].sort((a, b) => cellDepth(bed, b, shadowDeg) - cellDepth(bed, a, shadowDeg) || a - b);
  const assignment = new Map<number, string>();
  const leftOut: string[] = [];
  let i = 0;
  for (const c of ordered) {
    const n = Math.max(1, c.cells);
    const take = cells.slice(i, i + n);
    if (take.length === 0) leftOut.push(c.cropId);
    for (const cell of take) assignment.set(cell, c.cropId);
    i += take.length;
  }
  const shadowCm = new Map<string, number>();
  const tan = Math.tan((Math.max(sun.noonAltitude, 5) * Math.PI) / 180);
  for (const c of ordered) if (tall(c.cropId) >= 90) shadowCm.set(c.cropId, Math.round(tall(c.cropId) / tan));
  return { assignment, order: ordered.map((c) => c.cropId), shadowCm, shadowDeg, leftOut };
}

/**
 * Plantas ya puestas que quedan en la sombra de otra más alta: una más baja
 * que da hacia donde cae la sombra de una alta, a menos de lo que mide esa sombra.
 */
export function shadedBy(bed: GardenBed, owners: Map<number, string>, sun: SunDirection): { shaded: string; by: string }[] {
  const shadowDeg = normalizeDeg(sun.fromDeg + 180);
  const s = (shadowDeg * Math.PI) / 180;
  const { cols } = gridSize(bed);
  const tan = Math.tan((Math.max(sun.noonAltitude, 5) * Math.PI) / 180);
  const out = new Map<string, { shaded: string; by: string }>();
  const pos = (cell: number) => {
    const b = ((bed.bearingDeg ?? 0) * Math.PI) / 180;
    const right = ((cell % cols) + 0.5) * 30;
    const down = (Math.floor(cell / cols) + 0.5) * 30;
    // Este y norte (hacia el frente = arriba de la grilla).
    return { e: right * Math.cos(b) - down * Math.sin(b), n: -right * Math.sin(b) - down * Math.cos(b) };
  };
  for (const [cellA, a] of owners) {
    const ha = cropHeightCm(a);
    if (ha < 90) continue;
    const reach = ha / tan;
    const pa = pos(cellA);
    for (const [cellB, bId] of owners) {
      if (bId === a || cropHeightCm(bId) >= ha * 0.6) continue;
      const pb = pos(cellB);
      const along = (pb.e - pa.e) * Math.sin(s) + (pb.n - pa.n) * Math.cos(s);
      const across = Math.abs((pb.e - pa.e) * Math.cos(s) - (pb.n - pa.n) * Math.sin(s));
      if (along > 0 && along <= reach && across <= 45 && !CROP_BY_ID.get(bId)?.shade) out.set(`${a}>${bId}`, { shaded: bId, by: a });
    }
  }
  return [...out.values()];
}
