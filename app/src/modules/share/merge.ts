import { v7 as uuidv7 } from 'uuid';
import { nowIso } from '@/core/model/entity';
import type { Attachment, Doctor, EmergencyContact, EmergencyContactRef, Id, MedicalProfile, PersonalDocument, PetHealth } from '@/core/model/types';
import { emptyInsurance, emptyPetHealth, normalizeProfile } from '@/modules/firstAid/medicalStore';
import type { SharePayload } from './package';

/**
 * Mezcla lo que comparte un familiar con lo que ya hay (ARQUITECTURA §8.3):
 * nunca borra; agrega lo que falta; completa datos vacíos; y si un dato está
 * cargado distinto pregunta (por defecto queda el propio). Lo que depende de
 * quién mira (parentesco, "Yo", mostrar en contactos, orden) no viaja.
 */

export interface LocalData {
  profiles: MedicalProfile[];
  contacts: EmergencyContact[];
  documents: PersonalDocument[];
  attachments: Attachment[];
}

/** Datos sueltos de una ficha que pueden estar cargados distinto. */
export const CONFLICT_FIELDS = [
  'birthDate',
  'bloodType',
  'allergies',
  'conditions',
  'notes',
  'phone',
  'insurance.name',
  'insurance.plan',
  'insurance.memberNumber',
  'insurance.emergencyPhone',
  'pet.species',
  'pet.speciesOther',
  'pet.neutered',
] as const;
export type ConflictField = (typeof CONFLICT_FIELDS)[number];

export interface Conflict {
  /** `${id de la ficha que llega}:${campo}`: lo que se marca en `useTheirs`. */
  key: string;
  field: ConflictField;
  mine: string;
  theirs: string;
}

export interface MergeDecisions {
  /** Fichas que llegan y NO son la misma persona que la parecida que ya hay (por id de la que llega). */
  separate: Set<Id>;
  /** Conflictos en los que se elige el dato que llega. */
  useTheirs: Set<string>;
}

export interface ProfileMatch {
  incoming: MedicalProfile;
  local: MedicalProfile;
  /** Misma ficha compartida antes (mismo id): no se puede separar. */
  sameRecord: boolean;
  /** Datos que se completan o agregan (medicamentos, médicos, teléfonos…). */
  additions: number;
  conflicts: Conflict[];
}

