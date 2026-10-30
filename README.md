# VikArg Survival

> *Hay que estar listo para que no te agarre un imprevisto.*

App de preparacionismo **offline-first** para Android y PC: inventario con vencimientos, ubicaciones, herramientas de campo (brújula, inclinómetro, waypoints, sol y luna, mapa estelar), mapas offline y una biblioteca de manuales de supervivencia. Todos los datos quedan en el dispositivo, cifrados.

Es una Progressive Web App: se instala desde el navegador (Chrome o Edge) y funciona sin internet.

## Principios

- **Offline-first:** todo lo que puede funcionar sin conexión, funciona sin conexión.
- **Autosuficiencia:** nada depende obligatoriamente de servicios de terceros. El servidor es opcional y autoalojable.
- **Privacidad:** los datos del usuario se cifran en el dispositivo (AES-256-GCM).

La arquitectura completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `app/` | La PWA (TypeScript + React + Vite) |
| `docs/` | Arquitectura y guías |
| `server/` | Servidor opcional en Docker *(fase F2)* |
| `tools/library-builder/` | Conversión de libros a paquetes de biblioteca *(fase F4)* |

## Desarrollo

Requiere Node.js 22 o superior.

```bash
cd app
npm install
npm run dev        # servidor de desarrollo
npm test           # tests
npm run build      # build de producción en app/dist
npm run preview    # sirve el build (para probar la PWA y el modo offline)
```

Para probar en un celular Android en la misma red: `npm run dev -- --host` y abrir la IP que muestra. Los sensores y la instalación como app requieren HTTPS; para eso usar el deploy de GitHub Pages.

## Licencia

[GPL-3.0-or-later](LICENSE). Podés usar, estudiar, modificar y redistribuir el código; las versiones modificadas que se distribuyan deben publicarse bajo la misma licencia.

## Deploy

Cada push a `main` publica la app en GitHub Pages mediante [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Hay que habilitarlo una vez en *Settings → Pages → Source: GitHub Actions*.
