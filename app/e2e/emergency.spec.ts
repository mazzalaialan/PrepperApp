import { expect, test, type Page } from '@playwright/test';
import { cancelCount, fakeSpeech, spokenLines } from './fakeSpeech';

const PASSWORD = 'prueba-segura-123';
// Bariloche: hay cuartel en los datos oficiales y Radio Nacional (LRA 30).
const HERE = { latitude: -41.1335, longitude: -71.3103 };

test.use({ geolocation: HERE, permissions: ['geolocation'] });

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

async function mockOsm(page: Page) {
  const ctx = page.context();
  await ctx.route('https://overpass-api.de/**', async (route) => {
    const query = new URLSearchParams(route.request().postData() ?? '').get('data') ?? '';
    if (query.includes('amenity')) {
      // Búsqueda de cercanos: una comisaría con teléfono.
      await route.fulfill({
        json: { elements: [{ type: 'node', id: 1, lat: -41.135, lon: -71.305, tags: { amenity: 'police', name: 'Comisaría 28', phone: '+54 294 442 2030', 'addr:street': 'Mitre', 'addr:housenumber': '100' } }] },
      });
    } else {
      // Alrededores: calles, ruta y mojón.
      await route.fulfill({
        json: {
          elements: [
            { type: 'way', id: 2, center: { lat: -41.1336, lon: -71.3104 }, tags: { highway: 'residential', name: 'Moreno' } },
            { type: 'way', id: 3, center: { lat: -41.1337, lon: -71.31 }, tags: { highway: 'residential', name: 'Rolando' } },
            { type: 'way', id: 4, center: { lat: -41.134, lon: -71.311 }, tags: { highway: 'trunk', ref: 'RN 40' } },
            { type: 'node', id: 5, lat: -41.14, lon: -71.31, tags: { highway: 'milestone', distance: '1990' } },
          ],
        },
      });
    }
  });
  await ctx.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: { address: { road: 'Mitre', house_number: '250', city: 'San Carlos de Bariloche', state: 'Río Negro' } } }),
  );
}

