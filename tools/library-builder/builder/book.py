"""
Arma el libro en HTML liviano (ARQUITECTURA §11.2): `index.html` con el
índice y un archivo por capítulo si el libro es grande, más `book.json` con
los datos. HTML limpio: sin scripts, estilos ni enlaces externos; el estilo lo
pone la app.
"""
import html
import json
import os
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

from .pdftext import Block

# Libros más grandes que esto se separan por capítulo.
SPLIT_PAGES = 200
SPLIT_BYTES = 600_000
# Sin índice ni títulos claros: un capítulo cada tantas páginas.
FALLBACK_PAGES = 40


@dataclass
class Chapter:
    title: str
    html: list[str] = field(default_factory=list)

    @property
    def size(self) -> int:
        return sum(len(x) for x in self.html)


def _esc(t: str) -> str:
    return html.escape(t, quote=False)


def block_html(b: Block) -> str:
    if b.kind == "img":
        return f'<figure><img src="{b.src}" alt="" loading="lazy"></figure>'
    if b.kind == "li":
        return f"<li>{_esc(b.text)}</li>"
    return f"<{b.kind}>{_esc(b.text)}</{b.kind}>"


def _wrap_lists(parts: list[str]) -> list[str]:
    out: list[str] = []
    in_list = False
    for p in parts:
        is_li = p.startswith("<li>")
        if is_li and not in_list:
            out.append("<ul>")
            in_list = True
        elif not is_li and in_list:
            out.append("</ul>")
            in_list = False
        out.append(p)
    if in_list:
        out.append("</ul>")
    return out


def chapters_from_blocks(blocks: list[Block], toc: list[tuple[int, str, int]], pages: int) -> list[Chapter]:
    """Separa por el índice del PDF, si no por los títulos, si no cada tantas páginas. Libros chicos: un solo capítulo."""
    total = sum(len(b.text) + 60 for b in blocks)
    if pages <= SPLIT_PAGES and total <= SPLIT_BYTES:
        return [Chapter("", [block_html(b) for b in blocks])]

    starts: list[tuple[int, str]] = []  # (índice de bloque, título)
    top = [t for t in toc if t[0] == 1 and t[2] > 0]
    if len(top) >= 3:
        for _, title, page in top:
            idx = next((i for i, b in enumerate(blocks) if b.page >= page), None)
            if idx is not None and (not starts or idx > starts[-1][0]):
                starts.append((idx, title))
    if len(starts) < 3:
        for level in ("h1", "h2"):
            heads = [(i, b.text) for i, b in enumerate(blocks) if b.kind == level]
            if 3 <= len(heads) <= 200:
                starts = heads
                break
    if len(starts) < 3:
        starts = []
        last = -FALLBACK_PAGES
        for i, b in enumerate(blocks):
            if b.page - last >= FALLBACK_PAGES:
                starts.append((i, f"Páginas {b.page}–{min(pages, b.page + FALLBACK_PAGES - 1)}"))
                last = b.page
    if not starts or starts[0][0] > 0:
        starts.insert(0, (0, "Inicio"))
    chapters = []
    for n, (idx, title) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(blocks)
        chunk = blocks[idx:end]
        if chunk:
            chapters.append(Chapter(title, [block_html(b) for b in chunk]))
    return chapters


def chapters_from_html(fragment: str, size_hint_pages: int = 0) -> list[Chapter]:
    """Para lo que viene de Pandoc o LibreOffice (ya es HTML): se separa por <h1>, si no por <h2>."""
    if len(fragment) <= SPLIT_BYTES:
        return [Chapter("", [fragment])]
    for tag in ("h1", "h2"):
        parts = re.split(rf"(?=<{tag}[\s>])", fragment)
        if len(parts) >= 3:
            chapters = []
            for p in parts:
                m = re.match(rf"<{tag}[^>]*>(.*?)</{tag}>", p, re.S)
                title = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else "Inicio"
                if p.strip():
                    chapters.append(Chapter(html.unescape(title)[:120] or "Inicio", [p]))
            return chapters
    # Sin títulos: en partes parejas, cortando entre párrafos.
    chunks, cur = [], ""
    for p in re.split(r"(?<=</p>)", fragment):
        cur += p
        if len(cur) > SPLIT_BYTES // 2:
            chunks.append(cur)
            cur = ""
    if cur:
        chunks.append(cur)
    return [Chapter(f"Parte {i + 1}", [c]) for i, c in enumerate(chunks)]


