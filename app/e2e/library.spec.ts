import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const SERVER = 'http://127.0.0.1:8099';

test('biblioteca: libres (verde) y con derechos (clave VikArg), bajar por categoría, leer y buscar sin conexión', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Servidor de pruebas (con biblioteca y clave).
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Desbloquear para modificar' }).first().click();
  await page.getByLabel('Servidor VikArg').fill(SERVER);
  await page.getByRole('button', { name: 'Guardar' }).last().click();

  await page.goto('/#/library/books');
  const cat = page.getByTestId('library-cat-cabuyeria');
  await expect(cat).toContainText('Cabuyería');
  await expect(page.getByTestId('book-montanismo')).toContainText('Libre');
  await expect(page.getByTestId('book-enciclopedia')).toContainText('Con derechos');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-60-library.png`, fullPage: true });

  // En bloque: con el filtro "Libres", "elegir los que se ven" toma solo el libre; después, toda la categoría.
  await page.getByRole('button', { name: 'Libres', exact: true }).click();
  await page.getByTestId('library-select-visible').click();
  await expect(page.getByTestId('library-bar')).toContainText('1 libro elegido');
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByLabel('Elegir todos los libros de Cabuyería').check();
  await expect(page.getByTestId('library-bar')).toContainText('2 libros elegidos');
  await page.getByTestId('library-download').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('uso personal');
  await dialog.getByLabel('Clave VikArg', { exact: true }).fill('otra');
  await page.getByTestId('library-key-ok').click();
  await expect(dialog.getByText('La clave no es correcta.')).toBeVisible();
  await dialog.getByLabel('Clave VikArg', { exact: true }).fill('VikArg-prueba');
  await page.getByTestId('library-key-ok').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('book-montanismo').getByLabel('En el dispositivo')).toBeVisible();
  await expect(page.getByTestId('book-enciclopedia').getByLabel('En el dispositivo')).toBeVisible();
  await expect(page.getByText('Libros con derechos desbloqueados.')).toBeVisible();

  // Leer: capítulos y siguiente.
  await page.getByRole('link', { name: 'Leer «Manual de montañismo del Ejército»' }).click();
  const frame = page.frameLocator('[data-testid="reader-frame"]');
  await expect(frame.locator('h1')).toHaveText('Nudos');
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await expect(frame.locator('h1')).toHaveText('Anclajes');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-61-reader.png` });

  // Sin conexión: el libro con derechos se lee igual (está descifrado en el dispositivo), también tras recargar.
  await context.setOffline(true);
  await page.goto('/#/library/read/enciclopedia');
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(frame.locator('h1')).toHaveText('Introducción');
  await expect(frame.locator('p')).toContainText('as de guía');

  // Buscar en los libros bajados.
  await page.goto('/#/library/search');
  await page.getByLabel('Palabra o frase (al menos 3 letras)').fill('prusik');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('library-hits')).toContainText('Manual de montañismo del Ejército');
  await page.getByTestId('library-hits').getByRole('link').first().click();
  await expect(frame.locator('h1')).toHaveText('Nudos');
  await context.setOffline(false);
});
