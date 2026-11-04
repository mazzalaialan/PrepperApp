import { createHash } from 'node:crypto';
import { open, rm, type FileHandle } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bytesToHeader, Compression, findTile, zxyToTileId, type Entry, type Header } from 'pmtiles';

/**
 * Lectura y escritura de archivos PMTiles v3 (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
 *
 * El lector entrega las teselas tal como están guardadas (comprimidas con
 * gzip si el archivo lo indica), así el servidor las manda sin
 * descomprimirlas y el navegador las descomprime solo.
 */

const HEADER_BYTES = 127;
/** El encabezado y el directorio raíz tienen que entrar en los primeros 16 KB. */
const ROOT_MAX = 16_384 - HEADER_BYTES;

// ---------- Directorios ----------

function writeVarint(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function readVarint(buf: Uint8Array, pos: { i: number }): number {
  let n = 0;
  let mul = 1;
  for (;;) {
    const b = buf[pos.i++]!;
    n += (b & 0x7f) * mul;
    if (b < 0x80) return n;
    mul *= 0x80;
  }
}

export function serializeDirectory(entries: Entry[]): Buffer {
  const out: number[] = [];
  writeVarint(out, entries.length);
  let last = 0;
  for (const e of entries) {
    writeVarint(out, e.tileId - last);
    last = e.tileId;
  }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    writeVarint(out, i > 0 && prev && e.offset === prev.offset + prev.length ? 0 : e.offset + 1);
  });
  return gzipSync(Buffer.from(out));
}

export function deserializeDirectory(compressed: Uint8Array, gzip = true): Entry[] {
  const buf = gzip ? gunzipSync(compressed) : compressed;
  const pos = { i: 0 };
  const n = readVarint(buf, pos);
  const entries: Entry[] = [];
  let last = 0;
  for (let i = 0; i < n; i++) {
    last += readVarint(buf, pos);
    entries.push({ tileId: last, offset: 0, length: 0, runLength: 1 });
  }
  for (const e of entries) e.runLength = readVarint(buf, pos);
  for (const e of entries) e.length = readVarint(buf, pos);
  entries.forEach((e, i) => {
    const v = readVarint(buf, pos);
    const prev = entries[i - 1];
    e.offset = v === 0 && prev ? prev.offset + prev.length : v - 1;
  });
  return entries;
}

/** Si el directorio raíz no entra, las entradas van a directorios hoja y la raíz apunta a ellos. */
function buildDirectories(entries: Entry[]): { root: Buffer; leaves: Buffer } {
  const root = serializeDirectory(entries);
  if (root.length <= ROOT_MAX) return { root, leaves: Buffer.alloc(0) };
  for (let leafSize = 4096; ; leafSize = Math.ceil(leafSize * 1.2)) {
    const rootEntries: Entry[] = [];
    const parts: Buffer[] = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const leaf = serializeDirectory(entries.slice(i, i + leafSize));
      rootEntries.push({ tileId: entries[i]!.tileId, offset, length: leaf.length, runLength: 0 });
      parts.push(leaf);
      offset += leaf.length;
    }
    const r = serializeDirectory(rootEntries);
    if (r.length <= ROOT_MAX) return { root: r, leaves: Buffer.concat(parts) };
  }
}

// ---------- Escritura ----------

export interface ArchiveInfo {
  tileType: 'mvt' | 'png';
  /** Compresión de las teselas tal como se pasan a `add` (las PNG ya vienen comprimidas: 'none'). */
  tileCompression: 'gzip' | 'none';
  minZoom: number;
  maxZoom: number;
  bounds: { west: number; south: number; east: number; north: number };
  metadata: Record<string, unknown>;
}

const e7 = (deg: number) => Math.round(deg * 1e7);

/**
 * Arma un PMTiles a partir de teselas que llegan ordenadas por tileId
 * (`zxyToTileId`). Las teselas idénticas (mar, llanura) se guardan una
 * sola vez. Va escribiendo los datos a disco, así no hace falta tener todo
 * en memoria; al final reescribe el encabezado y los directorios.
 */
