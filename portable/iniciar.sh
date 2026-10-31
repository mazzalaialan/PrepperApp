#!/bin/sh
# Abre VikArg Survival sin internet (Linux y Mac). Necesita Python 3.
cd "$(dirname "$0")" || exit 1
exec python3 servidor.py
