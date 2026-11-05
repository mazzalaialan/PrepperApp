"""
Repetidoras de radioaficionados de Chile: el "Listado oficial de repetidoras"
de SUBTEL (Unidad de Radioaficionados), información pública. Genera
app/public/data/repeaters-CL.json, que la app baja con el paquete de Chile y
guarda para usar sin conexión.

Uso (con poppler-utils): python3 tools/country-data/repeaters-cl.py <pdf> <url> <fecha AAAA-MM-DD>
El PDF está en https://www.subtel.gob.cl/inicio-concesionario/servicios-de-telecomunicaciones/servicios-de-radio-aficionados/
"""
import json
import re
import subprocess
import sys
from datetime import date

pdf, url, listed = sys.argv[1], sys.argv[2], sys.argv[3]
text = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
lines = text.splitlines()

NUM = r"\d+(?:,\d+)?"
DMS = r"(\d+)°\s*(\d+)[’']\s*([\d,]+)\"?"
MAIN = re.compile(
    rf"(?P<rut>\d{{6,8}}-[\dkK])\s+(?P<band>[A-Z]+/[A-Z]+)\s+(?P<call>[A-Z0-9]+(?:\s[A-Z0-9]{{1,3}})?\s*/?\s*(?:RP[TR]-\S+)?)\s+(?P<tx>{NUM})\s+(?P<rx>{NUM})\s+(?P<nums>(?:{NUM}\s+){{1,2}}{NUM})\s+(?P<comuna>.*?)\s*"
    rf"(?P<from>\d\d/\d\d/\d{{4}})\s+(?P<to>\d\d/\d\d/\d{{4}})(?:\s+(?P<lat>{DMS})\s+(?P<lon>{DMS}))?\s*(?P<site>.*)$"
)


def f(s: str) -> float:
    return float(s.replace(",", "."))


def dms(s: str | None) -> float | None:
    """Grados, minutos y segundos (sur u oeste). Minutos imposibles = sin ubicación."""
    m = re.match(DMS, s or "")
    if not m:
        return None
    d, mi, se = int(m.group(1)), int(m.group(2)), f(m.group(3))
    # El listado trae algunos segundos mayores que 60 (errores de carga): se suman igual
    # (es menos de 1 km). Minutos de 60 o más ya no se sabe qué quisieron poner.
    if mi >= 60 or se >= 100:
        return None
    return round(-(d + mi / 60 + se / 3600), 5)


# El listado corta algunos nombres de región en el renglón; se completan.
REGIONS = {
    "Región Del Libertador": "Región del Libertador General Bernardo O'Higgins",
    "Región De Nuble": "Región de Ñuble",
    "Región De Aysen": "Región de Aysén",
    "Región De Magallanes": "Región de Magallanes y de la Antártica Chilena",
}


def region_name(r: str) -> str:
    r = re.sub(r" De$", " De Santiago", r.strip().title())
    r = REGIONS.get(r, r)
    return re.sub(r" (De|Del|La|Los|Las|Y)\b", lambda m: " " + m.group(1).lower(), r)


def iso(d: str) -> str:
    dd, mm, yy = d.split("/")
    return f"{yy}-{mm}-{dd}"