export class PmtilesWriter {
  private entries: Entry[] = [];
  private seen = new Map<string, { offset: number; length: number }>();
  private dataBytes = 0;
  private addressed = 0;
  private lastId = -1;
  private pending: Buffer[] = [];
  private pendingBytes = 0;

  private file: FileHandle;
  private dataPath: string;

  private constructor(file: FileHandle, dataPath: string) {
    this.file = file;
    this.dataPath = dataPath;
  }

  /** Los datos de las teselas van a un archivo temporal; `finish` arma el definitivo. */
  static async create(path: string): Promise<PmtilesWriter> {
    const dataPath = `${path}.data.tmp`;
    return new PmtilesWriter(await open(dataPath, 'w'), dataPath);
  }

  async add(tileId: number, data: Uint8Array): Promise<void> {
    if (tileId <= this.lastId) throw new Error('las teselas tienen que llegar ordenadas por tileId');
    this.lastId = tileId;
    this.addressed++;
    const key = createHash('sha1').update(data).digest('base64');
    const hit = this.seen.get(key);
    const last = this.entries.at(-1);
    if (hit) {
      // Misma tesela que la anterior y consecutiva: se alarga la corrida.
      if (last && last.offset === hit.offset && last.tileId + last.runLength === tileId) last.runLength++;
      else this.entries.push({ tileId, offset: hit.offset, length: hit.length, runLength: 1 });
      return;
    }
    const entry = { tileId, offset: this.dataBytes, length: data.byteLength, runLength: 1 };
    this.seen.set(key, { offset: entry.offset, length: entry.length });
    this.entries.push(entry);
    this.dataBytes += data.byteLength;
    this.pending.push(Buffer.from(data));
    this.pendingBytes += data.byteLength;
    if (this.pendingBytes > 8 * 1024 * 1024) await this.flush();
  }