export interface MergeResult {
  newProfiles: MedicalProfile[];
  matches: ProfileMatch[];
  newContacts: number;
  updatedContacts: number;
  newDocuments: number;
  existingDocuments: number;
  writes: {
    profiles: MedicalProfile[];
    contacts: EmergencyContact[];
    documents: PersonalDocument[];
    /** Adjuntos nuevos y de qué adjunto del paquete salen sus bytes. */
    attachments: { attachment: Attachment; from: Id }[];
  };
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
/**
 * Clave para comparar teléfonos: los últimos 8 dígitos ("011 4222-3333" = "4222 3333";
 * "Escuela N.º 5 (4222 3333)" = "Escuela 4222-3333"). Vacía si no parece un teléfono.
 */
const digits = (s: string | null | undefined) => {
  const all = (s ?? '').replace(/\D/g, '');
  return all.length >= 6 ? all.slice(-8) : '';
};

function getField(p: MedicalProfile, f: ConflictField): string {
  const pet = p.pet ?? emptyPetHealth();
  const ins = p.insurance ?? emptyInsurance();
  switch (f) {
    case 'birthDate':
      return p.birthDate ?? '';
    case 'insurance.name':
      return ins.name;
    case 'insurance.plan':
      return ins.plan;
    case 'insurance.memberNumber':
      return ins.memberNumber;
    case 'insurance.emergencyPhone':
      return ins.emergencyPhone;
    case 'pet.species':
      return p.pet ? pet.species : '';
    case 'pet.speciesOther':
      return pet.speciesOther;
    case 'pet.neutered':
      return pet.neutered === null ? '' : String(pet.neutered);
    default:
      return (p[f] as string | undefined) ?? '';
  }
}

function setField(p: MedicalProfile, f: ConflictField, value: string): MedicalProfile {
  if (f === 'birthDate') return { ...p, birthDate: value || null };
  if (f.startsWith('insurance.')) return { ...p, insurance: { ...(p.insurance ?? emptyInsurance()), [f.slice(10)]: value } };
  if (f.startsWith('pet.')) {
    const pet: PetHealth = { ...(p.pet ?? emptyPetHealth()) };
    if (f === 'pet.species') pet.species = value as PetHealth['species'];
    else if (f === 'pet.speciesOther') pet.speciesOther = value;
    else pet.neutered = value === '' ? null : value === 'true';
    return { ...p, pet };
  }
  return { ...p, [f]: value };
}

const PET_DATES = ['lastRabiesVaccine', 'lastSpeciesVaccine', 'lastDeworming', 'lastFleaTreatment'] as const;

/** ¿Es la misma persona? Mismo nombre y especie, y la fecha de nacimiento no se contradice. */
function samePerson(a: MedicalProfile, b: MedicalProfile): boolean {
  return a.kind === b.kind && norm(a.name) === norm(b.name) && (!a.birthDate || !b.birthDate || a.birthDate === b.birthDate);
}

export function mergeShare(local: LocalData, incoming: SharePayload, decisions: MergeDecisions): MergeResult {
  const localIds = new Set([...local.profiles, ...local.contacts, ...local.documents, ...local.attachments].map((e) => e.id));
  const freshId = (id: Id) => (localIds.has(id) ? uuidv7() : id);
  const now = nowIso();

  // ---------- contactos ----------
  const contactMap = new Map<Id, Id>();
  const contactWrites: EmergencyContact[] = [];
  let newContacts = 0;
  let updatedContacts = 0;
  const localContacts = [...local.contacts];
  for (const c of incoming.contacts) {
    const phones = [digits(c.phone), digits(c.phone2)].filter(Boolean);
    const found =
      localContacts.find((l) => l.id === c.id) ??
      (phones.length ? localContacts.find((l) => [digits(l.phone), digits(l.phone2)].some((d) => phones.includes(d))) : undefined) ??
      (!phones.length ? localContacts.find((l) => l.kind === c.kind && norm(l.name) === norm(c.name)) : undefined);
    if (found) {
      contactMap.set(c.id, found.id);
      // Solo se completan los datos que faltan; el resto queda como está.
      const filled: EmergencyContact = { ...found };
      for (const k of ['phone', 'phone2', 'address', 'notes', 'specialty', 'frequency', 'tone'] as const) {
        if (!filled[k]?.trim() && c[k]?.trim()) filled[k] = c[k];
      }
      if (filled.lat === null && c.lat !== null) Object.assign(filled, { lat: c.lat, lon: c.lon });
      if (JSON.stringify(filled) !== JSON.stringify(found)) {
        contactWrites.push({ ...filled, updatedAt: now });
        updatedContacts++;
      }
    } else {
      const id = freshId(c.id);
      contactMap.set(c.id, id);
      const created = { ...c, id, updatedAt: now, deletedAt: null };
      contactWrites.push(created);
      localContacts.push(created);
      newContacts++;
    }
  }

  // ---------- fichas: quién es quién ----------
  const profileMap = new Map<Id, Id>();
  const pairs: { incoming: MedicalProfile; local: MedicalProfile; sameRecord: boolean }[] = [];
  const taken = new Set<Id>();
  const incomingProfiles = incoming.profiles.map(normalizeProfile);
  for (const p of incomingProfiles) {
    const byId = local.profiles.find((l) => l.id === p.id);
    const similar = byId ?? (decisions.separate.has(p.id) ? undefined : local.profiles.find((l) => !taken.has(l.id) && samePerson(l, p)));
    if (similar && !taken.has(similar.id)) {
      taken.add(similar.id);
      profileMap.set(p.id, similar.id);
      pairs.push({ incoming: p, local: normalizeProfile(similar), sameRecord: !!byId });
    } else {
      profileMap.set(p.id, freshId(p.id));
    }
  }

  const mapDoctor = (d: Doctor): Doctor => ({ ...d, contactId: d.contactId ? (contactMap.get(d.contactId) ?? null) : null });
  const mapContactRef = (c: EmergencyContactRef): EmergencyContactRef | null =>
    c.profileId ? (profileMap.has(c.profileId) ? { ...c, profileId: profileMap.get(c.profileId)! } : null) : c;

  const profileWrites: MedicalProfile[] = [];
  const attachmentWrites: { attachment: Attachment; from: Id }[] = [];
  const photoOf = (ownerId: Id, list: Attachment[]) => list.find((a) => a.ownerType === 'medicalProfile' && a.ownerId === ownerId);
  const copyPhoto = (fromOwner: Id, toOwner: Id) => {
    const photo = photoOf(fromOwner, incoming.attachments);
    if (photo && incoming.blobs[photo.id]) attachmentWrites.push({ attachment: { ...photo, id: freshId(photo.id), ownerId: toOwner, updatedAt: now }, from: photo.id });
  };

  // Nuevas: llegan sin lo que depende de quién mira.
  const newProfiles: MedicalProfile[] = [];
  for (const p of incomingProfiles) {
    if (pairs.some((m) => m.incoming.id === p.id)) continue;
    const id = profileMap.get(p.id)!;
    const created: MedicalProfile = {
      ...p,
      id,
      relationship: '',
      isMe: false,
      inContacts: true,
      doctors: (p.doctors ?? []).map(mapDoctor),
      emergencyContacts: (p.emergencyContacts ?? []).flatMap((c) => mapContactRef(c) ?? []),
      updatedAt: now,
      deletedAt: null,
    };
    newProfiles.push(created);
    profileWrites.push(created);
    copyPhoto(p.id, id);
  }

  // Las que ya están: se completan y se preguntan las diferencias.
  const matches: ProfileMatch[] = [];
  for (const { incoming: p, local: l, sameRecord } of pairs) {
    let merged: MedicalProfile = { ...l };
    let additions = 0;
    const conflicts: Conflict[] = [];
    for (const f of CONFLICT_FIELDS) {
      if (f.startsWith('pet.') !== (l.kind === 'pet')) continue;
      if (f.startsWith('insurance.') && l.kind === 'pet') continue;
      const mine = getField(l, f);
      const theirs = getField(p, f);
      if (!theirs.trim() || norm(mine) === norm(theirs)) continue;
      if (!mine.trim()) {
        merged = setField(merged, f, theirs);
        additions++;
        continue;
      }
      const key = `${p.id}:${f}`;
      conflicts.push({ key, field: f, mine, theirs });
      if (decisions.useTheirs.has(key)) merged = setField(merged, f, theirs);
    }
    // Vacunas, desparasitación y pipeta: la fecha más reciente.
    if (l.kind === 'pet' && p.pet) {
      const pet = { ...(merged.pet ?? emptyPetHealth()) };
      for (const k of PET_DATES) {
        if (p.pet[k] && (!pet[k] || p.pet[k]! > pet[k]!)) {
          pet[k] = p.pet[k];
          additions++;
        }
      }
      merged = { ...merged, pet };
    }
    // Listas: se suman los que faltan.
    const meds = [...merged.medications];
    for (const m of p.medications) {
      if (!meds.some((x) => norm(x.name) === norm(m.name))) {
        meds.push(m);
        additions++;
      }
    }
    const doctors = [...(merged.doctors ?? [])];
    for (const d of (p.doctors ?? []).map(mapDoctor)) {
      const dup = doctors.some(
        (x) => (d.contactId && x.contactId === d.contactId) || (!!digits(d.phone) && digits(x.phone) === digits(d.phone)) || (!d.phone && norm(x.name) === norm(d.name)),
      );
      if (!dup) {
        doctors.push(d);
        additions++;
      }
    }
    const contacts = [...(merged.emergencyContacts ?? [])];
    for (const c of (p.emergencyContacts ?? []).flatMap((x) => mapContactRef(x) ?? [])) {
      if (c.profileId === l.id) continue;
      const dup = contacts.some((x) =>
        c.profileId ? x.profileId === c.profileId : !x.profileId && (digits(c.text) ? digits(x.text) === digits(c.text) : norm(x.text) === norm(c.text)),
      );
      if (!dup) {
        contacts.push(c);
        additions++;
      }
    }
    merged = { ...merged, medications: meds, doctors, emergencyContacts: contacts };
    if (!photoOf(l.id, local.attachments) && photoOf(p.id, incoming.attachments)) {
      copyPhoto(p.id, l.id);
      additions++;
    }
    if (JSON.stringify(merged) !== JSON.stringify(l)) profileWrites.push({ ...merged, updatedAt: now });
    matches.push({ incoming: p, local: l, sameRecord, additions, conflicts });
  }

  // ---------- documentos: los que no están se agregan ----------
  const documentWrites: PersonalDocument[] = [];
  let existingDocuments = 0;
  for (const d of incoming.documents) {
    if (local.documents.some((x) => x.id === d.id)) {
      existingDocuments++;
      continue;
    }
    const id = freshId(d.id);
    const { order: _order, ...rest } = d;
    documentWrites.push({ ...rest, id, profileId: d.profileId ? (profileMap.get(d.profileId) ?? null) : null, updatedAt: now, deletedAt: null });
    for (const a of incoming.attachments) {
      if (a.ownerType === 'document' && a.ownerId === d.id && incoming.blobs[a.id]) {
        attachmentWrites.push({ attachment: { ...a, id: freshId(a.id), ownerId: id, updatedAt: now }, from: a.id });
      }
    }
  }

  return {
    newProfiles,
    matches,
    newContacts,
    updatedContacts,
    newDocuments: documentWrites.length,
    existingDocuments,
    writes: { profiles: profileWrites, contacts: contactWrites, documents: documentWrites, attachments: attachmentWrites },
  };
}
