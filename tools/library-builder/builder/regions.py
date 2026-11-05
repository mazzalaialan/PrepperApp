"""
Fotos y dibujos dentro de una página escaneada (ARQUITECTURA §11.2: nunca la
página entera). Se busca en una versión chica de la página dónde hay "tinta"
fuera de las cajas de texto (las del PDF o las del OCR) y se agrupa en
regiones; las chicas (viñetas, adornos, números) se descartan.
"""
from PIL import Image

LOW_DPI = 50
CELL = 5  # px a 50 dpi
INK = 232  # más oscuro que esto (de 0 a 255) no es papel en blanco
MIN_AREA = 0.025  # de la página
MIN_SIDE = 0.12  # de la página, ancho o alto
MAX_AREA = 0.85  # más que esto es la página entera
FILL = 0.35  # parte de la región que tiene que tener tinta
MIN_VAR = 120  # contraste mínimo de un cuadro (varianza en escala 0–255)


def photo_regions(gray: Image.Image, text_boxes: list[tuple[float, float, float, float]], scale: float) -> list[tuple[int, int, int, int]]:
    """
    `gray`: la página en escala de grises a LOW_DPI. `text_boxes`: cajas de texto
    en coordenadas de la página original; `scale` las lleva a píxeles de `gray`.
    Devuelve regiones (x0, y0, x1, y1) en píxeles de `gray`.
    """
    w, h = gray.size
    cols, rows = max(1, w // CELL), max(1, h // CELL)
    small = gray.resize((cols, rows), Image.BOX)
    # Contraste de cada cuadro (desvío estándar): E[x²] − E[x]². Un fondo gris o un degradé es oscuro
    # pero parejo; una foto o un dibujo, no.
    sq = gray.point(lambda v: v * v // 255).resize((cols, rows), Image.BOX)
    px, pq = small.load(), sq.load()

    def is_ink(c: int, r: int) -> bool:
        m = px[c, r]
        var = pq[c, r] * 255 - m * m
        return m < INK and var > MIN_VAR

    ink = [[is_ink(c, r) for c in range(cols)] for r in range(rows)]
    # Lo que está debajo del texto (un poco agrandado) no es imagen.
    for x0, y0, x1, y1 in text_boxes:
        c0, c1 = int(x0 * scale / CELL) - 1, int(x1 * scale / CELL) + 1
        r0, r1 = int(y0 * scale / CELL) - 1, int(y1 * scale / CELL) + 1
        for r in range(max(0, r0), min(rows, r1 + 1)):
            row = ink[r]
            for c in range(max(0, c0), min(cols, c1 + 1)):
                row[c] = False
    seen = [[False] * cols for _ in range(rows)]
    regions = []
    for r in range(rows):
        for c in range(cols):
            if not ink[r][c] or seen[r][c]:
                continue
            # Región conectada (vecinos inmediatos: un título cerca de una foto no se pega).
            stack = [(r, c)]
            seen[r][c] = True
            cells = 0
            r0 = r1 = r
            c0 = c1 = c
            while stack:
                y, x = stack.pop()
                cells += 1
                r0, r1, c0, c1 = min(r0, y), max(r1, y), min(c0, x), max(c1, x)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < rows and 0 <= nx < cols and ink[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((ny, nx))
            bw, bh = c1 - c0 + 1, r1 - r0 + 1
            area = bw * bh / (cols * rows)
            if area < MIN_AREA or area > MAX_AREA:
                continue
            if bw < cols * MIN_SIDE or bh < rows * MIN_SIDE:
                continue
            if cells / (bw * bh) < FILL:
                continue
            regions.append((c0 * CELL, r0 * CELL, (c1 + 1) * CELL, (r1 + 1) * CELL))
    return regions
