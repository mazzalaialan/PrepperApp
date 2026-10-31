# VikArg Prepping Tools — Documento de Arquitectura

> *"Hay que estar listo para que no te agarre un imprevisto".*

| | |
|---|---|
| Estado | Aprobado |
| Fecha | 2026-10-30 |
| Licencia del código | Open source (repositorio público en GitHub) |

---

## 1. Principios rectores

Estos principios ordenan todas las decisiones. Ante una duda de diseño, se resuelve a favor del principio de mayor jerarquía.

1. **Offline-first absoluto.** Toda funcionalidad que *puede* funcionar sin internet, funciona sin internet. La red es una mejora, nunca un requisito.
2. **Autosuficiencia.** Todo lo que se puede tener local y propio, se tiene local y propio. Ningún servicio de terceros es imprescindible; los servicios externos (clima, servidor) son configurables y reemplazables.
3. **El dispositivo es la fuente de verdad.** El servidor es opcional y auxiliar (notificaciones y transferencia). Si desaparece, no se pierde nada.
4. **Privacidad por defecto.** Los datos del usuario se cifran en reposo. El backup sale cifrado.
5. **Modularidad.** Cada funcionalidad es un módulo independiente que se puede habilitar, deshabilitar o degradar según las capacidades del dispositivo.
6. **Diseño para crecer.** El modelo de datos está preparado para sincronización desde el día 1, aunque la sincronización continua no exista todavía.

---

## 2. Alcance y plataformas

| Tema | Decisión |
|---|---|
| Tipo de app | Progressive Web App (PWA) instalable |
| Plataformas objetivo | **Android (Chrome)** y **PC (Chrome / Edge)** |
| iOS | Fuera de alcance (no se bloquea, pero no se prueba ni se optimiza) |
| Distribución | Instalación desde el navegador. Opcional: APK (TWA) en GitHub Releases. **Sin Play Store** por ahora (ver §13) |
| Idiomas | Español e inglés desde el inicio, arquitectura multi-idioma |
| Unidades | Sistema métrico por defecto, imperial seleccionable en Ajustes |
| Usuarios | Un solo usuario por instalación. Puede tener varios dispositivos |
| Monetización | Gratuita |

### 2.1 Degradación por capacidades

No se detecta "es PC" o "es celular": se detecta **cada capacidad** (brújula, acelerómetro, GPS, cámara, lector de códigos, notificaciones, etc.).

- Si un módulo **no puede funcionar** sin la capacidad → se muestra deshabilitado (grisado) con un mensaje que explica qué falta.
- Si un módulo **puede funcionar degradado** → funciona con carga manual. Ejemplos:
  - Sol y luna: sin GPS, el usuario elige una ciudad.
  - Mapa estelar: sin brújula, se puede rotar a mano.
  - Waypoints: sin GPS, coordenadas escritas a mano.

---

## 3. Arquitectura general

```
┌──────────────────────────── Dispositivo (PWA) ────────────────────────────┐
│                                                                            │
│  UI (React)  ──►  Módulos de funcionalidad  ──►  Núcleo (core)             │
│                   inventario, alertas,           db, crypto, i18n,         │
│                   biblioteca, mapas, sensores,   sensores, unidades,       │
│                   astronomía, clima, backup...   temas, capacidades        │
│                                                                            │
│  Service Worker (Workbox): app offline, aviso diario en segundo plano,     │
│                            recepción de push                               │
│                                                                            │
│  Almacenamiento:                                                           │
│   • IndexedDB "vikarg-user"     → datos del usuario (CIFRADOS)             │
│   • IndexedDB "vikarg-content"  → metadatos de biblioteca y mapas          │
│   • OPFS                        → archivos grandes: libros, PDF, mapas     │
│   • Cache Storage               → la app en sí (HTML/JS/CSS/íconos)        │
└────────────────────────────────────────────────────────────────────────────┘
            │  (opcional, solo con conexión)
            ▼
┌──────────── Servidor VikArg (Docker, autoalojado) ────────────┐
│  • Notificaciones push programadas                             │
│  • Transferencia de backup con código                          │
│  • (Opcional) sirve la propia PWA y los paquetes de biblioteca │
└────────────────────────────────────────────────────────────────┘

Servicios externos opcionales y reemplazables:
  • Clima: Open-Meteo (open source, autoalojable, URL configurable)
  • Paquetes de biblioteca: GitHub Releases y/o servidor propio (espejos)
```

---

