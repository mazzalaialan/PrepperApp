import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Item } from '@/core/model/types';
import { buildSystemCategories, systemCategoryId } from '@/modules/inventory/domain/categories';
import { computeAlerts } from '@/modules/inventory/domain/alerts';
import { buildSeedStock, seedExpiry } from './seedStock';
import seeds from './seeds.json';
import type { SeedInfo } from './seeds';

const data = seeds as unknown as Record<string, SeedInfo>;

describe('semillas en el inventario', () => {
  it('el vencimiento sugerido es la fecha en que se guardó más los años habituales (el mínimo del rango)', () => {
    // tomate: 4 a 6 años → 4
    expect(seedExpiry(data['tomate'], '2026-11-13')).toBe('2030-11-13');
    // cebolla: 1 a 2 años → 1
    expect(seedExpiry(data['cebolla'], '2026-11-13')).toBe('2027-11-13');
    // quinua: 0,5 años → medio año
    expect(seedExpiry(data['quinua'], '2026-11-13')).toBe('2027-05-13');
    // papa y ajo se multiplican por partes vivas: sin plazo habitual
    expect(seedExpiry(data['papa'], '2026-11-13')).toBeNull();
    expect(seedExpiry(undefined, '2026-11-13')).toBeNull();
  });

  it('arma el artículo en la categoría Semillas (hereda el control de vencimiento) y un lote con las fechas', () => {
    const { item, lot, isNewItem } = buildSeedStock({ name: ' Semillas de tomate Platense ', unit: 'sobres', quantity: 3, locationId: 'loc1', storedOn: '2026-11-13', expiry: '2030-11-13' });
    expect(isNewItem).toBe(true);
    expect(item).toMatchObject({ name: 'Semillas de tomate Platense', categoryId: systemCategoryId('seeds'), unit: 'sobres', controlType: null, alertsEnabled: null });
    expect(lot).toMatchObject({ itemId: item.id, locationId: 'loc1', quantity: 3, manufactureDate: '2026-11-13', expiryDate: '2030-11-13' });
  });

  it('si el artículo ya existe, suma un lote nuevo al mismo artículo', () => {
    const first = buildSeedStock({ name: 'Semillas de lechuga', unit: 'g', quantity: 5, locationId: 'l', storedOn: '2026-01-01', expiry: '2029-01-01' });
    const second = buildSeedStock({ name: 'Semillas de lechuga', unit: 'g', quantity: 2, locationId: 'l', storedOn: '2026-11-13', expiry: '2029-11-13' }, first.item);
    expect(second.isNewItem).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(second.lot.itemId).toBe(first.item.id);
    expect(second.lot.id).not.toBe(first.lot.id);
  });

  it('la categoría Semillas existe, va al final y controla el vencimiento: las semillas por vencer dan aviso', () => {
    const cats = buildSystemCategories();
    const seedsCat = cats.find((c) => c.id === systemCategoryId('seeds'))!;
    expect(seedsCat).toMatchObject({ controlType: 'expiryDate', alertsEnabled: true });
    expect(cats[cats.length - 1]!.id).toBe(systemCategoryId('seeds'));
    const { item, lot } = buildSeedStock({ name: 'Semillas de acelga', unit: 'sobres', quantity: 1, locationId: 'l', storedOn: '2024-01-01', expiry: '2026-11-20' });
    const alerts = computeAlerts({ lots: [lot], items: new Map<string, Item>([[item.id, item]]), categories: new Map(cats.map((c) => [c.id, c])), today: '2026-11-13' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toMatch(/expir/i);
    expect(newEntity).toBeTypeOf('function');
  });
});
