"""
Qué falta convertir (ARQUITECTURA §11.2): compara la colección con lo ya
convertido. Los libros nuevos que se agregan a la carpeta aparecen como
pendientes; los que cambiaron (otro archivo con el mismo nombre), también.
"""
import fcntl
import json
import os
from collections import defaultdict
from contextlib import contextmanager

from .scan import Entry

LOCK = ".convert.lock"


@contextmanager
def single_run(out: str):
    """Una sola conversión a la vez: si ya hay otra corriendo, se avisa y no se hace nada."""
    f = open(os.path.join(out, LOCK), "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("Ya hay una conversión corriendo: esperá a que termine.")
    try:
        yield
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()


def conversion_key(e: Entry) -> str:
    return f"{e.md5}|{e.title}|{e.license}|{e.kind}"


def book_state(e: Entry, conv: dict) -> str:
    """convertido · pendiente · error · afuera · duplicado"""
    if e.exclude_reason or e.kind in ("archive", "skip"):
        return "afuera"
    if e.duplicate_of:
        return "duplicado"
    c = conv.get(e.id)
    if not c or c.get("skipped"):
        return "pendiente"
    if c.get("error"):
        return "error"
    return "convertido" if c.get("key") == conversion_key(e) else "pendiente"


def status(entries: list[Entry], out: str) -> dict:
    conv_path = os.path.join(out, "conversion.json")
    conv: dict = json.load(open(conv_path)) if os.path.exists(conv_path) else {}
    by_cat: dict[str, dict[str, list[Entry]]] = defaultdict(lambda: defaultdict(list))
    for e in entries:
        by_cat[e.category][book_state(e, conv)].append(e)
    summary = {
        cat: {state: len(lst) for state, lst in states.items()}
        for cat, states in sorted(by_cat.items())
    }
    pending = [
        {"path": e.path, "kind": e.kind, "pages": e.pages, "error": conv.get(e.id, {}).get("error")}
        for cat in sorted(by_cat)
        for state in ("pendiente", "error")
        for e in by_cat[cat][state]
    ]
    data = {"categories": summary, "pending": pending}
    json.dump(data, open(os.path.join(out, "status.json"), "w"), ensure_ascii=False, indent=1)
    return data


def print_status(data: dict) -> None:
    cats = data["categories"]
    tot = defaultdict(int)
    print(f"{'Categoría':38} {'Convertidos':>11} {'Pendientes':>10} {'Con error':>9}")
    for cat, s in cats.items():
        for k, v in s.items():
            tot[k] += v
        print(f"{cat[:38]:38} {s.get('convertido', 0):>11} {s.get('pendiente', 0):>10} {s.get('error', 0):>9}")
    print(f"{'Total':38} {tot['convertido']:>11} {tot['pendiente']:>10} {tot['error']:>9}")
    print(f"(además: {tot['duplicado']} duplicados y {tot['afuera']} que quedan afuera; detalle en report.html)")
    scanned = [p for p in data["pending"] if p["kind"] == "pdf-ocr"]
    if scanned:
        print(f"De los pendientes, {len(scanned)} son escaneados ({sum(p['pages'] for p in scanned)} páginas de OCR, unos {sum(p['pages'] for p in scanned) * 5 // 3600} h).")
