import { strFromU8, strToU8 } from 'fflate';
import { create } from 'zustand';
import { blobStore } from '@/core/db/repository';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { checkKey, deriveLibraryKey, installBook, LibraryError, loadCatalog, removeBookFiles, type InstalledBook, type LibraryBook, type LibraryCatalog } from './books';

const INDEX_ID = 'library-index';
const KEY_ID = 'library-key';

export interface DownloadProgress {
  /** Libro que se está bajando. */
  title: string;
  n: number;
  total: number;
  bytes: number;
  bookBytes: number;
}

interface LibraryState {
  catalog: LibraryCatalog | null;
  /** Ya se leyó qué libros hay en el dispositivo. */
  ready: boolean;
  offline: boolean;
  loading: boolean;
  installed: Map<string, InstalledBook>;
  selected: Set<string>;
  /** Clave de descifrado en memoria (se borra al bloquear). */
  key: CryptoKey | null;
  passphrase: string | null;
  progress: DownloadProgress | null;
  /** Errores por libro de la última descarga. */
  failures: Map<string, LibraryError['code']>;
  load: () => Promise<void>;
  clear: () => void;
  refresh: (serverUrl: string) => Promise<void>;
  toggle: (id: string) => void;
  setSelected: (ids: string[], on: boolean) => void;
  /** Comprueba la clave con el catálogo y, si se pide, la guarda cifrada en la bóveda. */
  unlockPrivate: (passphrase: string, remember: boolean) => Promise<boolean>;
  forgetKey: () => Promise<void>;
  download: (serverUrl: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

async function saveIndex(installed: Map<string, InstalledBook>) {
  await blobStore.put(INDEX_ID, strToU8(JSON.stringify([...installed.values()])) as Uint8Array<ArrayBuffer>);
}

/** Libros del catálogo por id (con su categoría). */
export function catalogBooks(c: LibraryCatalog | null): Map<string, { book: LibraryBook; categoryId: string }> {
  return new Map((c?.categories ?? []).flatMap((cat) => cat.books.map((b) => [b.id, { book: b, categoryId: cat.id }] as const)));
}

/** Biblioteca: catálogo del servidor, libros bajados (índice cifrado en la bóveda) y descargas. */
export const useLibrary = create<LibraryState>((set, get) => ({
  catalog: null,
  ready: false,
  offline: false,
  loading: false,
  installed: new Map(),
  selected: new Set(),
  key: null,
  passphrase: null,
  progress: null,
  failures: new Map(),

  async load() {
    const idx = await blobStore.get(INDEX_ID);
    const list = idx ? (JSON.parse(strFromU8(idx)) as InstalledBook[]) : [];
    set({ installed: new Map(list.map((b) => [b.id, b])), ready: true });
    const saved = await blobStore.get(KEY_ID);
    if (saved) set({ passphrase: strFromU8(saved) });
  },

  clear() {
    set({ ready: false, installed: new Map(), selected: new Set(), key: null, passphrase: null, progress: null, failures: new Map() });
  },

  async refresh(serverUrl) {
    set({ loading: true });
    try {
      const r = await loadCatalog(serverUrl);
      set({ catalog: r?.catalog ?? null, offline: r?.offline ?? true });
      // Clave recordada: se deriva cuando ya está el catálogo (la sal viene con él).
      const { passphrase, key } = get();
      if (r?.catalog.encryption && passphrase && !key) {
        const k = await deriveLibraryKey(passphrase, r.catalog.encryption);
        if (await checkKey(k, r.catalog)) set({ key: k });
      }
    } finally {
      set({ loading: false });
    }
  },

  toggle(id) {
    const selected = new Set(get().selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selected });
  },

  setSelected(ids, on) {
    const selected = new Set(get().selected);
    for (const id of ids) {
      if (on) selected.add(id);
      else selected.delete(id);
    }
    set({ selected });
  },

  async unlockPrivate(passphrase, remember) {
    const catalog = get().catalog;
    if (!catalog?.encryption) return false;
    const key = await deriveLibraryKey(passphrase, catalog.encryption);
    if (!(await checkKey(key, catalog))) return false;
    set({ key, passphrase });
    if (remember) await blobStore.put(KEY_ID, strToU8(passphrase) as Uint8Array<ArrayBuffer>);
    return true;
  },

  async forgetKey() {
    await blobStore.remove(KEY_ID);
    set({ key: null, passphrase: null });
  },

  async download(serverUrl) {
    const books = catalogBooks(get().catalog);
    const ids = [...get().selected].filter((id) => books.has(id));
    const failures = new Map<string, LibraryError['code']>();
    void navigator.storage?.persist?.();
    for (const [n, id] of ids.entries()) {
      const { book, categoryId } = books.get(id)!;
      set({ progress: { title: book.title, n: n + 1, total: ids.length, bytes: 0, bookBytes: book.bytes } });
      try {
        const inst = await installBook(serverUrl, book, categoryId, {
          key: get().key ?? undefined,
          passphrase: get().passphrase ?? undefined,
          onProgress: (bytes) => set({ progress: { title: book.title, n: n + 1, total: ids.length, bytes, bookBytes: book.bytes } }),
        });
        const installed = new Map(get().installed).set(id, inst);
        set({ installed });
        await saveIndex(installed);
        const selected = new Set(get().selected);
        selected.delete(id);
        set({ selected });
      } catch (e) {
        failures.set(id, e instanceof LibraryError ? e.code : 'download');
        // Sin conexión no tiene sentido seguir con los demás.
        if (e instanceof LibraryError && e.code === 'offline') break;
      }
    }
    set({ progress: null, failures });
  },

  async remove(id) {
    await removeBookFiles(id);
    const installed = new Map(get().installed);
    installed.delete(id);
    set({ installed });
    await saveIndex(installed);
  },
}));

onSessionChange(() => {
  if (isUnlocked()) void useLibrary.getState().load();
  else useLibrary.getState().clear();
});
