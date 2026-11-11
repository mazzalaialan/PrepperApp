# Proceso para revisar y corregir los diagramas de nudos (versión eficiente)

Objetivo: que cada diagrama represente el nudo real y se entienda, gastando pocos tokens. Reglas de oro (del usuario): se parte del nudo REAL (nunca se inventa), el dibujo tiene que SE ENTENDER, y no se hace trampa con los controles.

## Herramientas (baratas, sin mirar imágenes)
- `node check.mjs <id>… | all`: por figura, la secuencia arriba/abajo de cada cuerda (A/B), cruces ambiguos y, si hay `refs/<id>.json`, COINCIDE / NO COINCIDE con la referencia real (acepta el espejo).
- `node montage.mjs <id> <paso>`: UNA imagen con la figura completa y solo los cruces ambiguos ampliados (o los 4 de menor ángulo). Una lectura de imagen por figura, no una por cruce.
- `node trace.mjs <id> <paso>`: el recorrido detallado (solo si hace falta depurar).
- `node build.mjs`: regenera los SVG. `refs/<id>.json`: la secuencia leída de la referencia real, con fuente y licencia.

## Flujo por nudo (un nudo o un grupo chico por vez)
1. **Referencia (una sola vez por nudo, modelo con visión fuerte).** Conseguir la figura de referencia (preferir SVG vectoriales de Commons: se leen con un script, sin mirar), leer cruce por cruce la secuencia real, escribir `refs/<id>.json` (fuente, licencia, secuencia por cuerda del paso terminado y de los pasos que se puedan leer). Si no hay referencia confiable: "SIN REFERENCIA" y no se inventa.
2. **Corrección (modelo económico, en bucle automático).** Editar el spec; repetir `node check.mjs <id>` hasta que COINCIDA y no queden ambiguos sin justificar. Recién entonces mirar UN montage por figura cambiada. Máximo 4 vueltas por nudo; si no sale, informar qué se probó.
3. **Revisión visual final (una pasada, sobre los montages).** Ver los montages de las figuras cambiadas y decidir OK o CORREGIR con defectos concretos. No se vuelven a leer referencias ni a abrir recortes sueltos.
4. Commit por grupo. `npx vitest run src/modules/knots` antes de commitear.

## Límites para ahorrar
- No lanzar varios agentes de revisión a la vez sobre el mismo grupo ni ciclos completos de analista→corrector→analista: la verificación de secuencia es automática, la visual es una pasada.
- No releer lo que ya está aprobado (`escape`, grupos 1 y 3, y lo que `check.mjs` ya da COINCIDE y sin ambiguos).
- Respuestas de los agentes: corto, por nudo, solo lo que cambió.
