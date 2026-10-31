import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('recomendaciones: grupo familiar, regla de agua por categoría y cobertura', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Stock: 60 L de agua.
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Casa');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Bidón');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Agua' });
  await page.getByLabel('Unidad', { exact: true }).fill('L');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  await page.getByRole('dialog').getByLabel('Cantidad').fill('60');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/#/inventory');
  await page.getByRole('link', { name: /Recomendaciones/ }).click();
  await expect(page.getByText('Primero agregá tu grupo familiar.')).toBeVisible();

  const dialog = page.getByRole('dialog');
  for (const [label, count] of [['Adultos', '2'], ['Niños', '1'], ['Perro', '1']] as const) {
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await dialog.getByLabel('Quién').fill(label);
    await dialog.getByLabel('Cantidad').fill(count);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.getByText('4 en total')).toBeVisible();

  // Agua: 4 L por persona por día, 14 días, sin el perro.
  await page.getByRole('button', { name: 'Nueva regla' }).click();
  await dialog.getByLabel('Descripción').fill('Agua para tomar y cocinar');
  await dialog.getByLabel('Categoría').selectOption({ label: 'Agua' });
  await dialog.getByLabel('Unidad', { exact: true }).fill('L');
  await dialog.getByLabel('Por integrante por día (L)').fill('4');
  await dialog.getByLabel('Para cuántos días').fill('14');
  await dialog.getByLabel('Adultos (×2)').check();
  await dialog.getByLabel('Niños (×1)').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText('4 L por día · 14 días · Adultos, Niños')).toBeVisible();
  await expect(page.getByTestId('rule-status')).toHaveText('Tenés 60 de 168 L · alcanza para 5 días');
  await expect(page.getByText('Faltan 108 L')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-18-recommendations.png`, fullPage: true });

  // Borrar a "Niños": la regla pasa a 2 personas (no a todo el grupo).
  await page.getByRole('button', { name: /^Niños/ }).click();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByTestId('rule-status')).toHaveText('Tenés 60 de 112 L · alcanza para 7 días');
});
