import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Category, Id, IsoDay, Location } from '@/core/model/types';
import { computeAlerts, type LotAlert } from './domain/alerts';
import { categoryName } from './domain/categories';
import { today } from './domain/dates';
import { pathLabel } from './domain/locations';
import { stockShortages } from './domain/stock';
import { useInventory } from './store';

// Los derivados se memorizan sobre las colecciones: un selector que devuelva
// un array nuevo en cada render haría re-renderizar en bucle.

export function useAlerts(): LotAlert[] {
  const { lots, items, categories } = useInventory(
    useShallow((s) => ({ lots: s.lots, items: s.items, categories: s.categories })),
  );
  return useMemo(
    () => computeAlerts({ lots: [...lots.values()], items, categories, today: today() }),
    [lots, items, categories],
  );
}

/** Alerta más urgente de cada artículo (las alertas ya vienen ordenadas por severidad). */
export function useWorstAlertByItem(): Map<Id, LotAlert> {
  const alerts = useAlerts();
  return useMemo(() => {
    const map = new Map<Id, LotAlert>();
    for (const a of alerts) if (!map.has(a.itemId)) map.set(a.itemId, a);
    return map;
  }, [alerts]);
}

export function useShortages() {
  const { stockMins, lots, locations } = useInventory(
    useShallow((s) => ({ stockMins: s.stockMins, lots: s.lots, locations: s.locations })),
  );
  return useMemo(
    () => stockShortages([...stockMins.values()], [...lots.values()], [...locations.values()]),
    [stockMins, lots, locations],
  );
}

export interface LocationOption {
  id: Id;
  label: string;
  location: Location;
}

/** Ubicaciones con su ruta completa, ordenadas como un árbol. */
export function useLocationOptions(): LocationOption[] {
  const locations = useInventory((s) => s.locations);
  return useMemo(
    () =>
      [...locations.values()]
        .map((l) => ({ id: l.id, label: pathLabel(l.id, locations), location: l }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [locations],
  );
}

/** Categorías visibles en orden, con su nombre traducido. */
export function useCategoryOptions(includeId?: Id): { category: Category; name: string }[] {
  const { t } = useTranslation();
  const categories = useInventory((s) => s.categories);
  return useMemo(
    () =>
      [...categories.values()]
        .filter((c) => !c.hidden || c.id === includeId)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ category: c, name: categoryName(c, t) })),
    [categories, includeId, t],
  );
}

export function formatDay(day: IsoDay, locale: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** Para búsquedas: sin mayúsculas ni acentos ("Atún" encuentra "atun"). */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
