import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { Id, MedicalProfile } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';

interface MedicalState {
  loaded: boolean;
  profiles: Map<Id, MedicalProfile>;
  load: () => Promise<void>;
  clear: () => void;
  saveProfile: (p: MedicalProfile) => Promise<void>;
  deleteProfile: (id: Id) => Promise<void>;
}

export const useMedical = create<MedicalState>((set, get) => ({
  loaded: false,
  profiles: new Map(),

  async load() {
    const profiles = await repos.medicalProfiles.loadAll();
    set({ loaded: true, profiles: new Map(profiles.map((p) => [p.id, p])) });
  },

  clear() {
    set({ loaded: false, profiles: new Map() });
  },

  async saveProfile(p) {
    const saved = touch(p);
    await repos.medicalProfiles.put(saved);
    set({ profiles: new Map(get().profiles).set(saved.id, saved) });
  },

  async deleteProfile(id) {
    await repos.medicalProfiles.remove(id);
    const profiles = new Map(get().profiles);
    profiles.delete(id);
    set({ profiles });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useMedical.getState().loaded) void useMedical.getState().load();
  } else {
    useMedical.getState().clear();
  }
});

/** Edad en años cumplidos a una fecha dada. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty! - by! - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
}
