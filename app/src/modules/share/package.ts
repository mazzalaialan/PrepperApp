import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { fromB64, sealedFromJson, sealedToJson, toB64, wrappedFromJson, wrappedToJson, type SealedJson, type WrappedJson } from '@/core/backup/backup';
import { generateDek, open, PBKDF2_ITERATIONS, seal, unwrapDek, wrapDek } from '@/core/crypto/crypto';
import { blobStore, repos } from '@/core/db/repository';
import type { Attachment, Category, EmergencyContact, Item, Location, Lot, MedicalProfile, PersonalDocument, Route, StockMin, Waypoint } from '@/core/model/types';
import { useDocuments } from '@/modules/documents/store';
import { useContacts } from '@/modules/emergency/store';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { useInventory } from '@/modules/inventory/store';
import { useWaypoints } from '@/modules/waypoints/store';
import type { LocalData, MergeResult } from './merge';

/**
 * Paquete para compartir con un familiar (ARQUITECTURA §8.3): las secciones
 * elegidas (fichas, contactos, documentos, inventario, waypoints y rutas),
 * cifradas con una contraseña elegida para el envío (no la del usuario). Del
 * otro lado se mezclan sin borrar nada (ver merge.ts).
 */

export const SHARE_FORMAT = 'vikarg-share';
export const SHARE_VERSION = 1;
export const SHARE_EXTENSION = '.vikshare';

/**
 * Secciones que se pueden compartir. Cada módulo con datos del usuario suma la
 * suya (y su regla de mezcla en merge.ts): así la huerta y lo que venga se
 * comparten igual.
 */
export const SHARE_SECTIONS = ['medical', 'contacts', 'documents', 'inventory', 'waypoints'] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];
export type ShareSelection = Record<ShareSection, boolean>;

export interface InventoryShare {
  categories: Category[];
  locations: Location[];
  items: Item[];
  lots: Lot[];
  stockMins: StockMin[];
}

export interface SharePayload {
  createdAt: string;
  /** Nombre de quien comparte (su ficha "Yo"), para mostrarlo al importar. */
  from: string | null;
  /** Fichas médicas con su foto y sus médicos o veterinarios. */
  profiles: MedicalProfile[];
  contacts: EmergencyContact[];
  documents: PersonalDocument[];
  /** Ausentes si no se compartieron (y en archivos anteriores). */
  inventory?: InventoryShare;
  waypoints?: Waypoint[];
  routes?: Route[];
  /** Fotos de fichas, documentos, artículos, ubicaciones y waypoints. */
  attachments: Attachment[];
  /** Bytes de cada foto (por id de adjunto), en base64. */
  blobs: Record<string, string>;
}

interface ShareFile {
  format: typeof SHARE_FORMAT;
  version: number;
  key: WrappedJson;
  data: SealedJson;
}

export class ShareError extends Error {
  constructor(public readonly code: 'invalid-file' | 'newer-version' | 'wrong-password') {
    super(code);
    this.name = 'ShareError';
  }
}

/** Arma el contenido a compartir según lo elegido. */
export async function collectShare(selection: ShareSelection): Promise<SharePayload> {
  const local = await loadLocalData();
  const sharedProfiles = selection.medical ? local.profiles : [];
  const profileIds = new Set(sharedProfiles.map((p) => p.id));
  // Los médicos y la obra social de las fichas viajan siempre con ellas; el resto de los contactos, si se eligieron.
  const doctorIds = new Set(
    sharedProfiles.flatMap((p) => [...(p.doctors ?? []).map((d) => d.contactId), p.insurance?.contactId].filter((id): id is string => !!id)),
  );
  const sharedContacts = local.contacts.filter((c) => selection.contacts || doctorIds.has(c.id));
  const sharedDocuments = (selection.documents ? local.documents : []).map((d) => ({
    ...d,
    // Sin las fichas, el documento llega como general.
    profileId: d.profileId && profileIds.has(d.profileId) ? d.profileId : null,
  }));
  const waypoints = selection.waypoints ? local.waypoints : undefined;
  const waypointIds = new Set((waypoints ?? []).map((w) => w.id));
  const inventory: InventoryShare | undefined = selection.inventory
    ? {
        ...local.inventory,
        // Sin los waypoints, las ubicaciones llegan sin su punto en el mapa.
        locations: local.inventory.locations.map((l) => ({ ...l, waypointId: l.waypointId && waypointIds.has(l.waypointId) ? l.waypointId : null })),
      }
    : undefined;

  const owners = new Set<string>([
    ...profileIds,
    ...sharedDocuments.map((d) => d.id),
    ...(inventory ? [...inventory.items, ...inventory.locations].map((e) => e.id) : []),
    ...waypointIds,
  ]);
  const sharedAttachments = local.attachments.filter((a) => owners.has(a.ownerId));
  const blobs: Record<string, string> = {};
  for (const a of sharedAttachments) {
    const bytes = await blobStore.get(a.id);
    if (bytes) blobs[a.id] = toB64(bytes);
  }
  const me = sharedProfiles.find((p) => p.isMe);
  return {
    createdAt: new Date().toISOString(),
    from: me?.name ?? null,
    profiles: sharedProfiles,
    contacts: sharedContacts,
    documents: sharedDocuments,
    inventory,
    waypoints,
    routes: selection.waypoints ? local.routes : undefined,
    attachments: sharedAttachments,
    blobs,
  };
}
/** Cifra el contenido con la contraseña del envío. */
export async function encodeShare(payload: SharePayload, password: string, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array<ArrayBuffer>> {
  const key = await generateDek();
  const file: ShareFile = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    key: wrappedToJson(await wrapDek(key, password, iterations)),
    data: sealedToJson(await seal(key, gzipSync(strToU8(JSON.stringify(payload))) as Uint8Array<ArrayBuffer>)),
  };
  return strToU8(JSON.stringify(file)) as Uint8Array<ArrayBuffer>;
}

