// Genera los íconos de la PWA a partir del logo original (assets-src/logo.jpg).
// Uso: npm run icons
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'assets-src/logo.jpg';
const OUT = 'public/brand';
const BG = '#121a24';

await mkdir(OUT, { recursive: true });

/** Recorta el emblema en círculo con fondo transparente. */
async function circle(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

for (const size of [192, 512]) {
  await sharp(await circle(size)).toFile(`${OUT}/icon-${size}.png`);
}

// Maskable: Android recorta con formas variables; el emblema va dentro de la zona segura (80%).
const inner = Math.round(512 * 0.8);
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: await circle(inner), gravity: 'center' }])
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);

await sharp(await circle(256)).webp({ quality: 85 }).toFile(`${OUT}/logo-256.webp`);

console.log('Íconos generados en', OUT);
