# Fuentes de datos investigadas

Resultado de las investigaciones sobre lluvia, radar, Bolivia y Perú, con lo que funciona, lo que no y por qué. Sirve para no repetir pruebas. Estado al **13 de noviembre de 2026**; los datos de teléfonos, frecuencias y enlaces cambian, así que cada uno lleva su fecha. Las licencias y el acceso se vuelven a verificar antes de usar un dato nuevo.

Regla general: se aceptan servicios abiertos o gratuitos, con o sin clave (mejor sin clave); no se aceptan los pagos ni los privados no documentados; **no se esquivan protecciones** (ver «Radar del SMN»). Los números o datos no confirmados oficialmente entran en la app con la leyenda «sin confirmar» y una forma de reportar si no funcionan.

## Lluvia

**En la app hoy:** pronóstico `minutely_15` de Open-Meteo (la URL del clima es configurable en Ajustes).

**GOES-19 RRQPE (NOAA, abierto):**
- Listado: `https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=ABI-L2-RRQPEF/AAAA/DDD/HH/`; archivos `OR_ABI-L2-RRQPEF-M6_G19_s...nc`, ~1,9 MB cada 10 minutos (~270 MB por día), NetCDF4/HDF5 (se lee con `h5wasm`), disco completo, proyección geoestacionaria, ~2 km en el nadir.
- Cubre Argentina, Chile y Uruguay; los píxeles se estiran a 4 km o más y se corren unos kilómetros en el sur de la Patagonia y Tierra del Fuego. El detector de rayos GLM puede no llegar a Tierra del Fuego (verificar).
- **Estima** lluvia por la altura de las nubes; no la mide. Se cae de vez en cuando (el 2 de noviembre de 2026 RRQPEF se detuvo a las 16:50Z mientras CMIPF y GLM seguían), así que hace falta una alternativa cuando los datos son viejos.
- Plan: muestrear en el punto y en anillos de 10, 25 y 50 km, combinar con Open-Meteo y mandar notificación Web Push. Hay una comprobación diaria del servidor cuyo resultado sale en `/api/health` (`observedRain`).

**Otros productos de NOAA (revisado el 13 de noviembre de 2026): no hay reemplazo abierto de la lluvia estimada.**
- **`ABI-L2-RRQPEF` retirado:** GOES-19 y GOES-18 dejaron de publicarlo el mismo día, el 2 de noviembre de 2026 (día 306 del año; la carpeta sigue listada pero sin archivos nuevos); GOES-16 no tiene archivos desde 2025. El reemplazo oficial («Enterprise Rainfall Rate», `ABI-L2-FLDK-RRQPE-AWIPS`) solo se distribuye por PDA, no por el bucket abierto. En el listado de `noaa-goes19` no hay ningún otro producto con RRQPE, RAIN o RRATE en el nombre.
- **Detector del servidor:** una vez por día revisa eso mismo (`server/src/rain/noaaWatch.ts`). **`observedRain.available` vacío en `/api/health` es el resultado correcto**: significa que NOAA todavía no publicó nada. `checkedAt` marca la última revisión; si se llena, queda también una advertencia en el log. Nadie recibe un aviso por eso: hay que mirar el health de vez en cuando.
- **PERSIANN-CDR** (`noaa-cdr-precip-persiann-pds`, lluvia diaria): último dato del 31 de julio de 2026, procesado el 13 de octubre; unos 3 meses y medio de atraso. Sirve para estadísticas del pasado, no para avisar. `noaa-cdr-precip-gpcp-pds` no existe (404).
- **«ABI-Flood» (inundación, no lluvia):** es lo único cercano que está activo (GOES-19 y GOES-18, cada hora, con el detalle diario en `ABI-Flood-Day`). Es un mapa de **fracción de agua en superficie de 1 km** («ABI Flood Detection v1r1», paquete «Enterprise Flood Map»), con las bandas ABI 02, 03, 04, 05 y 13; referencia: `https://www.ssec.wisc.edu/flood-map-demo/flood-products/`. **Solo de día**, y las nubes lo tapan, justo cuando llueve fuerte. Archivos `ABI-Flood-HCOM-AOI00N_v1r1_g19_s…_e…_c….nc` (NetCDF) y `.tif` (GeoTIFF de 1 hora: unos 24 MB para Sudamérica) en `ABI-Flood-Hourly/AAAA/MM/DD/` y `ABI-Flood-Hourly-TIF/…`. Son tres áreas: `AOI002` (106° O a 65° O, 14,5° N a 50,5° N: Norteamérica), `AOI003` (92,5° O a 49° O, 0° a 14,5° N) y **`AOI004` (81,5° O a 34,5° O, 0° a 50,5° S): Sudamérica al sur del ecuador**, o sea casi todo nuestro mapa, menos el sur de la Patagonia y Tierra del Fuego. Dominio público de NOAA. **No sirve para los avisos de lluvia.** Queda como idea de una capa «agua en superficie / anegamientos» (ver `PENDIENTES.md`); no se midió contra casos reales.
- Resumen: para lluvia observada siguen las dos vías de siempre, el radar del SMN (pausado, ver abajo) o esperar a que NOAA abra el reemplazo. Hoy el aviso de lluvia depende del pronóstico de Open-Meteo.

