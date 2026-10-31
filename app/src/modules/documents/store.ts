import { create } from 'zustand';
import { blobStore, repos } from '@/core/db/repository';
import type { CompressedImage } from '@/core/images/compress';
import { newEntity, touch } from '@/core/model/entity';
import type { Attachment, Id, PersonalDocument } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { registerAlertSource, useInventory } from '@/modules/inventory/store';
import { documentAlertRows } from './expiry';

type ById<T> = Map<Id, T>;

const toMap = <T extends { id: Id }>(xs: T[]): ById<T> => new Map(xs.map((x) => [x.id, x]));

interface DocumentsState {
  loaded: boolean;
  documents: ById<PersonalDocument>;
  /** Fotos de documentos (solo metadatos; los bytes se leen bajo demanda). */
  pages: ById<Attachment>;

  load: () => Promise<void>;
  clear: () => void;
  saveDocument: (d: PersonalDocument) => Promise<void>;
  deleteDocument: (id: Id) => Promise<void>;
  addPages: (documentId: Id, images: CompressedImage[]) => Promise<void>;
  removePage: (attachmentId: Id) => Promise<void>;
  /** Mueve una foto un lugar antes (-1) o después (+1). */
  movePage: (attachmentId: Id, delta: -1 | 1) => Promise<void>;
}

/** Fotos de un documento, en orden. */
export function documentPages(pages: ById<Attachment>, documentId: Id): Attachment[] {
  return [...pages.values()].filter((a) => a.ownerId === documentId).sort((a, b) => a.order - b.order);
}

/** Documentos personales (ARQUITECTURA §5.2): copias de DNI, escrituras, pólizas, con N fotos. */
export const useDocuments = create<DocumentsState>((set, get) => {
  async function putPage(a: Attachment) {
    const saved = touch(a);
    await repos.attachments.put(saved);
    set({ pages: new Map(get().pages).set(saved.id, saved) });
  }

  return {
    loaded: false,
    documents: new Map(),
    pages: new Map(),

    async load() {
      const [documents, attachments] = await Promise.all([repos.documents.loadAll(), repos.attachments.loadAll()]);
      set({ loaded: true, documents: toMap(documents), pages: toMap(attachments.filter((a) => a.ownerType === 'document')) });
    },

    clear() {
      set({ loaded: false, documents: new Map(), pages: new Map() });
    },

    async saveDocument(d) {
      const saved = touch(d);
      await repos.documents.put(saved);
      set({ documents: new Map(get().documents).set(saved.id, saved) });
    },

    async deleteDocument(id) {
      for (const page of documentPages(get().pages, id)) await get().removePage(page.id);
      await repos.documents.remove(id);
      const documents = new Map(get().documents);
      documents.delete(id);
      set({ documents });
    },

    async addPages(documentId, images) {
      let order = Math.max(-1, ...documentPages(get().pages, documentId).map((p) => p.order));
      for (const image of images) {
        const page = newEntity<Attachment>({
          ownerType: 'document',
          ownerId: documentId,
          mime: image.mime,
          width: image.width,
          height: image.height,
          order: ++order,
          sizeBytes: image.bytes.byteLength,
        });
        await blobStore.put(page.id, image.bytes);
        await putPage(page);
      }
    },

    async removePage(attachmentId) {
      await repos.attachments.remove(attachmentId);
      await blobStore.remove(attachmentId);
      const pages = new Map(get().pages);
      pages.delete(attachmentId);
      set({ pages });
    },

    async movePage(attachmentId, delta) {
      const page = get().pages.get(attachmentId);
      if (!page) return;
      const list = documentPages(get().pages, page.ownerId);
      const index = list.findIndex((p) => p.id === attachmentId);
      const other = list[index + delta];
      if (!other) return;
      await putPage({ ...page, order: other.order });
      await putPage({ ...other, order: page.order });
    },
  };
});

/** Cada cambio en los documentos actualiza las alertas (y las notificaciones). */
useDocuments.subscribe((state, prev) => {
  if (state.loaded && (state.documents !== prev.documents || !prev.loaded)) {
    void useInventory.getState().refreshAlertIndex();
  }
});

/** Vencimientos de documentos en el índice de alertas, con 60 días de anticipación. */
registerAlertSource(() => {
  const { loaded, documents } = useDocuments.getState();
  return loaded ? documentAlertRows(documents.values()) : [];
});

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useDocuments.getState().loaded) void useDocuments.getState().load();
  } else {
    useDocuments.getState().clear();
  }
});
