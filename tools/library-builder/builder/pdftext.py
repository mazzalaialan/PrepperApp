"""
PDF con texto → bloques del libro (títulos, párrafos, listas, imágenes) con
PyMuPDF (ARQUITECTURA §11.2). Lo que no es contenido se descarta: encabezados
y pies que se repiten, números de página. Las imágenes que trae el PDF se
extraen tal cual; los dibujos hechos con vectores (muy comunes en manuales: los
nudos, por ejemplo) se recortan de la página como imagen. Nunca la página
entera.
"""
import re
from collections import Counter
from dataclasses import dataclass, field

import fitz

from PIL import Image

from .images import ImageStore
from .regions import LOW_DPI, photo_regions

# Bloques del libro, en orden.
@dataclass
class Block:
    kind: str  # "h1" "h2" "h3" "p" "li" "img"
    text: str = ""
    src: str = ""
    page: int = 0


@dataclass
class Extracted:
    blocks: list[Block] = field(default_factory=list)
    toc: list[tuple[int, str, int]] = field(default_factory=list)  # (nivel, título, página)
    warnings: list[str] = field(default_factory=list)


_PAGE_NUM = re.compile(r"^\s*(p[aá]g(ina)?\.?\s*)?(\d{1,4}|[ivxlcdm]{1,6})(\s*(de|/|of)\s*\d{1,4})?\s*$", re.I)
_BULLET = re.compile(r"^\s*([•·▪■●◦○‣–\-\*]|\d{1,2}[.)]|[a-z][.)])\s+", re.I)
_NORM = re.compile(r"[\d\s]+")

# Márgenes donde viven encabezados y pies.
EDGE = 0.08
# Un texto de borde que se repite en más de esta parte de las páginas es encabezado o pie.
REPEAT = 0.3
# Dibujos vectoriales: cuántos trazos hacen falta para que valga la pena recortarlos.
MIN_DRAWINGS = 12
MIN_DRAWING_AREA = 0.04  # del área de la página
# Si el texto ocupa más que esto de una zona de trazos, no es un dibujo (son líneas alrededor del texto).
MAX_TEXT_IN_DRAWING = 0.35
DRAWING_DPI = 150


def _line_text(line: dict) -> str:
    return "".join(s["text"] for s in line["spans"]).strip()


def _edge_lines(doc: fitz.Document) -> set[str]:
    """Textos de borde que se repiten (encabezados y pies), sin números."""
    seen: Counter[str] = Counter()
    for page in doc:
        h = page.rect.height
        keys = set()
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            y0, y1 = b["bbox"][1], b["bbox"][3]
            if y1 < h * EDGE or y0 > h * (1 - EDGE):
                for line in b["lines"]:
                    k = _NORM.sub("", _line_text(line)).lower()
                    if k:
                        keys.add(k)
        seen.update(keys)
    n = max(1, doc.page_count)
    return {k for k, c in seen.items() if c >= max(3, n * REPEAT)}


def _body_size(doc: fitz.Document) -> float:
    sizes: Counter[float] = Counter()
    for i, page in enumerate(doc):
        if i > 60 and i % 5:  # en libros largos, una muestra alcanza
            continue
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    sizes[round(s["size"], 1)] += len(s["text"].strip())
    return sizes.most_common(1)[0][0] if sizes else 10.0


