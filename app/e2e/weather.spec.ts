import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

/** Respuesta de Open-Meteo armada a partir de la hora actual (como hace el servicio real). */
function fakeForecast() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  const hours = Array.from({ length: 48 }, (_, i) => new Date(now.getTime() + (i - 2) * 3_600_000));
  const days = Array.from({ length: 16 }, (_, i) => local(new Date(now.getTime() + i * 86_400_000)).slice(0, 10));
  const rep = <T,>(first: T[], rest: T) => [...first, ...Array.from({ length: 16 - first.length }, () => rest)];
  // Intervalos de 15 min desde el actual: la lluvia arranca en el cuarto (dentro de 45 min).
  const slot0 = new Date(now);
  slot0.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);
  const quarter = (d: Date) => `${local(d).slice(0, 11)}${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const slots = Array.from({ length: 8 }, (_, i) => new Date(slot0.getTime() + i * 15 * 60_000));
  return {
    latitude: -34.6,
    longitude: -58.38,
    timezone: 'America/Argentina/Buenos_Aires',
    minutely_15: { time: slots.map(quarter), precipitation: [0, 0, 0, 1.2, 2, 0.5, 0, 0] },
    current: {
      time: quarter(slot0), temperature_2m: 21.4, relative_humidity_2m: 64, apparent_temperature: 20.1, precipitation: 0,
      weather_code: 2, wind_speed_10m: 18, wind_direction_10m: 135, wind_gusts_10m: 35, pressure_msl: 1013.2,
    },
    hourly: {
      time: hours.map(local),
      temperature_2m: hours.map((_, i) => 18 + (i % 10)),
      precipitation_probability: hours.map((_, i) => (i % 6) * 10),
      weather_code: hours.map((_, i) => (i % 12 === 0 ? 61 : 1)),
      wind_speed_10m: hours.map(() => 15),
      wind_direction_10m: hours.map(() => 180), // del sur: la flecha apunta al norte
      wind_gusts_10m: hours.map(() => 32),
    },
    daily: {
      time: days,
      weather_code: rep([2, 95, 3, 61, 0, 1, 2], 1),
      temperature_2m_max: rep([24, 27, 22, 19, 25, 26, 28], 24),
      temperature_2m_min: rep([14, 17, 13, 11, 12, 13, 15], 13),
      precipitation_sum: rep([0, 42, 0, 6, 0, 0, 0], 0),
      // Días lejanos con valores extremos: no deben generar avisos (es solo tendencia).
      precipitation_probability_max: rep([5, 90, 20, 70, 0, 0, 10], 0),
      wind_speed_10m_max: rep([20, 40, 18, 25, 12, 15, 22], 60),
      wind_gusts_10m_max: rep([35, 88, 30, 45, 25, 30, 40], 120),
      wind_direction_10m_dominant: rep([90, 200, 270, 180, 0, 45, 135], 220),
      uv_index_max: rep([7, 4, 6, 3, 9, 8, 7], 5),
    },
  };
}

test('clima: descarga, avisos, y sin conexión muestra lo guardado', async ({ page, context }, testInfo) => {
  let requests = 0;
  await context.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
    requests++;
    await route.fulfill({ json: fakeForecast() });
  });

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Clima/ }).click();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  await expect(page.getByText('Parcialmente nublado · sensación 20°')).toBeVisible();
  await expect(page.getByText('Tormenta eléctrica')).toBeVisible();
  await expect(page.getByText('Ráfagas fuertes de hasta 88 km/h')).toBeVisible();
  await expect(page.getByText('Lluvia intensa: 42 mm')).toBeVisible();
  await expect(page.getByText('Radiación UV muy alta (índice 9)')).toBeVisible();
  await expect(page.getByTestId('weather-updated')).toHaveText(/Actualizado (ahora|hace \d+ minutos?|este minuto)/);
  await expect(page.getByTestId('next-rain')).toHaveText('Empieza a llover en unos 45 min (3,7 mm)');
  // Cada hora: gotita con la probabilidad y viento con dirección, velocidad y ráfagas.
  const hour = page.getByTestId('hour').nth(1);
  await expect(hour.getByLabel(/^Probabilidad de lluvia \d+ %$/)).toBeVisible();
  await expect(hour.getByLabel('Viento 15 km/h, ráfagas 32 km/h')).toBeVisible();
  await expect(hour.getByRole('img', { name: 'Viento del S' })).toBeVisible();
  await expect(hour.getByText('r. 32')).toBeVisible();
  // 16 días: 7 confiables y 9 como tendencia, sin avisos por los días lejanos.
  await expect(page.getByTestId('day')).toHaveCount(7);
  await expect(page.getByTestId('trend-day')).toHaveCount(9);
  await expect(page.getByText(/Tendencia: días 8 a 16/)).toBeVisible();
  await expect(page.getByText(/Ráfagas fuertes de hasta 120/)).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-16-weather.png`, fullPage: true });
  expect(requests).toBe(1);

  // Al volver con un pronóstico reciente no se descarga de nuevo.
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Clima/ }).click();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  expect(requests).toBe(1);

  // Sin conexión: queda lo guardado y avisa al intentar actualizar.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('Sin conexión: el pronóstico se descarga cuando haya internet. Se muestra el último pronóstico guardado.')).toBeVisible();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  await context.setOffline(false);
});

test('aviso de lluvia por waypoint, activado desde su ficha', async ({ page, context }) => {
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => route.fulfill({ json: fakeForecast() }));
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill('-41.13, -71.31');
  await page.getByLabel('Avisarme si va a llover en este punto').check();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // El vigilante revisa enseguida y muestra el aviso arriba, en cualquier pantalla.
  const notice = page.locator('.rain-notice');
  await expect(notice).toHaveText(/Lluvia en unos 45 min · Refugio/);
  await notice.getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Avisos de lluvia' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Refugio.*Lluvia en unos 45 min/ })).toBeVisible();
  await notice.getByRole('button', { name: 'Cerrar' }).click();
  await expect(notice).toHaveCount(0);

  // Desactivado en la ficha, deja de figurar.
  await page.goto('/#/orientation/waypoints');
  await page.getByRole('link', { name: /^Refugio/ }).first().click();
  await page.getByLabel('Avisarme si va a llover en este punto').uncheck();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/weather/forecast');
  await expect(page.getByText('Para recibir avisos de un lugar guardado')).toBeVisible();
});
