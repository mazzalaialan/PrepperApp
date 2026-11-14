/**
 * Aviso marino oficial de INUMET (Uruguay) para el Río de la Plata y el río Uruguay: situación sinóptica y avisos vigentes por zona
 * (viento, olas, visibilidad). JSON público, con CORS abierto: la app lo pide directo con conexión y guarda el último.
 * https://www.inumet.gub.uy/reportes/pronos_marino_auto/aviso-marino.json
 */
export interface UyZoneWarning {
  zone: string;
  /** «visibilidad», «viento»… tal como lo escribe INUMET. */
  kind: string;
  text: string;
}

export interface UyMarineNotice {
  /** El aviso está vigente (`activo`). */
  active: boolean;
  issued: string;
  validFrom: string;
  synoptic: string;
  warnings: UyZoneWarning[];
  fetchedAt: number;
}

export const UY_MARINE_URL = 'https://www.inumet.gub.uy/reportes/pronos_marino_auto/aviso-marino.json';

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

export function parseUyMarine(raw: unknown, fetchedAt = Date.now()): UyMarineNotice | null {
  const d = raw as { activo?: number; fechaEmision?: string; fechaInicioValidez?: string; horaInicioValidez?: string; situacionSinoptica?: string; zonasDescripcion?: { zonaNombre?: string; tipo?: string; descripcion?: string }[] } | null;
  if (!d || typeof d !== 'object' || (d.situacionSinoptica === undefined && !Array.isArray(d.zonasDescripcion))) return null;
  return {
    active: d.activo === 1,
    issued: clean(d.fechaEmision),
    validFrom: [clean(d.fechaInicioValidez), clean(d.horaInicioValidez)].filter(Boolean).join(' '),
    synoptic: clean(d.situacionSinoptica),
    warnings: (d.zonasDescripcion ?? []).map((z) => ({ zone: clean(z.zonaNombre), kind: clean(z.tipo), text: clean(z.descripcion) })).filter((z) => z.text),
    fetchedAt,
  };
}

export async function fetchUyMarine(): Promise<UyMarineNotice | null> {
  const res = await fetch(UY_MARINE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`INUMET ${res.status}`);
  return parseUyMarine(await res.json());
}

const STORE = 'vikarg.uymarine.last';
export function loadSavedUy(): UyMarineNotice | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as UyMarineNotice) : null;
  } catch {
    return null;
  }
}
export function saveUy(n: UyMarineNotice): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(n));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