**Radar de Chile y Uruguay (6 de noviembre de 2026):** la DMC de Chile no tiene red de radares meteorológicos (un proyecto de 8 radares sin financiar; radares móviles en evaluación tras las inundaciones de octubre de 2026). INUMET de Uruguay: el radar de Biassini (Salto) está demorado desde 2021, compraron más y todavía no hay imágenes públicas. INUMET publica sus alertas como dominio público: volver a consultarles cuando funcione.

## Radar del SMN de la Argentina

Cronología: 3 de noviembre de 2026 (sondeo), 4 (respuesta del CIM), 6 (se evaluó una app de terceros y se redactó un pedido), 11 (autorización por escrito).

**Cómo está armado:**
- Radares SINARAME (RMA1 a RMA20) más INTA (ANG, PAR, PER) y los mosaicos `COMP_ARG`, `COMP_CEN` y `COMP_NOR`.
- Lista de imágenes: `https://ws1.smn.gob.ar/v1/images/radar/{ID}` (ID por ejemplo `COMP_ARG` o `RMA10_240`), con las últimas 12 imágenes, una cada 10 minutos. Pide `Authorization: JWT <token>`; el token (válido 1 hora, `sub: web`) lo arma la propia página `smn.gob.ar/radar`.
- Las imágenes (PNG ya dibujados, no volúmenes de datos) están en `estaticos.smn.gob.ar/vmsr/radar/<nombre>.png` (por ejemplo `RMA10_240_ZH_CMAX_...png`; un radar caído devuelve `no_disponible.png`). **Esa dirección tiene un desafío de Cloudflare** («managed challenge», bloqueo por detección de bot, no por volumen).
- El visor SINARAME (`radares.hidricosargentina.gob.ar`, del Ministerio de Obras Públicas) es Blazor Server con Leaflet y `imageOverlay` cuyos límites salen de la latitud, la longitud y el radio de cada radar; los datos viajan por SignalR.
- El bucket AWS del SMN (`smn-ar-wrf`) solo tiene pronósticos WRF. Los pedidos de acceso van al Centro de Información Meteorológica (CIM, `cim@smn.gob.ar`).

**Qué se probó y qué pasó:**
- La API de pago del SMN: el CIM contestó el 4 de noviembre que es un servicio pago, por eso no se usa. La app Rain Alarm (de.mdiener.rain.usa) muestra «CC BY 2.5 SMN Argentina», pero su acceso es una API privada de pago (mínimo de US$ 1.000 por mes) y devuelve solo una intensidad 0 a 12, sin imágenes: no sirve.
- El 11 de noviembre el SMN **autorizó por escrito consultar sus datos bajo CC BY 4.0** y dijo que no puede dar un token gratuito de su API. Con la lista de imágenes y el token de la página, la **lista funciona**; los **PNG no se pueden bajar** desde el servidor: `curl` (con identificación propia `VikArg-radar/1.0`), Chromium sin pantalla y Chromium con pantalla virtual reciben el desafío. Un servicio de rastreo externo fue bloqueado por el sistema de permisos como evasión de la verificación anti-bot, y no se reintentó por otro camino.

**Decisión:** no se esquiva el desafío (ni navegadores disfrazados, ni proxies, ni IP oculta). El camino limpio, **pausado** hasta que quien dirige lo retome: pedirle al SMN que **permita en Cloudflare la IP del servidor** (o el identificador `VikArg-radar/1.0`) para `estaticos.smn.gob.ar/vmsr/radar/*`, y que entregue los límites geográficos y la escala de colores en dBZ (o los datos crudos ODIM/NetCDF) y las condiciones de consulta. Con eso: el servidor consulta una vez cada 10 minutos solo `COMP_ARG`, `COMP_CEN` y `COMP_NOR` (después los radares individuales), guarda las últimas 12 imágenes, las sirve él mismo, renueva el token cada hora, usa un identificador propio, espera más cuando recibe 403 o 429 y muestra la atribución al SMN y la leyenda legal existente. Falta la IP pública del servidor para el mensaje.