## 4. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Lenguaje | **TypeScript** (estricto) | Tipado del modelo de datos; menos errores al escalar |
| UI | **React** | Ecosistema maduro, fácil de mantener por terceros (open source) |
| Build | **Vite** + `vite-plugin-pwa` (**Workbox**) | Rápido; genera el Service Worker y el manifest |
| Base local | **Dexie** (sobre IndexedDB) | Versionado de esquema y migraciones; volumen esperado bajo (miles de registros) |
| Archivos grandes | **OPFS** (Origin Private File System) | Libros, PDF y mapas de cientos de MB sin pasar por IndexedDB |
| Cifrado | **WebCrypto** nativo (AES-GCM, PBKDF2) + **WebAuthn PRF** para huella | Sin dependencias criptográficas externas |
| Estado | Zustand | Simple y liviano |
| Rutas | React Router | |
| i18n | i18next | Estándar; soporta plurales y fallback |
| Mapas | **MapLibre GL** + **PMTiles** + `maplibre-contour` | Mapas vectoriales offline; curvas de nivel calculadas en el dispositivo |
| PDF | **pdf.js** | Visor y extracción de texto para búsqueda |
| Búsqueda | **MiniSearch** | Índices serializables, se generan de antemano por paquete |
| Astronomía | `astronomy-engine` | Sol, luna, fases, planetas y coordenadas estelares, 100% offline |
| Declinación magnética | Modelo WMM (offline) | En Argentina el desvío supera los 10°; sin corregir, los rumbos son erróneos |
| Códigos de barras | `BarcodeDetector` nativo (Android). Respaldo `zxing-wasm` para PC: pendiente; mientras tanto en PC el código se tipea | |
| Imágenes | Compresión propia con `OffscreenCanvas` → WebP | Sin dependencias |
| Tests | Vitest + Playwright | |
| Servidor | Node.js + Fastify + SQLite, empaquetado en Docker | Mínimo, autoalojable en cualquier máquina |

---

## 5. Modelo de datos

### 5.1 Campos comunes (todas las entidades del usuario)

Preparan la app para sincronizar sin rehacer el modelo.

| Campo | Tipo | Uso |
|---|---|---|
| `id` | UUID v7 | Identificador global, ordenable por fecha, sin colisiones entre dispositivos |
| `createdAt` | ISO 8601 | |
| `updatedAt` | ISO 8601 | Resolución de conflictos (gana el último) |
| `deletedAt` | ISO 8601 \| null | Borrado lógico; se purga tras un período |

### 5.2 Entidades

```
Categoría 1───* Artículo 1───* Lote *───1 Ubicación (árbol, 4 niveles)
                    │                          │
                    └──* StockMínimo *─────────┘
Artículo / Documento / Ubicación / Waypoint ──* Adjunto (fotos)
```

**Categoría**
| Campo | Notas |
|---|---|
| `name` / `nameKey` | Las del sistema usan una clave de traducción; las del usuario, texto libre |
| `isSystem` | Las del sistema no se borran (sí se renombran u ocultan) |
| `hidden` | |
| `icon`, `color` | |
| `controlType` | `none` · `expiryDate` · `shelfLife` · `capacity` (ver §6) |
| `alertsEnabled` | Hay categorías sin notificaciones |
| `alertLeadDays` | Anticipación del aviso |
| `alertCapacityPct` | Umbral para tipo `capacity` |
| `order` | |

Categorías del sistema iniciales:

| Categoría | Control por defecto | Alertas |
|---|---|---|
| Agua | Fecha de vencimiento | Sí |
| Alimento | Fecha de vencimiento | Sí |
| Filtros de agua | Capacidad / usos | Sí |
| Filtros de aire | Fecha de vencimiento | Sí |
| Botiquín | Fecha de vencimiento | Sí |
| Energía / Iluminación | Vida útil desde fecha | Sí |
| Seguridad | Fecha de vencimiento | Sí |
| Fuego | Ninguno | No |
| Refugio | Ninguno | No |
| Abrigos | Ninguno | No |
| Higiene | Fecha de vencimiento | Sí |
| Herramientas | Ninguno | No |
| Entretenimiento | Ninguno | No |
| Otros | Ninguno | No |

**Ubicación**
| Campo | Notas |
|---|---|
| `parentId` | null = raíz |
| `depth` | 1 a 4 (validado). Ej.: Casa › Sótano › Estante 3 › Caja A |
| `name`, `notes` | |
| `waypointId` | Opcional: ubicación geográfica (ej.: escondite) |

**Artículo** (*qué es*)
| Campo | Notas |
|---|---|
| `name`, `categoryId`, `notes`, `barcode` | |
| `unit` | Texto libre (ej.: "latas", "L", "raciones"). Sin conversiones. Vive en el artículo para poder sumar sus lotes |
| `weightGrams` | Peso por unidad, **guardado siempre en gramos**; se muestra en el sistema elegido |
| `favorite` | Marca de seguimiento / favorito |
| `controlType` | null = hereda de la categoría |
| `alertsEnabled`, `alertLeadDays`, `alertCapacityPct` | null = hereda de la categoría |

**Lote** (*cuánto hay, dónde y hasta cuándo*)
| Campo | Notas |
|---|---|
| `itemId`, `locationId`, `quantity` | |
| `expiryDate` | Tipo `expiryDate` |
| `manufactureDate`, `shelfLifeMonths` | Tipo `shelfLife`: vencimiento calculado |
| `capacityTotal`, `capacityRemaining`, `capacityUnit` | Tipo `capacity`. El remanente se **carga a mano** |
| `notes` | |

No se guarda historial de movimientos: solo el estado actual.

**StockMínimo**: (`itemId`, `locationId`, `minQuantity`). Lo define el usuario.

**Documento personal**: `title`, `notes`, `tags` + N adjuntos (fotos). Ej.: copias de DNI, escrituras, pólizas. Distinto de los libros de la biblioteca.

