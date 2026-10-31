import sharp from 'sharp';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('documento con varias fotos: agregar, ver, reordenar y quitar', async ({ page }, testInfo) => {
  const colors = [
    { name: 'frente.png', rgb: { r: 200, g: 40, b: 40 } },
    { name: 'dorso.png', rgb: { r: 40, g: 200, b: 40 } },
    { name: 'anexo.png', rgb: { r: 40, g: 40, b: 200 } },
  ];
  const files = await Promise.all(
    colors.map(async ({ name, rgb }) => {
      const path = testInfo.outputPath(name);
      await sharp({ create: { width: 600, height: 800, channels: 3, background: rgb } }).png().toFile(path);
      return path;
    }),
  );

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/documents');
  await expect(page.getByText('Todavía no cargaste documentos')).toBeVisible();
  await page.getByRole('link', { name: 'Nuevo documento' }).click();
  await expect(page.getByText('Guardá el documento para agregarle fotos.')).toBeVisible();
  await page.getByLabel('Título').fill('DNI de Ana');
  await page.getByLabel('Etiquetas').fill('identidad, familia, identidad');
  // Vence en 30 días: ya está dentro de los 60 de aviso.
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDay = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  await expect(page.getByText('Te avisamos 60 días antes')).toBeVisible();
  await page.getByLabel('Vencimiento').fill(dueDay);
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Queda en el índice de notificaciones, avisando desde 60 días antes.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ lotId: string; itemName: string; kind: string; dueDate: string }[]>((resolve) => {
            const req = indexedDB.open('vikarg-user');
            req.onsuccess = () => {
              const get = req.result.transaction('alertIndex').objectStore('alertIndex').getAll();
              get.onsuccess = () => resolve(get.result);
            };
          }),
      ),
    )
    .toContainEqual(expect.objectContaining({ itemName: 'DNI de Ana', kind: 'expiry', dueDate: dueDay, lotId: expect.stringMatching(/^doc:/) }));

  await page.getByTestId('doc-files').setInputFiles(files);
  await expect(page.getByRole('button', { name: /^Foto \d$/ })).toHaveCount(3);

  // Visor: la primera foto es la roja; al moverla después, pasa a ser la segunda.
  await page.getByRole('button', { name: 'Foto 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'DNI de Ana · 1/3' })).toBeVisible();
  const firstPixel = () =>
    dialog.getByRole('img').evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
  expect((await firstPixel())[0]).toBeGreaterThan(150);
  await dialog.getByRole('button', { name: 'Mover después' }).click();
  await expect(dialog.getByRole('heading', { name: 'DNI de Ana · 2/3' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Anterior' }).click();
  await expect(dialog.getByRole('heading', { name: 'DNI de Ana · 1/3' })).toBeVisible();
  expect((await firstPixel())[1]).toBeGreaterThan(150); // ahora la primera es la verde

  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Quitar' }).click();
  await expect(dialog.getByRole('heading', { name: 'DNI de Ana · 1/2' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('button', { name: /^Foto \d$/ })).toHaveCount(2);

  // Listado: búsqueda por etiqueta (sin duplicados) y cantidad de fotos.
  await page.goto('/#/documents');
  await page.getByPlaceholder('Buscar por título o etiqueta').fill('famil');
  await expect(page.getByText(/^2 fotos · vence el .+ · identidad, familia$/)).toBeVisible();
  await expect(page.getByText('Vence en 30 días')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-09-documents.png`, fullPage: true });

  // Sobrevive al bloqueo.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/documents');
  await page.getByRole('link', { name: /DNI de Ana/ }).click();
  await expect(page.getByRole('button', { name: /^Foto \d$/ })).toHaveCount(2);
  await expect(page.getByLabel('Vencimiento')).toHaveValue(dueDay);

  // También aparece en las alertas de Inicio.
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: /DNI de Ana.*Vence en 30 días/ })).toBeVisible();
});
