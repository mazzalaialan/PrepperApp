#!/bin/sh
# Suite e2e completa con los contenedores pesados en pausa (verificada); se reanudan siempre al salir.
cd "$(dirname "$0")/.." || exit 1
sh scripts/heavy-containers.sh pause || { echo "no se pudo pausar todo: no corro las e2e" >&2; sh scripts/heavy-containers.sh unpause; exit 1; }
trap 'sh scripts/heavy-containers.sh unpause' EXIT INT TERM
npx playwright test "$@"
