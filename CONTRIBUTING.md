# Cómo colaborar

Gracias por querer sumar código a VikArg. Para que el proyecto pueda seguir ofreciéndose bajo GPL-3.0-or-later y también bajo una licencia comercial (doble licencia), cada colaborador acepta este acuerdo.

## Acuerdo de contribución (BORRADOR, pendiente de revisión por un abogado)

Al enviar una contribución (pull request, parche u otro medio), declarás que:

1. Sos el autor de lo que enviás o tenés derecho a aportarlo.
2. Conservás la titularidad de tu contribución.
3. Le otorgás al titular del proyecto una licencia perpetua, mundial, gratuita y no exclusiva para usar, modificar, sublicenciar y distribuir tu contribución, incluso bajo licencias distintas de la GPL (por ejemplo, comerciales).
4. Tu contribución se publica en el repositorio bajo GPL-3.0-or-later.
5. Si usaste herramientas de IA, lo indicás y verificaste que no copian código con licencia incompatible.

Para aceptarlo, escribí en el pull request: «Acepto el acuerdo de contribución de CONTRIBUTING.md».

## Antes de enviar

La guía completa de cómo se trabaja, se prueba y se publica está en [docs/COLABORAR.md](docs/COLABORAR.md); lo que falta hacer, en [docs/PENDIENTES.md](docs/PENDIENTES.md). Lo mínimo:

- Corré `npm test` y `npm run typecheck` en `app/` (y lo mismo en `server/` si tocás el servidor).
- Los textos de la app van en `app/src/locales/es.json` y `en.json`, en español rioplatense; los commits, en español.
- No pongas mails personales en el código ni en la documentación (solo `contacto.vikarg@gmail.com`).
- Cada dato o texto nuevo con su fuente y licencia (`docs/FUENTES-DE-DATOS.md`).
- No publiques versiones ni toques producción: lo decide quien dirige el proyecto.

Contacto: contacto.vikarg@gmail.com
