"""
Conversión de cada libro según su formato, con caché (se puede cortar y
volver a correr) y el resultado en `conversion.json` para el informe y los
paquetes (ARQUITECTURA §11.2).
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import traceback
import zipfile

from . import license as lic
from . import pdftext
from .meta import guess_lang
from .book import chapters_from_blocks, chapters_from_html, clean_html, write_book
from .images import ImageStore
from .scan import Entry

BOOKS_DIR = "books"


def _run(cmd: list[str], timeout: int = 600, cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, timeout=timeout, cwd=cwd)


def _pandoc_html(path: str, images: ImageStore, workdir: str) -> str:
    media = os.path.join(workdir, "media")
    # Pandoc deduce el formato por la extensión; un Word con macros (.docm) es un .docx.
    src_fmt = ["-f", "docx"] if path.lower().endswith(".docm") else []
    r = _run(["pandoc", *src_fmt, path, "-t", "html5", "--wrap=none", f"--extract-media={media}"], timeout=900)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[:300])
    raw = r.stdout.decode("utf-8", "ignore")

    def rewrite(src: str) -> str | None:
        p = src if os.path.isabs(src) else os.path.join(workdir, src)
        return images.from_file(p) if os.path.exists(p) else None

    return clean_html(raw, rewrite)


def _office_to(path: str, fmt: str, workdir: str) -> str:
    """LibreOffice sin pantalla: DOC → DOCX, PPT → PDF, XLS → HTML."""
    r = _run(["soffice", "--headless", f"-env:UserInstallation=file://{workdir}/lo", "--convert-to", fmt, "--outdir", workdir, path], timeout=900)
    base = os.path.splitext(os.path.basename(path))[0]
    ext = fmt.split(":")[0]
    out = os.path.join(workdir, f"{base}.{ext}")
    if not os.path.exists(out):
        raise RuntimeError(f"LibreOffice no pudo convertir: {r.stderr.decode('utf-8', 'ignore')[:300]}")
    return out


def convert_one(e: Entry, src_root: str, out_root: str, ocr: bool) -> dict:
    path = os.path.join(src_root, e.path)
    folder = os.path.join(out_root, BOOKS_DIR, e.id)
    shutil.rmtree(folder, ignore_errors=True)
    images = ImageStore(os.path.join(folder, "img"))
    warnings: list[str] = []
    meta = {
        "id": e.id,
        "title": e.title,
        "author": e.author,
        "lang": e.lang,
        "category": e.category,
        "section": e.section,
        "license": e.license,
        "licenseReason": e.license_reason,
        "source": e.path,
        "pages": e.pages,
    }
    with tempfile.TemporaryDirectory() as work:
        kind = e.kind
        if kind == "pdf":
            ex = pdftext.extract(path, images)
            warnings += ex.warnings
            chapters = chapters_from_blocks(ex.blocks, ex.toc, e.pages)
        elif kind == "pdf-ocr":
            if not ocr:
                return {"skipped": "OCR salteado"}
            from . import ocr as ocr_mod

            ex = ocr_mod.extract(path, images, work)
            warnings += ex.warnings
            chapters = chapters_from_blocks(ex.blocks, [], e.pages)
            # Con el texto del OCR ya se puede ver la licencia y el idioma.
            sample = ocr_mod.sample_text(ex.blocks)
            if not e.license_reason.startswith("Elegido a mano"):
                meta["license"], meta["licenseReason"] = lic.classify(sample)
            if meta["lang"] == "?":
                meta["lang"] = guess_lang(sample)
        elif kind in ("epub", "pandoc"):
            chapters = chapters_from_html(_pandoc_html(path, images, work))
        elif kind == "office":
            if e.ext in (".doc", ".docm"):
                chapters = chapters_from_html(_pandoc_html(_office_to(path, "docx", work), images, work))
            else:
                pdf = _office_to(path, "pdf", work)
                ex = pdftext.extract(pdf, images)
                warnings += ex.warnings
                chapters = chapters_from_blocks(ex.blocks, ex.toc, 0)
        elif kind == "sheet":
            html_path = _office_to(path, "html:HTML (StarCalc)", work)
            chapters = chapters_from_html(clean_html(open(html_path, encoding="utf-8", errors="ignore").read(), lambda s: None))
        elif kind == "mobi":
            import mobi

            tmp, extracted = mobi.extract(path)
            try:
                chapters = chapters_from_html(_pandoc_html(extracted, images, work))
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        elif kind == "cbz":
            with zipfile.ZipFile(path) as z:
                z.extractall(work)
            figs = []
            for root, _, files in sorted(os.walk(work)):
                for f in sorted(files):
                    s = images.from_file(os.path.join(root, f))
                    if s:
                        figs.append(f'<figure><img src="{s}" alt="" loading="lazy"></figure>')
            chapters = chapters_from_html("\n".join(figs))
        else:
            return {"skipped": f"Formato no convertible: {kind}"}
    text_len = sum(len(re.sub(r"<[^>]+>", "", "".join(c.html))) for c in chapters)
    if text_len < 200 and images.count == 0:
        warnings.append("Casi sin contenido: revisar")
    data = write_book(folder, meta, chapters)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(folder) for f in fs)
    return {
        "chapters": len(data["chapters"]),
        "images": images.count,
        "bytes_out": size,
        "chars": text_len,
        "warnings": warnings,
        "license": data["license"],
        "licenseReason": data["licenseReason"],
        "lang": data["lang"],
    }


def convert(entries: list[Entry], src: str, out: str, categories: list[str], all_: bool, books: list[str], ocr: bool, limit: int | None = None) -> int:
    """Convierte lo pendiente y devuelve cuántos libros convirtió.

    Orden: primero los que no necesitan OCR (salen en segundos), después los
    escaneados de menos a más páginas, así los libros van apareciendo rápido.
    Con `limit`, se detiene después de esa cantidad (para armar los paquetes
    seguido).
    """
    status_path = os.path.join(out, "conversion.json")
    status: dict = json.load(open(status_path)) if os.path.exists(status_path) else {}
    wanted = [
        e
        for e in entries
        if not e.exclude_reason
        and not e.duplicate_of
        and e.kind not in ("archive", "skip")
        and (all_ or e.category in categories or e.path in books)
    ]
    wanted.sort(key=lambda e: (e.kind == "pdf-ocr", e.pages or 0 if e.kind == "pdf-ocr" else 0))

    def done(e: Entry) -> bool:
        st = status.get(e.id, {})
        # Un salteado (OCR para después) o con error no está hecho.
        return st.get("key") == f"{e.md5}|{e.title}|{e.license}|{e.kind}" and not st.get("error") and not st.get("skipped")

    pending = [e for e in wanted if not done(e) and (ocr or e.kind != "pdf-ocr")]
    # Los que ya fallaron, al final: no frenan a los demás en cada tanda.
    pending.sort(key=lambda e: bool(status.get(e.id, {}).get("error")))
    if limit is not None:
        pending = pending[:limit]
    print(f"{len(wanted)} libros en total; {len(pending)} para convertir ahora")
    converted = 0
    for n, e in enumerate(pending, 1):
        key = f"{e.md5}|{e.title}|{e.license}|{e.kind}"
        t0 = time.time()
        try:
            res = convert_one(e, src, out, ocr)
        except Exception as err:
            res = {"error": f"{type(err).__name__}: {err}"[:400], "trace": traceback.format_exc()[-1500:]}
        res["key"] = key
        res["seconds"] = round(time.time() - t0, 1)
        status[e.id] = res
        json.dump(status, open(status_path, "w"), ensure_ascii=False, indent=1)
        flag = "ERROR " + res["error"] if "error" in res else res.get("skipped") or f"{res['chapters']} cap, {res['images']} img, {res['bytes_out'] // 1024} KB"
        print(f"[{n}/{len(pending)}] {e.title[:60]} — {flag} ({res['seconds']} s)", flush=True)
        if "error" not in res and not res.get("skipped"):
            converted += 1
    return converted
