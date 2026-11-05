"""
Paquetes de la biblioteca (ARQUITECTURA §11): un ZIP por libro convertido y un
catálogo con todos (libres y con derechos) para que la app los liste. El
servidor sirve los libres a cualquiera y los con derechos solo con la clave
de la biblioteca. Se arma de a poco: un libro que no cambió conserva su ZIP.
"""
import base64
import hashlib
import html
import json
import os
import re
import tempfile
import zipfile
from datetime import datetime, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from .meta import slug
from .scan import Entry
from .status import book_state

PKG_DIR = "packages"
# Fecha fija dentro del ZIP: el mismo libro da siempre el mismo archivo (y el mismo hash).
ZIP_TIME = (2026, 1, 1, 0, 0, 0)

# Nombres para mostrar de las carpetas (con acentos).
CATEGORY_NAMES = {
    "Agua y aguas negras": "Agua y aguas negras",
    "Alimento": "Alimento",
    "Animales e insectos": "Animales e insectos",
    "Cabuyeria": "Cabuyería",
    "Catastrofes": "Catástrofes",
    "Cocina": "Cocina",
    "Comunicaciones": "Comunicaciones",
    "Construcciones y herramientas": "Construcciones y herramientas",
    "Cultivo": "Cultivo",
    "Defensa y entrenamiento": "Defensa y entrenamiento",
    "Energia": "Energía",
    "Higiene": "Higiene",
    "Literatura General": "Literatura general",
    "Medicina y Primeros Auxilios": "Medicina y primeros auxilios",
    "Mochilas kits y preparacion hogar": "Mochilas, kits y preparación del hogar",
    "Orientacion": "Orientación",
    "Psicologia": "Psicología",
    "Revista Comando": "Revista Comando",
    "Supervivencia General": "Supervivencia general",
    "Vehiculos y Movilidad": "Vehículos y movilidad",
}


def _plain_text(folder: str) -> str:
    """Texto del libro, para buscar en la app sin abrir cada capítulo."""
    parts = []
    for name in sorted(os.listdir(folder)):
        if name.endswith(".html"):
            raw = open(os.path.join(folder, name), encoding="utf-8").read()
            raw = re.sub(r"<(nav|title)[^>]*>.*?</\1>", " ", raw, flags=re.S)
            text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
            parts.append(f"\f{name}\n" + re.sub(r"\s+", " ", text).strip())
    return "\n".join(parts)


def _zip_book(folder: str, dest: str) -> None:
    tmp = dest + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, _, files in os.walk(folder):
            for f in sorted(files):
                path = os.path.join(root, f)
                arc = os.path.relpath(path, folder)
                info = zipfile.ZipInfo(arc, ZIP_TIME)
                # Las imágenes ya están comprimidas.
                info.compress_type = zipfile.ZIP_STORED if f.endswith(".webp") else zipfile.ZIP_DEFLATED
                z.writestr(info, open(path, "rb").read())
        info = zipfile.ZipInfo("text.txt", ZIP_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, _plain_text(folder))
    os.replace(tmp, dest)


# Libros con derechos: cifrados con la clave de la biblioteca (ARQUITECTURA §11.2). Mismo esquema que la
# bóveda de la app (PBKDF2-SHA256 + AES-256-GCM): si los archivos se filtran (git, un espejo, una copia),
# sin la clave no se pueden abrir. Formato de cada archivo: "VKLB1" + IV (12 bytes) + texto cifrado con etiqueta.
MAGIC = b"VKLB1"
ITERATIONS = 600_000
KEY_CHECK = b"VikArg biblioteca"


class LibraryCrypto:
    def __init__(self, passphrase: str, salt: bytes):
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
        self.salt = salt
        self.aes = AESGCM(kdf.derive(passphrase.encode("utf-8")))

    def seal(self, data: bytes) -> bytes:
        iv = os.urandom(12)
        return MAGIC + iv + self.aes.encrypt(iv, data, None)

    def open(self, blob: bytes) -> bytes:
        assert blob[:5] == MAGIC
        return self.aes.decrypt(blob[5:17], blob[17:], None)