## Alertas oficiales y números de Bolivia y Perú

Investigado el 7 de noviembre de 2026; segunda pasada el mismo día. Ninguno de los dos países está en el registro de alertas de la OMM (no hay CAP).

**Alertas:**
- **Bolivia, SENAMHI:** JSON abierto y sin clave en `https://senamhi.gob.bo/index.php/api/alertas/active-alerts` (color, tipo de evento, fechas, MultiPolygon por alerta). Las alertas hidrológicas (`.../active-hydro-alerts`) vienen como texto HTML, sin polígono.
- **Perú, SENAMHI:** servicio WFS en `https://idesep.senamhi.gob.pe/geoserver/g_aviso/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_aviso:view_aviso&viewparams=qry:<aviso>_<mapa>_<año>&outputFormat=application/json` (nivel 1 a 4, fechas de inicio y fin; polígonos de ~2 MB por aviso: simplificar en el servidor). La lista de avisos sale de `https://www.senamhi.gob.pe/?p=aviso-meteorologico`.
- **Volcanes de Perú:** CENVUL (`cenvul.igp.gob.pe`, el boletín está embebido en la página): en 2026 Sabancaya y Ubinas están en naranja.

**Teléfonos de emergencia:**
- **Perú (oficial, gob.pe/547, último cambio 2024-01-14):** 105 policía, 116 bomberos, 106 SAMU (solo algunas regiones y Lima), 115 Defensa Civil, 113 Infosalud, 100 violencia, 110 policía de carreteras, Cruz Roja 01 266 0481, EsSalud ambulancias de Lima 117. CICOTOX (centro de toxicología): +51 1 328 7700, WhatsApp +51 956 740 869, Jr. Puno 1002, piso 3, Lima (dato aportado por quien dirige). Hay una lista aportada que contradice gob.pe en el 110 y el 113: se mantuvo gob.pe.
- **Bolivia:** 110 policía, 119 bomberos, 118 ambulancia, 165 ambulancia de La Paz; 911 sin confirmar. Sin fuente oficial; el 118 y el 800 14 0348 siguen marcados «sin confirmar». Familia Segura 800 11 3040 (UNICEF, apoyo psicológico, 6 a 24 h); 156 Línea Segura es municipal de La Paz. No hay línea nacional de intoxicaciones ni de salud mental (CIATOX del Hospital Japonés de Santa Cruz, Hospital Santa Bárbara de Sucre, red RETOXBOL).
- **Montaña y rescate:** Perú, USAM/DEPSAM (Policía de Alta Montaña, Yungay y Huaraz), +51 43 393333 o 043 493333 (las fuentes no coinciden; sin verificar). Bolivia: Socorro Andino Boliviano (`socorroandinoboliviano.org`); la guía municipal de La Paz lista refugios y teléfonos. No hay frecuencias publicadas en ninguno.

**Servicios cercanos y parques:**
- **Perú, RENIPRESS** (SUSALUD, ODC-By): `https://www.datosabiertos.gob.pe/sites/default/files/RENIPRESS_<dd-mm-aaaa>.csv` (mensual, separado por `;`, UTF-8 con BOM; `NORTE` = latitud, `ESTE` = longitud, `TELEFONO`, `CATEGORIA`, `ESTADO`); ~36.000 filas, 27.000 activas, 20.000 con coordenadas. Policía y bomberos salen de OpenStreetMap (la lista de comisarías del MININTER no se pudo bajar). El portal peruano rechaza (418) los clientes con una dirección web en el User-Agent: usar uno sin URL.
- **SERNANP (Perú):** `https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer` (capa 1, «ANP Nacional Definitiva», 104 elementos; también zonas reservadas, áreas de conservación regional y privada, amortiguamiento). La licencia no está declarada. Las áreas departamentales, municipales y privadas se descartaron a propósito: «cada uno es responsable por dónde circula».
- **Bolivia:** no hay descarga oficial de áreas protegidas (solo el atlas del SERNAP 2024); se usan las de OpenStreetMap. Sede del SERNAP en La Paz: 2426304. GeoBolivia no responde desde el servidor.

