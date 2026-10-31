import { create } from 'zustand';
import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { EmergencyContact, Id } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';

interface ContactsState {
  loaded: boolean;
  contacts: Map<Id, EmergencyContact>;
  load: () => Promise<void>;
  clear: () => void;
  save: (c: EmergencyContact) => Promise<void>;
  remove: (id: Id) => Promise<void>;
}

/** Contactos de emergencia propios (cifrados, viajan en el backup). */
export const useContacts = create<ContactsState>((set, get) => ({
  loaded: false,
  contacts: new Map(),

  async load() {
    const all = await repos.contacts.loadAll();
    set({ loaded: true, contacts: new Map(all.map((c) => [c.id, c])) });
  },

  clear() {
    set({ loaded: false, contacts: new Map() });
  },

  async save(c) {
    const saved = touch(c);
    await repos.contacts.put(saved);
    set({ contacts: new Map(get().contacts).set(saved.id, saved) });
  },

  async remove(id) {
    await repos.contacts.remove(id);
    const contacts = new Map(get().contacts);
    contacts.delete(id);
    set({ contacts });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useContacts.getState().loaded) void useContacts.getState().load();
  } else {
    useContacts.getState().clear();
  }
});
