/**
 * Tipos de la categoría Náutica de «Buscar cercanos». Cada lugar trae su tipo escrito (`type`/`detail`): estos textos son los mismos
 * que escribe tools/services-data/build.mjs, y de ellos sale el identificador con el que se eligen o se sacan de la lista.
 */
export const NAUTICAL_IDS = ['fuel', 'marina', 'slipway', 'storage', 'rental', 'shop', 'mooring', 'pier'] as const;
export type NauticalId = (typeof NAUTICAL_IDS)[number];

export const NAUTICAL_LABEL: Record<NauticalId, string> = {
  fuel: 'Combustible para embarcaciones',
  marina: 'Marina',
  slipway: 'Rampa para embarcaciones',
  storage: 'Guardería de embarcaciones',
  rental: 'Alquiler de embarcaciones',
  shop: 'Taller o comercio náutico',
  mooring: 'Amarra o boya',
  pier: 'Muelle',
};

/** El tipo de un lugar según su texto (null si no se reconoce: no se saca de la lista por las dudas). */
export function nauticalIdOf(detail: string | undefined): NauticalId | null {
  return NAUTICAL_IDS.find((id) => NAUTICAL_LABEL[id] === detail) ?? null;
}
