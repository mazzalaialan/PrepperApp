"""Títulos, idioma y slugs (ARQUITECTURA §11.2)."""
import re
import unicodedata

ES = set(
    "de la que el en y los las del se por un una para con no es al lo como más pero sus le ya o este si porque esta "
    "entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros "
    "ese eso ante ellos e esto antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos "
    "cual poco ella estar estas algunas algo nosotros agua puede debe".split()
)
EN = set(
    "the of and to in is that for it as was with be by on not he this are or his from at which but have an they you "
    "were her all she there would their we him been has when who will more no if out so said what up its about into "
    "than them can only other new some could time these two may then do first any my now such like our over man me "
    "even most made after also did many before must through back years where much your way well down should because "
    "each just those people how too little very make water".split()
)


def guess_lang(text: str) -> str:
    words = re.findall(r"[a-záéíóúñü]+", text.lower())
    es = sum(w in ES for w in words)
    en = sum(w in EN for w in words)
    if es > en * 1.2 and es > 15:
        return "es"
    if en > es * 1.2 and en > 15:
        return "en"
    return "?"


def slug(text: str, max_len: int = 60) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:max_len].rstrip("-") or "libro"


def norm_key(text: str) -> str:
    """Clave para encontrar el mismo libro con otro nombre de archivo o formato."""
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\b(pdf|epub|docx?|libro|ebook|copia|copy|\(\d+\))\b", " ", t)
    return re.sub(r"[^a-z0-9]+", "", t)


# Basura habitual en nombres de archivo: números de Scribd, guiones bajos, "ASDF", "(1)".
_JUNK = [
    (r"^\d{6,}[-_ ]*(\d+[-_ ]+)?", ""),
    (r"[_]+", " "),
    (r"\s*\(\d+\)\s*$", ""),
    (r"\b(ASDF|PDF|pdf)\b", ""),
    (r"-(?=\S)", " "),
    (r"\s{2,}", " "),
]

# Metadatos que no son un título (los ponen los programas al exportar).
_BAD_META = re.compile(
    r"^(microsoft (word|powerpoint)|untitled|sin t[ií]tulo|documento\d*|document\d*|presentaci[oó]n|"
    r"\S+\.(docx?|pdf|pptx?|indd|qxd|p65)|[a-z]:\\|scan|img_?\d+|\d+)$",
    re.I,
)


def clean_filename_title(name: str) -> str:
    t = re.sub(r"\.[A-Za-z0-9]{2,4}$", "", name)
    for pattern, rep in _JUNK:
        t = re.sub(pattern, rep, t)
    t = t.strip(" .-_")
    # TODO EN MAYÚSCULAS → como oración.
    if t.isupper() and len(t) > 6:
        t = t.capitalize()
    return t[:1].upper() + t[1:] if t else name


def title_from_meta(meta_title: str | None) -> str | None:
    if not meta_title:
        return None
    t = meta_title.strip()
    t = re.sub(r"^Microsoft (Word|PowerPoint) - ", "", t)
    # "02_manual_SILLA_v18set2013.cdr" → "02 manual SILLA v18set2013"
    t = re.sub(r"\.(cdr|indd|qxd|p65|docx?|pdf|pptx?|odt|rtf|ai)$", "", t, flags=re.I).replace("_", " ").strip()
    if len(t) < 4 or len(t) > 160 or _BAD_META.match(t) or not re.search(r"[A-Za-zÁÉÍÓÚáéíóúñ]{3}", t):
        return None
    return t


def pick_title(file_name: str, meta_title: str | None) -> tuple[str, str]:
    """Título y de dónde salió ("meta" o "archivo")."""
    meta = title_from_meta(meta_title)
    from_file = clean_filename_title(file_name)
    # El de los metadatos solo si se parece al nombre o el nombre es poco informativo.
    if meta and (len(from_file) < 6 or norm_key(meta)[:10] in norm_key(from_file) or norm_key(from_file)[:10] in norm_key(meta)):
        return meta, "meta"
    return from_file, "archivo"
