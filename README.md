# Herramientas de Supervivencia por VikArg

> *Hay que estar listo para que no te agarre un imprevisto.*

App de preparacionismo **offline-first** para Android y PC: inventario con vencimientos, ubicaciones, herramientas de campo (brújula, inclinómetro, waypoints, tracks, sol y luna, mapa estelar), entrenamiento (sesiones a pie, remo, ciclismo y bajo techo con calorías, desnivel y salidas), mapas offline, clima con avisos, emergencias y primeros auxilios, huerta (calendario por zona, canteros y avisos de helada y riego) y una biblioteca de manuales de supervivencia. Con datos de Argentina, Chile, Uruguay, Bolivia y Perú (servicios cercanos, emergencias y radio, según el país). Todos los datos quedan en el dispositivo, cifrados.

Es una Progressive Web App: se instala desde el navegador (Chrome o Edge) y funciona sin internet.

## Usarla sin internet

- **Celular o PC con internet una vez:** abrila y usá "Instalar app" en Chrome o Edge. Queda guardada y funciona sin conexión.
- **PC sin internet:** descargá el **paquete portable** de la [última versión](https://github.com/mazzalaialan/SurvTools/releases/latest), descomprimilo (sirve en un pendrive) y abrí `Iniciar VikArg.bat` (Windows) o `iniciar.sh` (Linux/Mac). Instrucciones en el `LEEME.txt` del paquete.

## Principios

- **Offline-first:** todo lo que puede funcionar sin conexión, funciona sin conexión.
- **Autosuficiencia:** nada depende obligatoriamente de servicios de terceros. El servidor es opcional y autoalojable.
- **Privacidad:** los datos del usuario se cifran en el dispositivo (AES-256-GCM). Con las notificaciones activadas, el servidor guarda solo lo necesario para los avisos (vencimientos y lugares redondeados a 1 km), y se borra desde Ajustes → Eliminar mi cuenta.

La arquitectura completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

Si vas a colaborar, empezá por [CONTRIBUTING.md](CONTRIBUTING.md) (acuerdo de contribución y mínimos), seguí con [docs/COLABORAR.md](docs/COLABORAR.md) (cómo se trabaja, se prueba y se publica) y mirá [docs/PENDIENTES.md](docs/PENDIENTES.md) (qué falta).

## Estructura

| Carpeta | Contenido |
|---|---|
| `app/` | La PWA (TypeScript + React + Vite) |
| `docs/` | Arquitectura y guías |
| `server/` | Servidor opcional: notificaciones push, avisos de lluvia, rayos, peligros naturales y huerta, mapas offline y transferencia ([guía de instalación](docs/SERVIDOR.md)) |
| `deploy/` | Docker Compose con HTTPS automático |
| `portable/` | Lanzadores del paquete para usar la app sin internet en una PC |
| `tools/library-builder/` | Conversión de libros (PDF, DOC, EPUB…) a HTML liviano por categoría, con informe *(fase Biblioteca, §11.2 de la arquitectura)* |

## Desarrollo

Requiere Node.js 22 o superior.

```bash
cd app
npm install
npm run dev        # servidor de desarrollo
npm test           # tests
npm run e2e        # pruebas de punta a punta (Playwright): celular solo donde importa, ~15–20 min
npm run e2e:rapido # sin mapas ni seguir tracks, solo escritorio: para el día a día
npm run build      # build de producción en app/dist
npm run preview    # sirve el build (para probar la PWA y el modo offline)
```

Para probar en un celular Android en la misma red: `npm run dev -- --host` y abrir la IP que muestra. Los sensores y la instalación como app requieren HTTPS; para eso usar el deploy de GitHub Pages.

## Licencia

[GPL-3.0-or-later](LICENSE). Podés usar, estudiar, modificar y redistribuir el código; las versiones modificadas que se distribuyan deben publicarse bajo la misma licencia.

También está disponible bajo una licencia comercial no exclusiva para quien no pueda o no quiera cumplir la GPL: contacto.vikarg@gmail.com. Para colaborar con código, ver [CONTRIBUTING.md](CONTRIBUTING.md) y [docs/COLABORAR.md](docs/COLABORAR.md).

## Deploy

Cada push a `main` publica la app en GitHub Pages mediante [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Hay que habilitarlo una vez en *Settings → Pages → Source: GitHub Actions*.
