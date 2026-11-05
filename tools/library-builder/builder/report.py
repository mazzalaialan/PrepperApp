"""Informe para revisar a mano (ARQUITECTURA §11.2): `report.html` en la salida."""
import html
import json
import os
from collections import Counter, defaultdict

from .scan import Entry

KIND_NAME = {
    "pdf": "PDF con texto",
    "pdf-ocr": "PDF escaneado (OCR)",
    "epub": "EPUB",
    "pandoc": "Word, ODT, RTF, TXT, HTM",
    "office": "DOC o presentación (LibreOffice)",
    "mobi": "MOBI",
    "sheet": "Planilla (tabla HTML)",
    "cbz": "Imágenes (CBZ)",
    "archive": "ZIP (se descomprime)",
    "skip": "No es un libro",
}


def _mb(n: int) -> str:
    return f"{n / 2**20:.1f} MB"


def write_report(entries: list[Entry], out: str) -> None:
    conv_path = os.path.join(out, "conversion.json")
    conv: dict = json.load(open(conv_path)) if os.path.exists(conv_path) else {}
    e_ = html.escape
    # Lo que se supo al convertir (licencia e idioma de los escaneados, después del OCR) manda.
    for x in entries:
        c = conv.get(x.id, {})
        if c.get("license"):
            x.license, x.license_reason = c["license"], c.get("licenseReason", x.license_reason)
        if c.get("lang") and x.lang == "?":
            x.lang = c["lang"]
    books = [e for e in entries if not e.exclude_reason and not e.duplicate_of and e.kind not in ("archive",)]
    rows: list[str] = []

    def table(title: str, head: list[str], body: list[list[str]], note: str = "") -> None:
        rows.append(f"<h2>{e_(title)} ({len(body)})</h2>")
        if note:
            rows.append(f"<p>{note}</p>")
        if not body:
            rows.append("<p><em>Nada.</em></p>")
            return
        rows.append("<table><thead><tr>" + "".join(f"<th>{e_(h)}</th>" for h in head) + "</tr></thead><tbody>")
        for r in body:
            rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>")
        rows.append("</tbody></table>")

    kinds = Counter(e.kind for e in books)
    by_cat: dict[str, list[Entry]] = defaultdict(list)
    for e in books:
        by_cat[e.category].append(e)
    total_conv = sum(v.get("bytes_out", 0) for v in conv.values())

    rows.append("<h1>Biblioteca: informe de conversión</h1>")
    rows.append(
        f"<p>{len(entries)} archivos · {len(books)} libros a convertir · "
        f"{sum(1 for e in entries if e.duplicate_of)} duplicados · {sum(1 for e in entries if e.exclude_reason)} afuera · "
        f"{sum(1 for e in books if e.license == 'public')} públicos · origen {_mb(sum(e.bytes for e in books))}"
        + (f" · convertidos {len(conv)} ({_mb(total_conv)})" if conv else "")
        + "</p>"
    )
    from .status import book_state

    pend = [x for x in entries if book_state(x, conv) in ("pendiente", "error")]
    table(
        "Falta convertir",
        ["Libro", "Categoría", "Formato", "Estado"],
        [[e_(x.title), e_(x.category), e_(KIND_NAME.get(x.kind, x.kind)), e_(conv.get(x.id, {}).get("error") or "pendiente")] for x in sorted(pend, key=lambda x: (x.category, x.title))],
        "Para sumarlos: <code>sh tools/library-builder/run.sh update</code> (los libros nuevos que agregues a la carpeta aparecen acá solos).",
    )
    table("Por formato", ["Formato", "Libros"], [[e_(KIND_NAME.get(k, k)), str(n)] for k, n in kinds.most_common()])
    table(
        "Por categoría",
        ["Categoría", "Libros", "Escaneados", "Públicos", "Origen", "Convertido"],
        [
            [
                e_(c),
                str(len(v)),
                str(sum(1 for x in v if x.kind == "pdf-ocr")),
                str(sum(1 for x in v if x.license == "public")),
                _mb(sum(x.bytes for x in v)),
                _mb(sum(conv.get(x.id, {}).get("bytes_out", 0) for x in v)) if conv else "—",
            ]
            for c, v in sorted(by_cat.items())
        ],
    )
    table(
        "Públicos (van a los espejos)",
        ["Libro", "Categoría", "Por qué"],
        [[e_(x.title), e_(x.category), e_(x.license_reason)] for x in sorted(books, key=lambda x: x.title) if x.license == "public"],
        "Solo lo que es público con seguridad: obras del gobierno federal de EE. UU., licencias libres declaradas en el libro, publicaciones oficiales argentinas con Creative Commons. Para cambiar uno, <code>license:</code> en <code>books.yaml</code>.",
    )
    table(
        "Para revisar la licencia",
        ["Libro", "Categoría", "Motivo"],
        [[e_(x.title), e_(x.category), e_(x.license_reason)] for x in sorted(books, key=lambda x: x.title) if x.license == "private" and "revisar" in x.license_reason],
    )
    table(
        "Títulos corregidos (revisar)",
        ["Archivo", "Título", "De dónde"],
        [[e_(os.path.basename(x.path)), e_(x.title), e_(x.title_source)] for x in sorted(books, key=lambda x: x.path) if os.path.splitext(os.path.basename(x.path))[0] != x.title],
        "Si un título o la categoría están mal, se corrigen en <code>books.yaml</code> (<code>title:</code>, <code>category:</code>, <code>section:</code>).",
    )
    table(
        "Duplicados (se usa el otro)",
        ["Archivo", "Se usa", "Nota"],
        [[e_(x.path), e_(x.duplicate_of or ""), e_("; ".join(x.notes))] for x in entries if x.duplicate_of],
    )
    table(
        "Quedan afuera",
        ["Archivo", "Motivo"],
        [[e_(x.path), e_(x.exclude_reason or "")] for x in entries if x.exclude_reason],
    )
    table("ZIP", ["Archivo", "Contenido"], [[e_(x.path), e_("; ".join(x.notes))] for x in entries if x.kind == "archive"])
    if conv:
        table(
            "Conversión",
            ["Libro", "Modo", "Páginas", "Capítulos", "Imágenes", "Origen", "HTML", "Avisos"],
            [
                [
                    e_(x.title),
                    e_(KIND_NAME.get(x.kind, x.kind)),
                    str(x.pages or ""),
                    str(conv[x.id].get("chapters", "")),
                    str(conv[x.id].get("images", "")),
                    _mb(x.bytes),
                    _mb(conv[x.id].get("bytes_out", 0)),
                    e_("; ".join(conv[x.id].get("warnings", []))),
                ]
                for x in sorted(books, key=lambda x: (x.category, x.title))
                if x.id in conv
            ],
        )
    page = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de la biblioteca</title><style>
body{{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1200px;color:#222;background:#fafafa}}
table{{border-collapse:collapse;width:100%;margin:8px 0 24px;font-size:13px}}th,td{{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}}
th{{background:#eee}}h2{{margin-top:28px}}code{{background:#eee;padding:0 3px}}
@media (prefers-color-scheme: dark){{body{{background:#121a24;color:#ddd}}th{{background:#1d2836}}td,th{{border-color:#334}}code{{background:#1d2836}}}}
</style></head><body>{''.join(rows)}</body></html>"""
    open(os.path.join(out, "report.html"), "w").write(page)
