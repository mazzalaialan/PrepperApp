# Entrenamiento: requisitos pedidos

Requisitos que dio quien dirige el proyecto el 7 de noviembre de 2026 para la sección «Entrenamiento». Lo ya hecho y lo que falta está en `docs/PENDIENTES.md` (sección 2); este documento conserva el **porqué y el alcance original** para decidir lo que falta sin perder criterio.

## Lo más importante

- **Grabación con modos de actividad:** caminar, correr, trekking, todas las variantes de remo (kayak, canoa, bote o remo de banco, SUP, rafting) y de ciclismo (ruta, montaña, gravel, urbana, bicicleta eléctrica). Los cálculos dependen de la actividad: calorías con el MET propio de cada una, ritmo en min/km para caminar, correr y trekking y velocidad en km/h para bicicleta y remo, y el desnivel pesa en trekking y montaña.
- **Sesiones bajo techo:** cinta (caminar o correr), elíptica y escalador. No tienen GPS: se carga a mano o con cronómetro (tiempo, distancia que marca la máquina, inclinación o desnivel si la muestra), calorías por MET y sin mapa.
- **Qué se registra:** tiempo de actividad (en movimiento y total), distancia, calorías, ritmo o velocidad promedio y desnivel acumulado (positivo y negativo). Pulso y datos propios de cada actividad cuando haya reloj conectado (más adelante, con Health Connect y HealthKit, que exigen la app nativa: dejar el modelo de datos preparado).
- **Mapa y perfil de altura:** marcar la ruta en el mapa y generar el perfil, como ya hacen los tracks importados de Wikiloc (se reutilizan el grabador de Tracks, el mapa y el perfil).

## También

Los extras sugeridos (planes, registro, desnivel y ritmo, historial) y lo útil para las actividades de una escuela de montaña (trekking, aproximaciones, alta montaña) y para supervivencia. Ideas:
- peso corporal por persona para las calorías (de la ficha médica «Yo»);
- parciales por kilómetro, altura máxima y mínima, historial con totales semanales, planes y metas, peso de la mochila para las calorías de trekking, vueltas, pausa automática, exportar GPX y compartir.

**Roles (alumno e instructor, para versiones institucionales): no ahora;** solo dejar el código preparado para una compuerta futura.

## Funciones de aplicaciones de running que encajan

«Lo que tengan las apps tipo Adidas Running y encaje»:
- entrenador por voz (estadísticas habladas cada kilómetro o cada N minutos, reutilizando la voz de las guías);
- entrenamientos por intervalos (temporizadores de trabajo y descanso);
- metas (distancia, tiempo o frecuencia por semana) y progreso;
- récords personales (1, 5 y 10 km más rápidos, el más largo, el de más desnivel);
- resúmenes semanales y mensuales y rachas;
- carga manual y botón de vuelta, cuenta regresiva de inicio, pausa automática;
- zonas de privacidad (ocultar inicio y fin cerca de casa);
- notas por actividad (cómo se sintió, superficie, clima completado desde el pronóstico);
- seguimiento de equipamiento (km por zapatillas, bicicleta o bote, con aviso de recambio);
- planificar una ruta (dibujarla con distancia y desnivel y seguirla, con las herramientas del mapa);
- importar y exportar GPX y TCX;
- **enlace de seguimiento en vivo para seguridad:** compartir la ubicación en tiempo real con la familia durante una salida (del lado del servidor, solo si la persona lo activa, y vence solo).

No se hace muro social, «me gusta» ni exceso de insignias.

## Salidas

Agrupar actividades en una **salida**, por ejemplo «Salida al Platita» (un cerro): todas las actividades de esa salida juntas (aproximación, ascenso, descenso, varios días), con totales combinados, mapa y perfil de altura, visible en la app y compartible por un **enlace público** para redes sociales.

El enlace público es una publicación del lado del servidor (la persona lo decide, de forma explícita): se sube una instantánea (recorrido simplificado, estadísticas y título; **sin fotos**, porque el crecimiento del almacenamiento del servidor no se podría controlar) y se sirve una página pública de solo lectura. Se puede borrar el enlace. No incluye datos privados (médicos, ubicación exacta del hogar); conviene recortar el inicio y el fin cerca de casa.

## Pantalla bloqueada y bloqueo de la app (acordado el 7 de noviembre)

Entrenamiento reutiliza el grabador de Tracks (`modules/tracks/recorder.ts`): el bloqueo automático de la app se pausa mientras se graba (`holdLock`) y el bloqueo manual de la bóveda no corta la grabación (los puntos se cifran con la clave de grabación y se unen al desbloquear).

Limitación de la web: el sistema suspende la página cuando se apaga la pantalla o se cambia de aplicación y queda un hueco. Por eso Entrenamiento arranca en **modo bolsillo** (pantalla negra y bloqueo de apagado), y tras un hueco muestra «se cortó la grabación entre HH:MM y HH:MM» y **no** une el hueco con una recta en distancia ni calorías (nuevo tramo). Grabar de verdad con la pantalla apagada es trabajo de la app nativa (ver `PENDIENTES.md`, sección 3).
