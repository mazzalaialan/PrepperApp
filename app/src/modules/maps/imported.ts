import { FileSource, PMTiles, TileType, type Header } from 'pmtiles';
import { archiveCovers, type TileKind } from './sources';

/**
 * Mapas importados a mano: un archivo .pmtiles (por ejemplo el mismo que usa
 * el servidor, o uno armado con Planetiler) se copia al almacenamiento privado
 * del navegador (OPFS) y la app lo lee directo, sin conexión y sin descargar
 * zonas. Sirve para cargar una región entera de una vez o para un celular que
 * nunca va a tener internet (el archivo se pasa por cable o tarjeta).
 *
 * El mapa tiene que tener el esquema OpenMapTiles (el de OpenFreeMap y
 * Planetiler), que es el que sabe dibujar el estilo de la app; la elevación,
 * la codificación Terrarium (la de Terrain Tiles de AWS).
 */

const DIR = 'maps-imported';

export type ImportedKind = 'vector' | 'elevation';

export interface ImportedMap {
  /** Nombre del archivo: también es su identificador. */
  name: string;
  kind: ImportedKind;
  minZoom: number;
  maxZoom: number;
  /** [oeste, sur, este, norte] */
  bounds: [number, number, number, number];
  bytes: number;
  /** Cuándo se importó. */
  importedAt: string;
}

export type ImportError = 'notPmtiles' | 'unknownSchema' | 'mapboxTerrain' | 'unsupportedType' | 'noSpace' | 'noStorage';

export class ImportFailure extends Error {
  readonly reason: ImportError;
  constructor(reason: ImportError) {
    super(reason);
    this.reason = reason;
  }
}

/** Qué es el archivo según su encabezado y metadatos, o por qué no sirve. */
export function classify(header: Pick<Header, 'tileType'>, metadata: unknown): ImportedKind | ImportError {
  const meta = (metadata ?? {}) as { vector_layers?: { id?: string }[]; encoding?: string };
  if (header.tileType === TileType.Mvt) {
    const ids = new Set((meta.vector_layers ?? []).map((l) => l.id));
    // OpenMapTiles: "transportation" y "place" (Protomaps, en cambio, usa "roads" y "places").
    return ids.has('transportation') || ids.has('place') ? 'vector' : 'unknownSchema';
  }
  if (header.tileType === TileType.Png || header.tileType === TileType.Webp) {
    return meta.encoding === 'mapbox' ? 'mapboxTerrain' : 'elevation';
  }
  return 'unsupportedType';
}

/** El nombre con que se guarda (sin barras, que OPFS no acepta). */
export const storedName = (fileName: string) => fileName.replace(/[\\/]/g, '_').trim() || 'mapa.pmtiles';

async function dir(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator.storage?.getDirectory !== 'function') throw new ImportFailure('noStorage');
  return (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });
}

async function describe(file: File, name: string): Promise<{ info: ImportedMap; archive: PMTiles }> {
  const archive = new PMTiles(new FileSource(file));
  let header: Header;
  let metadata: unknown;
  try {
    header = await archive.getHeader();
    metadata = await archive.getMetadata();
  } catch {
    throw new ImportFailure('notPmtiles');
  }
  const kind = classify(header, metadata);
  if (kind !== 'vector' && kind !== 'elevation') throw new ImportFailure(kind);
  return {
    archive,
    info: {
      name,
      kind,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      bytes: file.size,
      importedAt: new Date(file.lastModified).toISOString(),
    },
  };
}

interface Opened {
  info: ImportedMap;
  archive: PMTiles;
}

let opened: Promise<Opened[]> | null = null;

/** Los mapas importados en este dispositivo (los de mayor zoom primero). */
function openAll(): Promise<Opened[]> {
  opened ??= (async () => {
    const list: Opened[] = [];
    try {
      const d = await dir();
      for await (const handle of (d as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        if (handle.kind !== 'file') continue;
        try {
          list.push(await describe(await (handle as FileSystemFileHandle).getFile(), handle.name));
        } catch {
          // Un archivo a medio copiar o dañado: se ignora (se puede borrar desde la lista).
        }
      }
    } catch {
      return [];
    }
    return list.sort((a, b) => b.info.maxZoom - a.info.maxZoom || a.info.name.localeCompare(b.info.name));
  })();
  return opened;
}

export async function listImported(): Promise<ImportedMap[]> {
  return (await openAll()).map((o) => o.info);
}

/**
 * Copia el archivo al dispositivo. Primero revisa que sirva (sin copiar
 * nada); si ya había uno con el mismo nombre, lo reemplaza.
 */
export async function importPmtiles(file: File, onProgress?: (copied: number, total: number) => void): Promise<ImportedMap> {
  const name = storedName(file.name);
  const { info } = await describe(file, name);
  const d = await dir();
  const estimate = await navigator.storage.estimate?.().catch(() => undefined);
  if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < file.size) throw new ImportFailure('noSpace');
  // Que el navegador no lo borre si se queda sin espacio.
  void navigator.storage.persist?.();
  const handle = await d.getFileHandle(name, { create: true });
  if (typeof handle.createWritable !== 'function') throw new ImportFailure('noStorage');
  opened = null;
  try {
    const out = await handle.createWritable();
    const reader = file.stream().getReader();
    let copied = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await out.write(value);
      copied += value.byteLength;
      onProgress?.(copied, file.size);
    }
    await out.close();
  } catch (e) {
    await d.removeEntry(name).catch(() => undefined);
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
    throw quota ? new ImportFailure('noSpace') : e;
  } finally {
    opened = null;
  }
  return info;
}

export async function removeImported(name: string): Promise<void> {
  opened = null;
  await (await dir()).removeEntry(name).catch(() => undefined);
  opened = null;
}

/**
 * Una tesela de los mapas importados, o `undefined` si ninguno la tiene (hay
 * que buscarla en lo descargado o en la red). `null`: el archivo cubre ese
 * lugar pero no tiene datos (mar abierto, por ejemplo).
 */
export async function importedTile(kind: TileKind, z: number, x: number, y: number): Promise<ArrayBuffer | null | undefined> {
  const want: ImportedKind = kind === 'vector' ? 'vector' : 'elevation';
  let covered = false;
  for (const o of await openAll()) {
    if (o.info.kind !== want || !archiveCovers({ ...o.info, updatedAt: o.info.importedAt }, z, x, y)) continue;
    covered = true;
    try {
      const tile = await o.archive.getZxy(z, x, y);
      if (tile) return tile.data;
    } catch {
      // Archivo que ya no se puede leer: se prueba con el siguiente.
    }
  }
  return covered && kind === 'vector' ? null : undefined;
}

/** Para las pruebas. */
export function resetImported() {
  opened = null;
}