**Radio:**
- **Perú, red RENER-INDECI y afines (aportado por quien dirige, sin fuente declarada; se muestra «sin confirmar» con enlace para reportar):** VHF primaria 146.960 MHz, HF primaria 7.100 kHz, simplex interna 147.635 MHz, control OA4O (Radio Club Peruano); INDECI red secundaria 10.342 kHz, emergencias nacionales 155.640 MHz; Cruz Roja Peruana 155.760 MHz; PMR 446.000 a 446.100 MHz (8 canales); llamada VHF 146.520 MHz. Falta confirmar INDECI y Cruz Roja.
- **Radio Nacional del Perú (IRTP):** la lista pública solo trae algunas ciudades; **Puno 100.9 MHz FM y Trujillo 89.7 MHz FM** salen de la planilla oficial «Red de Radio FM del IRTP» de datos abiertos (ODC-By, **hay que atribuir**, planilla del 2021-09-15: puede haber cambiado) y no tienen AM. La planilla trae además Ilave 98.9, Juliaca 100.5, Ayaviri 94.5, Desaguadero 94.1, Huamachuco 106.5 y Santiago de Chuco 100.1 (sin cargar). Las otras 13 emisoras vienen de una lista aportada y no están confirmadas en el IRTP; falta cotejarlas con esa planilla. AM oficial del IRTP: Lima 850, Iquitos 1120, Tacna 830, Tumbes 780. Fuente: `https://www.datosabiertos.gob.pe/dataset/red-de-radiodifusi%C3%B3n-instituto-nacional-de-radio-y-televisi%C3%B3n-del-per%C3%BA-irtp`.
- **Bolivia:** Red Patria Nueva, La Paz 94.3 FM y 1020 AM, Cochabamba 93.7 FM (otras ciudades sin verificar).
- **Repetidoras:** Radio Club Peruano (`oa4o.pe`) tiene Lima R1 y R2 y temporales en Trujillo y Huaraz, sin lista pública de frecuencias; RENER usa 146.520 simplex. Chile: lista oficial de SUBTEL en `app/public/data/repeaters-CL.json`, que se regenera con `tools/country-data/repeaters-cl.py` cuando SUBTEL publica un PDF nuevo.

**Mapas sin conexión:** los límites pasaron de -76,-56,-53,-17.4 a -81.5,-56,-53,0 (se agregaron Perú, Bolivia y Ecuador); el relieve pasó de ~4,4 a ~7,3 GB y el vector de ~1,5 a ~2,5 GB (estimación); el mapa del tiempo necesita departamentos de BO y PE como regiones y Ecuador y Colombia como vecinos. Se reconstruyó con `~/vikarg/deploy/maps/build-bope.sh` (registros `build-bope-*.log`). Todos los países de Sudamérica van con su nombre, con las fronteras de países en un color y las de provincias en otro.

## Calendarios de huerta de Bolivia y Perú

No existe un calendario oficial abierto de siembra por cultivo y mes:
- INIAF «Proyecto Hortalizas» (2025) e INIA Huancayo «biohuertos» (2010) no traen calendarios; los calendarios agrícolas del INIA para Costa, Sierra y Selva 2025 están detrás de un acceso con usuario (`repositorio.inia.gob.pe`).
- El calendario de cultivos de la FAO (CC BY 4.0) solo trae cultivos de campo.
- La tabla usable es el «Manual para el cultivo de hortalizas, Valle Central de Tarija» (Organización Esperanza Bolivia y Louvain Coopération, 2016; no oficial; cuadros gráficos leídos a ojo, ±1 mes; 20 cultivos).
- Otras pistas sin revisar: Programa de Hortalizas de la UNALM (`lamolina.edu.pe/hortalizas`, no responde desde el servidor) y guías de CIPCA, CEMSE y Jatun Sacha.

Cargado en la app (todas «estimadas» y con aviso): «Valles de Bolivia (Tarija)», «Trópico y Yungas de Bolivia» (12 cultivos del proyecto Jatun Sacha de UNODC) y «Sierra de Perú» (7 cultivos del calendario del INIA para la sierra; los meses de siembra se pasaron a mano desde una publicación del INIA, sin el documento a la vista: **verificarlos contra el documento**; la cosecha sale del ciclo de cada cultivo). Detalle en `PENDIENTES.md`, sección 1.
