import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { HouseholdMember, Id, RecommendationRule } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { i18n } from '@/core/i18n/i18n';
import { categoryName } from '@/modules/inventory/domain/categories';
import { today } from '@/modules/inventory/domain/dates';
import { registerAlertSource, useInventory } from '@/modules/inventory/store';
import { recommendationShortages } from './calc';

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
}

export const useRecommendations = create<RecommendationsState>((set, get) => ({
  loaded: false,
  members: new Map(),
  rules: new Map(),

  async load() {
    const [members, rules] = await Promise.all([repos.householdMembers.loadAll(), repos.recommendationRules.loadAll()]);
    set({ loaded: true, members: new Map(members.map((m) => [m.id, m])), rules: new Map(rules.map((r) => [r.id, r])) });
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
