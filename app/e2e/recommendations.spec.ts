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
  await expect(page.getByText('Primero agregá tu grupo familiar.').first()).toBeVisible();

  const dialog = page.getByRole('dialog');
  for (const [label, count] of [['Adultos', '2'], ['Niños', '1'], ['Perro', '1']] as const) {
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await dialog.getByLabel('Quién').fill(label);
    await dialog.getByLabel('Cantidad').fill(count);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.getByText('4 en total')).toBeVisible();

  // Reglas de ejemplo: agua y alimentos para 3 días, 7 días y 6 meses; solo se controla el plan de 7 días.
  const week = page.getByTestId('rule-group-7');
  await expect(page.getByTestId('rule-group-3')).toContainText('Plan para 3 días');
  await expect(page.getByTestId('rule-group-3')).toContainText('no se controla');
  await expect(page.getByTestId('rule-group-180')).toContainText('Plan para 6 meses');
  await expect(week).toContainText('se controlan 2 de 2');
  // 4 integrantes (con el perro) × 3 L × 7 días = 84 L; hay 60.
  await expect(week.getByText('Faltan 24 L')).toBeVisible();
  // Se destilda una sola regla y después el plan entero.
  await week.getByLabel('Controlar «Alimentos no perecederos»').uncheck();
  await expect(week).toContainText('se controlan 1 de 2');
  // Con el plan a medias, tocarlo controla todas; tocarlo de nuevo, ninguna.
  await week.getByLabel('Plan para 7 días').check();
  await expect(week).toContainText('se controlan 2 de 2');
  await week.getByLabel('Plan para 7 días').uncheck();
  await expect(week).toContainText('no se controla');
  await expect(week.getByText('No se controla: no avisa si falta.')).toHaveCount(2);
  // Volver a agregarlas no las duplica.
  await page.getByRole('button', { name: 'Agregar reglas de ejemplo' }).click();
  await expect(page.getByText('Las reglas de ejemplo ya están.')).toBeVisible();

  // Agua: 4 L por persona por día, 14 días, sin el perro.
  await page.getByRole('button', { name: 'Nueva regla' }).click();
  await dialog.getByLabel('Descripción').fill('Agua de la casa');
  await dialog.getByLabel('Categoría').selectOption({ label: 'Agua' });
  await dialog.getByLabel('Unidad', { exact: true }).fill('L');
  await dialog.getByLabel('Por integrante por día (L)').fill('4');
  await dialog.getByLabel('Para cuántos días').fill('14');
  await dialog.getByLabel('Adultos (×2)').check();
  await dialog.getByLabel('Niños (×1)').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText('4 L por día · 14 días · Adultos, Niños')).toBeVisible();
  const mine = page.getByTestId('rule-group-14');
  await expect(mine.getByTestId('rule-status')).toHaveText('Tenés 60 de 168 L · alcanza para 5 días');
  await expect(mine.getByText('Faltan 108 L')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-18-recommendations.png`, fullPage: true });

  // El faltante aparece en las alertas de Inicio y en la pantalla de Alertas…
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('link', { name: /Agua de la casa.*alcanza para 5 días.*Faltan 108 L/ })).toBeVisible();
  await page.goto('/#/inventory/alerts');
  await expect(page.getByRole('heading', { name: 'Faltantes según tus recomendaciones' })).toBeVisible();
  // …y en el índice que usan las notificaciones (aviso diario y servidor).
  const rows = await page.evaluate(
    () =>
      new Promise<{ lotId: string; itemName: string; kind: string }[]>((resolve) => {
        const req = indexedDB.open('vikarg-user');
        req.onsuccess = () => {
          const get = req.result.transaction('alertIndex').objectStore('alertIndex').getAll();
          get.onsuccess = () => resolve(get.result);
        };
      }),
  );
  expect(rows).toEqual([expect.objectContaining({ itemName: 'Agua de la casa', kind: 'shortage', lotId: expect.stringMatching(/^rec:/) })]);
  await page.goto('/#/inventory/recommendations');

  // Borrar a "Niños": la regla pasa a 2 personas (no a todo el grupo).
  await page.getByRole('button', { name: /^Niños/ }).click();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(mine.getByTestId('rule-status')).toHaveText('Tenés 60 de 112 L · alcanza para 7 días');
});
