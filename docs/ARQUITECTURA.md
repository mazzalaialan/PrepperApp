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
| `waypointId` | Opcional: dónde está (uno de "Mis waypoints", o se crea con el GPS). Las de adentro heredan el de la de arriba. Sirve para los avisos de peligros naturales cerca de la reserva (ver "Avisos de peligros naturales") |

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

**Huerta** (§10.1): `GardenBed` (cantero o maceta: medidas, sol, en invernadero, `waypointId`) y `Planting` (cultivo de la ficha, cantero y cuadros, almácigo o siembra directa, fechas, estado, notas, cosechas con el lote del inventario si se sumó). Foto de cada siembra como adjunto `planting`.

**Ajustes**: idioma, sistema de unidades, tema, ciudad o ubicación manual, URL del servidor, URL de clima, espejos de biblioteca, tiempo de autobloqueo. Huerta: zona (o automática), fecha de la última helada, avisos de helada y riego, y el último "regué" de cada lugar.

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

### 8.3 Compartir con un familiar (`.vikshare`)

A diferencia del backup (que reemplaza todo y se abre con la contraseña propia), sirve para pasarle datos a **otra persona con su propia bóveda**, y se **suma** a lo que ya tiene (`modules/share`).

- **Contenido elegible:** huerta (canteros con su waypoint, siembras y cosechas), fichas médicas (con su foto y sus médicos/veterinarios, que viajan siempre con ellas), el resto de los contactos y los documentos (con fotos). Si no van las fichas, los documentos llegan como generales.
- **Cifrado:** JSON comprimido (gzip) y cifrado con una DEK nueva envuelta con una **contraseña elegida para el envío** (PBKDF2 + AES-GCM, igual que la bóveda). La contraseña se dice por otro medio.
- **Mezcla (`merge.ts`, función pura con pruebas):** nunca borra.
  - *Fichas:* la misma si tiene el mismo id (ya compartida antes) o mismo nombre y especie y la fecha de nacimiento no se contradice; el resumen permite separarlas ("no es la misma persona").
  - *Datos sueltos* (nacimiento, grupo, alergias, enfermedades, notas, teléfono, obra social, datos de mascota): si falta se completa; si difiere se pregunta, y por defecto queda el propio. Fechas de vacunas y desparasitación: la más reciente.
  - *Listas* (medicamentos, médicos, contactos de emergencia): se suman las que faltan, sin duplicar (teléfonos comparados por sus últimos 8 dígitos).
  - *No viaja lo que depende de quién mira:* parentesco, "Yo", "Mostrar en contactos" y el orden de los documentos. Las fichas nuevas llegan sin parentesco.
  - *Contactos:* el mismo si tiene el mismo id o teléfono; solo se completan sus datos vacíos. Las referencias (médico de una ficha, contacto de emergencia que es otra ficha) se reubican a los ids locales.
  - *Documentos:* se agregan los que no están (por id), con sus fotos.
  - *Waypoints:* el mismo si tiene el mismo id o el mismo nombre a menos de 30 m. *Rutas:* se agregan las que falten (por id o nombre), apuntando a los waypoints propios.
  - *Inventario* (apagado por defecto): categorías del sistema por id y propias por nombre; ubicaciones por nombre dentro de la misma ubicación padre; artículos por nombre dentro de la misma categoría (se completan código, unidad, peso y notas vacíos); lotes y mínimos se agregan los que falten (por id), así recibir dos veces no duplica el stock. Pensado para quienes comparten la casa.
  - *Huerta*: canteros (el mismo por id o por nombre) con el waypoint de cada uno (viaja aunque no se compartan los waypoints: sin él no hay helada ni riego); siembras que falten (por id), sin pisar cuadros ocupados de este lado; las cosechas llegan sin el lote del inventario del otro.
- Recibir el mismo archivo dos veces no duplica nada.
- **Regla para módulos nuevos (huerta y los que vengan):** todo módulo con datos del usuario suma su sección en `SHARE_SECTIONS` (`modules/share/package.ts`) y su regla de mezcla en `merge.ts`, con pruebas, siguiendo los mismos principios: no borrar, reconocer lo mismo por id o por un dato natural, completar lo vacío y no pisar lo que depende de quién mira.

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
| `PUT /api/devices/:id/stock` | Lugares con reserva del inventario (waypoints de las ubicaciones, ~1 km), solo para los avisos de peligros naturales |
| `PUT /api/devices/:id/garden` | Huerta (§10.1): un lugar por grupo de canteros a menos de ~1 km (coordenadas redondeadas, cultivos al aire libre y desde qué mínima se queman, datos del riego) y las tareas ya escritas. El servidor avisa la helada a partir de las 17 (la madrugada siguiente), el riego una vez por episodio y las tareas juntas a la hora de aviso |
| `DELETE /api/devices/:id` · `POST /api/devices/:id/test` | Baja · notificación de prueba |
| Tarea cada 10 min | Envía a cada dispositivo, a su hora local, solo las alertas nuevas o que vencen ese día |
| `POST /api/transfers` / `GET /api/transfers/:code` | Transferencia con código de un solo uso (§8.2) |

Implementación: Node 26 (TypeScript ejecutado sin build), Fastify y SQLite integrado (`node:sqlite`). Instalación: [SERVIDOR.md](SERVIDOR.md).
| Estático (opcional) | Sirve la propia PWA y los paquetes de biblioteca: instalación 100% autónoma |
| Mapas (opcional) | Sirve archivos PMTiles regionales con *range requests* para la descarga por área (§12) |

El servidor nunca ve datos del inventario, salvo el índice de alertas y, para los peligros naturales, un punto (~1 km) con el nombre de cada ubicación con waypoint donde hay reserva. De la huerta recibe un punto por lugar con los cultivos al aire libre y los datos del riego, y las tareas ya escritas. Los backups le llegan cifrados.

**Biblioteca privada** (fase Biblioteca, §11.2): los paquetes privados se sirven solo con la clave de acceso a la biblioteca privada configurada en el servidor.

---

## 10. Módulos

La app se organiza en siete secciones:

| Sección | Módulos |
|---|---|
| Emergencias (antes "Botiquín") | Contactos de emergencia, mi ubicación para socorristas, botiquines por tipo, ficha médica familiar, guías de primeros auxilios, radio |
| Documentos | Documentos personales con N fotos |
| Orientación | Brújula, declinómetro, inclinómetro, GPS y waypoints, mapas offline, mapa estelar |
| Meteorología | Clima, sol y luna, mapa de tiempo y peligros naturales (§12.4) |
| Inventario | Artículos, ubicaciones, alertas, categorías, recomendaciones |
| Huerta y cultivo | Calendario de siembra y cosecha, canteros y seguimiento |
| Biblioteca | Manuales |

**Declinómetro** (`/orientation/declination`, después de la Brújula; `modules/declination`): declinación de cualquier lugar (GPS, waypoint o coordenadas a mano) con el modelo WMM 2025 incluido (`magvar`, válido 2025–2030; fuera de ese período avisa), con dibujo de los dos nortes, cambio anual (diferencia con la fecha de un año después), error en metros por km si no se corrige, conversor de rumbos magnético ↔ verdadero con la cuenta a la vista, cuenta para un mapa de papel viejo (declinación y variación anual del margen, con botones "Oeste (−)" y "Este (+)" y el signo escrito con el número; el modelo no sirve para años anteriores) y un machete: fórmulas, regla "de la brújula al mapa: Este se suma, Oeste se resta", regla nemotécnica GMER (de Geográfico a Magnético, el Este Resta), pasos con brújula de placa, brújulas con ajuste, norte de cuadrícula y valores de la región. La Brújula enlaza al Declinómetro.

Navegación en el celular: Inicio, Emergencias, Documentos, Orientación, Meteorología y "Más" (Inventario, Huerta, Biblioteca). Inicio muestra las secciones en ese mismo orden, con las alertas arriba de todo. En pantallas anchas el riel lateral muestra todas. Ajustes se abre desde la barra superior; incluye Backup y transferencia (§8). **Acerca de** (`/about`, al pie del Inicio y al final de Ajustes): versión, privacidad, código fuente, formulario para reportar un problema, sugerir una mejora o dejar un mensaje (con versión y datos técnicos del dispositivo opcionales) que se envía como issue de GitHub o se copia; también se puede enviar por mail a contacto.vikarg@gmail.com (`CONTACT_EMAIL` en `core/about.ts`, la casilla de contacto de VikArg), y más adelante por el servidor. Incluye el enlace a cafecito.app/vikarg.

**Botiquines.** Un botiquín es una ubicación del inventario con `kitType` (`general`, `trauma`, `bleeding`, `anaphylaxis`, `burns`, `other`): físicamente es una caja o mochila que puede estar en la casa, el auto o la mochila de escape. Su contenido son lotes del inventario (se cargan una vez); lo que falta sale del stock mínimo por ubicación. La sección muestra los vencimientos de todo lo que está en botiquines o en la categoría Botiquín.

**Ficha médica** (`MedicalProfile`, cifrada): nombre, fecha de nacimiento, grupo sanguíneo, alergias, enfermedades, medicación habitual (nombre, dosis, cuándo), contacto de emergencia, médico / obra social y notas.

