#!/bin/sh
# Pausa (o reanuda) los contenedores pesados de esta máquina para que las e2e no
# fallen por carga: el conversor de la biblioteca y el ollama de Project NOMAD.
# El conversor cambia de ID en cada tanda (run.sh crea uno nuevo), así que se
# busca por la imagen con que se creó (Config.Image), no por ID. Después de
# pausar verifica que cada uno quedó en pausa; si alguno no, sale con error.
#   sh scripts/heavy-containers.sh pause|unpause|status
set -u
action=${1:-status}

heavy() {
  # Todos los que están corriendo: el conversor (imagen vikarg-library-builder, aunque se haya vuelto a armar) y nomad_ollama.
  ids=$(docker ps -q 2>/dev/null) || return 0
  [ -z "$ids" ] && return 0
  docker inspect -f '{{.Id}} {{.Config.Image}} {{.Name}}' $ids | awk '$2 ~ /^vikarg-library-builder(:|$)/ || $3 == "/nomad_ollama" { print substr($1, 1, 12), $3 }'
}

state() { docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null; }

# El script que lanza las tandas de conversión: se detiene también, para que no arranque un contenedor nuevo en medio de las pruebas.
loops() { pgrep -f '^sh /home/alan/vikarg-library/auto-convert\.sh' 2>/dev/null; }

case "$action" in
  pause)
    for p in $(loops); do kill -STOP "$p" && echo "en pausa: auto-convert.sh (pid $p)"; done
    list=$(heavy)
    if [ -z "$list" ]; then echo "sin contenedores pesados corriendo"; exit 0; fi
    fail=0
    echo "$list" | while read -r id name; do
      [ "$(state "$id")" = paused ] || docker pause "$id" >/dev/null
    done
    # Verificar con el estado real de cada uno.
    for id in $(echo "$list" | awk '{print $1}'); do
      s=$(state "$id")
      name=$(echo "$list" | awk -v i="$id" '$1 == i {print $2}')
      if [ "$s" = paused ]; then echo "en pausa: $id $name"; else echo "NO quedó en pausa: $id $name ($s)" >&2; fail=1; fi
    done
    exit $fail
    ;;
  unpause)
    for p in $(loops); do kill -CONT "$p" && echo "reanudado: auto-convert.sh (pid $p)"; done
    list=$(heavy)
    [ -z "$list" ] && { echo "nada que reanudar"; exit 0; }
    for id in $(echo "$list" | awk '{print $1}'); do
      [ "$(state "$id")" = paused ] && docker unpause "$id" >/dev/null
      echo "reanudado: $id $(echo "$list" | awk -v i="$id" '$1 == i {print $2}') ($(state "$id"))"
    done
    ;;
  status)
    list=$(heavy)
    [ -z "$list" ] && { echo "sin contenedores pesados corriendo"; exit 0; }
    for id in $(echo "$list" | awk '{print $1}'); do echo "$id $(echo "$list" | awk -v i="$id" '$1 == i {print $2}') $(state "$id")"; done
    ;;
  *) echo "uso: $0 pause|unpause|status" >&2; exit 2 ;;
esac
