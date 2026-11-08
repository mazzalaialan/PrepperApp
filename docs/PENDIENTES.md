# Pendientes de VikArg

Plan acordado el 7 de noviembre de 2026, de lo más fácil a lo más complejo; estado al 8 de noviembre. Cada punto se hace con sus pruebas y su commit; se publica solo cuando se decide. Lo hecho desde la 0.43.0 está commiteado y todavía sin publicar.

## Hecho

- **Parques y frecuencias de Bolivia y Perú:** parques de Bolivia (SERNAP, de OpenStreetMap) y de Perú (SERNANP) en Radio, con el contacto de la sede central; red de emergencia de radioaficionados de Perú (RENER) con las frecuencias confirmadas del manual 2024 del Radio Club Peruano.
- **Lluvia estimada por satélite en Bolivia y Perú:** mapa ampliado; medido: 12,5 MB por actualización y 2,0 s de procesador, solo mientras alguien mira la capa.
- **Elegir una ubicación en el mapa:** en la edición de waypoints y en "Escribir coordenadas" (publicado en la 0.43.0).
- **Grabar recorrido con pantalla apagada:** al volver de un corte, avisa entre qué horas fue y pregunta si unir con una recta o dejar el tramo vacío.
- **Entrenamiento (base):** sesiones de caminata, correr, trekking, remo (kayak, canoa, bote, SUP, rafting), ciclismo (ruta, montaña, gravel, urbana, eléctrica) y bajo techo (cinta, elíptica, escalador); calorías (ACSM y MET) con el peso de la ficha médica; tiempo en movimiento, ritmo o velocidad, parciales por km, desnivel, mapa y gráfico de desnivel; historial por semana, récords y salidas que agrupan actividades con totales, mapa y desnivel de toda la salida. Los puntos grabados ahora llevan la hora.
- **Enlace público de una salida:** solo si se elige; título, recorrido simplificado, datos y gráfico, sin fotos; se recorta el inicio y el final cerca de casa, vence al año y se puede borrar.
- **Importar y exportar GPX/TCX:** cada actividad con GPS se exporta a GPX o TCX (con altura y hora) y se puede importar un archivo de Strava, Garmin o Wikiloc como actividad nueva.
- **Objetivos semanales:** distancia, tiempo y cantidad de actividades, con barras de avance en la semana. La pausa automática ya está cubierta: el tiempo en movimiento descarta las paradas.

## 1. Calendarios de huerta de Bolivia y Perú (decisión pendiente)

Se investigó y no existe un calendario oficial abierto de siembra por cultivo y mes: el INIAF (Bolivia) y el INIA (Perú) no lo publican, y los de Costa, Sierra y Selva del INIA están detrás de un login. Solo hay un manual de una ONG (2016, valle de Tarija) con cuadros gráficos. Los textos de la app ya dicen que no hay calendario oficial. A decidir con el usuario: dejarlo así, armar uno propio a partir del manual de la ONG (con la fuente y sin generalizar a otras zonas) o esperar una fuente oficial. No se parecen a ninguna zona argentina.

## 2. Entrenamiento: lo que falta

**Funciones de apps de running**

Voz con los datos cada km, intervalos, notas (cómo me sentí, terreno, clima automático), equipo (km de zapatillas, bici o bote), planificar rutas en el mapa, zonas privadas, seguimiento en vivo para la familia (opcional y con vencimiento). Sin muro social. Botón de vuelta y cuenta regresiva se revisan al encarar este punto (la carga manual ya está).

**Pantalla bloqueada**

- Usa el mismo grabador que Tracks: el bloqueo automático de la app se pausa mientras se graba y el bloqueo a mano no corta la grabación.
- En la web, si el sistema suspende la página (pantalla apagada), se pierde el tramo: arranca en modo bolsillo y, al volver, avisa entre qué horas se cortó y pregunta si unir con una recta o dejar el tramo vacío (hecho).

**Roles**

- Roles de alumno e instructor (copia institucional): ahora no; solo dejar el código preparado.

## 3. App nativa (Capacitor)

- Detectar la plataforma; guardado sin conexión para web y app; notificaciones nativas por Firebase; tocar una notificación abre la pantalla correcta.
- **Requisito indispensable:** la grabación (Tracks, Entrenamiento y seguir un track) **nunca se corta con el celular bloqueado o la pantalla apagada**. Android: servicio en primer plano con notificación fija y lo que pide Google Play (declaración, aviso destacado, video). iPhone: ubicación en segundo plano explicada al revisor. Pruebas en celulares reales con salidas largas y pantalla apagada (batería, ahorro de energía de Xiaomi, Samsung y otras marcas).

## 4. Después de la app nativa

- Barómetro en el altímetro (sensor de presión de Android y CMAltimeter de iPhone).
- Relojes: Health Connect (Android) y HealthKit (iPhone), con actividades y pulso.