**Adjunto**: `ownerType`, `ownerId`, `mime`, `width`, `height`, `order`, `blob` (cifrado). Artículos: 0–1 foto típicamente; documentos: N.

**Waypoint**: `name`, `lat`, `lon`, `alt`, `icon`, `notes`.

**Grupo familiar y recomendaciones**
- `HouseholdMember`: `label`, `count` (ej.: "Adultos", 2; "Niños", 1; "Perros", 1).
- `RecommendationRule`: `description`, `categoryId` o `itemId`, `quantityPerMemberPerDay`, `unit`, `targetDays`, a qué miembros aplica.
- Las reglas **las define el usuario**; la app solo calcula y sugiere un stock mínimo, nunca lo impone.

**Ajustes**: idioma, sistema de unidades, tema, ciudad o ubicación manual, URL del servidor, URL de clima, espejos de biblioteca, tiempo de autobloqueo.

### 5.3 Índice de alertas (no cifrado)

Tabla mínima `AlertIndex` (`lotId`, `itemName`, `dueDate`, `kind`), **guardada sin cifrar**. Permite que el aviso en segundo plano funcione con la app bloqueada y es lo único que se envía al servidor de push. Contiene solo nombre del artículo y fecha; cantidades, ubicaciones, fotos y waypoints permanecen cifrados.

### 5.4 Versionado y migraciones

- Esquema versionado con Dexie; cada versión tiene su migración.
- El formato de backup lleva su propia versión (`formatVersion`) y la versión de esquema; la importación migra backups antiguos.

---

## 6. Vencimientos y alertas

### 6.1 Tipos de control

| Tipo | Ejemplos | Fecha / condición de alerta |
|---|---|---|
| `none` | Abrigos, Refugio | Nunca |
| `expiryDate` | Alimentos, medicamentos, matafuegos | `expiryDate − leadDays` |
| `shelfLife` | Pilas, baterías | `manufactureDate + shelfLifeMonths − leadDays` |
| `capacity` | Filtros de agua | `capacityRemaining / capacityTotal < pct` |

### 6.2 Herencia de configuración

Para cada lote: **artículo → categoría → valor global**. Si el artículo tiene valor, gana el artículo; si no, el de la categoría; si no, el global (30 días por defecto). Si la categoría tiene `alertsEnabled = false` y el artículo no lo sobrescribe, no hay alerta.

### 6.3 Canales de aviso (se suman)

| Nivel | Mecanismo | Requiere | Garantía |
|---|---|---|---|
| 1 | Panel de alertas al abrir la app | Nada | Siempre |
| 2 | Periodic Background Sync → notificación local | App instalada (Android) | Aproximadamente diaria; la frecuencia la decide Chrome |
| 3 | Web Push desde el servidor propio | Servidor configurado y conexión | Confiable |

> **Nota:** en Android, Chrome entrega todo push a través de Google (FCM). El contenido viaja cifrado de punta a punta (RFC 8291): Google no lo puede leer. Es una limitación de la plataforma, no evitable en una PWA.

---

## 7. Seguridad y cifrado

### 7.1 Esquema de claves

```
Contraseña (≥ 8 caracteres) ── PBKDF2-SHA256 (600k iter.) ──► KEK₁ ─┐
Clave de recuperación (impresa) ── PBKDF2 ───────────────────► KEK₂ ─┼─► envuelven a la DEK
Huella (WebAuthn PRF, opcional) ─────────────────────────────► KEK₃ ─┘
                                                                     │
                                         DEK (AES-256-GCM, aleatoria)┘
                                         cifra los datos del usuario
```

- La **DEK** (clave de datos) se genera una vez y nunca sale del dispositivo sin envolver.
- Cambiar la contraseña solo re-envuelve la DEK; no re-cifra los datos.
- **Clave de recuperación:** código largo mostrado una única vez en la configuración inicial, para imprimir o anotar.
- **Si se pierden contraseña y clave de recuperación, los datos son irrecuperables.** La app lo advierte explícitamente.
- Desbloqueo diario con huella (opcional); la contraseña se pide periódicamente y tras reinicios.
- Autobloqueo por inactividad (configurable).

### 7.2 Qué se cifra

| Dato | Cifrado |
|---|---|
| Artículos, lotes, ubicaciones, documentos, waypoints, fotos, grupo familiar, reglas | **Sí** |
| Índice de alertas (§5.3) | No (decisión explícita) |
| Ajustes no sensibles (idioma, tema) | No (se necesitan antes del desbloqueo) |
| Biblioteca y mapas | No (contenido público y pesado) |

### 7.3 Consultas sobre datos cifrados

Los campos cifrados no se pueden indexar en IndexedDB. Dado el volumen esperado (miles de registros), **al desbloquear se descifra todo a memoria** y las consultas se hacen en memoria. Cada escritura se cifra y persiste al instante. Si el volumen creciera mucho, se agregan índices ciegos (HMAC) sin cambiar el modelo.

### 7.4 HTML importado

Los manuales HTML se muestran en un `iframe` con `sandbox` (sin scripts, sin acceso a la app) y una política CSP restrictiva.

---

## 8. Backup, restauración y transferencia

