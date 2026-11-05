import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { HouseholdMember, Item, Lot, RecommendationRule } from '@/core/model/types';
import { evaluateRule, recommendationShortages } from './calc';
import { exampleRules } from './examples';
import { systemCategoryId } from '@/modules/inventory/domain/categories';

const member = (label: string, count: number) => newEntity<HouseholdMember>({ label, count });
const item = (name: string, unit: string, categoryId = 'sys-water') =>
  newEntity<Item>({
    name, categoryId, notes: '', barcode: null, unit, weightGrams: null, favorite: false,
    controlType: null, alertsEnabled: null, alertLeadDays: null, alertCapacityPct: null,
  });
const lot = (itemId: string, quantity: number) =>
  newEntity<Lot>({
    itemId, locationId: 'l', quantity, packageCount: null, packageSize: null, packageName: null, packageTareGrams: null,
    expiryDate: null, manufactureDate: null, shelfLifeMonths: null, capacityTotal: null, capacityRemaining: null, capacityUnit: null, notes: '',
  });
const rule = (over: Partial<RecommendationRule>) =>
  newEntity<RecommendationRule>({ description: '', categoryId: null, itemId: null, quantityPerMemberPerDay: 0, unit: '', targetDays: 0, memberIds: [], ...over });

const adults = member('Adultos', 2);
const kids = member('Niños', 1);
const dog = member('Perro', 1);
const members = [adults, kids, dog];

describe('evaluateRule', () => {
  it('agua por categoría: 4 L por persona por día durante 14 días, sin el perro', () => {
    const bidon = item('Bidón', 'L');
    const botellas = item('Botellas', ' l ');
    const pastillas = item('Pastillas potabilizadoras', 'unidades');
    const items = new Map([bidon, botellas, pastillas].map((i) => [i.id, i]));
    const lots = [lot(bidon.id, 60), lot(botellas.id, 24), lot(pastillas.id, 50)];
    const r = evaluateRule(rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 4, targetDays: 14, memberIds: [adults.id, kids.id] }), members, items, lots);
    expect(r).toMatchObject({ people: 3, dailyNeed: 12, target: 168, current: 84, missing: 84 });
    expect(r.daysCovered).toBe(7);
    expect(r.countedItems.map((i) => i.name)).toEqual(['Bidón', 'Botellas']); // las pastillas no son litros
  });

  it('por artículo y para todos: cubierto, sin faltante', () => {
    const alimento = item('Alimento balanceado', 'kg', 'sys-food');
    const items = new Map([[alimento.id, alimento]]);
    const r = evaluateRule(rule({ itemId: alimento.id, unit: 'kg', quantityPerMemberPerDay: 0.3, targetDays: 30, memberIds: [dog.id] }), members, items, [lot(alimento.id, 15)]);
    expect(r).toMatchObject({ people: 1, dailyNeed: 0.3, target: 9, current: 15, missing: 0 });
    expect(r.daysCovered).toBeCloseTo(50);
  });

  it('faltantes: solo las reglas que no se cumplen, con el último cambio como fecha', () => {
    const bidon = item('Bidón', 'L');
    const items = new Map([[bidon.id, bidon]]);
    const short = { ...rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 4, targetDays: 14 }), updatedAt: '2026-10-01T10:00:00.000Z' };
    const ok = { ...rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 1, targetDays: 1 }), updatedAt: '2026-10-01T10:00:00.000Z' };
    const l = { ...lot(bidon.id, 60), updatedAt: '2026-10-20T08:00:00.000Z' };
    const result = recommendationShortages([short, ok], [{ ...adults, updatedAt: '2026-09-01T00:00:00.000Z' }], items, [l]);
    expect(result).toHaveLength(1);
    expect(result[0]!.rule.id).toBe(short.id);
    expect(result[0]!.changedAt).toBe('2026-10-20T08:00:00.000Z'); // el lote es lo último que cambió
    // Sin integrantes la regla no aplica a nadie: no es un faltante.
    expect(recommendationShortages([short], [], items, [l])).toEqual([]);
  });

  it('sin miembros no hay necesidad ni días calculables', () => {
    const r = evaluateRule(rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 4, targetDays: 14 }), [], new Map(), []);
    expect(r).toMatchObject({ people: 0, target: 0, missing: 0, daysCovered: null });
  });

  it('una regla destildada no se controla: no es un faltante', () => {
    const short = rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 4, targetDays: 14 });
    expect(recommendationShortages([short], [adults], new Map(), [])).toHaveLength(1);
    expect(recommendationShortages([{ ...short, active: false }], [adults], new Map(), [])).toEqual([]);
    expect(recommendationShortages([{ ...short, active: true }], [adults], new Map(), [])).toHaveLength(1);
  });

  it('reglas de ejemplo: agua y alimentos para 3 días, 7 días y 6 meses; solo se controla la de 7 días', () => {
    const ex = exampleRules((k) => k);
    expect(ex.map((r) => [r.targetDays, r.unit, r.quantityPerMemberPerDay, r.active])).toEqual([
      [3, 'L', 3, false],
      [3, 'kg', 0.5, false],
      [7, 'L', 3, true],
      [7, 'kg', 0.5, true],
      [180, 'L', 3, false],
      [180, 'kg', 0.5, false],
    ]);
    expect(ex[2]!.categoryId).toBe(systemCategoryId('water'));
    // Ids fijos: agregarlas de nuevo no las duplica.
    expect(new Set(ex.map((r) => r.id)).size).toBe(6);
    expect(exampleRules((k) => k).map((r) => r.id)).toEqual(ex.map((r) => r.id));
    // 2 adultos sin agua: faltan 3 L × 2 × 7 días = 42 L.
    const short = recommendationShortages(ex, [adults], new Map(), []);
    expect(short.map((x) => x.result.missing)).toEqual([42, 7]);
  });
});
