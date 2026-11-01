import { v7 as uuidv7 } from 'uuid';
import { nowIso } from '@/core/model/entity';
import type {
  Attachment,
  Category,
  Doctor,
  EmergencyContact,
  EmergencyContactRef,
  Id,
  Item,
  Location,
  Lot,
  MedicalProfile,
  PersonalDocument,
  PetHealth,
  Route,
  StockMin,
  Waypoint,
} from '@/core/model/types';
import { emptyInsurance, emptyPetHealth, normalizeProfile } from '@/modules/firstAid/medicalStore';
import type { InventoryShare, SharePayload } from './package';

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
  inventory: InventoryShare;
  waypoints: Waypoint[];
  routes: Route[];
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
  /** Ausentes si el archivo no trae esa sección. */
  inventory: { items: number; lots: number; locations: number; categories: number } | null;
  waypoints: { waypoints: number; routes: number } | null;
  writes: {
    profiles: MedicalProfile[];
    contacts: EmergencyContact[];
    documents: PersonalDocument[];
    categories: Category[];
    locations: Location[];
    items: Item[];
    lots: Lot[];
    stockMins: StockMin[];
    waypoints: Waypoint[];
    routes: Route[];
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

/** Distancia aproximada en metros (para reconocer el mismo waypoint). */
function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

const PET_DATES =['lastRabiesVaccine', 'lastSpeciesVaccine', 'lastDeworming', 'lastFleaTreatment'] as const;

/** ¿Es la misma persona? Mismo nombre y especie, y la fecha de nacimiento no se contradice. */
function samePerson(a: MedicalProfile, b: MedicalProfile): boolean {
  return a.kind === b.kind && norm(a.name) === norm(b.name) && (!a.birthDate || !b.birthDate || a.birthDate === b.birthDate);
}

export function mergeShare(local: LocalData, incoming: SharePayload, decisions: MergeDecisions): MergeResult {
  const inv = local.inventory;
  const localIds = new Set(
    [
      ...local.profiles,
      ...local.contacts,
      ...local.documents,
      ...local.attachments,
      ...inv.categories,
      ...inv.locations,
      ...inv.items,
      ...inv.lots,
      ...inv.stockMins,
      ...local.waypoints,
      ...local.routes,
    ].map((e) => e.id),
  );
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

  /** Fotos de lo que se agrega (artículos, ubicaciones, waypoints): las del paquete, con el dueño nuevo. */
  const copyPhotos = (ownerType: Attachment['ownerType'], fromOwner: Id, toOwner: Id) => {
    for (const a of incoming.attachments) {
      if (a.ownerType === ownerType && a.ownerId === fromOwner && incoming.blobs[a.id]) {
        attachmentWrites.push({ attachment: { ...a, id: freshId(a.id), ownerId: toOwner, updatedAt: now }, from: a.id });
      }
    }
  };

  // ---------- waypoints y rutas ----------
  const waypointMap = new Map<Id, Id>();
  const waypointWrites: Waypoint[] = [];
  const routeWrites: Route[] = [];
  let waypointSummary: MergeResult['waypoints'] = null;
  if (incoming.waypoints) {
    for (const w of incoming.waypoints) {
      // El mismo punto: mismo id, o mismo nombre a menos de 30 m.
      const found = local.waypoints.find((l) => l.id === w.id) ?? local.waypoints.find((l) => norm(l.name) === norm(w.name) && metersBetween(l, w) < 30);
      if (found) {
        waypointMap.set(w.id, found.id);
        continue;
      }
      const id = freshId(w.id);
      waypointMap.set(w.id, id);
      waypointWrites.push({ ...w, id, updatedAt: now, deletedAt: null });
      copyPhotos('waypoint', w.id, id);
    }
    for (const r of incoming.routes ?? []) {
      if (local.routes.some((l) => l.id === r.id || norm(l.name) === norm(r.name))) continue;
      const waypointIds = r.waypointIds.flatMap((id) => (waypointMap.has(id) ? [waypointMap.get(id)!] : []));
      if (waypointIds.length < 2) continue;
      routeWrites.push({ ...r, id: freshId(r.id), waypointIds, updatedAt: now, deletedAt: null });
    }
    waypointSummary = { waypoints: waypointWrites.length, routes: routeWrites.length };
  }

  // ---------- inventario ----------
  const categoryWrites: Category[] = [];
  const locationWrites: Location[] = [];
  const itemWrites: Item[] = [];
  const lotWrites: Lot[] = [];
  const stockMinWrites: StockMin[] = [];
  let inventorySummary: MergeResult['inventory'] = null;
  if (incoming.inventory) {
    const theirs = incoming.inventory;
    // Categorías: las del sistema tienen el mismo id en todos lados; las propias, por nombre.
    const categoryMap = new Map<Id, Id>();
    for (const c of theirs.categories) {
      const found = inv.categories.find((l) => l.id === c.id) ?? (c.isSystem ? undefined : inv.categories.find((l) => !l.isSystem && norm(l.name) === norm(c.name)));
      if (found) categoryMap.set(c.id, found.id);
      else if (!c.isSystem) {
        const id = freshId(c.id);
        categoryMap.set(c.id, id);
        categoryWrites.push({ ...c, id, updatedAt: now, deletedAt: null });
      }
    }
    // Ubicaciones: de arriba hacia abajo, la misma si se llama igual dentro de la misma ubicación.
    const locationMap = new Map<Id, Id>();
    const allLocations = [...inv.locations];
    for (const l of [...theirs.locations].sort((a, b) => a.depth - b.depth)) {
      const parentId = l.parentId ? (locationMap.get(l.parentId) ?? null) : null;
      if (l.parentId && !parentId) continue;
      const found = allLocations.find((x) => x.id === l.id) ?? allLocations.find((x) => x.parentId === parentId && norm(x.name) === norm(l.name));
      if (found) {
        locationMap.set(l.id, found.id);
        continue;
      }
      const id = freshId(l.id);
      locationMap.set(l.id, id);
      const created = { ...l, id, parentId, waypointId: l.waypointId ? (waypointMap.get(l.waypointId) ?? null) : null, updatedAt: now, deletedAt: null };
      locationWrites.push(created);
      allLocations.push(created);
      copyPhotos('location', l.id, id);
    }
    // Artículos: el mismo si tiene el mismo id o se llama igual en la misma categoría; se completan sus datos vacíos.
    const itemMap = new Map<Id, Id>();
    for (const it of theirs.items) {
      const categoryId = categoryMap.get(it.categoryId);
      if (!categoryId) continue;
      const found = inv.items.find((x) => x.id === it.id) ?? inv.items.find((x) => x.categoryId === categoryId && norm(x.name) === norm(it.name));
      if (found) {
        itemMap.set(it.id, found.id);
        const filled: Item = { ...found };
        if (!filled.barcode && it.barcode) filled.barcode = it.barcode;
        if (!filled.notes.trim() && it.notes.trim()) filled.notes = it.notes;
        if (!filled.unit.trim() && it.unit.trim()) filled.unit = it.unit;
        if (filled.weightGrams === null && it.weightGrams !== null) filled.weightGrams = it.weightGrams;
        if (JSON.stringify(filled) !== JSON.stringify(found)) itemWrites.push({ ...filled, updatedAt: now });
        continue;
      }
      const id = freshId(it.id);
      itemMap.set(it.id, id);
      itemWrites.push({ ...it, id, categoryId, updatedAt: now, deletedAt: null });
      copyPhotos('item', it.id, id);
    }
    // Lotes: se agregan los que no están (por id: recibir dos veces no duplica el stock).
    for (const lot of theirs.lots) {
      const itemId = itemMap.get(lot.itemId);
      const locationId = locationMap.get(lot.locationId);
      if (!itemId || !locationId || inv.lots.some((x) => x.id === lot.id)) continue;
      lotWrites.push({ ...lot, id: freshId(lot.id), itemId, locationId, updatedAt: now, deletedAt: null });
    }
    // Mínimos: los que faltan para ese artículo y ubicación.
    for (const m of theirs.stockMins) {
      const itemId = itemMap.get(m.itemId);
      const locationId = locationMap.get(m.locationId);
      if (!itemId || !locationId || inv.stockMins.some((x) => x.id === m.id || (x.itemId === itemId && x.locationId === locationId))) continue;
      stockMinWrites.push({ ...m, id: freshId(m.id), itemId, locationId, updatedAt: now, deletedAt: null });
    }
    inventorySummary = {
      items: itemWrites.filter((x) => !inv.items.some((l) => l.id === x.id)).length,
      lots: lotWrites.length,
      locations: locationWrites.length,
      categories: categoryWrites.length,
    };
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
    inventory: inventorySummary,
    waypoints: waypointSummary,
    writes: {
      profiles: profileWrites,
      contacts: contactWrites,
      documents: documentWrites,
      categories: categoryWrites,
      locations: locationWrites,
      items: itemWrites,
      lots: lotWrites,
      stockMins: stockMinWrites,
      waypoints: waypointWrites,
      routes: routeWrites,
      attachments: attachmentWrites,
    },
  };
}
