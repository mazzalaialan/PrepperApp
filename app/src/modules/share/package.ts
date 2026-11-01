import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { fromB64, sealedFromJson, sealedToJson, toB64, wrappedFromJson, wrappedToJson, type SealedJson, type WrappedJson } from '@/core/backup/backup';
import { generateDek, open, PBKDF2_ITERATIONS, seal, unwrapDek, wrapDek } from '@/core/crypto/crypto';
import { blobStore, repos } from '@/core/db/repository';
import type { Attachment, EmergencyContact, MedicalProfile, PersonalDocument } from '@/core/model/types';
import { useDocuments } from '@/modules/documents/store';
import { useContacts } from '@/modules/emergency/store';
import { useMedical } from '@/modules/firstAid/medicalStore';
import type { LocalData, MergeResult } from './merge';

/**
 * Paquete para compartir con un familiar (ARQUITECTURA §8.3): fichas médicas,
 * contactos y documentos, cifrados con una contraseña elegida para el envío
 * (no la del usuario). Del otro lado se mezclan sin borrar nada (ver merge.ts).
 */

export const SHARE_FORMAT = 'vikarg-share';
export const SHARE_VERSION = 1;
export const SHARE_EXTENSION = '.vikshare';

export interface ShareSelection {
  /** Fichas médicas con su foto y sus médicos o veterinarios. */
  medical: boolean;
  /** El resto de los contactos (policía, frecuencias, vecinos…). */
  contacts: boolean;
  /** Documentos con sus fotos. */
  documents: boolean;
}

export interface SharePayload {
  createdAt: string;
  /** Nombre de quien comparte (su ficha "Yo"), para mostrarlo al importar. */
  from: string | null;
  profiles: MedicalProfile[];
  contacts: EmergencyContact[];
  documents: PersonalDocument[];
  /** Fotos de fichas y páginas de documentos. */
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
  const [profiles, contacts, documents, attachments] = await Promise.all([
    repos.medicalProfiles.loadAll(),
    repos.contacts.loadAll(),
    repos.documents.loadAll(),
    repos.attachments.loadAll(),
  ]);
  const sharedProfiles = selection.medical ? profiles : [];
  const profileIds = new Set(sharedProfiles.map((p) => p.id));
  // Los médicos de las fichas viajan siempre con ellas; el resto de los contactos, si se eligieron.
  const doctorIds = new Set(sharedProfiles.flatMap((p) => (p.doctors ?? []).flatMap((d) => (d.contactId ? [d.contactId] : []))));
  const sharedContacts = contacts.filter((c) => selection.contacts || doctorIds.has(c.id));
  const sharedDocuments = (selection.documents ? documents : []).map((d) => ({
    ...d,
    // Sin las fichas, el documento llega como general.
    profileId: d.profileId && profileIds.has(d.profileId) ? d.profileId : null,
  }));
  const documentIds = new Set(sharedDocuments.map((d) => d.id));
  const sharedAttachments = attachments.filter(
    (a) => (a.ownerType === 'medicalProfile' && profileIds.has(a.ownerId)) || (a.ownerType === 'document' && documentIds.has(a.ownerId)),
  );
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
  const [profiles, contacts, documents, attachments] = await Promise.all([
    repos.medicalProfiles.loadAll(),
    repos.contacts.loadAll(),
    repos.documents.loadAll(),
    repos.attachments.loadAll(),
  ]);
  return { profiles, contacts, documents, attachments };
}

/** Guarda la mezcla (solo agrega o completa: nunca borra) y recarga las pantallas. */
export async function applyMerge(result: MergeResult, payload: SharePayload): Promise<void> {
  for (const c of result.writes.contacts) await repos.contacts.put(c);
  for (const p of result.writes.profiles) await repos.medicalProfiles.put(p);
  for (const d of result.writes.documents) await repos.documents.put(d);
  for (const { attachment, from } of result.writes.attachments) {
    const bytes = blobBytes(payload, from);
    if (!bytes) continue;
    await blobStore.put(attachment.id, bytes);
    await repos.attachments.put(attachment);
  }
  await Promise.all([useContacts.getState().load(), useMedical.getState().load(), useDocuments.getState().load()]);
}

export function shareFileName(date = new Date()): string {
  return `vikarg-familia-${date.toISOString().slice(0, 10)}${SHARE_EXTENSION}`;
}
