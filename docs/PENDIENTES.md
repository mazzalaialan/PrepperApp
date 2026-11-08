# Pendientes de VikArg

Plan acordado el 7 de noviembre de 2026, de lo más fácil a lo más complejo. Cada punto se hace con sus pruebas y su commit; se publica solo cuando se decide.

## 1. Parques y frecuencias de Bolivia y Perú

- Parques de Bolivia (áreas protegidas de OpenStreetMap, como Chile) y de Perú (SERNANP, servicio de descarga, capa "ANP Nacional Definitiva"), con su sección en Radio.
- Frecuencias de emergencia de Perú, con la aclaración "sin confirmar": RENER (INDECI) VHF 146.960 MHz, HF 7.100 kHz, simplex 147.635 MHz, estación control OA4O; INDECI 155.640 MHz y 10.342 kHz; Cruz Roja Peruana 155.760 MHz; PMR 446.000–446.100 MHz; llamada VHF 146.520 MHz.

## 2. Calendarios de huerta de Bolivia y Perú

Con los datos del INIAF (Bolivia) y del INIA (Perú): altiplano, valles y trópico; costa, sierra y selva. No se parecen a ninguna zona argentina.

## 3. Lluvia estimada por satélite en Bolivia y Perú

Ampliar la zona del mapa de lluvia midiendo el costo de procesador del servidor.

## 4. Entrenamiento

**Lo más importante**

- Modos: caminar, correr, trekking; remo (kayak, canoa, bote, SUP, rafting); ciclismo (ruta, montaña, gravel, urbano, eléctrica). Bajo techo, sin GPS: cinta, elíptica y escalador.
- Cálculos según la actividad: tiempo total y en movimiento, distancia, calorías (según el esfuerzo de cada actividad y el peso de la ficha médica), ritmo (min/km) o velocidad (km/h), subida y bajada acumuladas. Frecuencia cardíaca y datos de cada actividad cuando se conecten relojes (los datos quedan preparados).
- Recorrido en el mapa y gráfico de desnivel, como los tracks importados de Wikiloc.

**Salidas**

- Agrupar actividades en una salida (por ejemplo "Salida al Platita"), con totales, mapa y desnivel de toda la salida.
- Enlace público para redes sociales, solo si se elige: título, recorrido simplificado, datos y gráfico, **sin fotos** (para controlar el espacio del servidor). Se puede borrar. Sin datos privados; se recorta el inicio y el final cerca de casa.

**Funciones de apps de running**

Voz con los datos cada km, intervalos, objetivos semanales, récords personales, resúmenes y rachas, botón de vuelta, cuenta regresiva, pausa automática, carga manual, notas (cómo me sentí, terreno, clima automático), equipo (km de zapatillas, bici o bote), planificar rutas en el mapa, zonas privadas, importar y exportar GPX/TCX, seguimiento en vivo para la familia (opcional y con vencimiento). Sin muro social.

**Pantalla bloqueada**

- Usa el mismo grabador que Tracks: el bloqueo automático de la app se pausa mientras se graba y el bloqueo a mano no corta la grabación.
- En la web, si el sistema suspende la página (pantalla apagada), se pierde el tramo: arranca en modo bolsillo y, al volver, avisa "se cortó la grabación entre HH:MM y HH:MM" sin unir el hueco con una línea recta.
- Roles de alumno e instructor (copia institucional): ahora no; solo dejar el código preparado.

## 5. Elegir una ubicación en el mapa

En todos los lugares donde se elige una ubicación (mi ubicación, waypoint, coordenadas), una opción más que abre el mapa para tocar un punto.

## 6. App nativa (Capacitor)

- Detectar la plataforma; guardado sin conexión para web y app; notificaciones nativas por Firebase; tocar una notificación abre la pantalla correcta.
- **Requisito indispensable:** la grabación (Tracks, Entrenamiento y seguir un track) **nunca se corta con el celular bloqueado o la pantalla apagada**. Android: servicio en primer plano con notificación fija y lo que pide Google Play (declaración, aviso destacado, video). iPhone: ubicación en segundo plano explicada al revisor. Pruebas en celulares reales con salidas largas y pantalla apagada (batería, ahorro de energía de Xiaomi, Samsung y otras marcas).

## 7. Después de la app nativa

- Barómetro en el altímetro (sensor de presión de Android y CMAltimeter de iPhone).
- Relojes: Health Connect (Android) y HealthKit (iPhone), con actividades y pulso.
