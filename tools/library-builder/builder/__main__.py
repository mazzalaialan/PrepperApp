"""Conversor de la biblioteca (ARQUITECTURA §11.2). Ver run.sh."""
import argparse
import json
import os
from dataclasses import asdict

import yaml

from .scan import Entry, scan

SRC = "/src"
OUT = "/out"


def load_overrides() -> dict:
    path = "/app/books.yaml"
    if not os.path.exists(path):
        return {}
    return yaml.safe_load(open(path)) or {}


def load_inventory() -> list[Entry]:
    return [Entry(**e) for e in json.load(open(os.path.join(OUT, "inventory.json")))]


def main() -> None:
    p = argparse.ArgumentParser(prog="library-builder")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan", help="analiza la colección")
    c = sub.add_parser("convert", help="convierte libros a HTML")
    c.add_argument("--category", action="append", default=[], help="categoría (se puede repetir)")
    c.add_argument("--all", action="store_true")
    c.add_argument("--book", action="append", default=[], help="ruta de un libro (para probar)")
    c.add_argument("--no-ocr", action="store_true", help="saltear los escaneados")
    sub.add_parser("report", help="arma el informe")
    args = p.parse_args()

    if args.cmd == "scan":
        entries = scan(SRC, OUT, load_overrides())
        json.dump([asdict(e) for e in entries], open(os.path.join(OUT, "inventory.json"), "w"), ensure_ascii=False, indent=1)
        from .report import write_report

        write_report(entries, OUT)
        print(f"{len(entries)} archivos analizados → {OUT}/inventory.json y {OUT}/report.html")
    elif args.cmd == "convert":
        from .convert import convert

        entries = load_inventory()
        convert(entries, SRC, OUT, categories=args.category, all_=args.all, books=args.book, ocr=not args.no_ocr)
    elif args.cmd == "report":
        from .report import write_report

        write_report(load_inventory(), OUT)


if __name__ == "__main__":
    main()