test('contactos: números nacionales, buscar cercanos (oficial + OpenStreetMap), guardar, editar y borrar', async ({ page, context }) => {
  await mockOsm(page);
  await setup(page);
  await page.getByRole('link', { name: 'Emergencias' }).first().click();
  await expect(page.getByRole('heading', { name: 'Emergencias' })).toBeVisible();
  await page.getByRole('link', { name: /Contactos de emergencia/ }).click();

  // Números nacionales: tocar llama y se puede copiar.
  await expect(page.getByTestId('national-emergencies').getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911');
  await expect(page.getByTestId('national-poison').getByRole('link', { name: '0800-333-0160' })).toHaveAttribute('href', 'tel:08003330160');
  await expect(page.getByTestId('national-same').getByRole('button', { name: 'Copiar 107' })).toBeVisible();

  // Cercanos: el cuartel oficial y la comisaría de OpenStreetMap.
  await page.getByRole('link', { name: 'Buscar cercanos' }).click();
  const list = page.getByTestId('nearby-list');
  await expect(list.getByText('Comisaría 28')).toBeVisible();
  await expect(list.getByText('Oficial').first()).toBeVisible();
  await page.getByRole('button', { name: 'Bomberos', exact: true }).click();
  await expect(list.getByText('Comisaría 28')).toHaveCount(0);
  await expect(list.locator('li').first()).toContainText('Bomberos');
  await page.getByRole('button', { name: 'Policía', exact: true }).click();
  const police = list.locator('li').filter({ hasText: 'Comisaría 28' });
  await expect(police.getByRole('link', { name: '+54 294 442 2030' })).toHaveAttribute('href', 'tel:+542944422030');
  await expect(police.getByRole('link', { name: /Mitre 100/ })).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=Mitre%20100/);
  await police.getByRole('button', { name: 'Guardar Comisaría 28 en mis contactos' }).click();
  await expect(police.getByLabel('Guardado en mis contactos')).toBeVisible();
  // La intendencia del Nahuel Huapi, con su teléfono, el 105 y las frecuencias que publica el parque.
  const office = list.locator('li').filter({ hasText: 'Intendencia · Parque Nacional Nahuel Huapi' });
  await expect(office.getByRole('link', { name: '0294 442-3111' })).toHaveAttribute('href', 'tel:02944423111');
  await expect(office.getByRole('link', { name: '105' })).toHaveAttribute('href', 'tel:105');
  await expect(office.getByTestId('park-radio')).toContainText('VHF 155,675 MHz');

  // Sin conexión: igual aparecen los datos oficiales.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await page.getByLabel('Hasta').selectOption({ label: '30 km' });
  await expect(page.getByTestId('nearby-status')).toContainText('Sin conexión: se muestran los datos oficiales');
  await expect(list.locator('li').first()).toBeVisible();
  // Zonas agrestes: rangos más grandes y "lo más cercano", esté a la distancia que esté (3 de cada tipo).
  await expect(page.getByLabel('Hasta').locator('option')).toHaveText(['5 km', '15 km', '30 km', '50 km', '100 km', '200 km', 'Lo más cercano (sin límite)']);
  await page.getByLabel('Hasta').selectOption({ label: 'Lo más cercano (sin límite)' });
  await page.getByRole('button', { name: 'Bomberos', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await context.setOffline(false);

  // La comisaría guardada va en "Servicios de emergencia cercanos", antes de Mis contactos; uno cargado a mano, en Mis contactos.
  await page.getByTestId('back').click();
  const services = page.getByTestId('my-services');
  await expect(services).toContainText('Comisaría 28');
  const order = await page.locator('h2').allTextContents();
  expect(order.indexOf('Servicios de emergencia cercanos')).toBeLessThan(order.indexOf('Mis contactos'));
  expect(order.indexOf('Servicios de emergencia cercanos')).toBeGreaterThan(-1);
  await expect(page.getByTestId('my-contacts')).toHaveCount(0);
  await page.getByRole('link', { name: 'Nuevo contacto' }).click();
  await page.getByLabel('Tipo').selectOption({ label: 'Otro' });
  await page.getByLabel('Nombre').fill('Dr. Pérez');
  await page.getByLabel('Teléfono', { exact: true }).fill('294 155 123456');
  await page.getByLabel('Dirección').fill('Moreno 50, Bariloche');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const mine = page.getByTestId('my-contacts');
  await expect(mine).toContainText('Dr. Pérez');
  await expect(mine.getByRole('link', { name: '294 155 123456' })).toHaveAttribute('href', 'tel:294155123456');

  // Editar y borrar.
  await page.getByRole('link', { name: 'Editar Dr. Pérez' }).click();
  await page.getByLabel('Notas').fill('Clínico de la familia');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(mine).toContainText('Clínico de la familia');
  await expect(mine).not.toContainText('Comisaría 28');
  await page.getByRole('link', { name: 'Editar Comisaría 28' }).click();
  await expect(page.getByText('Fuente: OpenStreetMap')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(services).toHaveCount(0);
  await expect(page.getByText('Buscá los bomberos, comisarías, hospitales y ambulancias más cercanos')).toBeVisible();
});

test('mi ubicación para socorristas y radio', async ({ page }, testInfo) => {
  await fakeSpeech(page);
  await mockOsm(page);
  await setup(page);
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('location-decimal')).toHaveText('-41.13350, -71.31030');
  await expect(page.getByTestId('location-dms')).toHaveText(/41°08′00(\.\d)?″ S 71°18′37(\.\d)?″ O/);
  const refs = page.getByTestId('location-refs');
  await expect(refs).toContainText('Mitre 250, San Carlos de Bariloche, Río Negro');
  await expect(refs).toContainText('Moreno y Rolando');
  await expect(refs).toContainText('RN 40 · cerca del km 1990');
  const msg = page.getByTestId('location-message');
  await expect(msg).toContainText('Necesito ayuda. Mi ubicación:');
  await expect(msg).toContainText('Coordenadas: -41.13350, -71.31030');
  await expect(msg).toContainText('Ruta RN 40 cerca del km 1990');
  await expect(msg).toContainText('https://www.google.com/maps/search/?api=1&query=-41.133500,-71.310300');
  await expect(page.getByRole('link', { name: 'Llamar al 911' })).toHaveAttribute('href', 'tel:911');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-19-location.png`, fullPage: true });

  // Leer el mensaje en voz alta: las coordenadas cifra por cifra, sin el link; "Llamar" lo corta.
  await page.getByRole('button', { name: 'Leer en voz alta' }).click();
  await expect.poll(() => spokenLines(page)).toContain('Coordenadas: 41 coma 1 3 3 5 0 grados sur, 71 coma 3 1 0 3 0 grados oeste. Precisión: 0 metros.');
  const read = await spokenLines(page);
  expect(read[0]).toBe('Necesito ayuda. Mi ubicación:');
  expect(read.join(' ')).not.toContain('google.com');
  await expect(page.getByRole('button', { name: 'Dejar de leer' })).toBeVisible();
  const before = await cancelCount(page);
  await page.getByRole('link', { name: 'Llamar al 911' }).click();
  expect(await cancelCount(page)).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Leer en voz alta' })).toBeVisible();

  // Guardar este lugar como waypoint: llega el formulario con las coordenadas y la dirección.
  await page.getByRole('link', { name: 'Guardar como waypoint' }).click();
  await expect(page.getByRole('textbox', { name: 'Coordenadas' })).toHaveValue(/^-41\.13350*, -71\.31030*$/);
  await expect(page.getByLabel('Notas')).toHaveValue('Mitre 250, San Carlos de Bariloche, Río Negro');
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Casa' })).toBeVisible();
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('location-waypoint')).toContainText('Casa');

  await page.goto('/#/first-aid/radio');
  const stations = page.getByTestId('radio-stations');
  await expect(stations.locator('li').first()).toContainText('LRA 30 · San Carlos de Bariloche');
  await expect(stations.locator('li').first()).toContainText('AM 590');
  await expect(stations.locator('li').first()).toContainText('FM 95,5');
  await expect(page.getByText('156,800 MHz')).toBeVisible();
  // Montaña: las de Argentina y Chile juntas (en la cordillera se está a pocos km del otro país).
  const mountain = page.getByTestId('mountain-frequencies');
  await expect(mountain).toContainText('Argentina · FEM · emergencias en montaña');
  await expect(mountain).toContainText('140,970 MHz');
  await expect(mountain).toContainText('139,970 MHz');
  await expect(mountain).toContainText('Chile · Cuerpo de Socorro Andino');
  // Guardaparques, CONAF y Radio Club de Carabineros: solo con la vida en peligro.
  await expect(mountain).toContainText('Argentina · Guardaparques');
  await expect(mountain).toContainText('142,800 MHz');
  await expect(mountain).toContainText('Chile · CONAF (guardaparques de Chile)');
  await expect(mountain).toContainText('146,910 MHz');
  await expect(mountain.getByTestId('emergency-only')).toHaveCount(3);
  await expect(mountain.getByTestId('emergency-only').first()).toContainText('Solo si tu vida depende de eso');
  await expect(page.getByText(/No se incluyen las de Gendarmería ni policía/)).toBeVisible();
  // Bariloche está a 1,5 km del Parque Nacional Nahuel Huapi: sus frecuencias y teléfonos de emergencia.
  const park = page.getByTestId('park-section');
  await expect(park).toContainText('Parque Nacional Nahuel Huapi');
  await expect(park).toContainText('del límite');
  const here = park.getByTestId('park-here');
  await expect(here.getByTestId('park-radio')).toContainText('VHF 155,675 MHz');
  await expect(here.getByTestId('park-radio')).toContainText('Club Andino Bariloche');
  await expect(here.getByRole('link', { name: '105' })).toHaveAttribute('href', 'tel:105');
  // Los otros parques que publican frecuencia, de los dos países (Chile: Torres del Paine, CONAF 143,800).
  const others = park.getByTestId('park-others');
  await expect(others).toContainText('Parque Nacional Lanín');
  await expect(others).toContainText('Parque Nacional Torres del Paine');
  await expect(others).toContainText('VHF 143,800 MHz');
  await expect(mountain).toContainText('CONAF publica la 143,800 MHz');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-20-radio-park.png`, fullPage: true });

  // Una frecuencia que me dieron en el refugio, con el lugar donde estoy.
  await page.getByRole('link', { name: 'Agregar frecuencia' }).click();
  await page.getByLabel('Nombre').fill('Refugio Frey');
  await page.getByLabel('Frecuencia', { exact: true }).fill('147,450 MHz');
  await page.getByLabel('Tono, canal u otro dato (opcional)').fill('tono 88,5 Hz');
  await page.getByLabel('Notas').fill('Escuchan de 8 a 20 h');
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click();
  await expect(page.getByTestId('freq-place')).toContainText('41°08′');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const mine = page.getByTestId('my-frequencies');
  await expect(mine).toContainText('Refugio Frey');
  await expect(mine).toContainText('147,450 MHz');
  await expect(mine).toContainText('tono 88,5 Hz · a 0 m');
  await expect(mine).toContainText('Escuchan de 8 a 20 h');
  // No se mezcla con los contactos.
  await page.goto('/#/first-aid/contacts');
  await expect(page.getByText(/^Todavía no guardaste contactos/)).toBeVisible();
  // Editar.
  await page.goto('/#/first-aid/radio');
  await page.getByRole('link', { name: 'Editar Refugio Frey' }).click();
  await page.getByLabel('Frecuencia', { exact: true }).fill('147,460 MHz');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('my-frequencies')).toContainText('147,460 MHz');

  // Repetidoras: un CSV con ubicación (estilo RepeaterBook) se ordena por cercanía.
  const csv = [
    'Output Freq,Input Freq,Offset,Uplink Tone,Call,Location,Lat,Long,Op Status,Mode',
    '146.970,146.370,-0.600,100.0,LU2FCF,Rosario,-32.9468,-60.6393,On-Air,FM',
    '147.120,147.720,+0.600,123.0,LU8VCB,Bariloche,-41.14,-71.30,On-Air,FM',
    '438.500,433.500,-5.000,,LU5VAS,Esquel,-42.91,-71.32,Off-Air,DMR',
  ].join('\n');
  await page.getByTestId('repeaters-file').setInputFiles({ name: 'repeaterbook.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByTestId('repeaters-message')).toHaveText('Se importaron 3 repetidoras.');
  const rpt = page.getByTestId('repeaters').locator('li');
  await expect(rpt.nth(0)).toContainText('LU8VCB · Bariloche');
  const details = rpt.nth(0).getByTestId('rpt-details');
  await expect(details).toContainText('Escuchás en 147,120 MHz');
  await expect(details).toContainText('Transmitís en 147,720 MHz (+0,6 MHz)');
  await expect(details).toContainText('Subtono para abrirla: 123,0 Hz (CTCSS)');
  // Chile: el listado oficial de SUBTEL; desde Bariloche entran las del otro lado de la cordillera (menos de 150 km).
  await expect(page.getByTestId('repeaters-official')).toContainText('Incluye 7 del listado oficial de repetidoras de SUBTEL (Chile)');
  await expect(rpt.nth(1)).toContainText('CE7RCM RPT-B · Volcan Osorno, Puerto Varas');
  await expect(rpt.nth(1).getByTestId('rpt-official')).toContainText(/Radio Club Melipulli · licencia hasta el/);
  await expect(rpt.nth(1).getByTestId('rpt-distance')).toHaveText(/^10\d km$/);
  const esquel = rpt.filter({ hasText: 'LU5VAS' });
  const rosario = rpt.filter({ hasText: 'LU2FCF' });
  await expect(esquel.getByTestId('rpt-details')).toContainText('Modo digital');
  await page.getByText('¿Qué significa cada dato?').click();
  await expect(page.getByText(/Un tono grave que tu equipo manda/)).toBeVisible();
  // La distancia, siempre en km.
  await expect(rpt.nth(0).getByTestId('rpt-distance')).toHaveText(/^\d,\d km$/);
  await expect(rosario.getByTestId('rpt-distance')).toHaveText(/^\d{4} km$/);
  await expect(esquel).toContainText('LU5VAS · Esquel');
  await expect(esquel).toContainText('fuera de servicio');
  await expect(rpt.nth(9)).toContainText('LU2FCF · Rosario');

  // La exportación CSV de RepeaterBook no trae coordenadas: se ubica por la localidad (aproximada);
  // la que no se encuentra va al final, sin distancia.
  const noCoords = [
    'Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes,Digital Access',
    '145.21000,144.610000,,88.5,,LU7DOT,"Mar del Plata - Faro",,Argentina,FM ,',
    '145.39000,144.790000,,,,LU9XYZ,"Paraje Inexistente",,Argentina,FM ,',
  ].join('\n');
  await page.getByTestId('repeaters-file').setInputFiles({ name: 'RB_2610311757.csv.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from(noCoords) });
  await expect(page.getByTestId('repeaters-message')).toContainText('de 1 no se encontró la localidad');
  await expect(page.getByTestId('repeaters-message')).toContainText('1 venía sin coordenadas');
  await expect(rpt).toHaveCount(12);
  const mdp = rpt.filter({ hasText: 'LU7DOT' });
  await expect(mdp.getByTestId('rpt-distance')).toHaveText(/^≈ 1\.?\d{3} km$/);
  await expect(mdp).toContainText('Ubicación aproximada: centro de Mar del Plata, Buenos Aires');
  await expect(rpt.last()).toContainText('LU9XYZ');
  await expect(rpt.last().getByTestId('rpt-distance')).toHaveText('sin ubicación');

  // Siguen ahí al volver (guardadas en el dispositivo) y se pueden borrar.
  await page.goto('/#/first-aid');
  await page.goto('/#/first-aid/radio');
  await expect(rpt).toHaveCount(12);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar las importadas' }).click();
  // Se borran las importadas; las del listado oficial siguen.
  await expect(rpt).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Borrar las importadas' })).toHaveCount(0);

  // Leyenda de radioaficionados según el país (Argentina: ENACOM).
  await expect(page.getByTestId('ham-license')).toContainText('En Argentina la licencia la da ENACOM');
  // Avisar que una repetidora no funciona: abre el formulario con los datos ya escritos.
  await rpt.nth(0).getByRole('link', { name: 'Avisar que no funciona o tiene datos mal' }).click();
  const box = page.getByLabel('Mensaje', { exact: true });
  await expect(box).toHaveValue(/Repetidora en desuso o con datos mal:\nCE7RCM RPT-B · 146,820 MHz/);
  await expect(box).toHaveValue(/Fuente: listado oficial de SUBTEL \(Chile\) al 26\/10\/2026/);
});