**Avisos de tiempo (lluvia y rayos).** Se activan por punto: cada waypoint tiene su interruptor, y "donde estoy" es una opción aparte.
- *Lluvia:* pronóstico de Open-Meteo cada 15 minutos (`minutely_15`) para las próximas 2 horas. En Sudamérica esos valores se interpolan del pronóstico por hora (solo Norteamérica y Europa central tienen modelos nativos de 15 minutos), así que la precisión es la de una hora; un aviso al minuto requiere radar (§12.4). Avisa una vez por episodio ("lluvia en unos 45 min · Refugio"). Con la app abierta revisa cada 15 minutos. **Con la app cerrada** avisa el servidor propio (`server/src/rain`, `server/src/lightning`): la app le manda los waypoints con aviso y, salvo que se apague en Ajustes → Notificaciones (`serverLocation`, prendido por defecto por decisión del usuario), la última ubicación conocida, que lee al abrir y cada 15 minutos solo si ya hay permiso de GPS. Todo va redondeado a 0,01° (~1 km); al apagarlo el servidor la borra. Si "donde estoy" está a menos de 10 km de un waypoint con aviso del mismo dispositivo, se ignora (`server/src/places.ts`). Al abrir la app, hasta tener GPS, manda `keepHere` para no perder el episodio en curso. El servidor revisa cada 15 minutos, consulta Open-Meteo de a 50 puntos sin repetir lugares, avisa una vez por episodio (se mantiene si "donde estoy" se movió menos de ~10 km) y no usa ubicaciones de más de 24 h. El push lleva la misma etiqueta que el aviso de la app abierta (`rain-<lugar>`), así que no suena dos veces. La fuente es intercambiable (`RainSource`). Lluvia observada: NOAA retiró GOES RRQPE (`ABI-L2-RRQPEF`) el 2026-11-02 a las 15:00 UTC; el reemplazo (Enterprise Rainfall Rate, `ABI-L2-FLDK-RRQPE-AWIPS`) solo se distribuye por PDA. El servidor revisa una vez por día si aparece en el bucket abierto (`rain/noaaWatch.ts`, en `/api/health`). EUMETSAT no tiene la lluvia del GOES-East en su Data Store (solo por EUMETCast); su lluvia del MTG (H SAF h40B, cada 10 min, ~3 MB, cuenta gratuita) nos ve en el borde del disco, con píxeles muy deformados y ~25 min de demora: descartada por ahora. **Estimación propia** (`rain/goesIr.ts`, `rain/observer.ts`): con la banda 13 del GOES-19 (infrarrojo de 10,3 µm, cada 10 min, 24 MB por archivo en franjas de 24 filas a lo ancho del disco) se leen con lectura parcial solo las franjas que cubren los lugares con aviso (50 km alrededor; ~400 KB por franja) y se pasa la temperatura del tope a lluvia con el Auto-Estimator de NESDIS (Vicente et al., 1998: R = 1,1183·10¹¹·exp(−3,6382·10⁻²·T^1,2), tope 72 mm/h; llueve desde 1 mm/h, ~235 K). Si en el lugar (a menos de 5 km) hay lluvia estimada, el aviso es "está lloviendo" con la intensidad, aunque el pronóstico no la tuviera; si no, decide Open-Meteo, que también avisa "en X min". Datos de más de 30 min no se usan. Es orientativa: yunques de cirros fríos dan falsas alarmas y la lluvia de nubes bajas no se ve. `RAIN_OBSERVED=false` la apaga. **Capa "Lluvia estimada (satélite)"** del mapa del tiempo (`rain/map.ts`): mientras alguien pidió `/api/rain/map` en los últimos 15 min, cada archivo nuevo (10 min) el servidor lee la región entera (~5,4 MB con lectura parcial), la pasa a Mercator con una tabla fija (720 × 1503 px, los mismos límites que el mapa) y arma un PNG propio (zlib, sin dependencias, ~30 KB) transparente donde no llueve, de celeste (1 mm/h) a rojo (>40 mm/h). La app pide la ubicación de la imagen cada 5 min con la capa prendida y la dibuja entre el satélite y el radar. Pendiente: radar del SMN (acceso pedido).
- *Limitación de las PWA:* con la app cerrada el navegador no le da el GPS a la app, y el chequeo periódico de Chrome es de horas. Por eso, para "donde estoy" en segundo plano, el servidor usa la **última ubicación conocida**, que la app le envía cada vez que está abierta, e indica su antigüedad. Leer el GPS en segundo plano solo es posible con una app nativa.
- *Rayos (hecho, servidor):* GOES‑19 GLM de NOAA (dominio público, cubre Argentina, unos 8 km de precisión, retraso de alrededor de un minuto). Cada 60 s, si hay lugares con aviso, el servidor lee los tres archivos nuevos del minuto con h5wasm (WebAssembly, sin binarios nativos) y **lectura parcial** (`satellite/partial.ts`, común a rayos e infrarrojo): en un worker intercepta `fs.readSync` de h5wasm sobre un archivo disperso del tamaño real y, cuando falta un bloque de 1 KB, espera (`Atomics.wait`) a que un segundo worker lo baje con HTTP Range. Así baja ~36 KB de ~380 KB por archivo (~155 MB por día) sin bloquear el servidor; si falla, baja el archivo completo. Después se queda con los rayos de buena calidad de la región y avisa por push a menos de 30 km, con distancia y dirección, como mucho una vez cada 10 minutos por lugar. **En el mapa del tiempo** (capa "Rayos", necesita el servidor): la app pide `GET /api/lightning` cada 20 s solo con el mapa a la vista y la capa prendida; cada tanda reemplaza a la anterior. Cada rayo es un círculo amarillo y cada grupo (celda de 36 px) lleva un ⚡ que titila a destiempo (fijo con ahorro de batería); se dibujan encima de las etiquetas del clima. Alrededor de mi ubicación, anillos de 10, 20 y 30 km. El servidor busca rayos cada 20 s si hay lugares con aviso o si alguien pidió el mapa en los últimos 5 minutos (`lightning/store.ts`). Se descartó Blitzortung: sus condiciones no permiten usar los datos para sistemas de aviso.
- *Radar (fase Mapas):* necesita el motor de mapas. La API gratuita de RainViewer quedó limitada a zoom 7 y sin predicción (2026); las fuentes se evalúan al llegar a la fase Mapas.
- Todos estos avisos son orientativos, se calculan a partir de pronósticos y no son alertas oficiales.

**Guías de primeros auxilios** (`modules/firstAid/guides`, hecho): primero "Lo primero" (proteger, avisar, ¿responde?, ¿respira?, sangrado, abrigo) y un botón **Empezar evaluación** que pregunta en orden (escena segura → responde → respira → sangra mucho → qué le pasó) y deriva al tema. Cada tema es un **árbol de pasos y preguntas** (`content.ts`, ES/EN en el mismo archivo, con pruebas que verifican que toda opción lleve a un paso existente y que todo sea alcanzable) con botones para llamar y, en zona agreste, acceso a Mi ubicación. El entorno (**ciudad** o **zona agreste**) se elige arriba a mano o con **Detectar con mi ubicación** (`detect.ts`, sin conexión: lo más cercano entre centros de salud de PBA, cuarteles de bomberos de todo el país y localidades del nomenclátor; tiempo estimado en auto = distancia en línea recta × 1,3 a 60 km/h; más de 60 minutos = zona agreste; la falta de conexión sola no lo define porque también pasa en ciudades), y queda guardado: cada paso puede valer para uno, otro o ambos (en zona agreste: pedir rescate con coordenadas, espera larga, abrigo, evacuar e improvisar). Temas: RCP, inconsciente que respira, sangrado (presión, torniquete, uniones, tronco, shock), atragantamiento, serpiente (yarará, cascabel, coral; sin torniquete, antiveneno vía Centro de Intoxicaciones), picaduras (alacrán, arañas, abeja), anafilaxia, caída de altura / columna, fracturas, quemaduras (térmica, química, eléctrica), dolor de pecho, ACV, convulsión, intoxicación y monóxido, hipotermia, golpe de calor, hipoglucemia y ahogamiento. El contenido sigue las recomendaciones del ERC (2021), la IFRC (2020), la AHA y la guía de ofidismo del Ministerio de Salud; la app aclara que no reemplaza un curso. **Lectura en voz alta** (`core/speech/speech.ts`, ajuste `guideVoice`): botón de altavoz en cada paso; lee título, instrucciones, pregunta y opciones con la voz del sistema (Web Speech API; en Android, las voces de Google instaladas, sin conexión; se prefiere una voz local y, en español, la de Argentina). Sin voz para el idioma, el botón no aparece. Una web no puede saber si hay una llamada en curso: la lectura se corta al tocar un botón de llamar y al pasar a segundo plano (abrir el marcador), y al volver no sigue sola (botón "repetir"). No se puede elegir altavoz o auricular: sale por el audio multimedia. Pendiente: enlazar con los manuales de la Biblioteca cuando exista.

