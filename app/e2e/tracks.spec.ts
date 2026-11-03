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

test('tracks de Wikiloc: importar, ver datos y perfil, ir a un punto y copiarlo o sacarlo de mis waypoints', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Está en Orientación.
  await page.goto('/#/orientation');
  await page.getByRole('link', { name: /^Tracks/ }).click();
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();

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
  await expect(page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // Desde el mismo botón se saca, y se puede volver a copiar.
  await page.goBack();
  await page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toHaveCount(0);
  await page.goBack();
  await page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' })).toBeVisible();

  // En la lista, con distancia y desnivel.
  await page.goto('/#/orientation/tracks');
  await expect(page.getByTestId('tracks-list')).toContainText('Refugio Frey desde Villa Catedral');
  await expect(page.getByTestId('tracks-list')).toContainText('2 puntos · Wikiloc');

  // Ir hasta uno de sus puntos con la brújula; ya no hay "ir al inicio" ni "ir al final".
  await page.getByRole('link', { name: /Refugio Frey desde Villa Catedral/ }).click();
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ir hasta Arroyo' }).click();
  await expect(page.getByRole('heading', { name: /Arroyo/ })).toBeVisible();

  // En el mapa, como capa propia.
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('button', { name: 'Tracks', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Se elimina desde la lista (con confirmación); el punto copiado queda en mis waypoints.
  await page.goto('/#/orientation/tracks');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar Refugio Frey desde Villa Catedral' }).click();
  await expect(page.getByTestId('tracks-list')).toHaveCount(0);
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // Y también desde el detalle del track.
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await expect(page.getByRole('heading', { name: 'Refugio Frey desde Villa Catedral' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page).toHaveURL(/#\/orientation\/tracks$/);
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();
});

test('grabar mi recorrido: sigue con la app bloqueada, pausa, mapa, volver al origen, pantalla negra y guardado', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/tracks');
  await page.getByRole('button', { name: 'Grabar mi recorrido' }).click();
  const bar = page.getByTestId('rec-bar');
  await expect(bar).toContainText('Grabando');
  // Avisa que con el celular bloqueado no se graba, hasta que se lee.
  const warn = page.getByTestId('rec-warn');
  await expect(warn).toContainText('Si bloqueás el celular o se apaga la pantalla, se deja de grabar.');
  await warn.getByRole('button', { name: 'Entendido' }).click();
  await expect(warn).toHaveCount(0);
  // Con mala señal no graba, y lo dice.
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 80 });
  await expect(page.getByTestId('rec-gps')).toContainText('Señal de GPS débil (±80 m)');
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await expect(page.getByTestId('rec-gps')).toHaveCount(0);
  // Que llegue la primera posición antes de moverse.
  await page.waitForTimeout(500);
  // Cada paso, unos 111 m al sur.
  const walk = async (lat: number) => {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  };
  await walk(-41.161);
  await walk(-41.162);
  await expect(page.getByTestId('rec-stats')).toContainText('222 m');
  // Aparece en la lista mientras se graba, sin poder borrarse.
  await expect(page.getByTestId('tracks-list')).toContainText('Grabando');

  // Con la app bloqueada se sigue grabando; al desbloquear vuelve a la misma pantalla con todo.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await expect(page.getByTestId('rec-locked')).toHaveText('Se sigue grabando tu recorrido.');
  await walk(-41.163);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page).toHaveURL(/#\/orientation\/tracks$/);
  await expect(page.getByTestId('rec-stats')).toContainText(/33\d m/);

  // Si el sistema cierra la app estando bloqueada, lo grabado mientras tanto (cifrado aparte) no se pierde:
  // al volver a entrar se suma y la grabación queda en pausa.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await walk(-41.164);
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(bar).toContainText('Grabación en pausa');
  await expect(page.getByTestId('rec-stats')).toContainText(/44\d m/);

  // En pausa no suma; al seguir arranca otro tramo.
  await walk(-41.17);
  await expect(page.getByTestId('rec-stats')).toContainText(/44\d m/);
  // El tramo nuevo arranca donde estás al seguir (no donde pausaste).
  await bar.getByRole('button', { name: 'Seguir grabando' }).click();
  await page.waitForTimeout(500);
  await walk(-41.171);
  await walk(-41.172);
  await expect(page.getByTestId('rec-stats')).toContainText(/66\d m/);
  await bar.getByRole('button', { name: 'Pausar la grabación' }).click();
  await expect(bar).toContainText('Grabación en pausa');
  await bar.getByRole('button', { name: 'Seguir grabando' }).click();

  // En el mapa offline, con su botón y lo grabado dibujado.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await page.goto('/#/orientation/maps');
  await expect(page.locator('.maps-camera').getByRole('button', { name: 'Pausar la grabación' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-recorded', '9');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-31-track-recording.png` });

  // Volver al origen por el mismo camino.
  await bar.getByRole('link', { name: 'Volver al origen' }).click();
  await expect(page.getByRole('heading', { name: 'Volviendo al origen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recorrer en sentido inverso' })).toHaveAttribute('aria-pressed', 'true');
  // Lo grabado (los dos tramos) va dibujado encima.
  await expect(page.getByTestId('follow-rec')).toHaveCount(2);
  await walk(-41.16);
  await expect(page.getByTestId('follow-status')).toHaveText('Llegaste al origen');

  // Pantalla negra: dos toques para volver.
  await bar.getByRole('button', { name: 'Pantalla negra (ahorra batería)' }).click();
  const pocket = page.getByTestId('pocket');
  await expect(pocket).toContainText('Grabando');
  await expect(pocket).toContainText('No bloquees el celular');
  await pocket.dblclick();
  await expect(pocket).toHaveCount(0);

  // Terminar: se le pone nombre (o se sigue grabando) y aparece en los tracks.
  await bar.getByRole('button', { name: 'Terminar y guardar la grabación' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar la grabación' });
  await expect(dialog.getByLabel('Nombre')).toHaveValue(/^Recorrido del/);
  await dialog.getByRole('button', { name: 'Seguir grabando' }).click();
  await expect(bar).toContainText('Grabando');
  await bar.getByRole('button', { name: 'Terminar y guardar la grabación' }).click();
  await dialog.getByLabel('Nombre').fill('Ida y vuelta');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Ida y vuelta' })).toBeVisible();
  await expect(page.getByText(/^Grabado el/)).toBeVisible();
  await expect(bar).toHaveCount(0);
  // Y el nombre y las notas se cambian después, en el track, con el lápiz.
  await page.getByRole('button', { name: 'Editar el nombre' }).click();
  await page.getByLabel('Nombre').fill('Nombre descartado');
  await page.getByLabel('Nombre').press('Escape');
  await expect(page.getByRole('heading', { name: 'Ida y vuelta' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar el nombre' }).click();
  await page.getByLabel('Nombre').fill('Ida y vuelta al arroyo');
  await page.getByLabel('Nombre').press('Enter');
  await expect(page.getByRole('heading', { name: 'Ida y vuelta al arroyo' })).toBeVisible();
  await expect(page.getByTestId('track-notes')).toContainText('Sin notas');
  await page.getByRole('button', { name: 'Agregar notas' }).click();
  await page.getByLabel('Notas').fill('Hay agua en el arroyo');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByTestId('track-notes')).toContainText('Hay agua en el arroyo');
  await expect(page.getByRole('button', { name: 'Editar las notas' })).toBeVisible();
  await page.goto('/#/orientation/tracks');
  await expect(page.getByTestId('tracks-list')).toContainText('Ida y vuelta al arroyo');
  await expect(page.getByTestId('tracks-list')).toContainText('Grabado por mí');
  await expect(page.getByRole('button', { name: 'Grabar mi recorrido' })).toBeVisible();
});

test('seguir un track en vivo: en el track, desviado, sentido inverso y llegada', async ({ page, context }, testInfo) => {
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

  // En pantalla completa, el estado y los datos van sobre el mapa.
  await expect(page.getByTestId('follow-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  const overlay = page.getByTestId('follow-overlay');
  await expect(overlay).toContainText('Vas por el track');
  await expect(overlay).toContainText('Faltan');
  await expect(overlay).toContainText('+710 m / −10 m');
  await expect(overlay).toContainText('Próximo punto: Arroyo');
  await context.setGeolocation({ latitude: -41.155, longitude: -71.428 });
  await expect(overlay).toContainText('Te saliste del track');
  // Que termine el movimiento del mapa hacia la nueva posición antes de la captura.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-30-track-follow-full.png` });
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(overlay).toHaveCount(0);
});
