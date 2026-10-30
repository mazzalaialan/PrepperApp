/**
 * Compresión de fotos (ARQUITECTURA §10): lado mayor ≤ 1280 px, WebP ~0,75.
 * Una foto de cámara de 4 MB queda en ~100–200 KB.
 */

export const MAX_DIMENSION = 1280;
export const QUALITY = 0.75;

export interface CompressedImage {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  width: number;
  height: number;
}

export function fitWithin(width: number, height: number, max = MAX_DIMENSION): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  // `from-image` respeta la rotación EXIF de las fotos del celular.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
  // Navegadores sin codificador WebP devuelven PNG (mucho más pesado): usar JPEG.
  if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type, width, height };
}