**Números de emergencia por país** (`emergency/national.ts`; el país se detecta por la zona horaria y se cambia en Contactos o en la guía, queda en `settings.country`):
- *Argentina:* 911, 107, 100, 103, 106, 105, Centro Nacional de Intoxicaciones (0800-333-0160), Toxicología del Hospital de Niños R. Gutiérrez (0800-444-8694), Hospital de Quemados de la Ciudad (011 4923-4082), Línea de Salud Mental del Ministerio de Salud (0800-999-0091, 24 h) y 144.
- *Chile:* 131 SAMU, 133 Carabineros, 132 Bomberos, 134 PDI, 137 rescate marítimo, CITUC (+56 2 2635 3800, 24 h) y \*4141 prevención del suicidio.
- *Uruguay:* 911 (todas las emergencias), 104 Bomberos, 106 Prefectura, CIAT del Hospital de Clínicas (1722, 24 h), Línea Vida (0800 0767 / \*0767) y violencia doméstica (0800 4141 / \*4141).

**Datos sin conexión por país** (`emergency/country.ts`, `loadCountryData`): Argentina viene con la app (bomberos, comisarías y salud de PBA, Radio Nacional, nomenclátor Georef). Chile y Uruguay son **paquetes aparte** (`app/public/data/CL.json` ~420 KB y `UY.json` ~75 KB, generados con `tools/country-data/build.mjs`: bomberos, policía y centros de salud de OpenStreetMap (ODbL), localidades con población de GeoNames (CC BY 4.0) y radios), fuera de la precarga del service worker (`globIgnores: data/**`): se bajan en segundo plano al elegir el país (`useCountryPrefetch`) y quedan en Cache Storage (`vikarg-country`) para usarlos sin conexión; con conexión se renuevan solos. Los usan Buscar cercanos, la radio más cercana, la detección de ciudad o zona agreste y la ubicación de repetidoras de RepeaterBook sin coordenadas. Radio: Uruguay muestra Radio Uruguay (SODRE, AM 1050) y su red de repetidoras FM; Chile, que no tiene radio pública nacional, la red de Radio Bío-Bío (privada, todas las regiones) con una nota sobre el Sistema de Alerta de Emergencia (SAE) de SENAPRED. Pendiente: pasar también Argentina a paquete para aliviar la descarga de quienes usan la app en otro país.

La guía de primeros auxilios escribe los números con marcas (`{medical}`, `{same}`, `{emergency}`, `{fire}`, `{poison}`) que se completan según el país (`fillGuideText`), y sus botones de llamada salen de `CALLS[país]` sin repetir.
**Contactos de emergencia** (`modules/emergency/`, tabla `contacts`, cifrada y en el backup): Buscar cercanos tiene rangos de 5 a 200 km y "lo más cercano (sin límite)": los 3 más cercanos de cada tipo con los datos oficiales incluidos, y OpenStreetMap hasta 200 km; si no hay nada en el rango, muestra igual lo más cercano de cada tipo (zonas agrestes). la pantalla va en este orden: mis datos, números nacionales, **servicios de emergencia cercanos** (los contactos de tipo policía, bomberos, ambulancia, hospital o defensa civil, guardados desde "Buscar cercanos" o a mano, con el botón de búsqueda) y **mis contactos** (familia, médicos de las fichas, obra social y el resto). números nacionales (911, 107 SAME, 100, 103, 105, 106, Intoxicaciones 0800-333-0160, 144; fuente argentina.gob.ar), contactos propios y búsqueda de cercanos. El teléfono se toca para llamar (`tel:`) o se copia; la dirección abre Google Maps.
- *Cercanos sin conexión:* datos oficiales incluidos en la app (`tools/emergency-data/build.mjs`, CC BY 4.0): cuarteles de bomberos de **todo el país** (IGN / Consejo Nacional de Bomberos Voluntarios, ~1.080), comisarías (~320) y establecimientos de salud (hospitales, UPA, CAPS; ~2.300) de la Provincia de Buenos Aires.
- *Con conexión:* se suma OpenStreetMap (Overpass, con un espejo de respaldo porque los servidores públicos a veces se saturan) y se unen los duplicados (mismo tipo a menos de 150 m), completando teléfono y dirección.
- *Pendiente con el servidor:* catálogos de otras provincias (Córdoba, Santa Fe, CABA) y el REFES nacional.

**Mi ubicación para socorristas:** coordenadas (decimal y GMS), precisión y altura; con conexión, dirección aproximada (Nominatim), calles cercanas, ruta y mojón kilométrico (Overpass); sin conexión, distancia y rumbo al waypoint más cercano. Arma un mensaje listo para copiar, compartir, SMS o WhatsApp, y un botón para llamar al 911.

**Radio:** Radio Nacional más cercana con AM/FM (incluida en la app; fuente Wikipedia, ubicada con OpenStreetMap), frecuencias internacionales de socorro (VHF marítimo canal 16, aeronáutica 121,5 MHz) y nota sobre radioaficionados: un texto general (escuchar no requiere licencia; ante peligro de vida se puede pedir auxilio por cualquier medio) y la licencia según el país elegido (ENACOM, SUBTEL o URSEC). **Frecuencias de montaña** (con país Argentina o Chile, las de los dos países juntas: en la cordillera se está a pocos km del otro): FEM 140,970 MHz (solo emergencias) y las de uso libre 139,970 y 138,510 MHz (Resolución 5/2015; Federación Andinistas Argentinos 2021, Club Andino Mercedario 2024); en Chile no hay frecuencia oficial de montaña: se muestra la del Cuerpo de Socorro Andino (150,625 MHz, de guías de montaña, sin confirmación oficial) y se recomienda escuchar también la FEM. No se incluye la de guardaparques (142,800 MHz) por la regla de abajo. **Mis frecuencias:** las que le dan al usuario en un refugio o un club (tabla `contacts`, `kind: 'radio'`, con tono, notas y lugar). **Repetidoras:** se **importan** desde un archivo que el usuario exporta para uso personal (RepeaterBook: CSV, GPX o KML con coordenadas; o CSV de CHIRP, sin coordenadas) y se ordenan por cercanía. El CSV de RepeaterBook para Argentina **no trae coordenadas** (solo "Localidad - detalle"): esas se ubican en el centro de su localidad con un nomenclátor incluido en la app (`places-ar.json`, Georef INDEC/IGN CC BY 4.0 + población de Natural Earth para desempatar nombres repetidos; `tools/places-data/build.mjs`; se carga solo al importar) y la distancia se muestra con "≈"; se guardan cifradas (`repeaters`) y viajan en el backup. Las de RepeaterBook no se incluyen en la app: sus condiciones prohíben redistribuir, guardar para uso sin conexión o espejar sin permiso escrito, y su API requiere aprobación (pedido de permiso enviado desde contacto.vikarg@gmail.com; también al Radio Club Argentino por un listado para Argentina). **Listados oficiales** (información pública del Estado): Chile, el "Listado oficial de repetidoras" de SUBTEL (`tools/country-data/repeaters-cl.py` lee el PDF → `app/public/data/repeaters-CL.json`, ~190 repetidoras con radioclub titular, coordenadas y vencimiento de la licencia; `emergency/officialRepeaters.ts`). Se baja aparte y queda guardado como los paquetes por país; se muestra con país Chile y, con Argentina, las que estén a menos de 150 km del lugar (cordillera). Se mezclan con las importadas por cercanía, sin duplicar; las de licencia vencida se marcan. Argentina (ENACOM) y Uruguay (URSEC) no publican un listado de repetidoras. Cada repetidora tiene "Avisar que no funciona o tiene datos mal", que abre el formulario de Acerca de con los datos ya escritos (`/about?tipo=bug&texto=…`). **No se incluyen frecuencias de fuerzas de seguridad, Gendarmería ni guardaparques:** no son públicas, muchas están cifradas y captarlas sin autorización puede ser delito (Código Penal, art. 153).

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
| Inclinómetro | Pendiente en grados con la escala de avalanchas (como CalTopo y swisstopo): menos de 25° verde, 25–30° ámbar, 30–45° rojo (la gran mayoría de las placas), 45–55° naranja (menos placas, coladas frecuentes) y más de 55° gris (pared o roca); el riesgo nunca baja con más pendiente; aviso de que es orientativo | Deshabilitado |
| Mapas offline | §12. En Orientación va tercero, después de Brújula e Inclinómetro | — |
| Waypoints y Rutas | Guardar puntos; rumbo y distancia a un waypoint. Las rutas (puntos unidos en orden) van abajo, en la misma pantalla (`/orientation/routes` redirige ahí) | Coordenadas manuales |
| Tracks | Importados (GPX) y grabados con la app (§16, Mapas) | — |
| Astronomía | Amanecer, anochecer, crepúsculos, fases lunares | Ubicación por GPS, por ciudad cercana (lista offline GeoNames) o tocando un punto en el mapa |
| Clima | Pronóstico descargado y cacheado; muestra "actualizado hace X" | Último dato guardado |
| Mapa estelar | Carta del cielo orientada con la brújula; estrellas hasta mag. ~5,5, constelaciones, planetas; Cruz del Sur destacada para hallar el sur | Rotación manual |
| Biblioteca | §11 | — |
| Huerta | Fichas, calendario por zona, canteros en grilla, seguimiento, avisos de helada y riego (§10.1) | Zona elegida a mano |
| Backup | §8 | — |
| Ajustes | Idioma, unidades, tema, seguridad, servidor, espejos | — |