### 8.1 Archivo de backup (`.vikarg`)

ZIP con:
- `manifest.json`: `formatVersion`, versión de app y de esquema, fecha, encabezado criptográfico (DEK envuelta por contraseña y por clave de recuperación).
- `data.enc`: todas las entidades del usuario, cifradas.
- `attachments/*.enc`: fotos cifradas.
- Lista de paquetes de biblioteca y mapas instalados (**no** su contenido, para que el backup no pese GB). Al restaurar, la app ofrece volver a descargarlos.

Restaurar **reemplaza todo** (con confirmación). Para abrir el backup se pide la contraseña o la clave de recuperación.

### 8.2 Transferencia entre dispositivos

| Escenario | Método |
|---|---|
| Sin internet | Exportar archivo → botón *Compartir* de Android (Quick Share, Bluetooth, USB, mensajería) |
| Con internet | **Código de transferencia:** el backup (ya cifrado) se sube al servidor propio, que devuelve un código de 8 caracteres de un solo uso, válido 24 h. Se ingresa el código (o se escanea su QR) en el otro dispositivo |

Un QR con los datos completos se descartó: un QR guarda ~2,9 KB y un inventario con fotos pesa cientos de KB o más.

---

## 9. Servidor VikArg (opcional, autoalojado)

- **Imagen Docker** única: Node.js + Fastify + SQLite. Sin otras dependencias.
- **No hay instancia obligatoria:** cada usuario instala la suya o usa la de alguien de confianza. La URL se configura en Ajustes.
- Las claves VAPID (push) se generan en el primer arranque.

| Endpoint | Función |
|---|---|
| `GET /api/health` | Verificación desde la app; expone la clave pública VAPID |
| `POST /api/devices` | Registra la suscripción push; devuelve id + token del dispositivo |
| `PUT /api/devices/:id` | Reemplaza el índice de alertas (§5.3), zona horaria y hora de aviso |
| `DELETE /api/devices/:id` · `POST /api/devices/:id/test` | Baja · notificación de prueba |
| Tarea cada 10 min | Envía a cada dispositivo, a su hora local, solo las alertas nuevas o que vencen ese día |
| `POST /api/transfers` / `GET /api/transfers/:code` | Transferencia con código de un solo uso (§8.2) |

Implementación: Node 26 (TypeScript ejecutado sin build), Fastify y SQLite integrado (`node:sqlite`). Instalación: [SERVIDOR.md](SERVIDOR.md).
| Estático (opcional) | Sirve la propia PWA y los paquetes de biblioteca: instalación 100% autónoma |
| Mapas (opcional) | Sirve archivos PMTiles regionales con *range requests* para la descarga por área (§12) |

El servidor nunca ve datos del inventario, salvo el índice de alertas. Los backups le llegan cifrados.

---

## 10. Módulos

La app se organiza en siete secciones:

| Sección | Módulos |
|---|---|
| Botiquín | Botiquines por tipo, ficha médica familiar, guías de primeros auxilios (F4) |
| Documentos | Documentos personales con N fotos |
| Orientación | Brújula, inclinómetro, GPS y waypoints, mapas offline, mapa estelar |
| Meteorología | Clima, sol y luna, mapa de tiempo y peligros naturales (§12.4) |
| Inventario | Artículos, ubicaciones, alertas, categorías, recomendaciones |
| Huerta y cultivo | Calendario de siembra y cosecha (F7), canteros y seguimiento (F8) |
| Biblioteca | Manuales |

Navegación en el celular: Inicio, Botiquín, Documentos, Orientación, Meteorología y "Más" (Inventario, Huerta, Biblioteca). Inicio muestra las secciones en ese mismo orden, con las alertas arriba de todo. En pantallas anchas el riel lateral muestra todas. Ajustes se abre desde la barra superior; incluye Backup y transferencia (§8).

**Botiquines.** Un botiquín es una ubicación del inventario con `kitType` (`general`, `trauma`, `bleeding`, `anaphylaxis`, `burns`, `other`): físicamente es una caja o mochila que puede estar en la casa, el auto o la mochila de escape. Su contenido son lotes del inventario (se cargan una vez); lo que falta sale del stock mínimo por ubicación. La sección muestra los vencimientos de todo lo que está en botiquines o en la categoría Botiquín.

**Ficha médica** (`MedicalProfile`, cifrada): nombre, fecha de nacimiento, grupo sanguíneo, alergias, enfermedades, medicación habitual (nombre, dosis, cuándo), contacto de emergencia, médico / obra social y notas.

