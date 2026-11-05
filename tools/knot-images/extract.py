"""
Figuras de nudos y anclajes (cap. 4 y 5 del FM 3-97.61) de los manuales del Ejército de EE. UU. (dominio público):
FM 3-97.61 "Military Mountaineering" (2002) y FM 3-05.70 "Survival" (2002),
Apéndice G (ARQUITECTURA §10.2). Saca cada figura de la página, la separa en
pasos (los paneles que trae, divididos por líneas o espacios en blanco) y deja
WebP chicos más un `figures.json` para elegir qué paso va en cada nudo.

Uso (dentro de la imagen del conversor de la biblioteca, que ya tiene
PyMuPDF y Pillow):
  docker run --rm -v <pdfs>:/src:ro -v <salida>:/out -v $PWD:/tool:ro \
    --entrypoint python vikarg-library-builder /tool/extract.py
"""
import io
import json
import os
import re

import fitz
from PIL import Image

SOURCES = {
    "fm39761": ("/src/src-fm39761.pdf", r"Figure ([45]-\d+)\.\s*(.+)"),
    "fm30570": ("/src/src-fm30570.pdf", r"Figure (G-\d+)\.\s*(.+)"),
    # FM 5-125 "Rigging Techniques, Procedures and Applications" (2001), cap. 4: anclajes y vientos.
    "fm5125": ("/src/src-fm5125.pdf", r"Figure (4-\d+)\.\s*(.+)"),
}
DPI = 220
OUT = "/out"


def figure_rect(page: fitz.Page, caption: fitz.Rect) -> fitz.Rect | None:
    """La figura está arriba del epígrafe: las imágenes y dibujos entre el epígrafe y el texto de arriba."""
    rects = [fitz.Rect(i["bbox"]) for i in page.get_image_info()]
    try:
        rects += [fitz.Rect(d["rect"]) for d in page.get_drawings()]
    except Exception:
        pass
    above = [r for r in rects if r.y1 <= caption.y0 + 4 and r.y1 > caption.y0 - 500 and r.width > 20 and r.height > 20 and abs(r) < abs(page.rect) * 0.9]
    if not above:
        return None
    # La más cercana al epígrafe y todo lo que se le superpone hacia arriba.
    above.sort(key=lambda r: -r.y1)
    fig = fitz.Rect(above[0])
    for r in above[1:]:
        if r.y1 >= fig.y0 - 12:
            fig |= r
    return fig & page.rect


def _cuts(g: Image.Image, axis: int) -> list[tuple[int, int]]:
    """Tramos entre separadores (líneas oscuras de lado a lado o franjas casi blancas) en un eje (0 = columnas)."""
    w, h = g.size
    px = g.load()
    n_along = w if axis == 0 else h
    n_across = h if axis == 0 else w
    sep = []
    for i in range(n_along):
        dark = white = 0
        for j in range(0, n_across, 2):
            v = px[i, j] if axis == 0 else px[j, i]
            dark += v < 90
            white += v > 232
        n = (n_across + 1) // 2
        sep.append(dark / n > 0.8 or white / n > 0.97)
    spans, start = [], None
    for i in range(n_along + 1):
        s = sep[i] if i < n_along else True
        if not s and start is None:
            start = i
        elif s and start is not None:
            if i - start > n_along * 0.15:
                spans.append((start, i))
            start = None
    return spans


def split_panels(img: Image.Image, depth: int = 0) -> list[Image.Image]:
    """Corte en X e Y recursivo: columnas, después filas dentro de cada columna (o al revés)."""
    if depth > 3:
        return [img]
    g = img.convert("L")
    for axis in (1, 0) if depth % 2 == 0 else (0, 1):
        spans = _cuts(g, axis)
        if len(spans) > 1:
            out = []
            for a, b in spans:
                piece = img.crop((a, 0, b, img.height) if axis == 0 else (0, a, img.width, b))
                out += split_panels(piece, depth + 1)
            return out
    return [img]


def trim(img: Image.Image) -> Image.Image:
    g = img.convert("L").point(lambda v: 255 if v > 235 else 0)
    from PIL import ImageOps

    box = ImageOps.invert(g).getbbox()
    return img.crop(box) if box else img


def save(img: Image.Image, name: str) -> str:
    img = trim(img)
    if img.width > 640:
        img = img.resize((640, round(img.height * 640 / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.convert("RGB").save(path, "WEBP", quality=62, method=6)
    return name


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    figures = []
    for key, (pdf, caption_re) in SOURCES.items():
        doc = fitz.open(pdf)
        rx = re.compile(caption_re)
        for page in doc:
            for block in page.get_text("blocks"):
                text = block[4].strip().replace("\n", " ")
                m = rx.match(text)
                if not m:
                    continue
                cap = fitz.Rect(block[:4])
                rect = figure_rect(page, cap)
                if not rect:
                    continue
                pix = page.get_pixmap(clip=rect, dpi=DPI)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                fig_id = f"{key}-{m.group(1)}"
                panels = split_panels(img)
                files = [save(p, f"{fig_id}-{i + 1}.webp") for i, p in enumerate(panels)]
                full = save(img, f"{fig_id}.webp")
                figures.append({"id": fig_id, "title": m.group(2).strip().rstrip("."), "page": page.number + 1, "full": full, "steps": files})
                print(fig_id, m.group(2)[:50], len(files), "pasos")
    json.dump(figures, open(os.path.join(OUT, "figures.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
