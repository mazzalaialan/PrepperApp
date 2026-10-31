import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { HouseholdMember, Item, Lot, RecommendationRule } from '@/core/model/types';
import { evaluateRule } from './calc';

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

  it('sin miembros no hay necesidad ni días calculables', () => {
    const r = evaluateRule(rule({ categoryId: 'sys-water', unit: 'L', quantityPerMemberPerDay: 4, targetDays: 14 }), [], new Map(), []);
    expect(r).toMatchObject({ people: 0, target: 0, missing: 0, daysCovered: null });
  });
});
