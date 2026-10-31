/**
 * Imágenes de las capas (satélite, radar, focos de calor): se descargan una
 * vez por URL y quedan en memoria mientras se usan. Con CORS habilitado se
 * pueden dibujar en el canvas.
 */

const MAX_IMAGES = 160;
const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = cache.get(url);
  if (hit) {
    // Lo usado recién pasa al final (se descarta lo más viejo).
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      cache.delete(url);
      reject(new Error(url));
    };
    img.src = url;
  });
  cache.set(url, promise);
  while (cache.size > MAX_IMAGES) cache.delete(cache.keys().next().value!);
  return promise;
}

/** Imagen ya descargada (para dibujar sin esperar), o `null`. */
const ready = new Map<string, HTMLImageElement>();

export function readyImage(url: string): HTMLImageElement | null {
  return ready.get(url) ?? null;
}

export async function preload(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = await loadImage(url);
    ready.set(url, img);
    while (ready.size > MAX_IMAGES) ready.delete(ready.keys().next().value!);
    return img;
  } catch {
    return null;
  }
}
