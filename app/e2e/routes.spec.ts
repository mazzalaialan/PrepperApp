import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const CASA = { lat: -34.6037, lon: -58.3816 };
const PUENTE = { lat: -34.6, lon: -58.37 };
const REFUGIO = { lat: -34.59, lon: -58.36 };

test.use({ geolocation: { latitude: CASA.lat, longitude: CASA.lon }, permissions: ['geolocation'] });

async function addPoint(page: Page, name: string, p: { lat: number; lon: number }) {
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Coordenadas').fill(`${p.lat}, ${p.lon}`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/waypoints\/[0-9a-f-]{36}$/);
}

test('rutas: lista de puntos con nombre, recorrido en orden y llegada', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await addPoint(page, 'Casa', CASA);
  await addPoint(page, 'Refugio', REFUGIO);
  await addPoint(page, 'Puente', PUENTE);

  // Cada punto del listado tiene su botón "Ir".
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByRole('link', { name: 'Ir a Puente' })).toBeVisible();

  // Las rutas están abajo, en la misma pantalla.
  await expect(page.getByRole('heading', { name: 'Waypoints y Rutas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rutas', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Nueva ruta' }).click();
  await page.getByLabel('Nombre de la ruta').fill('Evacuación al refugio');
  const choose = page.getByLabel('Elegí un punto guardado');
  for (const name of ['Casa', 'Refugio', 'Puente']) {
    await choose.selectOption({ label: name });
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  }
  // Puente va antes que Refugio.
  await page.getByRole('button', { name: 'Mover antes' }).nth(2).click();
  await expect(page.locator('.route-points .list-title')).toHaveText(['Casa', 'Puente', 'Refugio']);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/routes\/[0-9a-f-]{36}$/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-14-route.png`, fullPage: true });

  await page.goto('/#/orientation/routes');
  await expect(page.getByText(/^3 puntos · \d,\d+ km$/)).toBeVisible();
  await page.getByRole('link', { name: /Evacuación al refugio/ }).click();

  // Recorrido: arranca en el punto 1, que es donde estoy.
  await page.getByRole('link', { name: 'Recorrer la ruta' }).click();
  await expect(page.getByTestId('route-step')).toHaveText('Evacuación al refugio · punto 1 de 3');
  await expect(page.getByText('Llegaste', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente: Puente' }).click();
  await expect(page.getByRole('heading', { name: 'Ir a Puente' })).toBeVisible();
  await expect(page.getByTestId('route-step')).toHaveText('Evacuación al refugio · punto 2 de 3');
  await page.getByRole('button', { name: 'Siguiente: Refugio' }).click();
  await expect(page.getByRole('button', { name: 'Último punto' })).toBeDisabled();
  await context.setGeolocation({ latitude: REFUGIO.lat, longitude: REFUGIO.lon });
  await expect(page.getByText('Llegaste al final de la ruta')).toBeVisible();

  // Borrar un punto lo saca de la ruta, sin romperla.
  await page.goto('/#/orientation/waypoints');
  await page.getByRole('link', { name: /^Puente/ }).first().click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page).toHaveURL(/#\/orientation\/waypoints$/);
  await page.goto('/#/orientation/routes');
  await expect(page.getByText(/^2 puntos/)).toBeVisible();
});