def _is_sealed(path: str) -> bool:
    """Lo que manda es el archivo, no lo que diga el catálogo."""
    with open(path, "rb") as f:
        return f.read(len(MAGIC)) == MAGIC


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def package(entries: list[Entry], out: str, passphrase: str | None) -> dict:
    conv_path = os.path.join(out, "conversion.json")
    conv: dict = json.load(open(conv_path)) if os.path.exists(conv_path) else {}
    pkg = os.path.join(out, PKG_DIR)
    books_dir = os.path.join(pkg, "books")
    os.makedirs(books_dir, exist_ok=True)
    prev_path = os.path.join(pkg, "catalog.json")
    prev_catalog = json.load(open(prev_path)) if os.path.exists(prev_path) else {}
    prev = {b["id"]: b for c in prev_catalog.get("categories", []) for b in c["books"]}
    # La misma sal mientras no cambie la clave: así los libros que no cambiaron no se vuelven a cifrar.
    crypto = None
    if passphrase:
        old = prev_catalog.get("encryption")
        salt = base64.b64decode(old["salt"]) if old else os.urandom(16)
        crypto = LibraryCrypto(passphrase, salt)
        if old:
            try:
                crypto.open(base64.b64decode(old["check"]))
            except Exception:
                # Clave nueva: todo se vuelve a cifrar con sal nueva.
                crypto = LibraryCrypto(passphrase, os.urandom(16))
                prev = {}

    categories: dict[str, list[dict]] = {}
    keep = set()
    for e in entries:
        if book_state(e, conv) != "convertido":
            continue
        folder = os.path.join(out, "books", e.id)
        meta_path = os.path.join(folder, "book.json")
        if not os.path.exists(meta_path):
            continue
        meta = json.load(open(meta_path))
        license_ = meta.get("license", e.license)
        if license_ != "public" and not crypto:
            raise SystemExit("Hay libros con derechos y falta la clave de la biblioteca (LIBRARY_KEY o ~/vikarg-library/.library-key).")
        dest = os.path.join(books_dir, f"{e.id}.zip")
        key = conv[e.id]["key"]
        old = prev.get(e.id)
        # Sin cambios: se reusa el archivo (y su hash).
        if not (old and old.get("key") == key and old.get("license") == license_ and os.path.exists(dest) and _is_sealed(dest) == (license_ != "public")):
            _zip_book(folder, dest)
            if license_ != "public":
                sealed = crypto.seal(open(dest, "rb").read())
                open(dest + ".tmp", "wb").write(sealed)
                os.replace(dest + ".tmp", dest)
            old = None
        keep.add(f"{e.id}.zip")
        categories.setdefault(e.category, []).append(
            {
                "id": e.id,
                "title": meta.get("title") or e.title,
                "author": meta.get("author") or "",
                "lang": meta.get("lang") if meta.get("lang") in ("es", "en") else e.lang,
                "section": e.section,
                "license": license_,
                "encrypted": license_ != "public",
                "licenseReason": meta.get("licenseReason", e.license_reason),
                "pages": e.pages,
                "chapters": len(meta.get("chapters", [])),
                "bytes": os.path.getsize(dest),
                "sha256": old["sha256"] if old else _sha256(dest),
                "key": key,
            }
        )
    # ZIP de libros que ya no están (borrados de la colección o excluidos).
    for f in os.listdir(books_dir):
        if f.endswith(".zip") and f not in keep:
            os.remove(os.path.join(books_dir, f))

    catalog = {
        "format": "vikarg-library",
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Para derivar la clave en la app y comprobarla sin conexión antes de bajar nada.
        **(
            {"encryption": {"kdf": "PBKDF2-SHA256", "iterations": ITERATIONS, "salt": base64.b64encode(crypto.salt).decode(), "cipher": "AES-256-GCM", "check": base64.b64encode(crypto.seal(KEY_CHECK)).decode()}}
            if crypto
            else {}
        ),
        "categories": [
            {
                "id": slug(cat, 40),
                "name": CATEGORY_NAMES.get(cat, cat),
                "books": sorted(books, key=lambda b: ((b["section"] or ""), b["title"].lower())),
            }
            for cat, books in sorted(categories.items(), key=lambda kv: CATEGORY_NAMES.get(kv[0], kv[0]))
        ],
    }
    fd, tmp = tempfile.mkstemp(dir=pkg, suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, prev_path)
    total = sum(len(b) for b in categories.values())
    public = sum(1 for b in categories.values() for x in b if x["license"] == "public")
    size = sum(x["bytes"] for b in categories.values() for x in b)
    print(f"Catálogo: {total} libros ({public} libres, {total - public} con derechos), {size / 2**20:.0f} MB en {pkg}")
    return catalog
