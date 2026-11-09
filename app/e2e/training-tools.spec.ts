import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('entrenamiento: cronómetro, temporizador, herramientas y cuenta regresiva', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Cronómetro con vueltas.
  await page.goto('/#/training');
  await page.getByRole('link', { name: /Cronómetro/ }).click();
  await expect(page.getByTestId('sw-time')).toHaveText('0:00.00');
  await page.getByTestId('sw-start').click();
  await page.waitForTimeout(700);
  await page.getByTestId('sw-lap').click();
  await page.waitForTimeout(400);
  await page.getByTestId('sw-lap').click();
  await expect(page.getByTestId('sw-laps').getByRole('row')).toHaveCount(3); // encabezado + 2 vueltas
  await page.getByTestId('sw-pause').click();
  await expect(page.getByTestId('sw-time')).not.toHaveText('0:00.00');
  await page.getByTestId('sw-reset').click();
  await expect(page.getByTestId('sw-time')).toHaveText('0:00.00');

  // Temporizador: se elige 1 minuto y corre.
  await page.getByRole('button', { name: 'Temporizador' }).click();
  await page.getByTestId('timer-preset-60').click();
  await expect(page.getByTestId('timer-time')).toHaveText('1:00');
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('timer-time')).toHaveText(/^0:5\d$/);
  await page.getByTestId('timer-pause').click();

  // Herramientas: ritmo (10 km en 55:00 = 5:30 /km), zonas de pulso y metrónomo.
  await page.goto('/#/training');
  await page.getByRole('link', { name: /Herramientas/ }).click();
  await expect(page.getByTestId('pace-result')).toContainText('5:30 /km');
  await expect(page.getByTestId('pace-predict')).toContainText('21,1 km');
  await page.getByLabel('Edad').fill('40');
  await expect(page.getByTestId('hr-zones').getByRole('row')).toHaveCount(6); // encabezado + 5 zonas
  await expect(page.getByTestId('hr-zones')).toContainText('90–108');
  await page.getByLabel('O, si querés cumplir un ritmo (min/km)').fill('6:00');
  await expect(page.getByTestId('pace-target-result')).toContainText('1:00:00');
  await page.getByTestId('metronome-toggle').click();
  await page.getByTestId('metronome-toggle').click();

  // Cuenta regresiva antes de empezar una sesión con GPS.
  await page.goto('/#/training/workouts');
  await page.getByText('Objetivos de la semana').click();
  await page.getByTestId('countdown-setting').selectOption('3');
  await page.getByRole('button', { name: 'A pie' }).click();
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await expect(page.getByTestId('countdown')).toBeVisible();
  await expect(page.getByTestId('countdown-number')).toHaveText(/^[0-3]$/);
  await page.getByTestId('countdown-cancel').click();
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await expect(page).toHaveURL(/#\/training\/live$/, { timeout: 10_000 });
});
