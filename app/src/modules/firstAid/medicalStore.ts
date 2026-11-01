import { create } from 'zustand';
import { blobStore, repos } from '@/core/db/repository';
import type { CompressedImage } from '@/core/images/compress';
import { newEntity, touch } from '@/core/model/entity';
import type { Attachment, Id, MedicalProfile, PetHealth } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';

interface MedicalState {
  loaded: boolean;
  profiles: Map<Id, MedicalProfile>;
  /** Foto de cada persona, por id de ficha (solo metadatos). */
  photos: Map<Id, Attachment>;
  load: () => Promise<void>;
  clear: () => void;
  saveProfile: (p: MedicalProfile) => Promise<void>;
  deleteProfile: (id: Id) => Promise<void>;
  setPhoto: (profileId: Id, image: CompressedImage) => Promise<void>;
  removePhoto: (profileId: Id) => Promise<void>;
}

export const useMedical = create<MedicalState>((set, get) => ({
  loaded: false,
  profiles: new Map(),
  photos: new Map(),

  async load() {
    const [profiles, attachments] = await Promise.all([repos.medicalProfiles.loadAll(), repos.attachments.loadAll()]);
    set({
      loaded: true,
      profiles: new Map(profiles.map((p) => [p.id, normalizeProfile(p)])),
      photos: new Map(attachments.filter((a) => a.ownerType === 'medicalProfile').map((a) => [a.ownerId, a])),
    });
  },

  clear() {
    set({ loaded: false, profiles: new Map(), photos: new Map() });
  },

  async saveProfile(p) {
    const saved = touch(p);
    await repos.medicalProfiles.put(saved);
    set({ profiles: new Map(get().profiles).set(saved.id, saved) });
  },

  async deleteProfile(id) {
    await get().removePhoto(id);
    await repos.medicalProfiles.remove(id);
    const profiles = new Map(get().profiles);
    profiles.delete(id);
    set({ profiles });
  },

  async setPhoto(profileId, image) {
    // Una foto por persona: la nueva reemplaza a la anterior.
    await get().removePhoto(profileId);
    const photo = newEntity<Attachment>({
      ownerType: 'medicalProfile',
      ownerId: profileId,
      mime: image.mime,
      width: image.width,
      height: image.height,
      order: 0,
      sizeBytes: image.bytes.byteLength,
    });
    await blobStore.put(photo.id, image.bytes);
    await repos.attachments.put(photo);
    set({ photos: new Map(get().photos).set(profileId, photo) });
  },

  async removePhoto(profileId) {
    const photo = get().photos.get(profileId);
    if (!photo) return;
    await repos.attachments.remove(photo.id);
    await blobStore.remove(photo.id);
    const photos = new Map(get().photos);
    photos.delete(profileId);
    set({ photos });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useMedical.getState().loaded) void useMedical.getState().load();
  } else {
    useMedical.getState().clear();
  }
});

/** Las fichas anteriores a v0.7.2 eran todas de personas; las anteriores a 0.11 no tenían parentesco ni teléfono. */
export function normalizeProfile(p: MedicalProfile): MedicalProfile {
  return { ...p, kind: p.kind ?? 'person', pet: p.pet ?? null, relationship: p.relationship ?? '', phone: p.phone ?? '', inContacts: p.inContacts ?? true };
}

export function emptyPetHealth(): PetHealth {
  return { species: 'dog', speciesOther: '', lastRabiesVaccine: null, lastSpeciesVaccine: null, lastDeworming: null, neutered: null, lastFleaTreatment: null };
}

/** Meses completos entre una fecha y hoy (para "hace 3 meses"). */
export function monthsSince(day: string, today: string): number {
  const [y1, m1, d1] = day.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.max(0, (y2! - y1!) * 12 + (m2! - m1!) - (d2! < d1! ? 1 : 0));
}

/** Edad en años cumplidos a una fecha dada. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty! - by! - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
}