**Avisos de tiempo (lluvia y rayos).** Se activan por punto: cada waypoint tiene su interruptor, y "donde estoy" es una opción aparte.
- *Lluvia:* pronóstico de Open-Meteo cada 15 minutos (`minutely_15`) para las próximas 2 horas. En Sudamérica esos valores se interpolan del pronóstico por hora (solo Norteamérica y Europa central tienen modelos nativos de 15 minutos), así que la precisión es la de una hora; un aviso al minuto requiere radar (§12.4). Avisa una vez por episodio ("lluvia en unos 45 min · Refugio"). Con la app abierta revisa cada 15 minutos; en segundo plano lo hará el servidor propio.
- *Limitación de las PWA:* con la app cerrada el navegador no le da el GPS a la app, y el chequeo periódico de Chrome es de horas. Por eso, para "donde estoy" en segundo plano, el servidor usa la **última ubicación conocida**, que la app le envía cada vez que está abierta, e indica su antigüedad. Leer el GPS en segundo plano solo es posible con una app nativa.
- *Rayos (pendiente, requiere servidor):* GOES‑19 GLM de NOAA (dominio público, cubre Argentina, unos 8 km de precisión, retraso de alrededor de un minuto). El servidor procesa los archivos, guarda la última hora de descargas y avisa por push por distancia a los puntos con aviso activado. Se descartó Blitzortung: sus condiciones no permiten usar los datos para sistemas de aviso.
- *Radar (F5):* necesita el motor de mapas. La API gratuita de RainViewer quedó limitada a zoom 7 y sin predicción (2026); las fuentes se evalúan al llegar a F5.
- Todos estos avisos son orientativos, se calculan a partir de pronósticos y no son alertas oficiales.

**Guías de primeros auxilios:** se organizan por problema (trauma, sangrado profuso, anafilaxia, quemaduras…) y su contenido sale de manuales reconocidos de la Biblioteca (F4); la app no redacta indicaciones médicas propias.

| Módulo | Descripción | Sin sensor / sin red |
|---|---|---|
| Inventario | Artículos, lotes, categorías, stock mínimo, favoritos, búsqueda, peso total por ubicación | — |
| Ubicaciones | Árbol de 4 niveles | — |
| Alertas | §6 | — |
| Fotos | Cámara o archivo → WebP, máx. 1280 px, calidad ~0,75 | Archivo desde disco |
| Códigos de barras | Escaneo para buscar o crear artículos | Carga manual |
| Documentos | Documentos personales con N fotos y vencimiento opcional: avisa 60 días antes (turnos y trámites), en Inicio, Alertas y notificaciones (`doc:<id>` en el índice, tipo `expiry`) | — |
| Recomendaciones | Calculadora según grupo familiar y reglas del usuario | — |
| Brújula | Rumbo magnético y verdadero (WMM); integrada con mapas y estrellas | Deshabilitada |
| Inclinómetro | Pendiente en grados; resalta 30–45° como zona de riesgo de avalancha, con aviso de que es orientativo | Deshabilitado |
| GPS / Waypoints | Guardar puntos; rumbo y distancia a un waypoint | Coordenadas manuales |
| Mapas offline | §12 | — |
| Astronomía | Amanecer, anochecer, crepúsculos, fases lunares | Ubicación por GPS, por ciudad cercana (lista offline GeoNames) o tocando un punto en el mapa |
| Clima | Pronóstico descargado y cacheado; muestra "actualizado hace X" | Último dato guardado |
| Mapa estelar | Carta del cielo orientada con la brújula; estrellas hasta mag. ~5,5, constelaciones, planetas; Cruz del Sur destacada para hallar el sur | Rotación manual |
| Biblioteca | §11 | — |
| Huerta | Calendario (F7) y canteros (F8) | — |
| Backup | §8 | — |
| Ajustes | Idioma, unidades, tema, seguridad, servidor, espejos | — |

---

## 11. Biblioteca

### 11.1 En la app
- **Paquetes por categoría**, siguiendo la organización actual de las carpetas del autor. Cada libro conserva su idioma original. Categorías iniciales (20): Agua y aguas negras · Alimento · Animales e insectos · Cabuyería · Catástrofes · Cocina · Comunicaciones · Construcciones y herramientas · Cultivo · Defensa y entrenamiento · Energía · Higiene · Literatura general · Medicina y primeros auxilios · Mochilas, kits y preparación del hogar · Orientación · Psicología · Revista Comando · Supervivencia general · Vehículos y movilidad.
- Las categorías de la biblioteca son **independientes** de las categorías del inventario.
- Descarga bajo demanda desde una lista de **espejos** (GitHub Releases y/o servidor propio); se puede cambiar de espejo.
- Cada paquete incluye su **índice de búsqueda ya generado**: búsqueda de texto completo offline sin procesar nada en el dispositivo.
- El usuario también puede **importar** sus propios HTML, PDF o paquetes; esos contenidos se indexan al importarse.
- Visor HTML en `iframe` aislado (§7.4); visor PDF con pdf.js.

### 11.2 Herramienta de conversión (`tools/library-builder`)
Script en Python que recorre la carpeta de origen (una subcarpeta por categoría) y genera un paquete por categoría:

| Formato de origen | Conversión |
|---|---|
| EPUB, DOCX, ODT, etc. | Pandoc → HTML limpio |
| PDF con texto | PyMuPDF → HTML con imágenes extraídas |
| PDF escaneado | OCR (Tesseract, idioma detectado): texto para el índice + páginas como imágenes WebP |
| Imágenes | Redimensionadas y convertidas a WebP |

Salida por paquete: `manifest.json` (id, categoría, versión, idiomas, tamaño, hash), `books/<id>/index.html` + imágenes, `search-index.json`. Incluye un reporte de libros que fallaron o con conversión dudosa para revisar a mano.

---

## 12. Mapas offline