def _drawing_regions(page: fitz.Page, text_rects: list[fitz.Rect] | None = None) -> list[fitz.Rect]:
    """Zonas con muchos trazos vectoriales (dibujos, esquemas), unidas si se tocan.

    Se descartan las que son casi todo texto: líneas decorativas, subrayados o
    marcos alrededor de los párrafos (si no, se guardaba la página entera como
    imagen, como en "Salud de la botica del Señor").
    """
    try:
        drawings = page.get_drawings()
    except Exception:
        return []
    if len(drawings) < MIN_DRAWINGS:
        return []
    page_area = abs(page.rect)
    rects: list[fitz.Rect] = []
    for d in drawings:
        r = fitz.Rect(d["rect"])
        # Rectángulos que ocupan casi toda la página son marcos o fondos.
        if r.is_empty or abs(r) > page_area * 0.8:
            continue
        r = r + (-6, -6, 6, 6)
        for i, other in enumerate(rects):
            if r.intersects(other):
                rects[i] = other | r
                break
        else:
            rects.append(r)
    # Una segunda pasada une las que quedaron superpuestas.
    merged: list[fitz.Rect] = []
    for r in sorted(rects, key=lambda x: (x.y0, x.x0)):
        if merged and merged[-1].intersects(r):
            merged[-1] |= r
        else:
            merged.append(r)
    out = [r & page.rect for r in merged if abs(r) >= page_area * MIN_DRAWING_AREA and r.width > 60 and r.height > 60]
    if text_rects:
        out = [r for r in out if sum(abs(r & t) for t in text_rects) < abs(r) * MAX_TEXT_IN_DRAWING]
    return out


def extract(path: str, images: ImageStore) -> Extracted:
    out = Extracted()
    doc = fitz.open(path)
    out.toc = [(lvl, title.strip(), page) for lvl, title, page in doc.get_toc(simple=True) if title.strip()]
    edges = _edge_lines(doc)
    body = _body_size(doc)
    # Imágenes que aparecen en muchas páginas: logos y viñetas.
    xref_pages: Counter[int] = Counter()
    for page in doc:
        xref_pages.update({x[0] for x in page.get_images(full=True)})
    repeated = {x for x, c in xref_pages.items() if c >= max(3, doc.page_count * REPEAT)}

    for pno, page in enumerate(doc, start=1):
        h = page.rect.height
        items: list[tuple[float, Block]] = []
        text_dict = page.get_text("dict", sort=True)
        for b in text_dict["blocks"]:
            if b.get("type") != 0:
                continue
            lines = []
            sizes, bold = [], 0
            for line in b["lines"]:
                t = _line_text(line)
                if not t:
                    continue
                y0, y1 = line["bbox"][1], line["bbox"][3]
                at_edge = y1 < h * EDGE or y0 > h * (1 - EDGE)
                if at_edge and (_PAGE_NUM.match(t) or _NORM.sub("", t).lower() in edges):
                    continue
                if _PAGE_NUM.match(t) and len(b["lines"]) == 1:
                    continue
                lines.append(t)
                for s in line["spans"]:
                    if s["text"].strip():
                        sizes.append(s["size"])
                        bold += bool(s["flags"] & 16)
            if not lines:
                continue
            size = max(sizes) if sizes else body
            text = _join_lines(lines)
            short = len(text) < 140 and "\n" not in text
            if short and size >= body * 1.6:
                kind = "h1"
            elif short and size >= body * 1.25:
                kind = "h2"
            elif short and len(text) < 90 and bold >= len(sizes) * 0.8 and size >= body * 0.98 and not text.endswith((".", ",", ";")):
                kind = "h3"
            else:
                kind = "p"
            if kind == "p":
                # Listas: cada línea que empieza con viñeta o número es un ítem.
                if all(_BULLET.match(l) for l in lines[:1]) and len(lines) >= 1:
                    for item in _split_items(lines):
                        items.append((b["bbox"][1], Block("li", _BULLET.sub("", item, count=1), page=pno)))
                    continue
            items.append((b["bbox"][1], Block(kind, text, page=pno)))

        # Imágenes del PDF. Las que cubren casi toda la página, o tienen texto reconocido encima, son la
        # página escaneada (o pedazos de ella): no se guardan; se recortan solo las fotos y dibujos.
        page_area = abs(page.rect)
        infos = page.get_image_info(xrefs=True)
        text_rects = [fitz.Rect(b["bbox"]) for b in text_dict["blocks"] if b.get("type") == 0]

        def is_scan(info: dict) -> bool:
            r = fitz.Rect(info["bbox"]) & page.rect
            if abs(r) >= page_area * 0.8:
                return True
            covered = sum(abs(r & t) for t in text_rects)
            return abs(r) > 0 and covered / abs(r) > 0.15

        scans = [i for i in infos if is_scan(i)]
        if scans:
            for src, y in scanned_page_images(page, [tuple(t) for t in text_rects], images):
                items.append((y, Block("img", src=src, page=pno)))
            infos = [i for i in infos if not is_scan(i)]
        for info in infos:
            xref = info.get("xref")
            if not xref or xref in repeated:
                continue
            bbox = fitz.Rect(info["bbox"])
            if bbox.width < 40 or bbox.height < 40:
                continue
            src = images.from_pdf(doc, xref)
            if src:
                items.append((bbox.y0, Block("img", src=src, page=pno)))
        # Dibujos vectoriales.
        text_rects = [fitz.Rect(b["bbox"]) for b in text_dict["blocks"] if b.get("type") == 0]
        for r in _drawing_regions(page, text_rects):
            pix = page.get_pixmap(clip=r, dpi=DRAWING_DPI)
            src = images.from_pixmap(pix)
            if src:
                items.append((r.y0, Block("img", src=src, page=pno)))

        items.sort(key=lambda x: x[0])
        out.blocks.extend(b for _, b in items)

    out.blocks = merge_paragraphs(out.blocks)
    if doc.page_count and not any(b.kind != "img" for b in out.blocks):
        out.warnings.append("No salió texto: ¿es escaneado?")
    return out


