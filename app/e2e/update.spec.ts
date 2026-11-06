import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Simula una versión nueva publicada: se cambia el sw.js del build que sirve el servidor de pruebas
 * (Playwright no intercepta el pedido del service worker que hace el navegador al buscar
 * actualizaciones) y al final se deja como estaba. Las pruebas corren de a una.
 */
const SW = new URL('../dist/sw.js', import.meta.url);

test('actualización: avisa enseguida al abrir, se puede dejar para más tarde y vuelve a preguntar al reabrir', async ({ page }) => {
  // Cambiar el sw.js afectaría a otras pruebas que corran a la vez: solo con un proceso.
  test.skip(test.info().config.workers > 1, 'cambia el sw.js servido: solo corre con workers = 1');
  const original = readFileSync(SW, 'utf8');
  try {
    await page.goto('/');
    // Primera visita: la app queda instalada y el service worker la controla (eso no se avisa).
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
    await expect(page.getByTestId('update-prompt')).toHaveCount(0);

    writeFileSync(SW, `${original}\n// versión de prueba\n`);
    await page.reload();
    const prompt = page.getByTestId('update-prompt');
    // Aparece en la pantalla de entrada, antes de loguearse.
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(prompt).toContainText(/Bajando la versión nueva|Hay una versión nueva/);
    await expect(prompt.getByRole('button', { name: 'Actualizar' })).toBeVisible({ timeout: 60_000 });

    // Más tarde: no molesta más en esta sesión.
    await page.getByTestId('update-later').click();
    await expect(prompt).toHaveCount(0);

    // Al volver a abrir la app, pregunta otra vez.
    await page.reload();
    await expect(page.getByTestId('update-prompt').getByRole('button', { name: 'Actualizar' })).toBeVisible({ timeout: 30_000 });
  } finally {
    writeFileSync(SW, original);
  }
});
