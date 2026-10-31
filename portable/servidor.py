#!/usr/bin/env python3
"""VikArg Prepping Tools - servidor local para usar la app sin internet (Linux y Mac).

Sirve la carpeta "app" en http://127.0.0.1:47613 y abre el navegador.
Solo usa la biblioteca estándar de Python 3.

El puerto es siempre el mismo a propósito: el navegador guarda los datos por
dirección, y con otro puerto la app aparece vacía.
"""

import functools
import http.server
import os
import sys
import webbrowser

PORT = 47613
URL = f"http://127.0.0.1:{PORT}/"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".webp": "image/webp",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        # La app y su service worker se revisan siempre: así una versión nueva copiada en la carpeta se detecta.
        if self.path in ("/", "/index.html", "/sw.js"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.exit("No se encuentra la carpeta 'app' junto a este archivo. Descomprimí el paquete completo.")
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT))
    except OSError:
        sys.exit(f"El puerto {PORT} está ocupado. Si VikArg ya está abierto, usá esa ventana.")
    print(f"\n  VikArg Prepping Tools está funcionando en {URL}")
    print("  Dejá esta terminal abierta mientras uses la app. Para terminar: Ctrl+C.\n")
    webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
