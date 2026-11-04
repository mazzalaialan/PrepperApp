# Servidor VikArg — Guía de instalación

El servidor es **opcional**. La app funciona completa sin él; el servidor agrega:

- **Notificaciones push confiables:** avisos de vencimiento aunque la app esté cerrada.
- **Avisos de lluvia y rayos con la app cerrada:** en tus waypoints con aviso y donde estás.
- **Transferencia con código o QR:** pasar el backup a otro dispositivo sin cables.
- **Servir la propia app:** una instalación que no depende de GitHub.

El servidor nunca ve tu inventario. Solo recibe:
- nombre del artículo y fechas de las alertas, para poder notificar;
- para los avisos de lluvia y rayos: nombre y lugar de los waypoints con aviso y, salvo que lo apagues en **Ajustes → Notificaciones**, tu última ubicación conocida. Todo va redondeado a ~1 km y se borra al apagarlo;
- backups que llegan **ya cifrados** y se borran al descargarlos o a las 24 h.

---

## Requisito: HTTPS

Los navegadores solo permiten notificaciones push y conexiones desde una app HTTPS hacia un servidor también HTTPS. El servidor necesita:

1. **Una máquina siempre encendida con Docker:** un VPS, una mini PC en tu casa, una Raspberry Pi 4/5, etc.
2. **Un dominio o subdominio** que apunte a esa máquina (ej.: `vikarg.tudominio.com`).
3. **Los puertos 80 y 443 abiertos** hacia la máquina. Si está en tu casa, redirigilos en el router.

Con eso, el `docker-compose.yml` incluido obtiene y renueva el certificado HTTPS solo, con Caddy y Let's Encrypt.

> **¿Sin IP pública o sin poder abrir puertos?** Se puede exponer con un túnel, como Cloudflare Tunnel o Tailscale Funnel. Funciona, pero agrega un intermediario externo. Esta guía cubre la opción directa.

---

## Instalación

```bash
git clone https://github.com/mazzalaialan/PrepperApp.git
cd PrepperApp/deploy
cp .env.example .env
nano .env            # completar DOMAIN (el mail es opcional)
docker compose up -d --build
```

Verificación: abrí `https://TU_DOMINIO/api/health`. Tiene que responder algo como:

```json
{ "ok": true, "version": "0.1.0", "vapidPublicKey": "B…" }
```

La app queda servida en `https://TU_DOMINIO/` y se puede instalar desde ahí.

## Conectar la app

1. En la app: **Ajustes → Conexiones → Servidor VikArg**, poné `https://TU_DOMINIO` y tocá **Probar conexión**.
2. **Guardar.**
3. **Ajustes → Notificaciones → Activar notificaciones** y aceptá el permiso.
4. Tocá **Probar**: tiene que llegar una notificación.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto interno del servidor |
| `DATA_DIR` | `/data` | Dónde se guarda la base SQLite |
| `VAPID_SUBJECT` | `https://DOMAIN` (con el compose) | Contacto que exige Web Push (`mailto:` o `https:`). Sin mail se usa la URL del servidor; Let's Encrypt tampoco lo necesita |
| `ALLOWED_ORIGINS` | `*` | Orígenes permitidos (CORS), separados por coma |
| `TRANSFER_MAX_MB` | `50` | Tamaño máximo de un backup transferido |
| `TRANSFER_TTL_HOURS` | `24` | Validez de un código de transferencia |
| `SCHEDULER_INTERVAL_MINUTES` | `10` | Cada cuánto revisa si hay avisos para enviar |
| `APP_DIR` | `/srv/public` | Carpeta de la PWA a servir; vacío = no servirla |
| `WEATHER_URL` | `https://api.open-meteo.com` | Pronóstico para los avisos de lluvia (API compatible con Open-Meteo; puede ser una instancia propia) |
| `RAIN_INTERVAL_MINUTES` | `15` | Cada cuánto revisa la lluvia en los lugares con aviso |
| `RAIN_HERE_MAX_AGE_HOURS` | `24` | Hasta qué antigüedad usa la última ubicación conocida para "donde estoy" (lluvia y rayos) |
| `LIGHTNING_ENABLED` | `true` | Avisos de rayos (GOES-19 GLM); `false` los apaga |
| `LIGHTNING_INTERVAL_SECONDS` | `60` | Cada cuánto busca rayos nuevos |
| `LIGHTNING_FILES_PER_POLL` | `1` | Archivos de 20 s que lee por pasada: 1 ≈ 550 MB por día de descarga, 3 = todos ≈ 1,6 GB |
| `LIGHTNING_RADIUS_KM` | `30` | Distancia para avisar de rayos |