PAGE = """<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body>
{nav}
<article>
{body}
</article>
{nav}
</body></html>
"""


def write_book(folder: str, meta: dict, chapters: list[Chapter]) -> dict:
    """Escribe los archivos y devuelve los datos del libro (con sus capítulos)."""
    os.makedirs(folder, exist_ok=True)
    lang = meta.get("lang") if meta.get("lang") in ("es", "en") else "es"
    title = meta["title"]
    files = []
    if len(chapters) == 1:
        body = f"<h1>{_esc(title)}</h1>\n" + "\n".join(_wrap_lists(chapters[0].html))
        open(os.path.join(folder, "index.html"), "w").write(PAGE.format(lang=lang, title=_esc(title), nav="", body=body))
        files.append({"title": title, "file": "index.html"})
    else:
        names = [f"cap-{i + 1:03d}.html" for i in range(len(chapters))]
        for i, ch in enumerate(chapters):
            prev = f'<a href="{names[i - 1]}" rel="prev">←</a> ' if i else ""
            nxt = f' <a href="{names[i + 1]}" rel="next">→</a>' if i + 1 < len(chapters) else ""
            nav = f'<nav>{prev}<a href="index.html">{_esc(title)}</a>{nxt}</nav>'
            body = (f"<h1>{_esc(ch.title)}</h1>\n" if ch.title and not ch.html[0].startswith(("<h1", "<h2")) else "") + "\n".join(_wrap_lists(ch.html))
            open(os.path.join(folder, names[i]), "w").write(PAGE.format(lang=lang, title=_esc(f"{ch.title} · {title}"), nav=nav, body=body))
            files.append({"title": ch.title or f"Parte {i + 1}", "file": names[i]})
        toc = "\n".join(f'<li><a href="{f["file"]}">{_esc(f["title"])}</a></li>' for f in files)
        index = f"<h1>{_esc(title)}</h1>\n" + (f"<p>{_esc(meta['author'])}</p>\n" if meta.get("author") else "") + f"<ol>\n{toc}\n</ol>"
        open(os.path.join(folder, "index.html"), "w").write(PAGE.format(lang=lang, title=_esc(title), nav="", body=index))
    data = {**meta, "chapters": files}
    json.dump(data, open(os.path.join(folder, "book.json"), "w"), ensure_ascii=False, indent=1)
    return data


# ------------------------------------------------------------- limpieza de HTML

ALLOWED = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "pre", "code",
    "em", "strong", "b", "i", "u", "sub", "sup", "small", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "caption", "figure", "figcaption", "img", "a", "span", "div", "section",
}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "svg", "math", "form", "button", "head", "title"}
ATTRS = {"img": {"src", "alt"}, "a": {"href", "id"}, "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}, "ol": {"start"}}


class _Cleaner(HTMLParser):
    def __init__(self, rewrite_img):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.rewrite_img = rewrite_img
        self.open_a = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.skip += 1
            return
        if self.skip or tag not in ALLOWED:
            return
        keep = []
        for k, v in attrs:
            if k in ATTRS.get(tag, set()) and v is not None:
                if tag == "img" and k == "src":
                    v = self.rewrite_img(v)
                    if not v:
                        return
                # Solo enlaces internos del libro; los externos quedan como texto.
                if tag == "a" and k == "href" and (re.match(r"^[a-z]+:", v, re.I) or v.startswith("//")):
                    continue
                keep.append(f' {k}="{html.escape(v)}"')
        if tag == "img" and not any(a.startswith(" src=") for a in keep):
            return
        if tag == "a":
            self.open_a += 1
        self.out.append(f"<{tag}{''.join(keep)}>" if tag not in ("img", "br", "hr") else f"<{tag}{''.join(keep)}>")

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in ALLOWED or tag in ("img", "br", "hr"):
            return
        self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))


def clean_html(fragment: str, rewrite_img) -> str:
    c = _Cleaner(rewrite_img)
    c.feed(fragment)
    c.close()
    out = "".join(c.out)
    # <span> y <div> sin atributos no aportan nada.
    out = re.sub(r"</?(span|div|section)>", "", out)
    out = re.sub(r"<p>\s*</p>", "", out)
    return out
