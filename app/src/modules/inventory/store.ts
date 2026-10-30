import { create } from 'zustand';
import { db, type AlertIndexRow } from '@/core/db/db';
import { blobStore, repos } from '@/core/db/repository';
import type { CompressedImage } from '@/core/images/compress';
import { newEntity, touch } from '@/core/model/entity';
import {
  MAX_LOCATION_DEPTH,
  type Attachment,
  type Category,
  type Id,
  type Item,
  type Location,
  type Lot,
  type StockMin,
} from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { computeAlerts, upcomingNotifications } from './domain/alerts';
import { missingSystemCategories, systemCategoryId } from './domain/categories';
import { today } from './domain/dates';
import { canMoveTo, depthFor, subtreeIds } from './domain/locations';
import { normalizeLot } from './domain/stock';

type ById<T> = Map<Id, T>;

const toMap = <T extends { id: Id }>(xs: T[]): ById<T> => new Map(xs.map((x) => [x.id, x]));
const without = <T>(map: ById<T>, id: Id): ById<T> => {
  const next = new Map(map);
  next.delete(id);
  return next;
};
const withValue = <T>(map: ById<T>, id: Id, value: T): ById<T> => new Map(map).set(id, value);

export class InventoryError extends Error {
  constructor(public readonly code: 'location-not-empty' | 'location-invalid-parent' | 'category-system') {
    super(code);
    this.name = 'InventoryError';
  }
}

interface InventoryState {
  loaded: boolean;
  categories: ById<Category>;
  locations: ById<Location>;
  items: ById<Item>;
  lots: ById<Lot>;
  stockMins: ById<StockMin>;
  /** Solo metadatos; los bytes se leen bajo demanda de `blobStore`. */
  attachments: ById<Attachment>;

  load: () => Promise<void>;
  clear: () => void;

  saveCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: Id) => Promise<void>;
  saveLocation: (l: Location) => Promise<void>;
  deleteLocation: (id: Id) => Promise<void>;
  saveItem: (i: Item) => Promise<void>;
  deleteItem: (id: Id) => Promise<void>;
  saveLot: (l: Lot) => Promise<void>;
  deleteLot: (id: Id) => Promise<void>;
  setStockMin: (itemId: Id, locationId: Id, minQuantity: number | null) => Promise<void>;
  setItemPhoto: (itemId: Id, image: CompressedImage) => Promise<void>;
  removeItemPhoto: (itemId: Id) => Promise<void>;
}

/**
 * Inventario en memoria (ARQUITECTURA §7.3): se descifra todo al desbloquear,
 * cada cambio se persiste cifrado al instante y se descarta al bloquear.
 */