### 10.1 Huerta (definida el 05/11/2026)

Se hace todo junto: fichas, calendario, canteros, seguimiento y avisos.

**Fichas de cultivo** (incluidas en la app, sin conexión): unas 35 hortalizas y aromáticas de la huerta familiar. Cada una tiene familia (para la rotación), forma de siembra (directa o almácigo y trasplante), distancia entre plantas y entre líneas, días hasta la cosecha, comportamiento ante la helada (resistente, semirresistente, sensible), si tolera media sombra, si se puede en maceta, con qué asociarla y con qué no, con qué rotarla, período crítico de falta de agua, rendimiento orientativo y cómo se cosecha.

**Zonas.** Se sugieren con el waypoint de un cantero (si no hay, con el lugar del clima o el GPS: solo define la región). Regiones del INTA ProHuerta: Pampeana (centro y AMBA), NEA, NOA, Cuyo, Patagonia norte (valles irrigados) y Patagonia sur y andina. La app sugiere la zona según la ubicación y se puede cambiar a mano. **Chile y Uruguay** no tienen calendario oficial de huerta familiar (INIA Chile e INIA/MGAP Uruguay, revisado el 05/11/2026), así que usan la zona argentina de clima parecido y la app lo aclara: Uruguay → Pampeana; Chile central (Valparaíso a Biobío) → Cuyo; Araucanía a Aysén → Patagonia sur y andina; Magallanes → Patagonia sur y andina; norte de Chile → NOA. Opcionalmente, el usuario carga la fecha de su última helada de primavera: los cultivos sensibles no se recomiendan al aire libre antes de esa fecha.

**Fuentes de datos** (se citan en la app):
- Planificador ProHuerta (Parés, Ediciones INTA 2012, argentina.gob.ar): fichas y calendario de la zona Pampeana.
- Manual de cultivos para la huerta orgánica familiar (Goites, INTA 2008, CC BY 4.0): fichas, rendimientos, períodos críticos de agua.
- Calendario de cultivo a campo para el norte de la Patagonia (INTA EEA Alto Valle) y calendario del Valle Inferior del río Negro (INTA EEA Valle Inferior): Patagonia norte; también referencia para Cuyo.
- Planificador de huerta del sur de Santa Cruz (INTA EEA Santa Cruz): Patagonia sur y andina.
- Calendario de huerta agroecológica de La Rioja (INTA EEA La Rioja) y temporadas de Mendoza (INTA AER Rivadavia): NOA y Cuyo.
- Calendario de siembra para La Pampa (INTA EEA Anguil): control de la zona Pampeana.
- NEA: sin cartilla regional encontrada; se arma con la Pampeana corrida para clima subtropical (sin heladas fuertes, verano muy caluroso) y se marca como estimada.
Las publicaciones del repositorio del INTA tienen licencia CC BY-NC-SA 4.0: de ellas se toman solo datos (meses, distancias, días), no textos ni imágenes, y se citan.

**Calendario.** "Este mes": qué sembrar directo, qué almacigar, qué trasplantar y qué cosechar en la zona. Línea de 12 meses por cultivo con franjas de siembra directa, almácigo, trasplante y cosecha, y la marca de hoy.

**Canteros** (tabla `gardenBeds`, cifrada): nombre, tipo (cantero o maceta), **en invernadero** sí/no, ancho y largo, horas de sol directo, **waypoint** (uno de "Mis waypoints", como las ubicaciones del inventario; se puede crear en el momento con el GPS), notas. La helada y el riego se calculan **solo con el waypoint del cantero** (el GPS del celular está donde está la persona, no la huerta): un cantero sin waypoint no tiene esos avisos y la app lo marca. Los canteros cuyos waypoints están a menos de ~1 km son **un solo lugar con un solo aviso** (todos los de casa avisan una vez); canteros en lugares distintos (casa y campo) tienen cada uno su pronóstico, su lluvia, su aviso y su "regué". Los que están en invernadero no cuentan para el aviso de helada ni para el cálculo de riego por lluvia (no les llueve: se riegan siempre a mano). Se dibujan como **grilla de cuadros de 30 cm** (una maceta chica es un solo cuadro). Cada cuadro tiene lo que está plantado ahí. **Recomendaciones por cantero**: cultivos que se pueden sembrar o trasplantar ahora o el mes que viene en la zona, que toleran el sol que tiene (media sombra si tiene menos de 6 h) y la helada (en invernadero, la helada no cuenta), ordenados por asociaciones con lo que ya está plantado y penalizando la familia que ocupó ese cantero la temporada anterior (rotación). Cuántas plantas entran por cuadro según la distancia de la ficha.

**Seguimiento** (tabla `plantings`, cifrada): qué cultivo, en qué cantero y cuadros, cómo se sembró (directa o almácigo), fechas, estado (almácigo, sembrado, trasplantado, cosechando, terminado), notas y fotos, y la **cosecha** (fecha, cantidad, unidad). Al cargar una cosecha hay una opción **"Sumar al inventario"**: crea o suma un lote del artículo con el nombre del cultivo en la categoría Alimento. **Tareas automáticas**: trasplantar (almácigo + días de la ficha), empezar a cosechar (siembra o trasplante + días a cosecha), terminar; aparecen en las alertas de Inicio.

**Avisos.**
- **Helada:** si el pronóstico da mínima ≤ 2 °C en los próximos dos días y hay plantas sensibles o semirresistentes en canteros que no están en invernadero, avisa ("tapá los canteros"). Con la app abierta usa el pronóstico guardado; con la app cerrada, el servidor (ubicación de la huerta y una marca de que hay plantas sensibles; nada más del cultivo).
- **Riego:** balance de agua del suelo con la evapotranspiración de referencia (ET0, FAO-56) y la lluvia de Open-Meteo, y un coeficiente de cultivo según el estado de las plantas; solo cuentan los canteros que no están en invernadero. Si en los últimos días la lluvia no alcanzó y el déficit supera la reserva fácilmente aprovechable (según profundidad de raíz), avisa "regá"; después de regar se marca "regado" y el balance vuelve a cero. Mismo esquema: app abierta y servidor.
- El servidor recibe un punto por lugar (redondeado a ~1 km), no los canteros.

**Compartir** (§8.3): sección propia "Huerta" (canteros y siembras); se reconoce lo mismo por id y no se pisa lo del otro.

### 10.2 Cabuyería y anclajes (definida el 05/11/2026)

Sección propia en Inicio, **antes de Huerta**: Guía de nudos, Anclajes, Cuerdas y Glosario. Todo dentro de la app, sin conexión.

**Guía de nudos** (~40 para empezar). Cada ficha: nombres (principal, alternativos y en inglés, y el número de *The Ashley Book of Knots* cuando corresponde), para qué sirve, **paso a paso con imagen**, datos clave (si aguanta bajo carga, si se desata fácil después de cargarlo, si necesita nudo de seguridad, cuánta resistencia le saca a la cuerda, si sirve con cuerda mojada o resbalosa), errores comunes y cómo revisarlo, nudos relacionados y "para leer más" en la biblioteca. Los textos son propios.

**Búsqueda:** por nombre o alias (sin acentos), por **uso** (rappel y escalada, rescate, campamento y refugio, carga y transporte, náutica, pesca, primeros auxilios, supervivencia), por **tipo** (lazos, uniones, amarres, autobloqueantes, de tope, acortamientos, ataduras de palos), por propiedades ("se suelta fácil", "aguanta bajo carga", "con una mano") y un asistente "¿Qué necesito hacer?" con preguntas cortas.

**Modo práctica:** pantalla completa, imagen grande, anterior y siguiente, voz para leer cada paso (como las guías de primeros auxilios). Marcar "aprendido" para ver el progreso (en los ajustes del dispositivo).

**Cuerdas y glosario:** términos (chicote, firme, seno, vuelta, cote, gaza), tipos de cuerda (dinámica, estática, paracord, fibras naturales) y su cuidado. **Aviso de seguridad** en rappel, escalada y rescate: practicar con un instructor; la guía no reemplaza la formación.

**Imágenes** (la app es pública: no lleva imágenes de libros con derechos):
1. Dominio público: figuras del FM 3-05.70 (Apéndice G) y del FM 3-97.61 *Military Mountaineering* (Ejército de EE. UU.), separadas paso por paso.
2. Licencia libre: diagramas de Wikimedia Commons (CC BY-SA o dominio público), con crédito.
3. Dibujos propios en SVG para lo que no esté en ninguna de las dos.
4. **Biblioteca privada del usuario:** cada ficha guarda dónde aparece el nudo en los libros (ej.: "Enciclopedia ilustrada de los nudos, pág. 87"); si el paquete privado está en el dispositivo, la ficha muestra esas imágenes y el enlace al libro. La app no las lleva: las toma de la copia del usuario.

