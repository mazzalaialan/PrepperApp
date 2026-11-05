import type { GardenBed, IsoDay, Planting } from '@/core/model/types';
import { cropCalendar, type Zone } from './calendar';
import { CELL_CM, CROP_BY_ID, CROPS, type Crop, type RootDepth } from './crops';

/** Lógica de la huerta sin pantalla (ARQUITECTURA §10.1). */

export const DAY_MS = 86_400_000;

export function addDays(day: IsoDay, n: number): IsoDay {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const month = (day: IsoDay) => Number(day.slice(5, 7));

// ---------------------------------------------------------------- grilla

export function gridSize(bed: Pick<GardenBed, 'widthCm' | 'lengthCm'>): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.round(bed.widthCm / CELL_CM)), rows: Math.max(1, Math.round(bed.lengthCm / CELL_CM)) };
}

/** Qué siembra ocupa cada cuadro del cantero (solo las que siguen en la tierra). */
export function cellOwners(bed: GardenBed, plantings: Iterable<Planting>): Map<number, Planting> {
  const out = new Map<number, Planting>();
  for (const p of plantings) {
    if (p.bedId !== bed.id || p.status === 'done' || p.deletedAt) continue;
    for (const c of p.cells) out.set(c, p);
  }
  return out;
}

/** Cuántas plantas entran en tantos cuadros. */
export function plantsFor(crop: Crop, cells: number): number {
  if (crop.spacingCm <= CELL_CM) return Math.max(1, Math.floor(CELL_CM / crop.spacingCm) ** 2) * cells;
  const side = Math.max(1, Math.round(crop.spacingCm / CELL_CM));
  return Math.max(cells > 0 ? 1 : 0, Math.floor(cells / (side * side)));
}

// ---------------------------------------------------------------- tareas

export type TaskKind = 'transplant' | 'harvest' | 'finish';

export interface GardenTask {
  /** `${plantingId}:${kind}` */
  id: string;
  kind: TaskKind;
  planting: Planting;
  crop: Crop;
  /** Desde cuándo corresponde. */
  date: IsoDay;
}

/** Cuándo empieza la cosecha de una siembra. */
export function harvestStart(p: Planting, crop: Crop): IsoDay {
  const from = p.method === 'nursery' ? (p.transplantedOn ?? addDays(p.sownOn, crop.nurseryDays?.[0] ?? 30)) : p.sownOn;
  return addDays(from, crop.daysToHarvest[0]);
}

/** Hasta cuándo se cosecha, aproximadamente. */
export function harvestEnd(p: Planting, crop: Crop): IsoDay {
  const span = crop.daysToHarvest[1] - crop.daysToHarvest[0] + Math.round(crop.harvestMonths * 30);
  return addDays(harvestStart(p, crop), crop.perennial ? 365 * 50 : span);
}