export const useInventory = create<InventoryState>((set, get) => {
  /** Regenera el índice en claro que usan las notificaciones en segundo plano. */
  async function syncAlertIndex() {
    const { lots, items, categories } = get();
    const lotList = [...lots.values()];
    const rows: AlertIndexRow[] = upcomingNotifications({ lots: lotList, items, categories }).map((r) => ({
      ...r,
      kind: 'expiry',
    }));
    for (const a of computeAlerts({ lots: lotList, items, categories, today: today() })) {
      if (a.kind === 'capacityLow' || a.kind === 'capacityEmpty') {
        rows.push({ lotId: a.lotId, itemName: items.get(a.itemId)?.name ?? '', kind: 'capacity', dueDate: null, notifyFrom: a.notifyFrom });
      }
    }
    await db.transaction('rw', db.alertIndex, async () => {
      await db.alertIndex.clear();
      await db.alertIndex.bulkPut(rows);
    });
  }

  return {
    loaded: false,
    categories: new Map(),
    locations: new Map(),
    items: new Map(),
    lots: new Map(),
    stockMins: new Map(),
    attachments: new Map(),

    async load() {
      const [categories, locations, items, lots, stockMins, attachments] = await Promise.all([
        repos.categories.loadAll(),
        repos.locations.loadAll(),
        repos.items.loadAll(),
        repos.lots.loadAll(),
        repos.stockMins.loadAll(),
        repos.attachments.loadAll(),
      ]);
      const missing = missingSystemCategories(await repos.categories.loadAll({ includeDeleted: true }));
      await Promise.all(missing.map((c) => repos.categories.put(c)));
      set({
        loaded: true,
        categories: toMap([...categories, ...missing]),
        locations: toMap(locations),
        items: toMap(items),
        lots: toMap(lots.map(normalizeLot)),
        stockMins: toMap(stockMins),
        attachments: toMap(attachments),
      });
      await syncAlertIndex();
    },

    clear() {
      set({
        loaded: false,
        categories: new Map(),
        locations: new Map(),
        items: new Map(),
        lots: new Map(),
        stockMins: new Map(),
        attachments: new Map(),
      });
    },

    async saveCategory(c) {
      const saved = touch(c);
      await repos.categories.put(saved);
      set({ categories: withValue(get().categories, saved.id, saved) });
      await syncAlertIndex();
    },

    async deleteCategory(id) {
      const cat = get().categories.get(id);
      if (!cat) return;
      if (cat.isSystem) throw new InventoryError('category-system');
      // Los artículos no quedan huérfanos: pasan a "Otros".
      const other = systemCategoryId('other');
      for (const item of get().items.values()) {
        if (item.categoryId === id) await get().saveItem({ ...item, categoryId: other });
      }
      await repos.categories.remove(id);
      set({ categories: without(get().categories, id) });
    },

    async saveLocation(l) {
      const all = [...get().locations.values()];
      const isNew = !get().locations.has(l.id);
      if (isNew ? depthFor(l.parentId, get().locations) > MAX_LOCATION_DEPTH : !canMoveTo(l.id, l.parentId, all)) {
        throw new InventoryError('location-invalid-parent');
      }
      const saved = touch(l, { depth: depthFor(l.parentId, get().locations) });
      await repos.locations.put(saved);
      let locations = withValue(get().locations, saved.id, saved);
      // Mover una ubicación cambia la profundidad de todo su subárbol.
      for (const childId of subtreeIds(saved.id, [...locations.values()])) {
        if (childId === saved.id) continue;
        const child = locations.get(childId)!;
        const depth = depthFor(child.parentId, locations);
        if (depth !== child.depth) {
          const updated = touch(child, { depth });
          await repos.locations.put(updated);
          locations = withValue(locations, childId, updated);
        }
      }
      set({ locations });
    },

    async deleteLocation(id) {
      const { locations, lots } = get();
      const hasChildren = [...locations.values()].some((l) => l.parentId === id);
      const hasLots = [...lots.values()].some((l) => l.locationId === id);
      // No se borra en cascada: perder stock por un toque equivocado es peor que pedir que se vacíe primero.
      if (hasChildren || hasLots) throw new InventoryError('location-not-empty');
      for (const sm of get().stockMins.values()) {
        if (sm.locationId === id) await get().setStockMin(sm.itemId, id, null);
      }
      await repos.locations.remove(id);
      set({ locations: without(get().locations, id) });
    },

    async saveItem(i) {
      const saved = touch(i);
      await repos.items.put(saved);
      set({ items: withValue(get().items, saved.id, saved) });
      await syncAlertIndex();
    },

    async deleteItem(id) {
      await get().removeItemPhoto(id);
      for (const lot of get().lots.values()) if (lot.itemId === id) await repos.lots.remove(lot.id);
      for (const sm of get().stockMins.values()) if (sm.itemId === id) await repos.stockMins.remove(sm.id);
      await repos.items.remove(id);
      set({
        items: without(get().items, id),
        lots: new Map([...get().lots].filter(([, l]) => l.itemId !== id)),
        stockMins: new Map([...get().stockMins].filter(([, s]) => s.itemId !== id)),
      });
      await syncAlertIndex();
    },

    async saveLot(l) {
      const saved = touch(l);
      await repos.lots.put(saved);
      set({ lots: withValue(get().lots, saved.id, saved) });
      await syncAlertIndex();
    },

    async deleteLot(id) {
      await repos.lots.remove(id);
      set({ lots: without(get().lots, id) });
      await syncAlertIndex();
    },

    async setStockMin(itemId, locationId, minQuantity) {
      const existing = [...get().stockMins.values()].find((s) => s.itemId === itemId && s.locationId === locationId);
      if (minQuantity === null || minQuantity <= 0) {
        if (!existing) return;
        await repos.stockMins.remove(existing.id);
        set({ stockMins: without(get().stockMins, existing.id) });
        return;
      }
      const saved = existing
        ? touch(existing, { minQuantity })
        : newEntity<StockMin>({ itemId, locationId, minQuantity });
      await repos.stockMins.put(saved);
      set({ stockMins: withValue(get().stockMins, saved.id, saved) });
    },

    async setItemPhoto(itemId, image) {
      // Un artículo tiene una sola foto: la nueva reemplaza a la anterior.
      await get().removeItemPhoto(itemId);
      const attachment = newEntity<Attachment>({
        ownerType: 'item',
        ownerId: itemId,
        mime: image.mime,
        width: image.width,
        height: image.height,
        order: 0,
        sizeBytes: image.bytes.byteLength,
      });
      await blobStore.put(attachment.id, image.bytes);
      await repos.attachments.put(attachment);
      set({ attachments: withValue(get().attachments, attachment.id, attachment) });
    },

    async removeItemPhoto(itemId) {
      for (const a of get().attachments.values()) {
        if (a.ownerType !== 'item' || a.ownerId !== itemId) continue;
        await repos.attachments.remove(a.id);
        await blobStore.remove(a.id);
        set({ attachments: without(get().attachments, a.id) });
      }
    },
  };
});

/** Foto de un artículo, si tiene. */
export function itemPhoto(attachments: ById<Attachment>, itemId: Id): Attachment | undefined {
  for (const a of attachments.values()) if (a.ownerType === 'item' && a.ownerId === itemId) return a;
  return undefined;
}

/** Carga al desbloquear y descarta al bloquear. */
onSessionChange(() => {
  if (isUnlocked()) {
    if (!useInventory.getState().loaded) void useInventory.getState().load();
  } else {
    useInventory.getState().clear();
  }
});