**Hecho (05/11/2026):** `modules/knots`, 36 nudos con 65 imágenes (~0,9 MB, en `public/knots/`, disponibles sin conexión): figuras de los FM separadas por paso con `tools/knot-images/extract.py`, y de Wikimedia Commons con autor y licencia en cada ficha. Búsqueda por nombre y alias sin acentos, uso, tipo y propiedades; asistente con 10 necesidades; modo práctica con voz; "aprendido" en Ajustes (`knotsLearned`). Las referencias a la biblioteca privada se suman cuando esté el visor de la Biblioteca.

**Anclajes** (`modules/knots/anchors.ts`, 19 fichas): lo básico (principios: fuerte, redundante, repartido, sin extensión, simple; ángulos y fuerzas; cómo probarlo), puntos naturales (árbol, bloques, piedras trabadas, salientes y puentes de roca, arbustos), cómo sujetar (cinta apoyada, rodeando o con alondra; cuerda atada; anclaje sin tensión), armados (repartido con cordino, autorrepartido, dos árboles con ocho de dos gazas, rappel con anillo de abandono) e improvisados (estacas con su tabla de resistencia, "hombre muerto", vehículo, vientos de carpa). Fuentes: FM 3-97.61 cap. 5 y FM 5-125 cap. 4 (dominio público), figuras incluidas. **Árbol:** el manual no da un tamaño; la app recomienda al menos 20 cm de diámetro (~63 cm alrededor del tronco) para una persona y 30 cm (~94 cm) para rescate, siempre vivo, sano, bien arraigado y atado abajo. **Ángulos:** la tabla del FM 3-97.61 (fig. 5-20) da 1150 % para 170°, un error (la cuenta es 574 %): la app usa los valores calculados y muestra solo el dibujo. Cada ficha enlaza sus nudos y cada nudo los anclajes en que se usa; el asistente suma "Armar un punto fijo".

**Revisión (05/11/2026):** se sacaron los números de Ashley que no se pudieron confirmar y se corrigió el nudo guarda según el FM 3-97.61 (dos mosquetones iguales, mejor ovalados).

---

## 11. Biblioteca

### 11.1 En la app (hecha el 05/11/2026)
- **Libros** (`/library/books`): el catálogo del servidor propio por categoría (secciones = subcarpetas). Cada libro muestra si es **libre** (verde: dominio público o licencia libre) o **con derechos** (candado). Se elige una categoría entera o libro por libro y se bajan juntos, con progreso. Los con derechos piden la **clave VikArg** (se comprueba sin conexión con la prueba de clave del catálogo; opcionalmente se recuerda, cifrada con la bóveda) y muestran el aviso de uso personal.
- **Cifrado:** los con derechos llegan cifrados (PBKDF2-SHA256, 600.000 iteraciones, + AES-256-GCM, formato `VKLB1` + IV + texto cifrado) y se descifran en el dispositivo. Se verifica el SHA-256 de cada descarga.
- **Sin conexión:** cada libro se guarda descomprimido en Cache Storage y lo sirve el service worker (`/library/books/<id>/…`, antes que la navegación de la app). El catálogo también queda guardado.
- **Visor** (`/library/read/:id`): `iframe` sin scripts (`sandbox="allow-same-origin"`), con el estilo de la app inyectado (tema y tamaño de letra), capítulos, anterior y siguiente.
- **Buscar en los libros** (`/library/search`): en el texto de los libros bajados (`text.txt` de cada paquete), sin acentos.
- **Actualizaciones:** si el SHA-256 del catálogo cambió, el libro muestra "hay una versión nueva" y se puede volver a bajar.
- Pendiente: espejos públicos (GitHub Releases) para los libres e importar libros propios en el dispositivo.

### 11.2 Herramienta de conversión (`tools/library-builder`) — definida el 05/11/2026

**Origen:** la colección del autor (~1856 archivos, 7,2 GB): 1597 PDF (1280 con texto, 317 escaneados con ~17.600 páginas; las 99 Revistas Comando son escaneadas), 163 DOC/DOCX, 18 EPUB, 5 MOBI, planillas, presentaciones y algunos archivos que no son libros. ~1000 en español y ~230 en inglés. Una carpeta por categoría (las 20 de §11.1) con subcarpetas que pasan a ser **secciones** dentro de la categoría (ej.: Animales e insectos → Mascotas, Granja).

**Dónde corre:** en Docker en el servidor (sin sudo, CPU sin AVX): Python + PyMuPDF, Pandoc, LibreOffice (DOC/PPT viejos), Tesseract (OCR `spa+eng`), conversión de MOBI. Sin OCR con IA. Retoma donde quedó (caché por hash de archivo): el OCR de los escaneados tarda de 12 a 24 h con 2 núcleos.

**Conversión** (objetivo: HTML liviano con la misma estructura del libro):
| Origen | Cómo |
|---|---|
| EPUB, DOCX, ODT, RTF, TXT, HTM | Pandoc → HTML limpio |
| DOC, PPT, PPTX, PPS | LibreOffice → DOCX o PDF → como arriba |
| MOBI | → EPUB → Pandoc |
| PDF con texto | PyMuPDF: texto con títulos detectados por tamaño de letra, sin encabezados/pies repetidos ni números de página, uniendo palabras cortadas; imágenes extraídas |
| PDF escaneado | OCR: texto + recorte de los dibujos y fotos de la página (regiones sin texto). **Nunca la página entera como imagen** |
| XLSX, XLS | Tabla HTML |
| CBZ | Imágenes en WebP |
| ZIP | Se descomprime (incluye `.zip` + `.z01`) y se procesa lo de adentro |
| STL, SKP, DXF, PSD, OPUS, BAK | Quedan afuera (anotados en el informe) |

- **Estructura:** índice del EPUB, marcadores del PDF o títulos detectados; notas al pie, tablas, listas y enlaces internos. Los libros grandes (más de ~200 páginas o de ~1 MB de HTML) se **separan por capítulo** con índice navegable.
- **Imágenes:** WebP, ancho máximo ~1200 px; las repetidas (logos, viñetas de cada página) una sola vez; tope de peso por libro.
- **HTML limpio:** sin scripts, estilos propios ni enlaces externos; el estilo lo pone la app (tema oscuro, rojo nocturno, tamaño de letra). Se lee en el visor aislado (§7.4).
- **Duplicados:** el mismo libro una sola vez, de la mejor fuente: EPUB > DOCX > PDF con texto > escaneado.
- **Datos de cada libro:** título, autor, año, idioma, categoría, sección, licencia, origen. Se leen del archivo cuando se puede y se corrigen con un archivo de ajustes por libro (`books.yaml`): título mal escrito, categoría equivocada, modo forzado, excluir.
- **Búsqueda:** un índice por paquete, en español e inglés sin acentos ni plurales, con tope de tamaño.
- **Actualización:** hash por libro: actualizar un paquete baja solo lo que cambió.

**Públicos y privados:**
- **Privado por defecto.** Los privados quedan **solo en el servidor propio**, **cifrados con la clave VikArg** (`run.sh package`; la clave en `~/vikarg-library/.library-key`, nunca en git), y el servidor los entrega solo con la clave; la app la pide al elegirlos y muestra el aviso de uso personal.
- **Públicos** (dominio público o licencia libre) van a los espejos. El conversor busca por el título y el origen (FM del ejército de EE. UU., FEMA, CDC, OMS, INTA, Cruz Roja, organismos públicos, licencias Creative Commons en el propio libro): lo que es público **con seguridad** se marca público; lo dudoso queda privado. Todo va en el informe para revisar.

**En la app:** se puede bajar una categoría entera o libro por libro (casillas).

**Informe** (`report.html`): cada libro con modo de conversión, páginas, peso antes y después, licencia (y por qué), duplicados, títulos o categorías corregidos, archivos que quedaron afuera y conversiones dudosas para revisar a mano.

**Orden:** primero Cabuyería (nudos), Cultivo (huerta) y Medicina y primeros auxilios, porque sirven para mejorar la guía de nudos, la Huerta y las guías de primeros auxilios de la app. Después el resto.

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
| Servidor VikArg propio (**fuente principal**) | `vector.pmtiles` (OpenMapTiles, armado con Planetiler) + `elevation.pmtiles` (Terrarium, bajado de Terrain Tiles), que el operador arma una vez. Alcance inicial: **Argentina, Chile y Uruguay** (tamaño a medir al armarlos) | El servidor lee el archivo y entrega cada tesela por `z/x/y` (`/api/maps/…`), así la app usa las mismas teselas que con las fuentes públicas. Respaldo automático a las públicas (ver abajo) |
| Fuentes abiertas que permiten descarga masiva | Elevación (ej.: Terrain Tiles de Open Data) | Configurable y reemplazable |
| Importación manual | Archivos `.pmtiles` (mapa y elevación) generados por el usuario | Siempre disponible; guía paso a paso incluida |

Los servidores públicos de teselas de OpenStreetMap **no** se usan para descargas: su política lo prohíbe.