- **Los mapas no se precargan:** cada usuario descarga las zonas que le interesan (su ciudad, la ruta de evacuación, refugios en zonas remotas).

### 12.1 Descarga por área
1. Con conexión, el usuario **marca un área en el mapa**: un rectángulo, o un radio alrededor de un waypoint o refugio.
2. Le pone nombre (ej.: "Refugio Sierra") y elige el nivel de detalle (zoom máximo).
3. La app **muestra el tamaño estimado** antes de descargar.
4. Descarga el mapa vectorial y la elevación **solo de esa área** y los guarda como una "zona offline".
5. Las zonas se pueden actualizar, renombrar y borrar, y se pueden vincular a waypoints o ubicaciones del inventario.

Ejemplo: en un refugio remoto, el usuario baja un área de 20 km de radio con detalle de senderos; en su ciudad, un área más grande con menos detalle.

### 12.2 Fuentes de datos (configurables, en orden de prioridad)
| Fuente | Contenido | Nota |
|---|---|---|
| Servidor VikArg propio (**fuente principal**) | Archivo PMTiles regional que el operador descarga una vez + elevación. Alcance inicial: **Argentina, Chile y Uruguay** (~3–6 GB estimados; se mide en F5) | La app pide por *range requests* solo los tiles del área elegida |
| Fuentes abiertas que permiten descarga masiva | Elevación (ej.: Terrain Tiles de Open Data) | Configurable y reemplazable |
| Importación manual | Archivos `.pmtiles` (mapa y elevación) generados por el usuario | Siempre disponible; guía paso a paso incluida |

Los servidores públicos de teselas de OpenStreetMap **no** se usan para descargas: su política lo prohíbe.

### 12.3 Visualización
- **Sombreado de relieve y curvas de nivel se calculan en el dispositivo** a partir de la elevación.
- Se guarda en OPFS; la app pide almacenamiento persistente (`navigator.storage.persist()`).
- Sin conexión, el mapa muestra las zonas descargadas sobre un **contorno mundial liviano** incluido en la app (~1 MB), que también sirve para elegir un punto en el mapa (ej.: para astronomía).
- Capas propias: waypoints, zonas offline, posición GPS y rumbo de la brújula.

### 12.4 Mapa de Meteorología (tiempo y peligros naturales)
Es un **módulo de la sección Meteorología**, separado de los mapas de Orientación, aunque reutiliza sus funciones (proyección, dibujo, capas).
- **Mapa base muy simple:** solo el contorno de **Argentina, Chile y Uruguay** con provincias y regiones. Viene incluido en la app (Natural Earth, dominio público, simplificado, unos cientos de KB), así que funciona sin conexión y no necesita descargar zonas ni teselas. Por eso puede hacerse antes de F5.
- **Capas:** son opcionales, cada una se activa por separado y solo funciona con conexión. Muestran la hora de los datos; sin conexión queda lo último descargado. Los avisos con la app cerrada, por distancia a los waypoints con aviso activado, los hace el servidor propio. Nada de esto son alertas oficiales.

**Estado (v0.8, sin servidor):** implementado en `modules/weathermap/`. Mapa base propio (`tools/geo-data/build.mjs`: Natural Earth 1:10m simplificado, 60 provincias/regiones/departamentos + Malvinas + vecinos, 61 capitales, 104 volcanes del Smithsonian; ~70 KB comprimido) en proyección Web Mercator, la misma de las imágenes, para superponerlas sin reproyectar. Canvas con arrastre, pellizco, rueda, pantalla completa y tocar para ver el detalle. Fuentes verificadas en 2026-10 (todas abiertas, sin clave y con CORS, salvo donde se indica):

| Capa | Fuente | Estado |
|---|---|---|
| Satélite (nubes de tormenta) | GOES‑19 infrarrojo banda 13 (NASA GIBS, WMS EPSG:3857). Cada 10 min, ~45 min de demora; se busca la última imagen con pedidos de 16×16 px (si falta responde un PNG vacío). Animación de 2 h (13 imágenes) | ✅ |
| Radar de lluvia | RainViewer (13 imágenes, 2 h, teselas hasta zoom 7). En Argentina solo cubre el noreste: no publica los radares del SMN | ✅ (cobertura limitada) |
| Clima por zona | Open-Meteo, una consulta con las 61 capitales: temperatura, lluvia o viento con los colores de nivel | ✅ |
| Sismos | USGS, M2,5+ de la última semana, color por antigüedad | ✅ |
| Alertas de desastres | GDACS (ONU y Comisión Europea): ciclones tropicales/huracanes, inundaciones, sequías, incendios forestales y erupciones, con nivel verde/naranja/rojo | ✅ |
| Focos de calor | VIIRS NOAA‑20 375 m (NASA GIBS), por día (hoy y ayer); llama por grupo de focos (se agrupan los píxeles de la imagen). El producto de fuego de GOES es una imagen opaca y no sirve como capa | ✅ |
| Volcanes | Smithsonian GVP, incluido en la app (su servicio no tiene CORS) | ✅ |
| Rayos | GOES‑19 GLM (NOAA), procesado en el servidor | Pendiente: servidor |
| Tornados y alertas oficiales | No hay detección pública de tornados en tiempo real (solo radar y reportes). Las alertas del SMN (tormentas fuertes, viento, etc.) se publican en CAP/RSS sin CORS (`ssl.smn.gob.ar/CAP/AR.php`): las leerá el servidor | Pendiente: servidor |
| FIRMS (focos con clave) | NASA FIRMS, pide clave | Opcional en el servidor |
| Nivel de alerta volcánica | SERNAGEOMIN (Chile) y OAVV/SEGEMAR (AR) publican reportes, no datos | Pendiente |

