import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -41.16, longitude: -71.42 }, permissions: ['geolocation'] });

test('entrenamiento: sesión bajo techo, grabar con GPS y armar una salida', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // La sección está en la navegación.
  await page.goto('/#/training');
  await expect(page.getByRole('heading', { name: 'Entrenamiento' })).toBeVisible();
  await page.getByRole('link', { name: /Sesiones/ }).click();
  await expect(page.getByRole('heading', { name: 'Sesiones' })).toBeVisible();
  await expect(page.getByTestId('train-no-weight')).toContainText('Sin tu peso no se calculan las calorías.');

  // Bajo techo: cinta, con el tiempo, la distancia y el peso a mano.
  await page.getByRole('button', { name: 'Bajo techo' }).click();
  await page.getByLabel('Actividad', { exact: true }).selectOption({ label: 'Cinta' });
  await page.getByRole('link', { name: 'Cargar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Cargar una sesión' })).toBeVisible();
  await page.getByLabel('Duración').fill('30:00');
  await page.getByLabel('Distancia (km)').fill('4');
  await page.getByLabel('Peso (kg)').fill('70');
  await expect(page.getByTestId('m-preview')).toContainText('7:30 /km');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Cinta' })).toBeVisible();
  await expect(page.getByTestId('w-time')).toHaveText('30:00');
  await expect(page.getByTestId('w-distance')).toHaveText('4 km');
  await expect(page.getByTestId('w-effort')).toHaveText('7:30 /km');
  await expect(page.getByTestId('w-kcal')).toHaveText(/^3\d\d kcal$/);
  await expect(page.getByTestId('w-map')).toHaveCount(0);

  // Con GPS: trekking con mochila; termina con nombre y abre la sesión.
  await page.goto('/#/training/workouts');
  await page.getByRole('button', { name: 'A pie' }).click();
  await page.getByLabel('Actividad', { exact: true }).selectOption({ label: 'Trekking' });
  await page.getByLabel('Mochila o carga (kg, opcional)').fill('10');
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  const bar = page.getByTestId('rec-bar');
  await expect(bar).toContainText('Grabando');
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();
  await page.waitForTimeout(500);
  const walk = async (lat: number) => {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  };
  await walk(-41.161);
  await walk(-41.162);
  await walk(-41.163);
  await expect(page.getByTestId('rec-stats')).toContainText(/33\d m/);
  await bar.getByRole('button', { name: 'Terminar y guardar la grabación' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar la grabación' });
  await expect(dialog.getByLabel('Nombre')).toHaveValue('Trekking');
  await dialog.getByLabel('Nombre').fill('Trekking al cerro');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Trekking al cerro' })).toBeVisible();
  await expect(page).toHaveURL(/#\/training\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('w-distance')).toHaveText(/^33\d m$/);
  await expect(page.getByTestId('w-map')).toHaveAttribute('href', /\/orientation\/maps\?track=/);
  // Sin el peso cargado, las calorías no se inventan; con el peso a mano se calculan.
  await expect(page.getByTestId('w-kcal')).toHaveText('—');
  await page.getByLabel('Peso (kg)').fill('75');
  await page.getByRole('button', { name: 'Recalcular las calorías' }).click();
  await expect(page.getByTestId('w-kcal')).toHaveText(/ kcal$/);
  await expect(bar).toHaveCount(0);

  // Salida: se crea desde la sesión, se renombra y se le suma la otra.
  await page.locator('#w-outing-sel').selectOption({ label: 'Nueva salida…' });
  await expect(page.getByRole('heading', { name: 'Nueva salida' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar el nombre' }).click();
  await page.getByLabel('Nombre de la salida').fill('Salida al Platita');
  await page.getByLabel('Nombre de la salida').press('Enter');
  await expect(page.getByRole('heading', { name: 'Salida al Platita' })).toBeVisible();
  await expect(page.getByTestId('o-count')).toHaveText('1');
  await page.getByLabel('Sumar una actividad suelta').selectOption({ index: 1 });
  await expect(page.getByTestId('o-count')).toHaveText('2');
  await expect(page.getByTestId('o-distance')).toHaveText(/^4,3\d km$/);
  await expect(page.getByTestId('o-map')).toHaveAttribute('href', /\/orientation\/maps\?tracks=[0-9a-f-]{36}$/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-86-outing.png`, fullPage: true });

  // En la lista de salidas.
  await page.goto('/#/training/outings');
  await expect(page.getByTestId('outing-list')).toContainText('Salida al Platita');
  await expect(page.getByTestId('outing-list')).toContainText('2 actividades');

  // Borrar la salida deja las actividades sueltas.
  await page.getByRole('link', { name: /Salida al Platita/ }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page).toHaveURL(/#\/training\/outings$/);
  await page.goto('/#/training/workouts');
  await expect(page.getByTestId('train-row')).toHaveCount(2);
  await expect(page.getByTestId('train-week')).toContainText('2');
});
