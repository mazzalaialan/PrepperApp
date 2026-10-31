import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { HouseholdMember, Id, RecommendationRule } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';

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

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useRecommendations.getState().loaded) void useRecommendations.getState().load();
  } else {
    useRecommendations.getState().clear();
  }
});