export async function decodeShare(bytes: Uint8Array, password: string): Promise<SharePayload> {
  let file: ShareFile;
  try {
    file = JSON.parse(strFromU8(bytes)) as ShareFile;
  } catch {
    throw new ShareError('invalid-file');
  }
  if (file?.format !== SHARE_FORMAT || !file.key || !file.data) throw new ShareError('invalid-file');
  if (file.version > SHARE_VERSION) throw new ShareError('newer-version');
  let key: CryptoKey;
  try {
    key = await unwrapDek(wrappedFromJson(file.key), password);
  } catch {
    throw new ShareError('wrong-password');
  }
  try {
    return JSON.parse(strFromU8(gunzipSync(await open(key, sealedFromJson(file.data))))) as SharePayload;
  } catch {
    throw new ShareError('invalid-file');
  }
}

export const blobBytes = (payload: SharePayload, id: string): Uint8Array<ArrayBuffer> | null => (payload.blobs[id] ? fromB64(payload.blobs[id]) : null);

/** Lo que ya hay en este dispositivo, para mezclar. */
export async function loadLocalData(): Promise<LocalData> {
  const [profiles, contacts, documents, attachments, categories, locations, items, lots, stockMins, waypoints, routes] = await Promise.all([
    repos.medicalProfiles.loadAll(),
    repos.contacts.loadAll(),
    repos.documents.loadAll(),
    repos.attachments.loadAll(),
    repos.categories.loadAll(),
    repos.locations.loadAll(),
    repos.items.loadAll(),
    repos.lots.loadAll(),
    repos.stockMins.loadAll(),
    repos.waypoints.loadAll(),
    repos.routes.loadAll(),
  ]);
  return { profiles, contacts, documents, attachments, inventory: { categories, locations, items, lots, stockMins }, waypoints, routes };
}

/** Guarda la mezcla (solo agrega o completa: nunca borra) y recarga las pantallas. */
export async function applyMerge(result: MergeResult, payload: SharePayload): Promise<void> {
  const w = result.writes;
  // Primero lo referenciado (waypoints, categorías, ubicaciones) y después lo que lo usa.
  for (const x of w.waypoints) await repos.waypoints.put(x);
  for (const x of w.routes) await repos.routes.put(x);
  for (const x of w.categories) await repos.categories.put(x);
  for (const x of w.locations) await repos.locations.put(x);
  for (const x of w.items) await repos.items.put(x);
  for (const x of w.lots) await repos.lots.put(x);
  for (const x of w.stockMins) await repos.stockMins.put(x);
  for (const x of w.contacts) await repos.contacts.put(x);
  for (const x of w.profiles) await repos.medicalProfiles.put(x);
  for (const x of w.documents) await repos.documents.put(x);
  for (const { attachment, from } of w.attachments) {
    const bytes = blobBytes(payload, from);
    if (!bytes) continue;
    await blobStore.put(attachment.id, bytes);
    await repos.attachments.put(attachment);
  }
  await Promise.all([
    useContacts.getState().load(),
    useMedical.getState().load(),
    useDocuments.getState().load(),
    useInventory.getState().load(),
    useWaypoints.getState().load(),
  ]);
}

export function shareFileName(date = new Date()): string {
  return `vikarg-familia-${date.toISOString().slice(0, 10)}${SHARE_EXTENSION}`;
}