## Mantenimiento

**Actualizar a una versión nueva:**
```bash
cd PrepperApp && git pull
cd deploy && docker compose up -d --build
```

> **Actualizá el servidor cada vez que se actualiza la app.** Las versiones nuevas pueden mandar tipos de aviso nuevos (por ejemplo, los faltantes de recomendaciones desde la v0.7.0). Un servidor viejo rechaza la lista completa de avisos y deja de notificar hasta que se lo actualice.

**Backup del servidor:** todo está en el volumen `vikarg-data`, en el archivo `vikarg.db`. Ahí están las claves VAPID; si se pierden, cada dispositivo tiene que volver a activar las notificaciones. Los datos de la app **no** están en el servidor: el backup de la app se hace desde la app.

```bash
docker compose exec vikarg sh -c 'cp /data/vikarg.db /data/vikarg-$(date +%F).db'
```

**Logs:**
```bash
docker compose logs -f vikarg
```

## Cómo funcionan los avisos

- La app envía al servidor el índice de alertas cada vez que cambia: nombre del artículo, tipo, fecha de vencimiento y desde cuándo avisar.
- Cada 10 minutos el servidor revisa qué dispositivos llegaron a su hora de aviso (en la zona horaria de cada uno) y les envía **solo lo nuevo** desde el último aviso, o lo que **vence ese día**. No repite la lista todos los días.
- En Android, Chrome entrega los push a través de Google (FCM): no hay forma de evitarlo en una PWA. El contenido viaja **cifrado de punta a punta**, así que Google no puede leerlo.
- Si un dispositivo desinstala la app o revoca el permiso, el servidor lo detecta en el siguiente envío y lo borra.

## Cómo funcionan los avisos de lluvia y rayos

- Funcionan con el servidor y las notificaciones activadas. La app manda los waypoints con aviso ("Avisarme de lluvia y rayos en este punto") y la última ubicación que leyó con la app abierta, si ya tiene permiso de GPS. La ubicación viene activada y se apaga en **Ajustes → Notificaciones**. Con la app cerrada el celular no le da el GPS a una PWA. Todo va redondeado a ~1 km.
- Si la última ubicación está a menos de 10 km de un waypoint con aviso, se ignora y avisa solo el waypoint, para no mandar dos notificaciones.
- Cada 15 minutos el servidor pide el pronóstico de las próximas 2 horas (Open-Meteo `minutely_15`), una sola vez por lugar aunque lo tengan varios dispositivos, y de a 50 lugares por consulta.
- Avisa **una vez por episodio**: "Lluvia en unos 45 min · Refugio" o "Está lloviendo". Vuelve a avisar recién cuando el pronóstico se seca y vuelve a llover. Si la ubicación de "donde estoy" tiene más de media hora, la notificación lo aclara, y si tiene más de 24 h no se usa.
- **Rayos:** cada 60 segundos, y solo si hay algún lugar con aviso, baja el archivo más nuevo del GOES-19 GLM (NOAA, dominio público, `noaa-goes19`, uno cada 20 s con todo el disco) y se queda solo con los rayos de la región (15° S a 60° S, 45° O a 82° O). Avisa si cae uno a menos de 30 km, con la distancia y la dirección ("Rayos a 12 km al noroeste · Casa"), y como mucho una vez cada 10 minutos por lugar mientras sigan cayendo. El satélite tiene unos 8 km de error y ~1 minuto de demora. NOAA no permite bajar solo una zona: cada archivo pesa ~380 KB.
- Es pronóstico, no radar: en Argentina el horario es orientativo, con margen de una hora. La fuente es intercambiable (`server/src/rain/source.ts`), para sumar lluvia observada (GOES-19 o el radar del SMN) más adelante.

## Seguridad

- Cada dispositivo recibe un token propio al registrarse. El servidor guarda solo su hash.
- Los códigos de transferencia son de un solo uso. Una IP que prueba más de 20 códigos inválidos en 10 minutos queda bloqueada temporalmente.
- El servidor corre como usuario sin privilegios dentro del contenedor.
