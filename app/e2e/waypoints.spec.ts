import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const OBELISCO = { latitude: -34.603722, longitude: -58.381592 };

test.use({ geolocation: OBELISCO, permissions: ['geolocation'] });

test('waypoints: marcar acá, cargar por coordenadas y cómo llegar', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.getByRole('link', { name: 'Orientación' }).click();
  await page.getByRole('link', { name: /Waypoints/ }).click();
  await expect(page.getByText('Todavía no guardaste puntos')).toBeVisible();

  // Marcar la posición actual: crea el punto y abre su ficha.
  await page.getByRole('button', { name: 'Marcar acá' }).click();
  await expect(page.getByLabel('Coordenadas')).toHaveValue('-34.603722, -58.381592');
  await expect(page.getByTestId('coords-preview')).toHaveText('34°36′13.4″ S 58°22′53.7″ O');
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('wp-distance')).toHaveText('0 m');

  // Punto escrito a mano en grados, minutos y segundos.
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio Córdoba');
  const coords = page.getByLabel('Coordenadas');
  await coords.fill('hola');
  await expect(page.getByText('No reconozco esas coordenadas.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await coords.fill(`31°25'12.3"S 64°11'19.6"O`);
  await page.getByLabel('Altitud (m)').fill('390');
  // "Usar mi ubicación" con otra lectura de GPS en curso, y vuelta a las coordenadas a mano.
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click();
  await expect(coords).toHaveValue('-34.603722, -58.381592');
  await coords.fill(`31°25'12.3"S 64°11'19.6"O`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('wp-distance')).toHaveText(/^64\d,\d\d km$/);
  await expect(page.getByTestId('wp-bearing')).toHaveText(/^30\d° NO$/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-10-waypoint.png`, fullPage: true });

  // Listado ordenado por cercanía; al moverse, se recalcula.
  await page.goto('/#/orientation/waypoints');
  const titles = page.locator('.list-title');
  await expect(titles).toHaveText(['Casa', 'Refugio Córdoba']);
  await context.setGeolocation({ latitude: -31.43, longitude: -64.2 });
  await expect(titles).toHaveText(['Refugio Córdoba', 'Casa']);

  // Persisten tras bloquear.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/orientation/waypoints');
  await expect(titles).toHaveCount(2);
});
