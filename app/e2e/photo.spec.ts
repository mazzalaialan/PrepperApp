import sharp from 'sharp';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('la foto del artículo se comprime a 1280 px y sobrevive al bloqueo', async ({ page }, testInfo) => {
  // Foto "de cámara": 4000×3000 con ruido para que no comprima trivialmente.
  const width = 4000;
  const height = 3000;
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const photoPath = testInfo.outputPath('foto.jpg');
  await sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toFile(photoPath);

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Filtro Sawyer');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Sin foto')).toBeVisible();

  await page.getByTestId('photo-file').setInputFiles(photoPath);
  const img = page.getByRole('img', { name: 'Filtro Sawyer' });
  await expect(img).toBeVisible();
  const natural = await img.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  expect(natural).toEqual({ w: 1280, h: 960 });

  // Tras bloquear y desbloquear, la foto se descifra de nuevo.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto(page.url());
  await expect(page.getByRole('img', { name: 'Filtro Sawyer' })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-08-photo.png`, fullPage: true });
});
