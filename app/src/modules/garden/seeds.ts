/**
 * Guardar semilla propia, por cultivo (ficha del cultivo). Los datos salen de la investigación de
 * `tools/garden-data/semillas-investigacion.json` (con sus fuentes, licencias y discrepancias), condensada en
 * `seeds.json` (español e inglés). Son orientativos: las guías de distintos países no coinciden del todo.
 * Se cargan bajo demanda (el archivo pesa unos 100 KB) para no engordar el arranque de la app.
 */
export type SeedLevel = 'easy' | 'medium' | 'hard' | 'no';
export type SeedCycle = 'annual' | 'biennial' | 'vegetative' | 'perennial';
export type SeedPollination = 'self' | 'insects' | 'wind' | 'mixed' | 'vegetative';

interface Bi {
  es: string;
  en: string;
}

export interface SeedInfo {
  level: SeedLevel;
  cycle: SeedCycle;
  pollination: SeedPollination;
  /** Metros de aislamiento entre variedades de la misma especie: mínimo práctico y recomendado. */
  isolationM: { min: number | null; rec: number | null };
  /** Plantas que conviene dejar para semilla. */
  minPlants: { min: number | null; rec: number | null };
  /** Años que dura la germinación guardada en un lugar fresco y seco. */
  yearsViable: { min: number | null; max: number | null };
  why: Bi;
  cycleNote: Bi;
  isolationNote: Bi | null;
  harvest: Bi;
  dry: Bi;
  hybrids: Bi;
  caveat: Bi | null;
  argentina: Bi | null;
  confidence: 'high' | 'medium' | 'low';
  sources: { name: string; url: string; license: string }[];
}

let cache: Promise<Record<string, SeedInfo>> | null = null;

/** Todas las fichas de semilla (una sola carga por sesión). */
export function loadSeeds(): Promise<Record<string, SeedInfo>> {
  cache ??= import('./seeds.json').then((m) => m.default as unknown as Record<string, SeedInfo>);
  return cache;
}

export const seedText = (b: Bi, lang: string) => (lang.startsWith('en') ? b.en : b.es);
