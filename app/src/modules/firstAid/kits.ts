import type { Id, Item, Location, Lot } from '@/core/model/types';
import type { LotAlert } from '@/modules/inventory/domain/alerts';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { subtreeIds } from '@/modules/inventory/domain/locations';
import type { StockShortage } from '@/modules/inventory/domain/stock';

/** Ubicaciones marcadas como botiquín. */
export function kitsOf(locations: Location[]): Location[] {
  return locations.filter((l) => l.kitType !== null && !l.deletedAt);
}

/** Lotes guardados en el botiquín (incluye bolsillos o compartimentos que sean sububicaciones). */
export function kitLots(kitId: Id, lots: Lot[], locations: Location[]): Lot[] {
  const scope = subtreeIds(kitId, locations);
  return lots.filter((l) => !l.deletedAt && scope.has(l.locationId));
}

export function kitAlerts(kitId: Id, alerts: LotAlert[], lots: Map<Id, Lot>, locations: Location[]): LotAlert[] {
  const scope = subtreeIds(kitId, locations);
  return alerts.filter((a) => {
    const lot = lots.get(a.lotId);
    return lot !== undefined && scope.has(lot.locationId);
  });
}

export function kitShortages(kitId: Id, shortages: StockShortage[], locations: Location[]): StockShortage[] {
  const scope = subtreeIds(kitId, locations);
  return shortages.filter((s) => scope.has(s.stockMin.locationId));
}

/**
 * Lo que concierne al Botiquín: lo que está dentro de algún botiquín y,
 * aunque esté suelto, todo artículo de la categoría Botiquín.
 */
export function isFirstAidLot(lot: Lot, items: Map<Id, Item>, kitScope: Set<Id>): boolean {
  return kitScope.has(lot.locationId) || items.get(lot.itemId)?.categoryId === systemCategoryId('firstAid');
}

/** Todas las ubicaciones que pertenecen a algún botiquín. */
export function allKitsScope(locations: Location[]): Set<Id> {
  const scope = new Set<Id>();
  for (const kit of kitsOf(locations)) for (const id of subtreeIds(kit.id, locations)) scope.add(id);
  return scope;
}