CROP_DPI = 150


def scanned_page_images(page: fitz.Page, text_boxes: list, images: ImageStore) -> list[tuple[str, float]]:
    """Fotos y dibujos de una página escaneada, sin el texto ni la página entera. (src, y en puntos)."""
    low = page.get_pixmap(dpi=LOW_DPI, colorspace=fitz.csGRAY)
    gray = Image.frombytes("L", (low.width, low.height), low.samples)
    scale = LOW_DPI / 72
    out = []
    for x0, y0, x1, y1 in photo_regions(gray, text_boxes, scale):
        clip = fitz.Rect(x0 / scale, y0 / scale, x1 / scale, y1 / scale) & page.rect
        src = images.from_pixmap(page.get_pixmap(clip=clip, dpi=CROP_DPI))
        if src:
            out.append((src, clip.y0))
    return out


_ENDS_SENTENCE = re.compile(r"[.!?:;…»”\")]\s*$")


def merge_paragraphs(blocks: list[Block]) -> list[Block]:
    """Un párrafo que sigue en el bloque o la página siguiente (no termina en punto y el otro empieza en minúscula) va junto."""
    out: list[Block] = []
    pending_imgs: list[Block] = []
    for b in blocks:
        if b.kind == "img":
            pending_imgs.append(b)
            continue
        prev = out[-1] if out else None
        if (
            prev is not None
            and prev.kind == "p"
            and b.kind == "p"
            and not _ENDS_SENTENCE.search(prev.text)
            and re.match(r"^[a-záéíóúñü(]", b.text)
        ):
            prev.text = _join_lines([prev.text, b.text])
        else:
            out.append(b)
        # Las imágenes que quedaron en el medio van después del párrafo.
        out.extend(pending_imgs)
        pending_imgs = []
    out.extend(pending_imgs)
    return out


def _join_lines(lines: list[str]) -> str:
    """Une las líneas de un párrafo; las palabras cortadas con guion se vuelven a unir."""
    text = ""
    for line in lines:
        if not text:
            text = line
        elif re.search(r"[a-záéíóúñü]-$", text) and re.match(r"^[a-záéíóúñü]", line):
            text = text[:-1] + line
        else:
            text += " " + line
    return re.sub(r"\s{2,}", " ", text)


def _split_items(lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        if _BULLET.match(line) or not items:
            items.append(line)
        else:
            items[-1] = _join_lines([items[-1], line])
    return items