/** La próxima tarea de cada siembra activa. */
export function plantingTasks(plantings: Iterable<Planting>): GardenTask[] {
  const out: GardenTask[] = [];
  for (const p of plantings) {
    const crop = CROP_BY_ID.get(p.cropId);
    if (!crop || p.status === 'done' || p.deletedAt) continue;
    const base = { planting: p, crop };
    if (p.status === 'nursery') {
      out.push({ ...base, id: `${p.id}:transplant`, kind: 'transplant', date: addDays(p.sownOn, crop.nurseryDays?.[0] ?? 30) });
    } else if (p.status === 'growing') {
      out.push({ ...base, id: `${p.id}:harvest`, kind: 'harvest', date: harvestStart(p, crop) });
    } else if (!crop.perennial) {
      out.push({ ...base, id: `${p.id}:finish`, kind: 'finish', date: harvestEnd(p, crop) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Las que ya corresponden (hoy o antes). */
export function dueTasks(plantings: Iterable<Planting>, today: IsoDay): GardenTask[] {
  return plantingTasks(plantings).filter((t) => t.date <= today);
}

// ---------------------------------------------------------- recomendaciones

export interface BedRecommendation {
  crop: Crop;
  /** Qué se puede hacer ahora: sembrar directo, trasplantar o hacer el almácigo. */
  action: 'sow' | 'transplant' | 'nursery';
  /** Este mes (0) o el que viene (1). */
  when: 0 | 1;
  score: number;
  /** Se lleva bien con lo que ya hay en el cantero. */
  friends: Crop[];
  /** Se lleva mal con lo que ya hay. */
  foes: Crop[];
  /** Su familia ya ocupó este cantero en el último año. */
  sameFamilyRecently: boolean;
  /** Fue precedido por un grupo que le conviene (rotación). */
  goodRotation: boolean;
}

export interface RecommendOptions {
  zone: Zone;
  today: IsoDay;
  /** "MM-DD": los sensibles al aire libre no se recomiendan antes de esta fecha. */
  lastFrost: string | null;
}

/** Antes de la última helada de primavera (entre julio y esa fecha). */
export function beforeLastFrost(today: IsoDay, lastFrost: string | null): boolean {
  if (!lastFrost) return false;
  const md = today.slice(5);
  return md >= '07-01' && md < lastFrost;
}

/**
 * Qué conviene poner en un cantero ahora o el mes que viene, según la zona,
 * el sol, la helada, lo que ya tiene plantado (asociaciones) y lo que tuvo
 * antes (rotación). Lo mejor primero.
 */
export function recommendForBed(bed: GardenBed, plantings: Planting[], opts: RecommendOptions): BedRecommendation[] {
  const here = plantings.filter((p) => p.bedId === bed.id && !p.deletedAt);
  const current = here.filter((p) => p.status !== 'done').map((p) => CROP_BY_ID.get(p.cropId)).filter((c): c is Crop => !!c);
  const yearAgo = addDays(opts.today, -365);
  const recent = here
    .filter((p) => p.status === 'done' && (p.endedOn ?? p.sownOn) >= yearAgo)
    .map((p) => CROP_BY_ID.get(p.cropId))
    .filter((c): c is Crop => !!c);
  const thisMonth = month(opts.today);
  const frostWait = !bed.greenhouse && beforeLastFrost(opts.today, opts.lastFrost);

  const out: BedRecommendation[] = [];
  for (const crop of CROPS) {
    const cal = cropCalendar(opts.zone, crop.id);
    if (!cal) continue;
    if (bed.kind === 'pot' && !crop.container) continue;
    if (bed.sunHours < 6 && !crop.shade) continue;
    // En la zona va bajo cubierta: solo en invernadero.
    if (cal.cover && !bed.greenhouse) continue;
    let pick: Pick<BedRecommendation, 'action' | 'when'> | null = null;
    for (const when of [0, 1] as const) {
      const m = ((thisMonth - 1 + when) % 12) + 1;
      const tender = crop.frost === 'tender' && frostWait && when === 0;
      if (cal.sow.has(m) && !tender) pick = { action: 'sow', when };
      else if (cal.transplant.has(m) && !tender) pick = { action: 'transplant', when };
      else if (cal.nursery.has(m)) pick = { action: 'nursery', when };
      if (pick) break;
    }
    if (!pick) continue;
    const friends = current.filter((c) => crop.companions.includes(c.id) || c.companions.includes(crop.id));
    const foes = current.filter((c) => crop.avoid.includes(c.id) || c.avoid.includes(crop.id));
    const sameFamilyRecently = recent.some((c) => c.family === crop.family) || current.some((c) => c.family === crop.family);
    const goodRotation = recent.some((c) => crop.rotateAfter.includes(c.group));
    const score = (pick.when === 0 ? 2 : 0) + (pick.action === 'nursery' ? 0 : 1) + friends.length * 2 - foes.length * 4 - (sameFamilyRecently ? 3 : 0) + (goodRotation ? 2 : 0);
    out.push({ crop, ...pick, score, friends, foes, sameFamilyRecently, goodRotation });
  }
  return out.sort((a, b) => b.score - a.score || a.crop.name.es.localeCompare(b.crop.name.es));
}

// ------------------------------------------------------------- agua y helada

/** Lo que hay plantado al aire libre (los canteros en invernadero no cuentan para la helada ni para el riego por lluvia). */
export function outdoorPlantings(beds: Map<string, GardenBed>, plantings: Iterable<Planting>): { planting: Planting; crop: Crop }[] {
  const out: { planting: Planting; crop: Crop }[] = [];
  for (const p of plantings) {
    if (p.deletedAt || p.status === 'done' || p.status === 'nursery' || !p.bedId) continue;
    const bed = beds.get(p.bedId);
    const crop = CROP_BY_ID.get(p.cropId);
    if (!bed || bed.deletedAt || bed.greenhouse || !crop) continue;
    out.push({ planting: p, crop });
  }
  return out;
}

/** Mínima a partir de la cual se quema: los sensibles con 2 °C (helada en el pasto), los semirresistentes con −2 °C. */
export function frostThreshold(crop: Crop): number | null {
  if (crop.frost === 'tender') return 2;
  if (crop.frost === 'half') return -2;
  return null;
}

export interface FrostRisk {
  date: IsoDay;
  min: number;
  crops: Crop[];
}

/** Primera noche (hoy o mañana) en que la mínima pronosticada quema algo de lo plantado al aire libre. */
export function frostRisk(outdoor: { crop: Crop }[], days: { date: IsoDay; min: number }[], today: IsoDay): FrostRisk | null {
  const tomorrow = addDays(today, 1);
  for (const d of days) {
    if (d.date < today || d.date > tomorrow) continue;
    const hit = [...new Map(outdoor.map((o) => [o.crop.id, o.crop])).values()].filter((c) => {
      const t = frostThreshold(c);
      return t !== null && d.min <= t;
    });
    if (hit.length) return { date: d.date, min: d.min, crops: hit };
  }
  return null;
}

/** Agua que la planta saca sin esfuerzo de la zona de raíces, mm (FAO-56: ~40 % del agua útil de un suelo franco). */
export const READILY_AVAILABLE_MM: Record<RootDepth, number> = { shallow: 15, medium: 25, deep: 35 };

/** Coeficiente de cultivo según la etapa: inicio, desarrollo pleno o final. */
export function cropKc(p: Planting, crop: Crop, today: IsoDay): number {
  if (p.status === 'harvesting') return crop.kc[2];
  const start = p.transplantedOn ?? p.sownOn;
  const total = daysBetween(start, harvestStart(p, crop));
  const done = daysBetween(start, today);
  return total > 0 && done / total < 0.3 ? crop.kc[0] : crop.kc[1];
}

export interface WaterDay {
  date: IsoDay;
  /** Evapotranspiración de referencia (FAO-56), mm. */
  et0: number;
  rain: number;
}

export interface WaterBalance {
  /** Cuánto le falta al suelo, mm. */
  deficitMm: number;
  /** Desde cuánto conviene regar, mm. */
  thresholdMm: number;
  needsWater: boolean;
  kc: number;
  /** Lluvia contada en el período, mm. */
  rainMm: number;
  /** Desde qué día se cuenta. */
  since: IsoDay;
}

/** Lluvias de menos de 2 mm mojan las hojas y se evaporan: no llegan a las raíces. */
const RAIN_LOSS_MM = 2;

/**
 * Balance de agua del suelo desde el último riego (o desde hace 10 días, lo
 * que sea más reciente): cada día se pierde ET0 × Kc y se suma la lluvia útil.
 * El suelo no guarda más que lo que entra en la zona de raíces (lo que sobra
 * escurre). Avisa cuando falta más que lo fácilmente aprovechable de las
 * raíces más cortas que haya.
 */
export function waterBalance(outdoor: { planting: Planting; crop: Crop }[], days: WaterDay[], today: IsoDay, wateredOn: IsoDay | null): WaterBalance | null {
  if (!outdoor.length) return null;
  const kc = Math.max(...outdoor.map((o) => cropKc(o.planting, o.crop, today)));
  const thresholdMm = Math.min(...outdoor.map((o) => READILY_AVAILABLE_MM[o.crop.rootDepth]));
  const tenDaysAgo = addDays(today, -10);
  const since = wateredOn && wateredOn > tenDaysAgo ? wateredOn : tenDaysAgo;
  let deficit = 0;
  let rainMm = 0;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    // El día del riego cuenta desde después de regar: se empieza al día siguiente.
    if (d.date <= since || d.date > today) continue;
    const useful = Math.max(0, d.rain - RAIN_LOSS_MM);
    rainMm += d.rain;
    deficit = Math.max(0, deficit + d.et0 * kc - useful);
    // Más de lo que entra en las raíces no se acumula como falta: el suelo ya está seco.
    deficit = Math.min(deficit, thresholdMm * 3);
  }
  return { deficitMm: Math.round(deficit * 10) / 10, thresholdMm, needsWater: deficit >= thresholdMm, kc, rainMm: Math.round(rainMm * 10) / 10, since };
}