**Estado (v0.9, sin servidor):** implementado en `modules/maps/` con MapLibre GL 6 (se carga aparte, solo al abrir el mapa, y queda en el precache con su worker) y `maplibre-contour`.
- *Fuentes mientras no haya servidor:* mapa vectorial de **OpenFreeMap** (OpenStreetMap, esquema OpenMapTiles, sin clave). Sus condiciones permiten descargas offline de hasta **3.000 teselas o 50 MB por zona**, con 4 pedidos en paralelo y un User-Agent propio. El navegador no deja cambiar el User-Agent; los pedidos llevan el origen de la app. Si hace falta, se les escribe. Elevación de **Terrain Tiles** (AWS Open Data, Terrarium) hasta zoom 12. Letras Noto Sans de OpenFreeMap.
- *Zona:* círculo alrededor del centro del mapa (2 a 50 km) y detalle (zoom 10, 12 o 14). La app estima teselas y MB y no deja pasar el límite. Se guarda en Cache Storage (`vikarg-maps`; las vectoriales con clave propia sin versión, porque OpenFreeMap cambia la URL cada semana), y los datos de la zona van cifrados (`map-zones`, viajan en el backup; si se restaura en otro dispositivo, la zona figura como "no está en este dispositivo"). Al borrar una zona se borran solo las teselas que no usa otra.
- *Lectura:* protocolos propios de MapLibre (`vktile`, `vkdem`, `vkglyph`) que buscan primero en lo descargado y si no, en internet sin guardar. Las curvas de nivel piden la elevación con `fetch` y la sirve el service worker desde lo descargado.
- *Capas:* relieve, curvas de nivel (equidistancia según el zoom, maestras rotuladas), mis waypoints y rutas, mi ubicación, zonas descargadas y el contorno de AR/CL/UY como referencia sin teselas. El estilo usa los colores del tema (rojo nocturno y ahorro incluidos).
- *Servidor propio (hecho):* `server/src/maps/` (lector y escritor de PMTiles v3, rutas `/api/maps`) y `app/src/modules/maps/sources.ts`. La app pide cada tesela primero al servidor si su archivo cubre ese lugar y zoom; si no responde, responde 503 por sobrecarga (`MAPS_MAX_CONCURRENT`) o 5xx, pasa a las fuentes públicas y deja al servidor de lado por un rato (su `Retry-After`, o 5 min). En *Origen de los mapas* se elige entre automático, solo el servidor o solo las públicas. Las zonas que el servidor cubre enteras usan su límite (60.000 teselas o 1,5 GB por defecto, radios de hasta 200 km). Si una zona supera el límite de OpenFreeMap, sus teselas de mapa salen solo del servidor, para no violar esas condiciones. Las claves de caché no cambian, así que las zonas ya bajadas siguen sirviendo y se mezclan sin problema (mismo esquema). Cómo armar los archivos: docs/SERVIDOR.md.
- *Pendiente:* importar `.pmtiles` a mano en la app. GPX: hecho (tracks importados y grabados).

### 12.3 Visualización
- **Sombreado de relieve y curvas de nivel se calculan en el dispositivo** a partir de la elevación.
- Se guarda en OPFS; la app pide almacenamiento persistente (`navigator.storage.persist()`).
- Sin conexión, el mapa muestra las zonas descargadas sobre un **contorno mundial liviano** incluido en la app (~1 MB), que también sirve para elegir un punto en el mapa (ej.: para astronomía).
- Capas propias: waypoints, zonas offline, posición GPS y rumbo de la brújula.
- **Herramientas** (`modules/maps/MapTools.tsx`, `measure.ts`), debajo del mapa; con una activa, el toque marca puntos y no abre waypoints:
  - *Medir:* dos puntos dan la distancia en línea recta; más puntos, un recorrido por tramos con desnivel positivo y negativo, altura de inicio, fin, mínima y máxima y un perfil. Las alturas salen de las teselas de elevación (zoom 12, ~30 m, interpolación bilineal; muestras cada ~30 m, hasta 1500) de las zonas descargadas o, con conexión, de las fuentes públicas; el desnivel usa un umbral de 5 m para que el ruido del modelo no sume. Sin elevación, solo la distancia.
  - *Dirección a un punto:* desde tu ubicación o, eligiendo "Desde: un punto del mapa" (o sin ubicación), desde un primer punto tocado, muestra rumbo verdadero, rumbo magnético para la brújula (con la declinación del modelo WMM), distancia, altura aproximada del punto, cuánto más alto o bajo está y el ángulo para mirarlo (ej.: marcar la cima del Tronador). Se puede guardar como waypoint para ir con "Ir a".
  - *En pantalla completa:* los dos botones flotan sobre el mapa (debajo del de pantalla completa) y el resultado se resume arriba, con Deshacer, Borrar y el cambio de origen. *Clic derecho* (o mantener apretado en el celular, si el navegador lo envía): menú en ese punto con medir desde aquí, agregar punto, dirección hasta aquí (desde tu ubicación o desde el origen marcado), dirección desde aquí, copiar coordenadas y guardar como waypoint; se cierra con Escape, un clic afuera o al mover el mapa.

### 12.4 Mapa de Meteorología (tiempo y peligros naturales)
Es un **módulo de la sección Meteorología**, separado de los mapas de Orientación, aunque reutiliza sus funciones (proyección, dibujo, capas).
- **Mapa base muy simple:** solo el contorno de **Argentina, Chile y Uruguay** con provincias y regiones. Viene incluido en la app (Natural Earth, dominio público, simplificado, unos cientos de KB), así que funciona sin conexión y no necesita descargar zonas ni teselas. Por eso puede hacerse antes de la fase Mapas.
- **Capas:** son opcionales, cada una se activa por separado y solo funciona con conexión. Muestran la hora de los datos; sin conexión queda lo último descargado. Los avisos con la app cerrada, por distancia a los waypoints con aviso activado, los hace el servidor propio. Nada de esto son alertas oficiales.

**Estado (v0.8, sin servidor):** implementado en `modules/weathermap/`. Mapa base propio (`tools/geo-data/build.mjs`: Natural Earth 1:10m simplificado, 60 provincias/regiones/departamentos + Malvinas + vecinos, 61 capitales, 104 volcanes del Smithsonian; ~70 KB comprimido) en proyección Web Mercator, la misma de las imágenes, para superponerlas sin reproyectar. Canvas con arrastre, pellizco, rueda, pantalla completa y tocar para ver el detalle. Fuentes verificadas en 2026-10 (todas abiertas, sin clave y con CORS, salvo donde se indica):

| Capa | Fuente | Estado |
|---|---|---|
| Satélite (nubes de tormenta) | GOES‑19 infrarrojo banda 13 (NASA GIBS, WMS EPSG:3857). Cada 10 min, ~45 min de demora; se busca la última imagen con pedidos de 16×16 px (si falta responde un PNG vacío). Animación de 2 h (13 imágenes) | ✅ |
| Radar de lluvia | RainViewer (13 imágenes, 2 h, teselas hasta zoom 7). En Argentina solo cubre el noreste (alcance de los radares de Brasil): el SMN, Chile y Uruguay no le comparten sus radares. Lluvia estimada por satélite: IMERG de la NASA (GIBS) se descartó por su demora de 6–7 h (el mapa muestra las últimas 2 h); la candidata es la lluvia del GOES‑19 (RRQPE, cada 10 min, AWS `noaa-goes19`), que viene en NetCDF y necesita el servidor para convertirla en imágenes | ✅ (cobertura limitada); RRQPE pendiente: servidor |
| Clima por zona | Open-Meteo, una consulta con las 61 capitales: temperatura, lluvia o viento con los colores de nivel | ✅ |
| Sismos | USGS, M2,5+ de la última semana, color por antigüedad | ✅ |
| Alertas de desastres | GDACS (ONU y Comisión Europea): ciclones tropicales/huracanes, inundaciones, sequías, incendios forestales y erupciones, con nivel verde/naranja/rojo | ✅ |
| Focos de calor | VIIRS NOAA‑20 375 m (NASA GIBS), por día (hoy y ayer); llama por grupo de focos (se agrupan los píxeles de la imagen). El producto de fuego de GOES es una imagen opaca y no sirve como capa | ✅ |
| Volcanes | Smithsonian GVP, incluido en la app (su servicio no tiene CORS) | ✅ |
| Rayos | GOES‑19 GLM (NOAA), procesado en el servidor | Pendiente: servidor |
| Tornados y alertas oficiales | No hay detección pública de tornados en tiempo real (solo radar y reportes). Las alertas del SMN (tormentas fuertes, viento, etc.) se publican en CAP/RSS sin CORS (`ssl.smn.gob.ar/CAP/AR.php`): las leerá el servidor | Pendiente: servidor |
| FIRMS (focos con clave) | NASA FIRMS, pide clave | Opcional en el servidor |
| Nivel de alerta volcánica | SERNAGEOMIN (Chile) y OAVV/SEGEMAR (AR) publican reportes, no datos | Pendiente |

