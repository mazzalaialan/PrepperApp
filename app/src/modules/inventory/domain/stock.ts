import type { Id, Item, Location, Lot, StockMin } from '@/core/model/types';
import { subtreeIds } from './locations';

const active = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);

/** Cantidad total del artículo; si se indica ubicación, incluye sus sububicaciones. */
export function quantityOf(itemId: Id, lots: Lot[], locationScope?: Set<Id>): number {
  return active(lots)
    .filter((l) => l.itemId === itemId && (!locationScope || locationScope.has(l.locationId)))
    .reduce((sum, l) => sum + l.quantity, 0);
}

export interface StockShortage {
  stockMin: StockMin;
  current: number;
  missing: number;
}

/** Mínimos no cubiertos. El mínimo de "Casa" cuenta lo guardado en "Casa › Sótano". */
export function stockShortages(stockMins: StockMin[], lots: Lot[], locations: Location[]): StockShortage[] {
  return active(stockMins).flatMap((sm) => {
    const current = quantityOf(sm.itemId, lots, subtreeIds(sm.locationId, locations));
    return current < sm.minQuantity ? [{ stockMin: sm, current, missing: sm.minQuantity - current }] : [];
  });
}

/** Peso total en gramos de lo guardado en una ubicación y sus sububicaciones. */
export function weightAt(locationId: Id, lots: Lot[], items: Map<Id, Item>, locations: Location[]): number {
  const scope = subtreeIds(locationId, locations);
  return active(lots)
    .filter((l) => scope.has(l.locationId))
    .reduce((sum, l) => sum + l.quantity * (items.get(l.itemId)?.weightGrams ?? 0), 0);
}