  private async flush() {
    if (this.pending.length === 0) return;
    await this.file.write(Buffer.concat(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  async finish(path: string, info: ArchiveInfo): Promise<{ tiles: number; contents: number; bytes: number }> {
    await this.flush();
    await this.file.close();
    const { root, leaves } = buildDirectories(this.entries);
    const meta = gzipSync(Buffer.from(JSON.stringify(info.metadata)));
    const rootOffset = HEADER_BYTES;
    const metaOffset = rootOffset + root.length;
    const leafOffset = metaOffset + meta.length;
    const dataOffset = leafOffset + leaves.length;

    const h = Buffer.alloc(HEADER_BYTES);
    h.write('PMTiles', 0, 'ascii');
    h.writeUInt8(3, 7);
    const u64 = (v: number, at: number) => h.writeBigUInt64LE(BigInt(v), at);
    u64(rootOffset, 8);
    u64(root.length, 16);
    u64(metaOffset, 24);
    u64(meta.length, 32);
    u64(leafOffset, 40);
    u64(leaves.length, 48);
    u64(dataOffset, 56);
    u64(this.dataBytes, 64);
    u64(this.addressed, 72);
    u64(this.entries.length, 80);
    u64(this.seen.size, 88);
    h.writeUInt8(1, 96); // agrupado: los datos siguen el orden de tileId
    h.writeUInt8(Compression.Gzip, 97);
    h.writeUInt8(info.tileCompression === 'gzip' ? Compression.Gzip : Compression.None, 98);
    h.writeUInt8(info.tileType === 'mvt' ? 1 : 2, 99);
    h.writeUInt8(info.minZoom, 100);
    h.writeUInt8(info.maxZoom, 101);
    const { west, south, east, north } = info.bounds;
    h.writeInt32LE(e7(west), 102);
    h.writeInt32LE(e7(south), 106);
    h.writeInt32LE(e7(east), 110);
    h.writeInt32LE(e7(north), 114);
    h.writeUInt8(info.minZoom, 118);
    h.writeInt32LE(e7((west + east) / 2), 119);
    h.writeInt32LE(e7((south + north) / 2), 123);

    const out = await open(path, 'w');
    try {
      await out.write(Buffer.concat([h, root, meta, leaves]));
      const data = await open(this.dataPath, 'r');
      try {
        const chunk = Buffer.alloc(8 * 1024 * 1024);
        for (let pos = 0; ; ) {
          const { bytesRead } = await data.read(chunk, 0, chunk.length, pos);
          if (bytesRead === 0) break;
          await out.write(chunk.subarray(0, bytesRead));
          pos += bytesRead;
        }
      } finally {
        await data.close();
      }
    } finally {
      await out.close();
    }
    await rm(this.dataPath, { force: true });
    return { tiles: this.addressed, contents: this.seen.size, bytes: dataOffset + this.dataBytes };
  }
}

// ---------- Lectura ----------

export interface Tile {
  data: Buffer;
  /** 'gzip' si la tesela está guardada comprimida (se manda con Content-Encoding: gzip). */
  encoding: 'gzip' | null;
}

export class PmtilesReader {
  private leafCache = new Map<number, Entry[]>();

  private file: FileHandle;
  readonly header: Header;
  private root: Entry[];

  private constructor(file: FileHandle, header: Header, root: Entry[]) {
    this.file = file;
    this.header = header;
    this.root = root;
  }

  static async open(path: string): Promise<PmtilesReader> {
    const file = await open(path, 'r');
    try {
      const head = Buffer.alloc(16_384);
      const { bytesRead } = await file.read(head, 0, head.length, 0);
      if (bytesRead < HEADER_BYTES || head.toString('ascii', 0, 7) !== 'PMTiles') throw new Error(`no es un archivo PMTiles: ${path}`);
      const header = bytesToHeader(head.buffer.slice(head.byteOffset, head.byteOffset + HEADER_BYTES));
      if (header.internalCompression !== Compression.Gzip && header.internalCompression !== Compression.None) throw new Error(`compresión de directorios no soportada en ${path}`);
      const rootBytes = await readAt(file, header.rootDirectoryOffset, header.rootDirectoryLength);
      return new PmtilesReader(file, header, readDirectory(rootBytes, header.internalCompression));
    } catch (e) {
      await file.close();
      throw e;
    }
  }

  async close() {
    await this.file.close();
  }

  /** null si la tesela no está en el archivo (fuera de la zona o del rango de zoom). */
  async tile(z: number, x: number, y: number): Promise<Tile | null> {
    const h = this.header;
    if (z < h.minZoom || z > h.maxZoom || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return null;
    const id = zxyToTileId(z, x, y);
    let dir = this.root;
    for (let depth = 0; depth < 4; depth++) {
      const e = findTile(dir, id);
      if (!e) return null;
      if (e.runLength > 0) {
        const data = await readAt(this.file, h.tileDataOffset + e.offset, e.length);
        return { data, encoding: h.tileCompression === Compression.Gzip ? 'gzip' : null };
      }
      dir = await this.leaf(e.offset, e.length);
    }
    return null;
  }

  private async leaf(offset: number, length: number): Promise<Entry[]> {
    const hit = this.leafCache.get(offset);
    if (hit) {
      // Al final del mapa = la más reciente (se descarta la más vieja).
      this.leafCache.delete(offset);
      this.leafCache.set(offset, hit);
      return hit;
    }
    const entries = readDirectory(await readAt(this.file, this.header.leafDirectoryOffset + offset, length), this.header.internalCompression);
    this.leafCache.set(offset, entries);
    if (this.leafCache.size > 64) this.leafCache.delete(this.leafCache.keys().next().value!);
    return entries;
  }
}

function readDirectory(bytes: Buffer, compression: Compression): Entry[] {
  return deserializeDirectory(bytes, compression === Compression.Gzip);
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await file.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}
