import { Worker } from 'node:worker_threads';
import type { Flash } from '../lightning/glm.ts';
import type { IrRead, IrWindow } from '../rain/goesIr.ts';

/**
 * Lectura parcial de archivos NetCDF4/HDF5 remotos de NOAA: la lectura corre
 * en un worker (partialWorker.ts) que intercepta las lecturas de h5wasm y baja
 * con HTTP Range solo los pedazos que pide; el servidor principal no se
 * bloquea mientras tanto.
 * - Rayos (GLM): de ~380 KB por archivo, las coordenadas ocupan ~36 KB.
 * - Infrarrojo (ABI banda 13, 24 MB): solo las franjas de filas que se piden
 *   (la región entera, ~5,4 MB; un lugar, ~400 KB).
 */

export interface PartialResult<T> {
  value: T;
  /** Bytes bajados y pedidos hechos, para medir. */
  bytes: number;
  requests: number;
}

function runPartial<T>(url: string, size: number, task: unknown, timeoutMs: number): Promise<PartialResult<T>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./partialWorker.ts', import.meta.url), { workerData: { url, size, task } });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('la lectura parcial tardó demasiado'));
    }, timeoutMs);
    worker.once('message', (msg: { ok: true; result: PartialResult<T> } | { ok: false; error: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Rayos de un archivo GLM. */
export async function readGlmPartial(url: string, size: number, at: number, timeoutMs = 60_000): Promise<{ flashes: Flash[]; bytes: number; requests: number }> {
  const r = await runPartial<Flash[]>(url, size, { kind: 'glm', at }, timeoutMs);
  return { flashes: r.value, bytes: r.bytes, requests: r.requests };
}

/** Ventanas de temperatura de brillo de un archivo ABI banda 13. */
export function readIrPartial(url: string, size: number, windows: IrWindow[], timeoutMs = 180_000): Promise<PartialResult<IrRead>> {
  return runPartial<IrRead>(url, size, { kind: 'ir', windows }, timeoutMs);
}
