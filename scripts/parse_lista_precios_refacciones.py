#!/usr/bin/env python3
"""Parsea la lista de precios DAZON (OOXML estricto) a JSON para importar."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

LINEAS = {
    "DAZON 2026 LÍNEA DORADA SEP.": "linea_dorada",
    "DAZON 2026 REF. MOTOCARRO SEP.": "ref_motocarro",
    "DAZON 2026 LÍNEA AZUL SEP.": "linea_azul",
}

NOTAS_FISICAS = re.compile(
    r"\b(LARGO|HORQUILLA|BUJE|mm|CM\.?|DIAMETRO|DIÁMETRO|MEDIDA)\b",
    re.I,
)


def clean(s: str | None) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).replace("\xa0", " ").replace("\n", " ")).strip()


def norm_num(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return round(float(str(v).replace(",", "")), 2)
    except ValueError:
        return None


def norm_int(v) -> int:
    if v is None or v == "":
        return 0
    try:
        return int(float(str(v)))
    except ValueError:
        return 0


def split_clave(clave: str) -> tuple[str, str | None]:
    clave = clean(clave)
    if "/" in clave:
        nuevo, antiguo = clave.split("/", 1)
        nuevo, antiguo = clean(nuevo), clean(antiguo)
        return nuevo, antiguo or None
    return clave, None


def tipo_desde_marca(marca: str) -> str | None:
    m = clean(marca).upper()
    if not m:
        return None
    if "MOTOCARRO" in m:
        return "motocarro"
    if "MOTONETA" in m:
        return "motoneta"
    if "TRABAJO" in m or "CARGO" in m:
        return "trabajo"
    if "ATV" in m:
        return "atv"
    if "UNIVERSAL" in m:
        return "universal"
    return "otro"


def extract_compat(desc: str) -> tuple[str, list[str]]:
    """Separa descripción corta y lista de unidades compatibles."""
    d = clean(desc)
    if not d:
        return "", []

    m = re.search(r"COMPAT\w*\s*C\s*/\s*(.+)$", d, re.I)
    if m:
        corta = clean(d[: m.start()])
        rest = m.group(1)
        cut = NOTAS_FISICAS.split(rest, maxsplit=1)[0]
        parts = [clean(p) for p in cut.split("/") if clean(p)]
        # quitar sobras tipo "LARGO 34 cm..."
        parts = [p for p in parts if p and not re.fullmatch(r"[\d.\s]+", p)]
        return corta or d, parts

    # Listas tipo: "... IT DS-150 20-22/DS-150VE 18-19"
    m2 = re.search(
        r"(?:^|\s)((?:IT\s+)?[A-Z]{1,6}[-\s]?\d{2,4}[A-Z0-9\- ]*(?:/\s*[A-Z0-9][A-Z0-9\-./ ]+)+)\s*$",
        d,
        re.I,
    )
    if m2 and d.count("/") >= 1:
        blob = clean(m2.group(1))
        # Evitar falsos positivos en tallas de llanta 90/90-18
        if re.search(r"\b\d{2,3}\s*/\s*\d{2,3}-?\d{0,2}\b", blob):
            return d, []
        corta = clean(d[: m2.start(1)])
        parts = [clean(p) for p in blob.split("/") if clean(p)]
        parts = [re.sub(r"^IT\s+", "", p, flags=re.I) for p in parts]
        return corta or d, parts

    return d, []


def col_row(cell_ref: str) -> tuple[int, int]:
    m = re.match(r"([A-Z]+)(\d+)", cell_ref)
    assert m
    col, row = m.group(1), int(m.group(2))
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n, row


def load_strings(z: ZipFile) -> list[str]:
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    ns = root.tag[1 : root.tag.find("}")]
    q = lambda t: f"{{{ns}}}{t}"
    strings = []
    for si in root.findall(q("si")):
        texts = [(t.text or "") for t in si.iter(q("t"))]
        strings.append("".join(texts))
    return strings


def parse_sheet(z: ZipFile, sheet_path: str, strings: list[str]) -> list[list]:
    root = ET.fromstring(z.read(sheet_path))
    ns = root.tag[1 : root.tag.find("}")]
    q = lambda t: f"{{{ns}}}{t}"
    rows_data: dict[int, dict[int, object]] = {}
    for c in root.findall(f".//{q('c')}"):
        ref = c.attrib.get("r")
        if not ref:
            continue
        col, row = col_row(ref)
        t = c.attrib.get("t")
        v = c.find(q("v"))
        is_el = c.find(q("is"))
        val = None
        if t == "s" and v is not None and v.text is not None:
            val = strings[int(v.text)]
        elif t == "inlineStr" and is_el is not None:
            texts = [(tt.text or "") for tt in is_el.iter(q("t"))]
            val = "".join(texts)
        elif v is not None:
            val = v.text
        rows_data.setdefault(row, {})[col] = val
    out = []
    for r in sorted(rows_data):
        cols = rows_data[r]
        maxc = max(cols)
        out.append([cols.get(i) for i in range(1, maxc + 1)])
    return out


def header_map(header: list) -> dict[str, int]:
    mapping = {}
    for i, h in enumerate(header):
        key = clean(h).upper().replace("  ", " ")
        mapping[key] = i
    return mapping


def get(row: list, hm: dict[str, int], *names: str):
    for n in names:
        i = hm.get(n)
        if i is not None and i < len(row):
            return row[i]
    return None


def row_to_product(row: list, hm: dict[str, int], linea: str, fuente: str) -> dict | None:
    clave = clean(get(row, hm, "CLAVE"))
    if not clave:
        return None
    nuevo, antiguo = split_clave(clave)
    if not nuevo:
        return None

    desc = clean(get(row, hm, "DESCRIPCIÓN", "DESCRIPCION"))
    corta, comps = extract_compat(desc)
    marca = clean(get(row, hm, "MARCA"))
    mostrar = clean(get(row, hm, "MOSTRAR")).upper()
    visible = mostrar != "NO"

    return {
        "codigo_nuevo": nuevo,
        "codigo_antiguo": antiguo,
        "clave_completa": clave,
        "clave_simplificada": clean(get(row, hm, "CLAVE SIMPLI")) or nuevo,
        "linea_catalogo": linea,
        "marca": marca or None,
        "categoria": clean(get(row, hm, "CATEGORÍA", "CATEGORIA")) or None,
        "descripcion": desc or nuevo,
        "descripcion_corta": corta or desc or nuevo,
        "unidad_medida": clean(get(row, hm, "UNIDAD", "JGO O PZ", "JGO o PZ")) or None,
        "piezas_por_caja": clean(get(row, hm, "PIEZAS POR CAJA")) or None,
        "precio": norm_num(get(row, hm, "PRECIO", "PRECIO ")),
        "stock": norm_int(get(row, hm, "INVENTARIO")),
        "visible_venta": visible,
        "no_lista": norm_int(get(row, hm, "NO.")) or None,
        "fuente_archivo": fuente,
        "tipo_unidad_sugerido": tipo_desde_marca(marca),
        "compatibilidades": comps,
    }


def parse_xlsx(path: Path) -> list[dict]:
    z = ZipFile(path)
    strings = load_strings(z)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    wb_ns = wb.tag[1 : wb.tag.find("}")]
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in list(rels)}

    products: list[dict] = []
    seen_nuevos: set[str] = set()

    # Orden: dorada y motocarro primero (códigos nuevos), azul al final
    order = [
        "DAZON 2026 LÍNEA DORADA SEP.",
        "DAZON 2026 REF. MOTOCARRO SEP.",
        "DAZON 2026 LÍNEA AZUL SEP.",
    ]
    sheets = {
        sh.attrib["name"]: sh.attrib["{http://purl.oclc.org/ooxml/officeDocument/relationships}id"]
        for sh in wb.findall(f"{{{wb_ns}}}sheets/{{{wb_ns}}}sheet")
    }

    for name in order:
        rid = sheets.get(name)
        if not rid:
            continue
        target = "xl/" + rid_to_target[rid]
        linea = LINEAS[name]
        rows = parse_sheet(z, target, strings)
        # fila 5 (1-indexed) = header en excel → index 4
        header = rows[4]
        hm = header_map(header)
        for row in rows[5:]:
            prod = row_to_product(row, hm, linea, name)
            if not prod:
                continue
            codigo = prod["codigo_nuevo"]
            # Línea azul: si el código ya existe como nuevo o antiguo, no duplicar
            if linea == "linea_azul" and codigo in seen_nuevos:
                continue
            if codigo in seen_nuevos and linea != "linea_azul":
                # Preferir la primera aparición (dorada/motocarro)
                continue
            seen_nuevos.add(codigo)
            if prod.get("codigo_antiguo"):
                seen_nuevos.add(prod["codigo_antiguo"])
            products.append(prod)
    return products


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else
               "/home/ubuntu/.cursor/projects/workspace/uploads/22.09.26_LISTA_DE_PRECIOS_DAZON_SEPTIEMBRE_7188.xlsx")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else
               "/workspace/data/almacen_refacciones_seed.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    products = parse_xlsx(src)
    out.write_text(json.dumps(products, ensure_ascii=False), encoding="utf-8")
    with_compat = sum(1 for p in products if p["compatibilidades"])
    dual = sum(1 for p in products if p["codigo_antiguo"])
    print(f"productos={len(products)} dual_codigo={dual} con_compat={with_compat}")
    by_line = {}
    for p in products:
        by_line[p["linea_catalogo"]] = by_line.get(p["linea_catalogo"], 0) + 1
    print("por_linea", by_line)
    print("escrito", out)


if __name__ == "__main__":
    main()
