#!/bin/sh
# Uso: sh tools/library-builder/run.sh <comando> [opciones]
#   scan                     analiza la colección (formatos, escaneados, duplicados, licencias)
#   convert --category X     convierte una categoría (o --all)
#   report                   arma el informe
# Variables: SRC (carpeta de origen), OUT (salida; por defecto ~/vikarg-library).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${SRC:-"$HOME/Documentos/Biblioteca del Preparacionista"}
OUT=${OUT:-"$HOME/vikarg-library"}
mkdir -p "$OUT"
docker build -q -t vikarg-library-builder "$HERE" >/dev/null
# La colección se monta solo para leer; la red queda cortada.
exec docker run --rm --network none --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$SRC:/src:ro" -v "$OUT:/out" -v "$HERE/books.yaml:/app/books.yaml:ro" \
  vikarg-library-builder "$@"