**Fuentes sin API (decisión 2026-10-31):** la información que no tenga una API libre (alertas del SMN, nivel de alerta volcánica de SERNAGEOMIN y OAVV/SEGEMAR, reportes del SNMF, INPRES, etc.) se obtendrá con *web scraping* desde el servidor propio, que la normaliza y la sirve a la app. Se analiza fuente por fuente al instalar el servidor: términos de uso, frecuencia razonable de consulta (sin sobrecargar los sitios), caché y qué hacer cuando cambia el formato de la página.

Sin conexión: se ven el mapa, los volcanes, los waypoints y lo último guardado de sismos, alertas y clima por zona (cifrado, `weathermap-cache`). Con ahorro de batería, satélite y radar muestran solo la última imagen (sin animación).

Análisis inicial de candidatos (referencia):

| Capa | Fuentes candidatas | Viabilidad |
|---|---|---|
| Clima por provincia | Open-Meteo con varias coordenadas en una consulta | Alta |
| Tormentas animadas (radar) | Ver abajo | Depende de la fuente |
| Rayos | GOES‑19 GLM (NOAA), procesado en el servidor | Alta, requiere servidor |
| Terremotos | USGS (GeoJSON en tiempo real, dominio público); INPRES (AR) y CSN (Chile) para precisión local | Alta |
| Incendios | NASA FIRMS (focos de calor, clave gratuita); producto de incendios de GOES‑19 (cada 10 min, misma fuente que los rayos); reportes del SNMF (AR) | Alta |
| Volcanes | Ubicación: Smithsonian GVP. Nivel de alerta: SERNAGEOMIN (Chile) y OAVV/SEGEMAR (AR). Ceniza: VAAC Buenos Aires (SMN) | Media: varias publican reportes y no datos estructurados |

Detalle de las capas de tiempo:
1. **Clima del país o por provincia:** temperatura, lluvia y viento sobre el mapa.
   - *Opción A, propia y simple:* consultar Open-Meteo en una grilla de puntos (o en las capitales y centros de cada provincia, en una sola consulta con varias coordenadas) y dibujar valores o colores por provincia. Usa la fuente que ya está configurada y se autoaloja igual.
   - *Opción B:* capas de imagen de terceros. Se evalúan condiciones y disponibilidad.
2. **Tormentas animadas (radar):** dibujo de las tormentas con colores por intensidad y "fotos" cada 10–15 minutos durante las últimas 2 horas, en animación.
   - *Lo difícil es la fuente, no el dibujo:* la animación sobre MapLibre es simple; lo que falta es un radar abierto y estable para Argentina.
   - *Candidatos:* RainViewer (gratis, pero en 2026 limitado a zoom 7, nivel provincia, y sin predicción); radares del SMN (SINARAME), sin servicio público documentado, a consultar; imágenes infrarrojas de GOES‑19 (NASA GIBS, gratis, cada 10 minutos), que muestran las nubes de tormenta pero no la lluvia; lluvia pronosticada por Open-Meteo cada 15 minutos sobre una grilla, que es modelo y no observación.
   - *Decisión pendiente en F5:* según lo que esté disponible, radar real donde exista y satélite o modelo como respaldo, siempre aclarando qué se está viendo.

---

## 13. Distribución

| Canal | Estado |
|---|---|
| PWA en GitHub Pages | Canal principal |
| PWA servida por el servidor Docker propio | Alternativa autónoma |
| Paquete portable para PC (GitHub Releases, uno por versión) | App compilada + servidor local (`Iniciar VikArg.bat` con PowerShell en Windows, Python en Linux/Mac) en `localhost:47613`, puerto fijo porque los datos del navegador van por dirección. Para PCs sin internet o en pendrive |
| App Android nativa (APK con la app incluida) | **Decisión futura, no cercana.** Permitiría instalar en un celular sin internet (el APK se pasa por cable o Bluetooth) y usar el GPS en segundo plano. Una PWA no puede servirse a un celular desde otra PC por Wi-Fi: Chrome solo habilita cifrado y modo offline en HTTPS o `localhost` |
| Google Play Store | **Descartado por ahora**: agrega dependencia de Google (cuenta, verificación, revisión, 12 testers × 14 días) sin aportar funcionalidad. Se puede sumar más adelante sin cambiar la arquitectura |

---

## 14. Diseño e interfaz

- **Identidad:** VikArg Prepping Tools. Paleta derivada del logo (Vegvísir sobre azul noche):
  | Token | Uso | Referencia |
  |---|---|---|
  | `--bg` | Fondo | Azul noche |
  | `--accent` | Acentos, botones primarios | Cobre / bronce |
  | `--ok` | Estado correcto | Verde |
  | `--info` | Información | Azul acero |
  | `--danger` | Vencido / alerta | Rojo óxido |
