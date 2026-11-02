import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

/** Como lo exporta Wikiloc: metadata con link, un track y puntos con nombre. */
const WIKILOC = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Wikiloc - https://www.wikiloc.com" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Wikiloc - Refugio Frey desde Villa Catedral</name>
    <link href="https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456"><text>Refugio Frey en Wikiloc</text></link>
  </metadata>
  <wpt lat="-41.1700" lon="-71.4400"><ele>1700</ele><name>Refugio Frey</name><desc>Agua y camping</desc></wpt>
  <wpt lat="-41.1650" lon="-71.4300"><ele>1300</ele><name>Arroyo</name></wpt>
  <trk>
    <name>Refugio Frey desde Villa Catedral</name>
    <desc>Subida por el sendero del Cerro Catedral.</desc>
    <trkseg>
      <trkpt lat="-41.1600" lon="-71.4200"><ele>1000</ele></trkpt>
      <trkpt lat="-41.1640" lon="-71.4280"><ele>1150</ele></trkpt>
      <trkpt lat="-41.1660" lon="-71.4320"><ele>1300</ele></trkpt>
      <trkpt lat="-41.1680" lon="-71.4360"><ele>1290</ele></trkpt>
      <trkpt lat="-41.1700" lon="-71.4400"><ele>1700</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

test('tracks de Wikiloc: importar, ver datos y perfil, ir al inicio y copiar un punto a mis waypoints', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Está en Orientación.
  await page.goto('/#/orientation');
  await page.getByRole('link', { name: /Tracks importados/ }).click();
  await expect(page.getByText('Todavía no importaste tracks')).toBeVisible();

  // Un archivo que no es GPX avisa.
  await page.getByTestId('tracks-file').setInputFiles({ name: 'mal.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<kml></kml>') });
  await expect(page.getByRole('alert')).toHaveText('El archivo no es un GPX.');

  // Importar el GPX de Wikiloc abre el track.
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await expect(page.getByRole('heading', { name: 'Refugio Frey desde Villa Catedral' })).toBeVisible();
  const stats = page.getByTestId('track-stats');
  await expect(stats).toContainText('Distancia');
  await expect(stats).toContainText('710 m');
  await expect(page.getByTestId('track-profile')).toBeVisible();
  await expect(page.getByText('Fuente: Wikiloc')).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver la ruta original/ })).toHaveAttribute('href', 'https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456');

  // Sus puntos no están en mis waypoints hasta que los copio.
  const points = page.getByTestId('track-points').locator('li');
  await expect(points).toHaveCount(2);
  await expect(points.nth(0)).toContainText('Refugio Frey');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toHaveCount(0);
  await page.goBack();
  await page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Refugio Frey ya está en mis waypoints' })).toBeDisabled();
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // En la lista, con distancia y desnivel.
  await page.goto('/#/orientation/tracks');
  await expect(page.getByTestId('tracks-list')).toContainText('Refugio Frey desde Villa Catedral');
  await expect(page.getByTestId('tracks-list')).toContainText('2 puntos · Wikiloc');

  // Ir al inicio con la brújula.
  await page.getByRole('link', { name: /Refugio Frey desde Villa Catedral/ }).click();
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page.getByText('Inicio de Refugio Frey desde Villa Catedral')).toBeVisible();

  // En el mapa, como capa propia.
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('button', { name: 'Tracks importados' })).toHaveAttribute('aria-pressed', 'true');

  // Se elimina desde la lista (con confirmación); el punto copiado queda en mis waypoints.
  await page.goto('/#/orientation/tracks');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar Refugio Frey desde Villa Catedral' }).click();
  await expect(page.getByTestId('tracks-list')).toHaveCount(0);
  await expect(page.getByText('Todavía no importaste tracks')).toBeVisible();
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // Y también desde el detalle del track.
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await expect(page.getByRole('heading', { name: 'Refugio Frey desde Villa Catedral' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page).toHaveURL(/#\/orientation\/tracks$/);
  await expect(page.getByText('Todavía no importaste tracks')).toBeVisible();
});

test('seguir un track en vivo: en el track, desviado, sentido inverso y llegada', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  // En el segundo punto del track.
  await context.setGeolocation({ latitude: -41.164, longitude: -71.428 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await page.getByRole('link', { name: 'Seguir el track' }).click();
  await expect(page.getByRole('heading', { name: 'Siguiendo Refugio Frey desde Villa Catedral' })).toBeVisible();

  const status = page.getByTestId('follow-status');
  await expect(status).toHaveText('Vas por el track');
  const stats = page.getByTestId('follow-stats');
  await expect(stats).toContainText('Recorrido');
  await expect(stats).toContainText('Falta');
  // Quedan la subida al refugio y el repecho del medio.
  await expect(stats).toContainText('+560 m / −10 m');
  await expect(page.getByTestId('follow-next')).toContainText('Próximo punto: Arroyo');
  await expect(page.getByTestId('follow-map')).toBeVisible();

  // A un kilómetro al norte: fuera del track, con el rumbo para volver.
  await context.setGeolocation({ latitude: -41.155, longitude: -71.428 });
  await expect(status).toContainText('Te saliste del track');
  await expect(status).toContainText('S');

  // En sentido inverso, desde el refugio: falta todo y se baja.
  await context.setGeolocation({ latitude: -41.17, longitude: -71.44 });
  await page.getByRole('button', { name: 'Recorrer en sentido inverso' }).click();
  await expect(page.getByText('En sentido inverso: del final al inicio.')).toBeVisible();
  await expect(status).toHaveText('Vas por el track');
  await expect(stats).toContainText('+10 m / −710 m');

  // Llegada al inicio (que en inverso es el final).
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42 });
  await expect(status).toHaveText('Llegaste al final del track');

  // En el mapa (sin teselas: alcanza con que se dibuje y tenga los botones), siguiéndome de entrada.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await expect(page.getByTestId('follow-map')).toBeVisible();
  await page.getByRole('button', { name: 'Mapa 2D / 3D' }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('follow-map')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seguir mi posición' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Mapa en 3D' }).click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-terrain', 'on');
  // La elección queda guardada.
  await page.getByRole('link', { name: 'Volver' }).click();
  await page.getByRole('link', { name: 'Seguir el track' }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mapa en 3D' })).toHaveAttribute('aria-pressed', 'true');
});
