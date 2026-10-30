import { beforeEach, describe, expect, it } from 'vitest';
import { db, setTestDb } from '@/core/db/db';
import { newEntity } from '@/core/model/entity';
import type { Category, Item, Location, Lot } from '@/core/model/types';
import { initializeVault, lockVault, setTestIterations } from '@/core/security/vault';
import { systemCategoryId } from './domain/categories';
import { InventoryError, useInventory } from './store';

setTestIterations(1_000);

const inv = () => useInventory.getState();

const location = (name: string, parentId: string | null = null) =>
  newEntity<Location>({ name, parentId, depth: 0, notes: '', waypointId: null });

const item = (over: Partial<Item> = {}) =>
  newEntity<Item>({
    name: 'Agua mineral',
    categoryId: systemCategoryId('water'),
    notes: '',
    barcode: null,
    unit: 'L',
    weightGrams: 1000,
    favorite: false,
    controlType: null,
    alertsEnabled: null,
    alertLeadDays: null,
    alertCapacityPct: null,
    ...over,
  });

const lot = (itemId: string, locationId: string, over: Partial<Lot> = {}) =>
  newEntity<Lot>({
    itemId,
    locationId,
    quantity: 6,
    packageCount: null,
    packageSize: null,
    packageName: null,
    packageTareGrams: null,
    expiryDate: '2099-01-01',
    manufactureDate: null,
    shelfLifeMonths: null,
    capacityTotal: null,
    capacityRemaining: null,
    capacityUnit: null,
    notes: '',
    ...over,
  });

describe('inventario', () => {
  beforeEach(async () => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
    await initializeVault('una-contraseña');
    await inv().load();
  });

  it('crea las categorías del sistema una sola vez', async () => {
    const count = inv().categories.size;
    expect(count).toBe(14);
    await inv().load();
    expect(inv().categories.size).toBe(count);
  });

  it('calcula la profundidad y la actualiza al mover un subárbol', async () => {
    const casa = location('Casa');
    const sotano = location('Sótano', casa.id);
    const auto = location('Auto');
    for (const l of [casa, sotano, auto]) await inv().saveLocation(l);
    expect(inv().locations.get(sotano.id)?.depth).toBe(2);

    await inv().saveLocation({ ...inv().locations.get(casa.id)!, parentId: auto.id });
    expect(inv().locations.get(casa.id)?.depth).toBe(2);
    expect(inv().locations.get(sotano.id)?.depth).toBe(3);
  });

  it('rechaza un quinto nivel', async () => {
    let parent: string | null = null;
    for (const name of ['1', '2', '3', '4']) {
      const l = location(name, parent);
      await inv().saveLocation(l);
      parent = l.id;
    }
    await expect(inv().saveLocation(location('5', parent))).rejects.toBeInstanceOf(InventoryError);
  });

  it('no borra ubicaciones con stock', async () => {
    const casa = location('Casa');
    await inv().saveLocation(casa);
    const water = item();
    await inv().saveItem(water);
    await inv().saveLot(lot(water.id, casa.id));
    await expect(inv().deleteLocation(casa.id)).rejects.toThrow('location-not-empty');
  });

  it('borrar un artículo borra sus lotes y mínimos', async () => {
    const casa = location('Casa');
    await inv().saveLocation(casa);
    const water = item();
    await inv().saveItem(water);
    await inv().saveLot(lot(water.id, casa.id));
    await inv().setStockMin(water.id, casa.id, 20);
    await inv().deleteItem(water.id);
    expect(inv().lots.size).toBe(0);
    expect(inv().stockMins.size).toBe(0);
  });

  it('borrar una categoría del usuario mueve sus artículos a "Otros"', async () => {
    const custom = newEntity<Category>({
      ...inv().categories.get(systemCategoryId('tools'))!,
      nameKey: null,
      name: 'Pesca',
      isSystem: false,
    });
    await inv().saveCategory(custom);
    const rod = item({ name: 'Caña', categoryId: custom.id });
    await inv().saveItem(rod);
    await inv().deleteCategory(custom.id);
    expect(inv().items.get(rod.id)?.categoryId).toBe(systemCategoryId('other'));
    await expect(inv().deleteCategory(systemCategoryId('water'))).rejects.toThrow('category-system');
  });

  it('mantiene el índice de alertas en claro', async () => {
    const casa = location('Casa');
    await inv().saveLocation(casa);
    const water = item();
    await inv().saveItem(water);
    const l = lot(water.id, casa.id, { expiryDate: '2030-06-30' });
    await inv().saveLot(l);
    expect(await db.alertIndex.toArray()).toEqual([
      { lotId: l.id, itemName: 'Agua mineral', kind: 'expiry', dueDate: '2030-06-30', notifyFrom: '2030-05-31' },
    ]);
    await inv().deleteLot(l.id);
    expect(await db.alertIndex.count()).toBe(0);
  });

  it('la foto se reemplaza y se borra con el artículo', async () => {
    const water = item();
    await inv().saveItem(water);
    const image = (b: number) => ({ bytes: new Uint8Array([b]), mime: 'image/webp', width: 1, height: 1 });
    await inv().setItemPhoto(water.id, image(1));
    await inv().setItemPhoto(water.id, image(2));
    expect(inv().attachments.size).toBe(1);
    expect(await db.blobs.count()).toBe(1);
    await inv().deleteItem(water.id);
    expect(inv().attachments.size).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('se vacía al bloquear', () => {
    lockVault();
    expect(inv().loaded).toBe(false);
    expect(inv().categories.size).toBe(0);
  });
});