**Radar del SMN (analizado 2026-10-31):** la página `smn.gob.ar/radar` lista las imágenes con `ws1.smn.gob.ar/v1/images/radar/COMP_ARG` (JWT que genera la página y vence en 1 h, CORS solo para smn.gob.ar) y las sirve desde `estaticos.smn.gob.ar/vmsr/radar/` (mosaico nacional y radares de Anguil, Ezeiza, Paraná, Pergamino y Termas de Río Hondo, cada 10 min, 2 h), todo detrás de la protección anti-robots de Cloudflare. **No se toma sin autorización:** el usuario va a pedir acceso al SMN; si lo dan, lo consume el servidor y lo entrega como capa georreferenciada. Tampoco se extraen datos de apps de terceros (APIs privadas o datos licenciados).

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
   - *Decisión pendiente en la fase Mapas:* según lo que esté disponible, radar real donde exista y satélite o modelo como respaldo, siempre aclarando qué se está viendo.

---

## 13. Distribución

| Canal | Estado |
|---|---|
| PWA en GitHub Pages | Canal principal |
| PWA servida por el servidor Docker propio | Alternativa autónoma |
| Paquete portable para PC (GitHub Releases, uno por versión) | App compilada + servidor local (`Iniciar VikArg.bat` con PowerShell en Windows, Python en Linux/Mac) en `localhost:47613`, puerto fijo porque los datos del navegador van por dirección. Para PCs sin internet o en pendrive |
| App nativa Android, y quizá iOS (port completo de la app) | **Última fase, después de Biblioteca y la guía de nudos** (ver §13.1). Permitiría instalar en un celular sin internet (el APK se pasa por cable o Bluetooth) y usar el GPS en segundo plano. Una PWA no puede servirse a un celular desde otra PC por Wi-Fi: Chrome solo habilita cifrado y modo offline en HTTPS o `localhost` |
| Google Play Store | **Descartado por ahora**: agrega dependencia de Google (cuenta, verificación, revisión, 12 testers × 14 días) sin aportar funcionalidad. Se puede sumar más adelante sin cambiar la arquitectura |

### 13.1 App nativa: port completo a Android, y quizá iOS (pendiente, última fase)

**Alcance.** No es un APK que solo agregue la grabación en segundo plano: es el port de la app completa (todos los módulos) a Android, y posiblemente también a iPhone. Por su tamaño va al final del orden de ejecución, después de Biblioteca (decidido el 04/11/2026). La PWA sigue siendo el canal principal mientras tanto y después.

**Por qué hace falta.** En la PWA, Android y iOS dejan de dar la posición cuando la pantalla se apaga o la app pasa a segundo plano. Ni la API de Geolocation ni los service workers pueden pedirla desde atrás. Hoy la grabación sigue con la *app* bloqueada (§16, Mapas; `tracks/lockedBuffer.ts`), pero no con el *celular* bloqueado: el paliativo es la pantalla negra (pantalla encendida, en negro). Para grabar y seguir un track con la pantalla apagada, leer el GPS con la app cerrada (§ avisos con la última ubicación conocida) e instalar en un celular sin internet hace falta la app nativa.

**Cómo hacerla** (propuesta inicial; se revisa al llegar a esta fase).
- **Empaquetado:** Capacitor envuelve el mismo build web (`app/dist`) en un APK (y en una app iOS). Es una sola base de código; la PWA sigue siendo el canal principal y nada de la arquitectura cambia. El port consiste en revisar módulo por módulo lo que en nativo conviene resolver con plugins (GPS, sensores, cámara, notificaciones, archivos) y probar todo en el WebView.
- **GPS en segundo plano:** con un *foreground service* de ubicación, que es lo que exige Android. Muestra una notificación fija ("VikArg está grabando tu recorrido") mientras dura y necesita los permisos `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_LOCATION` (Android 14+). `ACCESS_BACKGROUND_LOCATION` no hace falta si el servicio se arranca con la app en pantalla.
  - Opción preferida: `@capacitor-community/background-geolocation` (libre, MIT).
  - Opción descartada: la de Transistor Software, que requiere licencia paga para Android en release.
- **Integración:** el servicio mantiene vivo el proceso, así que el WebView sigue recibiendo posiciones. `tracks/recorder.ts` usaría el plugin en lugar de `navigator.geolocation.watchPosition` cuando corre como app nativa (`Capacitor.isNativePlatform()`).
  - Todo lo demás queda igual: filtro de puntos, tramos, guardado cifrado cada 20 s, puntos con la app bloqueada cifrados con la clave de la grabación.
  - El seguimiento de un track (avisos y vibración al salirse o al llegar) también se puede mover a ese mismo flujo, para que avise con la pantalla apagada.
- **Batería:** filtro de distancia en el plugin (unos 8 m, como `MIN_STEP_M`) e intervalo mínimo de varios segundos. El GPS se apaga al pausar o terminar.
- **Distribución Android:** APK firmado con clave propia, en GitHub Releases junto al portable. Se instala a mano y también se puede pasar por cable o Bluetooth a un celular sin internet. El APK lleva la app adentro y funciona offline desde la instalación. Falta decidir si se actualiza solo con APK nuevos o si además carga la versión publicada cuando hay conexión.
- **iOS (posible):** requiere Mac y cuenta paga de Apple, y la distribución fuera de la App Store es limitada. El enfoque sería el mismo, con el permiso de ubicación "Siempre". Se decide al llegar a esta fase.

---

## 14. Diseño e interfaz

