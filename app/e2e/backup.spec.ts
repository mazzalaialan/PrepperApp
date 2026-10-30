import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function createVault(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test('exportar en un dispositivo y restaurar en otro', async ({ page, browser }, testInfo) => {
  await createVault(page);
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Mochila');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Linterna frontal');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/items\/[0-9a-f-]{36}$/);

  await page.goto('/#/inventory/backup');
  await expect(page.getByText('Todavía no hiciste ningún backup.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vikarg-backup-\d{4}-\d{2}-\d{2}\.vikarg$/);
  const file = testInfo.outputPath('backup.vikarg');
  await download.saveAs(file);
  await expect(page.getByText('Último backup: hoy.')).toBeVisible();

  // Otro dispositivo: contexto nuevo, almacenamiento vacío.
  const other = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const page2 = await other.newPage();
  await page2.goto('/');
  await page2.getByRole('button', { name: '¿Ya tenés un backup? Restaurarlo' }).click();
  await page2.getByLabel('Archivo de backup').setInputFiles(file);
  await expect(page2.getByText(/Artículos: 1 · Ubicaciones: 1/)).toBeVisible();

  await page2.getByLabel('Contraseña que tenías al exportarlo').fill('equivocada-1');
  await page2.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page2.getByText('La contraseña no corresponde a este backup.')).toBeVisible();

  await page2.getByLabel('Contraseña que tenías al exportarlo').fill(PASSWORD);
  await page2.getByRole('button', { name: 'Restaurar' }).click();
  await page2.goto('/#/inventory/items');
  await expect(page2.getByText('Linterna frontal')).toBeVisible();
  await other.close();
});
