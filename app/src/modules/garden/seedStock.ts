import { newEntity } from '@/core/model/entity';
import type { Id, IsoDay, Item, Lot } from '@/core/model/types';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { useInventory } from '@/modules/inventory/store';
import { addMonths } from '@/modules/inventory/domain/dates';
import type { SeedInfo } from './seeds';

/**
 * Semillas en el inventario (categoría «Semillas», con aviso de vencimiento): un artículo por cultivo (y variedad) y un lote por
 * cada vez que se guardan, con la fecha en que se guardaron y el vencimiento.
 */

/** Vencimiento sugerido: la fecha en que se guardó más los años habituales de vida de la semilla (el mínimo del rango, para avisar a tiempo). Sin dato, null. */
export function seedExpiry(info: Pick<SeedInfo, 'yearsViable'> | undefined, storedOn: IsoDay): IsoDay | null {
  const years = info?.yearsViable.min;
  if (!years || years <= 0) return null;
  return addMonths(storedOn, Math.round(years * 12));
}

export interface SeedStockInput {
  /** Nombre del artículo (p. ej. «Semillas de tomate Platense»). */
  name: string;
  unit: string;
  quantity: number;
  locationId: Id;
  storedOn: IsoDay;
  expiry: IsoDay | null;
  notes?: string;
}

/** El artículo (o el que ya existe con ese nombre y unidad) y el lote nuevo. Pura: no toca la base. */
export function buildSeedStock(input: SeedStockInput, existing?: Item): { item: Item; lot: Lot; isNewItem: boolean } {
  const item =
    existing ??
    newEntity<Item>({
      name: input.name.trim(),
      categoryId: systemCategoryId('seeds'),
      notes: '',
      barcode: null,
      unit: input.unit,
      weightGrams: null,
      favorite: false,
      // Hereda el control de vencimiento de la categoría.
      controlType: null,
      alertsEnabled: null,
      alertLeadDays: null,
      alertCapacityPct: null,
    });
  const lot = newEntity<Lot>({
    itemId: item.id,
    locationId: input.locationId,
    quantity: input.quantity,
    packageCount: null,
    packageSize: null,
    packageName: null,
    packageTareGrams: null,
    expiryDate: input.expiry,
    manufactureDate: input.storedOn,
    shelfLifeMonths: null,
    capacityTotal: null,
    capacityRemaining: null,
    capacityUnit: null,
    notes: input.notes ?? '',
  });
  return { item, lot, isNewItem: !existing };
}

/** Guarda las semillas en el inventario. */
export async function saveSeedStock(input: SeedStockInput): Promise<void> {
  const inv = useInventory.getState();
  const cat = systemCategoryId('seeds');
  const name = input.name.trim().toLowerCase();
  const existing = [...inv.items.values()].find((i) => i.categoryId === cat && i.name.trim().toLowerCase() === name && i.unit === input.unit);
  const { item, lot, isNewItem } = buildSeedStock(input, existing);
  if (isNewItem) await inv.saveItem(item);
  await inv.saveLot(lot);
}
