import { KNOTS, type Knot, type KnotType, type KnotUse } from './knots';

/** Sin acentos ni mayúsculas, para buscar "as de guia" o "ballestrinque" como sea que se escriba. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

export type KnotProp = 'easyUntie' | 'holdsLoad' | 'oneHand' | 'wet';
export const KNOT_PROPS: KnotProp[] = ['holdsLoad', 'easyUntie', 'wet', 'oneHand'];

export interface KnotFilter {
  query: string;
  use: KnotUse | null;
  type: KnotType | null;
  props: KnotProp[];
}

function haystack(k: Knot): string {
  return norm([k.name.es, k.name.en, ...k.aliases, k.purpose.es, k.purpose.en, k.abok ? `abok ${k.abok}` : ''].join(' '));
}

const HAY = new Map(KNOTS.map((k) => [k.id, haystack(k)]));
const NAMES = new Map(KNOTS.map((k) => [k.id, norm([k.name.es, k.name.en, ...k.aliases].join(' '))]));

/** Busca por nombre, alias o para qué sirve, con filtros por uso, tipo y propiedades. Primero los que coinciden por nombre. */
export function searchKnots(f: KnotFilter, lang: string): Knot[] {
  const words = norm(f.query).split(' ').filter(Boolean);
  const out = KNOTS.filter((k) => {
    if (f.use && !k.uses.includes(f.use)) return false;
    if (f.type && !k.types.includes(f.type)) return false;
    if (f.props.some((p) => !k[p])) return false;
    const hay = HAY.get(k.id)!;
    return words.every((w) => hay.includes(w));
  });
  const name = (k: Knot) => (lang.startsWith('en') ? k.name.en : k.name.es);
  const byName = (k: Knot) => (words.length && words.every((w) => NAMES.get(k.id)!.includes(w)) ? 0 : 1);
  return out.sort((a, b) => byName(a) - byName(b) || name(a).localeCompare(name(b)));
}
