import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parentPort, Worker, workerData } from 'node:worker_threads';
import { glmReady, readGlmFile } from './glm.ts';

/**
 * Worker de la lectura parcial (ver partial.ts). h5wasm (Emscripten en Node)
 * lee con `fs.readSync`, que es sincrónico: para el archivo de esta lectura se
 * intercepta, y si falta un pedazo este hilo espera (Atomics.wait) a que un
 * segundo hilo lo baje con HTTP Range. HDF5 nunca ve un error.
 */

// Medido sobre archivos reales: bloques de 1 KB sin adelanto bajan ~36 KB por archivo (~9 %) en ~16 pedidos.
const BLOCK = 1024;
/** Bloques de más que se piden de una vez (lo que sigue suele hacer falta enseguida). */
const READ_AHEAD = 0;
const MAX_RANGE = 256 * 1024;

const { url, size, at } = workerData as { url: string; size: number; at: number };

// ---------- Descarga sincrónica desde este hilo ----------

const control = new Int32Array(new SharedArrayBuffer(8)); // [estado, largo]: 0 esperando, 1 listo, 2 error
const data = new Uint8Array(new SharedArrayBuffer(MAX_RANGE));
const fetcherCode = `
const { parentPort, workerData } = require('node:worker_threads');
const { url, control, data } = workerData;
parentPort.on('message', async ({ start, end }) => {
  try {
    const res = await fetch(url, { headers: { range: 'bytes=' + start + '-' + end }, signal: AbortSignal.timeout(20000) });
    if (res.status !== 206) throw new Error('rango no aceptado: ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    data.set(buf.subarray(0, data.length));
    Atomics.store(control, 1, buf.length);
    Atomics.store(control, 0, 1);
  } catch {
    Atomics.store(control, 0, 2);
  }
  Atomics.notify(control, 0);
});`;
const fetcher = new Worker(fetcherCode, { eval: true, workerData: { url, control, data } });

let bytes = 0;
let requests = 0;
const blocks = new Map<number, Buffer>();

function fetchBlocks(from: number, to: number) {
  const start = from * BLOCK;
  const end = Math.min(size, (to + 1) * BLOCK) - 1;
  Atomics.store(control, 0, 0);
  fetcher.postMessage({ start, end });
  if (Atomics.wait(control, 0, 0, 25_000) === 'timed-out' || Atomics.load(control, 0) !== 1) throw new Error('no se pudo bajar un pedazo');
  const got = Buffer.from(data.slice(0, Atomics.load(control, 1)));
  requests++;
  bytes += got.length;
  for (let b = from; b <= to; b++) blocks.set(b, got.subarray((b - from) * BLOCK, (b - from + 1) * BLOCK));
}

// ---------- Archivo "vacío" e intercepción de lecturas ----------

const path = join(tmpdir(), `glm-partial-${randomUUID()}.nc`);
// Archivo disperso del tamaño real: HDF5 mira el tamaño, pero no se escribe nada.
fs.writeFileSync(path, '');
fs.truncateSync(path, size);
let ourFd: number | null = null;

const openSync = fs.openSync;
const readSync = fs.readSync;
(fs as { openSync: unknown }).openSync = function (this: unknown, ...args: Parameters<typeof fs.openSync>) {
  const fd = openSync.apply(this, args);
  if (args[0] === path) ourFd = fd;
  return fd;
};
(fs as { readSync: unknown }).readSync = function (this: unknown, ...args: unknown[]) {
  const [fd, buffer, offset, length, position] = args as [number, NodeJS.ArrayBufferView, number, number, number | bigint | null];
  if (fd !== ourFd || position === null || position === undefined) return (readSync as (...a: unknown[]) => number).apply(this, args);
  const pos = Number(position);
  const len = Math.min(length, size - pos);
  if (len <= 0) return 0;
  const first = Math.floor(pos / BLOCK);
  const last = Math.floor((pos + len - 1) / BLOCK);
  // Lo que falta se baja en tramos seguidos, con un poco de lectura adelantada.
  for (let b = first; b <= last; b++) {
    if (blocks.has(b)) continue;
    let end = b;
    while (end < last && !blocks.has(end + 1)) end++;
    end = Math.min(end + READ_AHEAD, Math.floor((size - 1) / BLOCK));
    fetchBlocks(b, end);
    b = end;
  }
  const out = Buffer.from(buffer.buffer, buffer.byteOffset + (offset ?? 0), len);
  for (let b = first; b <= last; b++) {
    const block = blocks.get(b)!;
    const from = Math.max(pos, b * BLOCK);
    const to = Math.min(pos + len, b * BLOCK + block.length);
    block.copy(out, from - pos, from - b * BLOCK, to - b * BLOCK);
  }
  return len;
};

try {
  await glmReady();
  fetchBlocks(0, Math.ceil(12288 / BLOCK) - 1); // el principio siempre hace falta (superbloque y encabezados)
  const flashes = readGlmFile(path, at);
  parentPort!.postMessage({ ok: true, result: { flashes, bytes, requests } });
} catch (err) {
  parentPort!.postMessage({ ok: false, error: String(err) });
} finally {
  fs.rmSync(path, { force: true });
  await fetcher.terminate();
}
