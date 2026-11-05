"""
¿Se puede publicar? (ARQUITECTURA §11.2). Privado por defecto: solo se marca
público lo que es público **con seguridad**, y siempre se dice por qué. Lo
dudoso queda privado y va al informe para revisar a mano.

Público seguro:
- Obras del gobierno federal de EE. UU. (dominio público, 17 U.S.C. §105):
  manuales del ejército (FM, ATP, TC), FEMA, CDC, USDA, NOAA, servicio de
  extensión agrícola federal… reconocidas por su encabezado oficial en el texto.
- Textos con una licencia libre declarada en el propio libro (Creative
  Commons, GFDL) o que dicen ser de dominio público.
- Publicaciones de argentina.gob.ar (CC BY 4.0) e INTA con licencia CC.

No alcanza el nombre de una organización (Cruz Roja, OMS sin licencia
declarada, ministerios de otros países): esos quedan privados.
"""
import re

# Encabezados que aparecen en las primeras páginas de las obras federales de EE. UU.
_US_FEDERAL = [
    (re.compile(r"headquarters,?\s+department of the army", re.I), "Manual del Ejército de EE. UU. (obra federal, dominio público)"),
    (re.compile(r"\b(field manual|fm|atp|tc)\s?\d{1,2}-\d{1,3}(\.\d+)?\b.{0,400}department of the army", re.I | re.S), "Manual del Ejército de EE. UU. (obra federal, dominio público)"),
    (re.compile(r"distribution (restriction|statement)[^.]{0,40}approved for public release", re.I), "Obra del gobierno de EE. UU. aprobada para difusión pública"),
    (re.compile(r"federal emergency management agency", re.I), "FEMA (obra federal de EE. UU., dominio público)"),
    (re.compile(r"centers for disease control and prevention", re.I), "CDC (obra federal de EE. UU., dominio público)"),
    (re.compile(r"united states department of agriculture|\busda\b.{0,80}(forest service|agricultural research|natural resources)", re.I | re.S), "USDA (obra federal de EE. UU., dominio público)"),
    (re.compile(r"national oceanic and atmospheric administration", re.I), "NOAA (obra federal de EE. UU., dominio público)"),
    (re.compile(r"u\.?s\.? (army|marine corps|air force|navy)\b.{0,200}(manual|handbook|publication)", re.I | re.S), "Publicación de las Fuerzas Armadas de EE. UU. (obra federal, dominio público)"),
]

_FREE_LICENSE = [
    # La licencia del propio libro, no una cita: "bajo licencia Creative Commons", "licensed under CC BY-SA 4.0"…
    (re.compile(r"(licen[cs]\w*|bajo|under|distribu\w+)[^.\n]{0,80}creative\s*commons|creative\s*commons[^.\n]{0,60}"
                r"(licen|attribution|atribuci|reconocimiento)|\bcc[\s-]by(-nc)?(-sa|-nd)?\s*[1-4]\.0", re.I), "Licencia Creative Commons declarada en el libro"),
    (re.compile(r"gnu free documentation license", re.I), "Licencia GFDL declarada en el libro"),
    (re.compile(r"(this (book|work|document) is in the public domain|released into the public domain|"
                r"(obra|libro|documento) (de|en el) dominio p[uú]blico)", re.I), "Declarado de dominio público en el libro"),
]

_ARG_GOB = re.compile(r"argentina\.gob\.ar|instituto nacional de tecnolog[ií]a agropecuaria", re.I)
_CC_NEAR = re.compile(r"creative\s*commons|\bcc[\s-]by", re.I)

# Señales de que NO es libre aunque aparezca una organización pública.
_COPYRIGHT = re.compile(r"(all rights reserved|todos los derechos reservados|prohibida (su|la) reproducci[oó]n|©\s*\d{4})", re.I)


# Las obras federales lo dicen en la portada o la primera página; más adelante suele ser solo una cita.
COVER_CHARS = 4000
# Organizaciones cuyos materiales tienen derechos aunque citen a FEMA o al CDC.
_NOT_FEDERAL = re.compile(r"american red cross|cruz roja|redalyc|scielo|elsevier|springer|wiley|catalog(ue)?\b", re.I)


def classify(text: str) -> tuple[str, str]:
    """(“public” | “private”, motivo). `text`: primeras páginas (desde la portada) y las últimas."""
    sample = text[:60000]
    for pattern, why in _FREE_LICENSE:
        if pattern.search(sample):
            return "public", why
    cover = text[:COVER_CHARS]
    for pattern, why in _US_FEDERAL:
        if pattern.search(cover) and not _NOT_FEDERAL.search(cover):
            # Una obra federal con "all rights reserved" suele ser de un tercero (editorial que la reimprimió).
            if _COPYRIGHT.search(sample):
                return "private", f"{why}, pero tiene una reserva de derechos de una editorial: revisar"
            return "public", why
    if _ARG_GOB.search(sample):
        if _CC_NEAR.search(sample):
            return "public", "Publicación oficial argentina con licencia Creative Commons"
        return "private", "Publicación oficial argentina sin licencia declarada en el libro: revisar"
    if _COPYRIGHT.search(sample):
        return "private", "Tiene reserva de derechos"
    return "private", "Sin licencia libre declarada"
