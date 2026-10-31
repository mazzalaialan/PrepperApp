import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const G = 9.81;
const rad = (d: number) => (d * Math.PI) / 180;

/** Simula el acelerómetro: emite `devicemotion` continuamente con la gravedad que se fije. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __gravity: { x: number; y: number; z: number } };
    w.__gravity = { x: 0, y: 0, z: 9.81 };
    setInterval(() => {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: w.__gravity, interval: 16 }));
    }, 16);
  });
});

/** Celular inclinado `angle` grados hacia adelante (borde superior levantado). */
const tiltForward = (page: Page, angle: number) =>
  page.evaluate((g) => ((window as unknown as { __gravity: object }).__gravity = g), {
    x: 0,
    y: G * Math.sin(rad(angle)),
    z: G * Math.cos(rad(angle)),
  });

test('inclinómetro: zonas de avalancha, fijar medida y modo apuntando', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.getByRole('link', { name: 'Orientación' }).click();
  await page.getByRole('link', { name: /Inclinómetro/ }).click();

  await tiltForward(page, 38);
  await expect(page.getByTestId('incl-angle')).toHaveText('38°');
  await expect(page.getByTestId('incl-zone')).toHaveText('Rango típico de avalanchas');
  await expect(page.getByTestId('incl-risk')).toHaveText('Riesgo de avalancha: Alto');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17-inclinometer.png`, fullPage: true });

  // Fijar: la medida queda aunque el celular se mueva.
  await page.getByRole('button', { name: 'Fijar medida' }).click();
  await tiltForward(page, 10);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('incl-angle')).toHaveText('38°');
  await page.getByRole('button', { name: 'Volver a medir' }).click();
  await expect(page.getByTestId('incl-angle')).toHaveText('10°');
  await expect(page.getByTestId('incl-zone')).toHaveText('Pendiente baja');
  await expect(page.getByTestId('incl-risk')).toHaveText('Riesgo de avalancha: Bajo');

  // Apuntando hacia abajo de la pendiente: elevación negativa.
  await page.getByRole('button', { name: 'Apuntando' }).click();
  await tiltForward(page, -27);
  await expect(page.getByTestId('incl-angle')).toHaveText('-27°');
  await expect(page.getByTestId('incl-zone')).toHaveText('Cerca del rango de avalanchas');
  await expect(page.getByTestId('incl-risk')).toHaveText('Riesgo de avalancha: Moderado');
});
