import re

MODELO_INICIO = re.compile(
    r"\b(?:IT\s+)?(?:(?:DT|FT|GS|GSC|GTS|DS|WS|DM|CG|RC|AT|XS|XFT|RT|NS|CS|VS|YZ|YFZ|D|W|GN)[\s\-]?\d{2,4}|(?:FORZA|DIABOLO|KURAZAI|PHANTOM|FIERA|RISKY|CARGO|DINAMO|VENTO|BAJAJ|PULSAR|HONDA|YAMAHA|SPARTHA|TERRA|XROAD|ITALIKA)(?:\s+[A-ZÁÉÍÓÚÑ]+)*[\s\-]?\d{2,4})",
    re.I,
)
PALABRA_MEDIDA = re.compile(
    r"^(largo|ancho|alto|diametro|diámetro|medida|horquilla|buje|mm|cm|pza|par|jgo|juego|negro|negra|roja|azul|completo|completa|trasero|delantero)$",
    re.I,
)

def clean(s):
    return re.sub(r"\s+", " ", str(s or "").replace("\xa0"," ").replace("\n"," ")).strip()

def normalizar(raw):
    s = clean(raw).upper()
    if not s: return ""
    s = re.sub(r"^IT\s+", "", s)
    s = re.sub(r"\b([A-Z]{1,6})(\d{2,4}[A-Z]?)\b", r"\1-\2", s)
    s = re.sub(r"\b([A-Z]{1,6}-\d{2,4}[A-Z]?)-([A-ZÁÉÍÓÚÑ])", r"\1 \2", s)
    s = re.sub(r"--+", "-", s)
    return re.sub(r"\s+", " ", s).strip()

def es_modelo(token):
    t = clean(token)
    if not t or len(t) < 2: return False
    if PALABRA_MEDIDA.match(t): return False
    if re.match(r"^[\d.,\s]+(mm|cm)?$", t, re.I): return False
    if re.match(r"^\d{2,3}\s*/\s*\d{2,3}", t): return False
    return bool(MODELO_INICIO.search(t))

def limpiar_partes(parts):
    out, seen = [], set()
    for raw in parts:
        p = clean(raw)
        p = re.sub(r"^IT\s+", "", p, flags=re.I)
        m = MODELO_INICIO.search(p)
        if m and m.start() > 0:
            p = clean(p[m.start():])
        if not es_modelo(p): continue
        p = clean(re.sub(r"\b(LARGO|DIAMETRO|DIÁMETRO|HORQUILLA|BUJE|mm|CM)\b.*$", "", p, flags=re.I))
        if not p or not es_modelo(p): continue
        canon = normalizar(p)
        if not canon or canon in seen: continue
        seen.add(canon)
        out.append(canon)
    return out

def extract_compat(desc_raw):
    d = clean(desc_raw)
    if not d: return "", []
    m = re.search(r"COMPAT\w*\s*C\s*/\s*(.+)$", d, re.I)
    if m:
        corta = clean(d[:m.start()])
        rest = m.group(1)
        nota = re.search(r"\b(LARGO|HORQUILLA|BUJE)\b\s*[\d.]", rest, re.I)
        if nota: rest = rest[:nota.start()]
        return corta or d, limpiar_partes(rest.split("/"))
    if "/" not in d: return d, []
    if re.match(r"^\S+\s+\d{2,3}\s*/\s*\d{2,3}", d) and d.count("/") == 1:
        return d, []
    start_m = MODELO_INICIO.search(d)
    if not start_m: return d, []
    zona = d[start_m.start():]
    if "/" not in zona: return d, []
    corta = clean(d[:start_m.start()])
    comps = limpiar_partes(zona.split("/"))
    if not comps: return d, []
    return corta or d, comps

