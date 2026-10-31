import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

test('botiquín de trauma: contenido, vencimientos y faltantes', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Un lugar común donde va a estar el botiquín.
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Auto');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Emergencias' }).click();
  await page.getByRole('link', { name: /Botiquines/ }).click();
  await expect(page.getByText('Todavía no armaste botiquines')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo botiquín' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nuevo botiquín' })).toBeVisible();
  await dialog.getByLabel('Nombre').fill('Trauma del auto');
  await dialog.getByLabel('¿Es un botiquín?').selectOption({ label: 'Trauma' });
  await dialog.getByLabel('Dentro de').selectOption({ label: 'Auto' });
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Trauma · Auto')).toBeVisible();

  // Contenido: un torniquete nuevo que vence pronto.
  await page.getByRole('link', { name: /Trauma del auto/ }).click();
  await expect(page.getByText('El botiquín está vacío.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await dialog.getByLabel('Nombre').fill('Torniquete CAT');
  await dialog.getByLabel('Unidad').fill('unidades');
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByLabel('Ubicación')).toHaveValue(/.+/);
  await expect(dialog.getByLabel('Ubicación').locator('option:checked')).toHaveText('Auto › Trauma del auto');
  await dialog.getByLabel('Cantidad').fill('1');
  await dialog.getByLabel('Fecha de vencimiento').fill(isoInDays(5));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vence en 5 días')).toBeVisible();

  // Mínimo de 2 torniquetes en ese botiquín → falta 1.
  await page.goto('/#/inventory/items');
  await page.getByRole('link', { name: /Torniquete CAT/ }).click();
  await expect(page.getByLabel('Categoría', { exact: true }).locator('option:checked')).toHaveText('Botiquín');
  await page.getByLabel('Ubicación').selectOption({ label: 'Auto › Trauma del auto' });
  await page.getByLabel('Mínimo', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Agregar mínimo' }).click();

  // El faltante de mínimo queda en el índice de notificaciones (solo con el nombre, sin la ubicación).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ lotId: string; itemName: string; kind: string }[]>((resolve) => {
            const req = indexedDB.open('vikarg-user');
            req.onsuccess = () => {
              const get = req.result.transaction('alertIndex').objectStore('alertIndex').getAll();
              get.onsuccess = () => resolve(get.result);
            };
          }),
      ),
    )
    .toContainEqual(expect.objectContaining({ itemName: 'Torniquete CAT', kind: 'minStock', lotId: expect.stringMatching(/^min:/) }));

  await page.goto('/#/first-aid/kits');
  await expect(page.getByText('2 a revisar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Para revisar' })).toBeVisible();
  await page.locator('a[href^="#/first-aid/kits/"]').click();
  await expect(page.getByRole('heading', { name: 'Falta' })).toBeVisible();
  await expect(page.getByText('1 de 2 unidades')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-11-kit.png`, fullPage: true });

  // El botiquín también se ve como ubicación del inventario.
  await page.goto('/#/inventory/locations');
  await expect(page.getByText('Trauma del auto')).toBeVisible();
});
