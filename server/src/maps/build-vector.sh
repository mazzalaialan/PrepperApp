#!/bin/sh
# Arma vector.pmtiles para el servidor con Planetiler (esquema OpenMapTiles,
# el mismo que usa OpenFreeMap, así el estilo de la app sirve igual).
#
#   sh server/src/maps/build-vector.sh /ruta/maps
#
# Baja el extracto de Sudamérica de Geofabrik (~3,5 GB) y recorta Argentina,
# Chile, Uruguay, Bolivia y Perú. Necesita Docker, ~10 GB de RAM libres y unos 30 GB de disco
# temporal; tarda de una a varias horas según la máquina. Para otra zona:
#   AREA=south-america BOUNDS=oeste,sur,este,norte sh build-vector.sh /ruta/maps
# Si osmdata.openstreetmap.de (polígonos de agua) no responde, se puede usar
# otra copia, por ejemplo la del Wayback Machine:
#   WATER_URL=https://web.archive.org/web/20260107000623id_/https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip
set -eu

OUT_DIR=${1:?Uso: build-vector.sh /ruta/maps}
AREA=${AREA:-south-america}
BOUNDS=${BOUNDS:--81.5,-56,-53,0}
MEMORY=${MEMORY:-10g}
WATER_URL=${WATER_URL:-}
mkdir -p "$OUT_DIR/planetiler"

docker run --rm \
  -e JAVA_TOOL_OPTIONS="-Xmx$MEMORY" \
  -v "$(cd "$OUT_DIR" && pwd)/planetiler:/data" \
  ghcr.io/onthegomap/planetiler:latest \
  --download --area="$AREA" --bounds="$BOUNDS" \
  --maxzoom=14 --output=/data/vector.pmtiles --force \
  ${WATER_URL:+--water_polygons_url="$WATER_URL"}

mv "$OUT_DIR/planetiler/vector.pmtiles" "$OUT_DIR/vector.pmtiles"
echo "Listo: $OUT_DIR/vector.pmtiles (los archivos bajados quedan en $OUT_DIR/planetiler; se pueden borrar)."