**Volver (05/11/2026):** la flecha de volver está en la barra de arriba en todas las pantallas menos Inicio (`ui/BackButton.tsx`): si se llegó navegando, vuelve a la anterior; si la pantalla se abrió directo (notificación, enlace, recarga), va a la de arriba. Las pantallas a pantalla completa (mapas, seguir un track, ir al punto, mapa estelar) tienen la suya.

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
| **Base** | Proyecto, PWA instalable, temas, i18n, base de datos, cifrado y desbloqueo, ajustes, detección de capacidades |
| **Inventario** (+ 05/11/2026: ubicaciones con waypoint y avisos de peligros cerca de la reserva) | Categorías, ubicaciones, artículos, lotes, stock mínimo, favoritos, fotos, códigos de barras, alertas en la app, backup y restauración |
| **Servidor** | Docker, push programado, código de transferencia, aviso diario en segundo plano |
| **Orientación, meteorología y botiquín** | Orientación: brújula, inclinómetro, GPS y waypoints con "ir al punto" (realidad aumentada con cámara y brújula). Meteorología: clima, sol y luna. Botiquín: botiquines por tipo y ficha médica. Documentos. Recomendaciones |
| **Biblioteca** | Visor, búsqueda, paquetes (públicos en los espejos; privados solo en el servidor propio con clave), descarga por categoría o libro por libro, importación y herramienta de conversión (§11.2). Siguiente fase; se empieza por Cabuyería, Cultivo y Primeros auxilios |
| **Mapas** | Orientación: descarga por área, importación de PMTiles, relieve, curvas de nivel, capas propias, guía. **Importar rutas GPX** (hecho, `modules/tracks`): Wikiloc y cualquier app (track `trk`/`trkseg`, o ruta `rte` si no hay track, y sus `wpt`), en una tabla propia cifrada `tracks` (Dexie v5), separada de "Mis waypoints" y "Mis rutas"; sus puntos no se mezclan con los del usuario salvo que él copie uno a mano. Se guarda el recorrido simplificado (Douglas-Peucker, 5 m) con distancia y desnivel calculados antes con todos los puntos (umbral de 5 m contra el ruido del GPS); se muestra perfil de altura (para ir a un punto con la brújula se copia a "Mis waypoints"), link a la ruta original y una capa propia en el mapa offline (`mapLayers.tracks`). Viaja en el backup y en "Compartir con un familiar" (sección de waypoints; el mismo track no se duplica). Seguimiento en vivo (`tracks/follow.ts`): proyecta el GPS sobre el recorrido y muestra lo recorrido, lo que falta, el desnivel que queda, el tiempo estimado (6 km/h en distancia, 300 m/h subiendo y 600 m/h bajando en altura; el mayor más la mitad del menor) y el próximo punto; avisa (y vibra) al salirse a más de 40 m o de la precisión del GPS, con margen para que no titile, y da el rumbo para volver; sentido inverso, dibujo del track sin mapa de fondo y pantalla siempre encendida. La simplificación al importar conserva los cambios de altura además de la forma. El seguimiento se ve como dibujo liviano o sobre el mapa offline; el mapa (también el de Orientación) pasa de plano a 3D (`mapLayers.terrain3d`, relieve con las mismas teselas de altura en una fuente aparte, exageración 1,3, inclinación hasta 75°) y la vista puede seguirte girando con la brújula o quedar libre (arrastrarla o girarla con la mano la libera). **Grabar el recorrido propio** (`tracks/recorder.ts`): se arranca desde Tracks, el mapa offline o mientras se sigue un track; queda como un `Track` más (`recorded`, `recording` mientras dura, `durationS` sin las pausas) en la misma tabla, y se guarda cifrado cada 20 s, al pausar y al ir a segundo plano (si la app se cierra, al volver aparece en pausa). Filtra puntos con más de 50 m de error o a menos de un paso (8 m o media precisión); cada pausa abre un tramo nuevo y al reanudar pide una posición fresca (sin caché). Al terminar se simplifica a 3 m y se calculan los datos. Con la app bloqueada sigue grabando (`tracks/lockedBuffer.ts`): cada grabación tiene su par RSA-OAEP 2048; la clave privada va dentro del track (`recKey`, cifrada con la bóveda, se borra al terminar) y, bloqueada, cada punto se cifra con la pública y se agrega en `localStorage`. Nunca queda nada en claro en el disco y, si el sistema cierra la app bloqueada, al desbloquear se descifra y se suma (la grabación vuelve en pausa). La pantalla de desbloqueo solo dice que se sigue grabando, sin datos. Al terminar se le pone nombre (diálogo; se puede seguir grabando) y después se cambia en el track (lápiz al lado del título; las notas, abajo, igual). "Volver al origen" sigue lo grabado hasta ese momento al revés (`?back=<puntos>`: la vuelta no se mezcla con la ida, y el sentido va en la dirección, `rev`, para volver igual tras bloquear). Lo grabado se dibuja en verde (`--ok`) sobre el mapa y el dibujo. El bloqueo automático no corre en la pantalla de seguimiento (`core/security/lockHold.ts`). Pantalla negra (`core/power/pocket.ts`): encendida para que el navegador no corte el GPS, pero negra y sin pintar lo de abajo; dos toques para volver. Límite de la PWA: con la pantalla apagada el navegador deja de dar posiciones; grabar con la pantalla apagada requiere la app Android (§13.1, pendiente). **Capa "Riesgo de avalancha"** (`maps/slope.ts`, protocolo `vkslope`): pendiente calculada en el celular con las mismas teselas de elevación Terrarium (z12, ~30 m; método de Horn), pintada con las zonas del inclinómetro (menos de 25° verde, 25–30° amarillo, 30–45° rojo óxido, más de 45° rojo puro `--steep`) y **solo por encima de la línea de nieve** (`maps/snowline.ts`): isoterma de 0 °C de Open-Meteo (`freezing_level_height`, un punto, ~700 bytes) más baja de los últimos 3 días y los próximos 2, menos 300 m. Con conexión, la del lugar que se mira (se vuelve a pedir a más de 50 km o 3 h); sin conexión, la del pronóstico guardado con la zona descargada más cercana (isoterma por hora de 3 días atrás a 14 adelante, ~2 KB, se guarda al bajar la zona y se renueva cada vez que la app se abre con conexión si tiene más de 24 h, `maps/zoneForecast.ts`; las horas de más de 3 días atrás se borran y un pronóstico vencido se descarta); si no hay ninguna cerca, se usa la altura que eligió el usuario para ese caso (`snowlineFallback`, 1500 m por defecto) y se avisa. Se puede poner a mano (`snowlineManual`). **Carga por viento** (`maps/wind.ts`): se rayan las laderas de 25° o más sobre la línea de nieve que miran a sotavento (a ±60° de hacia donde sopló el viento; la orientación sale del mismo cálculo de Horn). El viento sale de tres fuentes, en orden. La primera es el reciente: la misma consulta de Open-Meteo trae viento a 700 hPa (~3000 m, el de los filos) y nevada por hora; cuenta el viento de 5 m/s o más después de 0,5 cm de nieve nueva en los últimos 3 días, y los rumbos de 45° con al menos 25% del peso; también va en el pronóstico guardado de cada zona. La segunda es el habitual de la zona: al bajarla, 5 años de datos diarios del histórico (ERA5, `archive-api.open-meteo.com`, ~50 KB, una sola vez) con el viento dominante de los días con nieve y el siguiente. Si no hay ninguna de las dos, se asume viento del oeste. La ventana del viento es de 7 días (las placas pueden seguir inestables más de una semana con frío; la isoterma sigue con 3). Se ven dos rayados juntos, cada uno en su diagonal y su color: la carga de los últimos 7 días (blanco) y el sotavento habitual, donde pueden quedar placas viejas (azul; el de la zona descargada o, con conexión, el del lugar, pedido una vez y guardado con la consulta; sin nada, del oeste). Donde coinciden se cruzan. Es una subopción de la capa (`mapLayers.windLoad`, prendida). Con conexión no se raya hasta tener el dato del lugar. Las rayas siguen de una tesela a la otra y el sotavento va en la dirección de la tesela (`&lee=90,135`). Meteorología: mapa base de AR, CL y UY con capas de tiempo y peligros naturales (§12.4) |
| **Mapa estelar** | Dos vistas: cielo completo (cúpula, gira con la brújula o a mano) y "apuntar al cielo" (realidad aumentada con la orientación del celular, con puntos cardinales, escala de acimut y círculos de altura; en PC se arrastra). 5.044 estrellas hasta magnitud 6, 88 constelaciones en español, Sol, Luna y planetas. Guía para encontrar el Sur (Cruz del Sur y Punteros) o el Norte (Osa Mayor y Polar) según el hemisferio, búsqueda de astros, fecha y hora, rojo nocturno. Datos de d3-celestial (BSD-3), generados con `tools/sky-data`. Vía Láctea pendiente (~150 KB simplificada) |
| **Huerta** (hecha, 05/11/2026) | Definida en §10.1: fichas, calendario por zona del INTA, canteros en grilla de 30 cm, seguimiento con tareas y cosecha (opción de sumarla al inventario), avisos de helada y de riego. Todo en una sola fase |
| **Servidor (cuando esté instalado)** | Avisos de lluvia con la app cerrada (última ubicación conocida y waypoints): hecho con el pronóstico de Open-Meteo; falta la lluvia observada (GOES‑19 RRQPE, radar del SMN). Detector de rayos GOES‑19 con aviso por distancia |
| **Cabuyería** | Definida en §10.2 (05/11/2026): sección en Inicio antes de Huerta; guía de nudos con búsqueda por nombre, uso, tipo y propiedades, paso a paso con imágenes libres, modo práctica, cuerdas y glosario. Se hace ahora, en paralelo con la conversión de la biblioteca |
| **App nativa** | Port completo de la app a Android, y quizá iOS: GPS con la pantalla apagada y la app cerrada, instalación sin internet (§13.1) |

**Orden de ejecución** (decidido el 31/10/2026; actualizado el 04/11/2026, cuando se dejaron los códigos F0–F8 y las fases pasaron a nombrarse por su contenido):
Base → Inventario → Servidor → Orientación, meteorología y botiquín (hechas) → **Mapa estelar** → Mapas (incluye el mapa de Meteorología) → Servidor (avisos en segundo plano, rayos, peligros naturales) → Huerta (hecha el 05/11/2026) → **Biblioteca** (siguiente) → Guía de nudos (agregada el 05/11/2026) → **App nativa (port completo a Android, y quizá iOS; §13.1), al final** (agregada el 04/11/2026).

---

## 17. Puntos abiertos

Ninguno. Documento aprobado para iniciar la fase Base.

## Aclaración del SMN (avisos meteorológicos)

El Servicio Meteorológico Nacional pidió aclarar (2026-11) que, según el marco normativo vigente, la emisión de alertas meteorológicas y avisos oficiales a la población en Argentina es competencia exclusiva del SMN, y que las herramientas de terceros pueden usar datos meteorológicos como insumo informativo pero no sustituir, emitir ni superponerse con el Sistema de Alerta Temprana (SAT) ni con sus funciones de vigilancia. La app lo muestra (`ui/OfficialWeatherNotice.tsx`, clave `legal.smn`, con enlace a smn.gob.ar/alertas) en Clima, el mapa del clima, Notificaciones y Acerca de, y cada notificación de lluvia o rayos termina con "Aviso informativo, no oficial: las alertas oficiales son del SMN.". Los textos de la app hablan de "avisos" informativos, nunca de alertas oficiales. La API del SMN es paga: por ahora no se usa.

## Avisos de peligros naturales (servidor)

`server/src/hazards/`: con los mismos lugares que lluvia y rayos (`rain_places`), avisa sismos de USGS y eventos de GDACS (incendio forestal, inundación, ciclón tropical, erupción; la sequía no, porque no es urgente) con distancia y rumbo. El radio crece con la magnitud o el nivel de alerta (ver docs/SERVIDOR.md). Cada evento se avisa una vez por lugar y otra si empeora (`hazard_notices`). Se apaga por dispositivo (`devices.hazards`, `hazardNotices` en la app). La notificación (`hazardNotification`) lleva la fuente y la aclaración de que es informativa; los sismos fuertes, con posible tsunami o con alerta roja vibran más y quedan fijos hasta tocarlos. GDACS devuelve de a 100 eventos, los vigentes primero: el servidor y el mapa del clima piden páginas mientras haya vigentes.

**Reserva del inventario (05/11/2026):** cada ubicación del inventario puede tener su waypoint (se elige de "Mis waypoints" o se crea con el GPS; las de adentro heredan el de la ubicación de arriba). La app manda al servidor (`PUT /api/devices/:id/stock`) un punto por waypoint donde hay algo guardado, redondeado a ~1 km, con el nombre de la ubicación: nada más del inventario. Esos puntos se suman a los de lluvia para los peligros naturales, y el aviso dice "Tenés reserva cerca: Casa. Si podés, ponela a resguardo". **Un solo aviso por evento y dispositivo**, aunque toque varios lugares (donde estoy, waypoints, reservas): nombra el más cercano y lista las reservas dentro del radio.

