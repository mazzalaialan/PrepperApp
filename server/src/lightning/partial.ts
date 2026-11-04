import { Worker } from 'node:worker_threads';
import type { Flash } from './glm.ts';

/**
 * Lectura parcial de un archivo GLM remoto: de ~380 KB, las coordenadas de los
 * rayos y lo que HDF5 necesita para encontrarlas ocupan ~15 KB. La lectura
 * corre en un worker (partialWorker.ts) que intercepta las lecturas de h5wasm
 * y baja con HTTP Range solo los pedazos que pide; el servidor principal no se
 * bloquea mientras tanto.
 */

export interface PartialResult {
  flashes: Flash[];
  /** Bytes bajados y pedidos hechos, para medir. */
  bytes: number;
  requests: number;
}

export function readGlmPartial(url: string, size: number, at: number, timeoutMs = 60_000): Promise<PartialResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./partialWorker.ts', import.meta.url), { workerData: { url, size, at } });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('la lectura parcial tardó demasiado'));
    }, timeoutMs);
    worker.once('message', (msg: { ok: true; result: PartialResult } | { ok: false; error: string }) => {
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
