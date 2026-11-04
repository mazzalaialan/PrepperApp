import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

/** Ninguna pantalla más ancha que el celular: si no, el navegador achica la página y el menú de abajo queda fuera de la vista. */
async function expectFits(page: Page) {
  await expect
    .poll(() => page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth })))
    .toEqual({ width: page.viewportSize()!.width, scroll: page.viewportSize()!.width });
  // En el celular, el menú de abajo dentro de la pantalla.
  if (page.viewportSize()!.width < 900) {
    const nav = (await page.locator('nav.bottomnav').first().boundingBox({ timeout: 5000 }))!;
    expect(Math.round(nav.y + nav.height)).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
}

test('las pantallas entran en el ancho del celular, con el menú de abajo a la vista', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Con dos documentos aparece "Ordenar" al lado de "Nuevo documento": antes no entraban.
  for (const title of ['DNI de Ana', 'Pasaporte']) {
    await page.goto('/#/documents/new');
    await page.getByLabel('Título').fill(title);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
  }
  for (const route of ['/#/documents', '/#/inventory/items', '/#/first-aid', '/#/first-aid/contacts', '/#/orientation', '/#/weather', '/#/settings']) {
    await page.goto(route);
    await expectFits(page);
  }
});