items = []
for i, line in enumerate(lines):
    m = MAIN.search(line)
    if not m:
        continue
    nums = m.group("nums").split()
    tone = f(nums[0]) if len(nums) == 3 else None
    # Nombre del club: columna izquierda (antes del RUT), en el renglón de la fila y en
    # los de arriba y abajo que no sean de otra fila (el nombre ocupa hasta tres renglones).
    col = m.start("rut")
    is_row = lambda j: 0 <= j < len(lines) and bool(MAIN.search(lines[j]) or re.search(r"\d{6,8}-[\dkK] +[A-Z]+/", lines[j]))
    left = lambda j: lines[j][:col].strip() if 0 <= j < len(lines) and not is_row(j) else ""
    parts = [left(i - 1), line[:col].strip()]
    # Abajo: solo si el renglón siguiente no es el comienzo del nombre de la próxima fila.
    if left(i + 1) and not is_row(i + 2):
        parts.append(left(i + 1))
    name = " ".join(x for x in parts if x)
    above = lines[i - 1] if i else ""
    below = lines[i + 1] if i + 1 < len(lines) else ""
    region = (re.search(r"REGIÓN [A-ZÁÉÍÓÚÑ' ]+?(?=\s{2,}|$)", above) or re.search(r"REGIÓN [A-ZÁÉÍÓÚÑ' ]+?(?=\s{2,}|$)", below))
    site_above = re.split(r"\s{3,}", above.strip())[-1] if above.strip() and len(re.split(r"\s{3,}", above.strip())) > 2 else ""
    site = " ".join(x for x in (site_above, m.group("site").strip()) if x).strip()
    tx, rx = f(m.group("tx")), f(m.group("rx"))
    lat, lon = dms(m.group("lat")), dms(m.group("lon"))
    if lat is None or lon is None:
        lat = lon = None
    items.append(
        {
            "call": re.sub(r"\s*/?\s*(RP[TR])", r" \1", re.sub(r"^(CE\d)\s(?=[A-Z])", r"\1", m.group("call"))).strip(),
            "rut": m.group("rut"),
            "club": re.sub(r" (De|Del|La|Los|Las|Y|En)\b", lambda m: " " + m.group(1).lower(), name.title()),
            "band": m.group("band"),
            "output": tx,
            "offset": round(rx - tx, 3),
            "tone": tone,
            "region": region_name(region.group(0)) if region else "",
            # En la Metropolitana la región ocupa dos renglones: "… DE SANTIAGO" cae en la columna de la comuna.
            "comuna": re.split(r"\s{3,}", m.group("comuna").strip())[-1].title(),
            "site": site.title(),
            "lat": lat,
            "lon": lon,
            "granted": iso(m.group("from")),
            "expires": iso(m.group("to")),
        }
    )

# Un nombre por radioclub (mismo RUT): el que más se repite entre sus filas, sin
# renglones del vecino ("Radio Club X Radio Club X") y descartando los cortos.
from collections import Counter

def clean(n: str) -> str:
    w = n.split()
    h = len(w) // 2
    return " ".join(w[:h]) if len(w) % 2 == 0 and w[:h] == w[h:] else n

def split_merged(n: str, known: set[str]) -> str:
    """"Radio Club Gaviotas Radio Club Provincial Valparaiso": dos nombres pegados; queda el
    que figura solo en otra fila o, si no, el primero."""
    parts = [p.strip() for p in re.split(r"(?=\b(?:Radio Club|Radioclub)\b)", n) if p.strip()]
    if len(parts) < 2:
        return n
    for p_ in parts:
        if p_ in known:
            return p_
    return parts[0] if len(parts[0].split()) >= 3 else n


known = {clean(x["club"]) for x in items}
for x in items:
    x["club"] = split_merged(clean(x["club"]), known - {clean(x["club"])})

by_rut: dict[str, Counter] = {}
for x in items:
    by_rut.setdefault(x["rut"], Counter())[clean(x["club"])] += 1
for x in items:
    names = by_rut[x["rut"]]
    best = max(names, key=lambda n: (len(n.split()) >= 3, names[n], -len(n)))
    x["club"] = best if len(best.split()) >= 3 else ""
    del x["rut"]

out = {
    "country": "CL",
    "source": "SUBTEL, Unidad de Radioaficionados: Listado oficial de repetidoras",
    "url": url,
    "listedAt": listed,
    "generatedAt": date.today().isoformat(),
    "items": items,
}
json.dump(out, open("app/public/data/repeaters-CL.json", "w"), ensure_ascii=False, separators=(",", ":"))
rows = sum(1 for l in lines if re.search(r"\d{6,8}-[\dkK] +[A-Z]+/", l))
print(f"{len(items)} repetidoras de {rows} filas; {sum(1 for x in items if x['lat'] is None)} sin ubicación")