- **Ícono simplificado** para tamaños chicos (solo el símbolo central en cobre sobre fondo oscuro), en SVG + PNG maskable.
- **Temas:** oscuro (por defecto), claro, **rojo nocturno** (preserva la visión nocturna; recomendado para el mapa estelar) y **ahorro de batería**.
- **Ahorro de batería** (`core/power/saver.ts`): fondo y tarjetas en negro puro (en OLED/AMOLED el píxel negro está apagado; en LCD no ahorra). Además, sin animaciones ni transiciones, chequeo de lluvia cada 60 min en lugar de 15, GPS y sensores cortados mientras la página no se ve y con la mitad de redibujos, y la realidad aumentada arranca con la cámara apagada. Depende del tema elegido, no del efectivo: si el horario nocturno pone el rojo, el ahorro sigue. Pendiente: activarlo solo por nivel de batería (Battery Status API, solo Chromium).
- Interfaz simple, navegación por módulos, mobile-first, usable con una mano y con guantes (objetivos táctiles ≥ 48 px).

---

## 15. Estructura del repositorio

```
/
├─ app/                     PWA
│  └─ src/
│     ├─ core/              db, crypto, i18n, sensors, capabilities, units, theme
│     ├─ modules/           inventory, locations, alerts, documents, recommendations,
│     │                     compass, inclinometer, waypoints, maps, astronomy,
│     │                     weather, starmap, library, backup, settings, security
│     ├─ ui/                componentes compartidos
│     └─ locales/           es, en
├─ server/                  servidor Docker (Fastify + SQLite)
├─ tools/
│  └─ library-builder/      conversión de libros a paquetes
└─ docs/                    este documento, guías (mapas, servidor), decisiones
```

---

## 16. Fases

| Fase | Contenido |
|---|---|
| **F0 — Base** | Proyecto, PWA instalable, temas, i18n, base de datos, cifrado y desbloqueo, ajustes, detección de capacidades |
| **F1 — Inventario** | Categorías, ubicaciones, artículos, lotes, stock mínimo, favoritos, fotos, códigos de barras, alertas en la app, backup y restauración |
| **F2 — Servidor** | Docker, push programado, código de transferencia, aviso diario en segundo plano |
| **F3 — Orientación, meteorología y botiquín** | Orientación: brújula, inclinómetro, GPS y waypoints con "ir al punto" (realidad aumentada con cámara y brújula). Meteorología: clima, sol y luna. Botiquín: botiquines por tipo y ficha médica. Documentos. Recomendaciones |
| **F4 — Biblioteca** | Visor, búsqueda, paquetes, importación y herramienta de conversión |
| **F5 — Mapas** | Orientación: descarga por área, importación de PMTiles, relieve, curvas de nivel, capas propias, guía. **Importar rutas GPX** (a validar: tracks, rutas y waypoints del archivo): lo importado queda como un conjunto propio, separado de "Mis waypoints" y "Mis rutas"; sus puntos no se mezclan con los del usuario salvo que él copie uno a mano, se muestran como capa que se activa o desactiva y se borran juntos. Meteorología: mapa base de AR, CL y UY con capas de tiempo y peligros naturales (§12.4) |
| **F6 — Mapa estelar** | Dos vistas: cielo completo (cúpula, gira con la brújula o a mano) y "apuntar al cielo" (realidad aumentada con la orientación del celular, con puntos cardinales, escala de acimut y círculos de altura; en PC se arrastra). 5.044 estrellas hasta magnitud 6, 88 constelaciones en español, Sol, Luna y planetas. Guía para encontrar el Sur (Cruz del Sur y Punteros) o el Norte (Osa Mayor y Polar) según el hemisferio, búsqueda de astros, fecha y hora, rojo nocturno. Datos de d3-celestial (BSD-3), generados con `tools/sky-data`. Vía Láctea pendiente (~150 KB simplificada) |
| **F7 — Huerta: calendario** | Gráfico con la época del año actual y una línea de tiempo de qué se puede sembrar, trasplantar y cosechar, con datos del INTA por zona (a terminar de analizar) |
| **F8 — Huerta: canteros** | Fase exclusiva. Carga de canteros y macetas (tamaño, horas de sol), recomendaciones de qué plantar según sol, época y zona, y seguimiento de cada planta con sus tareas. Referencia: https://huerta.diariodeljardin.com/planear/ (a terminar de analizar) |
| **Servidor (cuando esté instalado)** | Avisos de lluvia con la app cerrada (última ubicación conocida y waypoints), detector de rayos GOES‑19 con aviso por distancia |

**Orden de ejecución** (decidido el 31/10/2026; los números de fase se mantienen como identificadores):
F0 → F1 → F2 → F3 (hechas) → **F6 Mapa estelar** → F5 Mapas (incluye el mapa de Meteorología) → Servidor (avisos en segundo plano, rayos, peligros naturales) → F7 y F8 Huerta → **F4 Biblioteca, al final**.

---

## 17. Puntos abiertos

Ninguno. Documento aprobado para iniciar F0.
