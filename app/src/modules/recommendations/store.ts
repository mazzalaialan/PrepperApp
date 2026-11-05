import { create } from 'zustand';
import { blobStore, repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { HouseholdMember, Id, RecommendationRule } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { i18n } from '@/core/i18n/i18n';
import { categoryName } from '@/modules/inventory/domain/categories';
import { today } from '@/modules/inventory/domain/dates';
import { registerAlertSource, useInventory } from '@/modules/inventory/store';
import { recommendationShortages } from './calc';
import { exampleRules } from './examples';

interface RecommendationsState {
  loaded: boolean;
  members: Map<Id, HouseholdMember>;
  rules: Map<Id, RecommendationRule>;
  load: () => Promise<void>;
  clear: () => void;
  saveMember: (m: HouseholdMember) => Promise<void>;
  deleteMember: (id: Id) => Promise<void>;
  saveRule: (r: RecommendationRule) => Promise<void>;
  deleteRule: (id: Id) => Promise<void>;
  /** Agrega las reglas de ejemplo que falten (no toca las que ya están). */
  addExamples: () => Promise<number>;
  /** Controla o deja de controlar varias reglas a la vez. */
  setActive: (ids: Id[], active: boolean) => Promise<void>;
}

const EXAMPLES_MARK = 'recommendation-examples';

export const useRecommendations = create<RecommendationsState>((set, get) => ({
  loaded: false,
  members: new Map(),
  rules: new Map(),

  async load() {
    const [members, rules] = await Promise.all([repos.householdMembers.loadAll(), repos.recommendationRules.loadAll()]);
    set({ loaded: true, members: new Map(members.map((m) => [m.id, m])), rules: new Map(rules.map((r) => [r.id, r])) });
    // La primera vez en cada bóveda se agregan las reglas de ejemplo (una sola vez: si se borran, no vuelven solas).
    if (!(await blobStore.get(EXAMPLES_MARK))) {
      await get().addExamples();
      await blobStore.put(EXAMPLES_MARK, new Uint8Array([1]));
    }
  },

  clear() {
    set({ loaded: false, members: new Map(), rules: new Map() });
  },

  async saveMember(m) {
    const saved = touch(m);
    await repos.householdMembers.put(saved);
    set({ members: new Map(get().members).set(saved.id, saved) });
  },

  async deleteMember(id) {
    // Las reglas conservan el id: una regla que era solo para este miembro queda en 0 personas,
    // en lugar de pasar a aplicar a todos (lista vacía) sin que nadie lo decida.
    await repos.householdMembers.remove(id);
    const members = new Map(get().members);
    members.delete(id);
    set({ members });
  },

  async saveRule(r) {
    const saved = touch(r);
    await repos.recommendationRules.put(saved);
    set({ rules: new Map(get().rules).set(saved.id, saved) });
  },

  async addExamples() {
    const current = get().rules;
    const missing = exampleRules((k) => i18n.t(k)).filter((r) => !current.has(r.id));
    for (const r of missing) await repos.recommendationRules.put(r);
    if (missing.length) {
      const rules = new Map(current);
      for (const r of missing) rules.set(r.id, r);
      set({ rules });
    }
    return missing.length;
  },

  async setActive(ids, active) {
    // Primero en pantalla (la casilla responde al instante) y después en la base.
    const rules = new Map(get().rules);
    const changed: RecommendationRule[] = [];
    for (const id of ids) {
      const r = rules.get(id);
      if (!r || (r.active !== false) === active) continue;
      const saved = touch({ ...r, active });
      rules.set(id, saved);
      changed.push(saved);
    }
    if (!changed.length) return;
    set({ rules });
    for (const r of changed) await repos.recommendationRules.put(r);
  },

  async deleteRule(id) {
    await repos.recommendationRules.remove(id);
    const rules = new Map(get().rules);
    rules.delete(id);
    set({ rules });
  },
}));

/** Cada cambio en el grupo o las reglas actualiza las alertas (y las notificaciones). */
useRecommendations.subscribe((state, prev) => {
  if (state.loaded && (state.rules !== prev.rules || state.members !== prev.members || !prev.loaded)) {
    void useInventory.getState().refreshAlertIndex();
  }
});

/** Faltantes de recomendaciones en el índice de alertas (se notifican como los vencimientos). */
registerAlertSource(() => {
  const { loaded, rules, members } = useRecommendations.getState();
  if (!loaded) return [];
  const { items, lots, categories } = useInventory.getState();
  const todayStr = today();
  return recommendationShortages([...rules.values()], [...members.values()], items, [...lots.values()]).map(({ rule, changedAt }) => {
    const category = categories.get(rule.categoryId ?? '');
    const name = rule.description || (rule.itemId ? items.get(rule.itemId)?.name : category && categoryName(category, (k) => i18n.t(k))) || '';
    const changedOn = today(new Date(changedAt));
    return {
      lotId: `rec:${rule.id}`,
      itemName: name.slice(0, 200),
      kind: 'shortage' as const,
      dueDate: null,
      notifyFrom: changedOn < todayStr ? changedOn : todayStr,
    };
  });
});

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useRecommendations.getState().loaded) void useRecommendations.getState().load();
  } else {
    useRecommendations.getState().clear();
  }
});
