/**
 * Parser de lista de precios DAZON para almacén de refacciones.
 * Extrae código nuevo/antiguo (CLAVE con diagonal) y compatibilidades
 * embebidas en la descripción.
 */
import * as XLSX from "xlsx";

export type LineaCatalogo = "linea_dorada" | "ref_motocarro" | "linea_azul";

export type RefaccionImportItem = {
  codigo_nuevo: string;
  codigo_antiguo: string | null;
  clave_completa: string;
  clave_simplificada: string | null;
  linea_catalogo: LineaCatalogo;
  marca: string | null;
  categoria: string | null;
  descripcion: string;
  descripcion_corta: string;
  unidad_medida: string | null;
  piezas_por_caja: string | null;
  precio: number | null;
  stock: number;
  visible_venta: boolean;
  no_lista: number | null;
  fuente_archivo: string;
  tipo_unidad_sugerido: string | null;
  compatibilidades: string[];
};

const LINEAS: Record<string, LineaCatalogo> = {
  "DAZON 2026 LÍNEA DORADA SEP.": "linea_dorada",
  "DAZON 2026 REF. MOTOCARRO SEP.": "ref_motocarro",
  "DAZON 2026 LÍNEA AZUL SEP.": "linea_azul",
};

const NOTAS_FISICAS = /\b(LARGO|HORQUILLA|BUJE|mm|CM\.?|DIAMETRO|DIÁMETRO|MEDIDA)\b/i;

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const normInt = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

export function splitClave(claveRaw: string): { nuevo: string; antiguo: string | null } {
  const clave = clean(claveRaw);
  if (!clave) return { nuevo: "", antiguo: null };
  if (clave.includes("/")) {
    const [a, ...rest] = clave.split("/");
    const nuevo = clean(a);
    const antiguo = clean(rest.join("/")) || null;
    return { nuevo, antiguo };
  }
  return { nuevo: clave, antiguo: null };
}

export function tipoDesdeMarca(marca: string | null): string | null {
  const m = clean(marca).toUpperCase();
  if (!m) return null;
  if (m.includes("MOTOCARRO")) return "motocarro";
  if (m.includes("MOTONETA")) return "motoneta";
  if (m.includes("TRABAJO") || m.includes("CARGO")) return "trabajo";
  if (m.includes("ATV")) return "atv";
  if (m.includes("UNIVERSAL")) return "universal";
  return "otro";
}

export function extractCompat(descRaw: string): { corta: string; comps: string[] } {
  const d = clean(descRaw);
  if (!d) return { corta: "", comps: [] };

  const m = d.match(/COMPAT\w*\s*C\s*\/\s*(.+)$/i);
  if (m) {
    const corta = clean(d.slice(0, m.index));
    const cut = m[1].split(NOTAS_FISICAS)[0] ?? m[1];
    const parts = cut
      .split("/")
      .map(clean)
      .filter(p => p && !/^[\d.\s]+$/.test(p));
    return { corta: corta || d, comps: parts };
  }

  // Listas modelo/año sin la palabra COMPATIBLE
  const m2 = d.match(
    /(?:^|\s)((?:IT\s+)?[A-Z]{1,6}[-\s]?\d{2,4}[A-Z0-9\- ]*(?:\/\s*[A-Z0-9][A-Z0-9\-./ ]+)+)\s*$/i,
  );
  if (m2 && (d.match(/\//g) || []).length >= 1) {
    const blob = clean(m2[1]);
    if (/\b\d{2,3}\s*\/\s*\d{2,3}-?\d{0,2}\b/.test(blob)) {
      return { corta: d, comps: [] };
    }
    const corta = clean(d.slice(0, m2.index! + (m2[0].startsWith(" ") ? 1 : 0)));
    const parts = blob
      .split("/")
      .map(clean)
      .map(p => p.replace(/^IT\s+/i, ""))
      .filter(Boolean);
    return { corta: corta || d, comps: parts };
  }

  return { corta: d, comps: [] };
}

function headerMap(header: unknown[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = clean(h).toUpperCase().replace(/ {2,}/g, " ");
    if (key) mapping[key] = i;
  });
  return mapping;
}

function get(row: unknown[], hm: Record<string, number>, ...names: string[]) {
  for (const n of names) {
    const i = hm[n];
    if (i !== undefined && i < row.length) return row[i];
  }
  return null;
}

function rowToProduct(
  row: unknown[],
  hm: Record<string, number>,
  linea: LineaCatalogo,
  fuente: string,
): RefaccionImportItem | null {
  const clave = clean(get(row, hm, "CLAVE"));
  if (!clave) return null;
  const { nuevo, antiguo } = splitClave(clave);
  if (!nuevo) return null;

  const desc = clean(get(row, hm, "DESCRIPCIÓN", "DESCRIPCION"));
  const { corta, comps } = extractCompat(desc);
  const marca = clean(get(row, hm, "MARCA")) || null;
  const mostrar = clean(get(row, hm, "MOSTRAR")).toUpperCase();

  return {
    codigo_nuevo: nuevo,
    codigo_antiguo: antiguo,
    clave_completa: clave,
    clave_simplificada: clean(get(row, hm, "CLAVE SIMPLI")) || nuevo,
    linea_catalogo: linea,
    marca,
    categoria: clean(get(row, hm, "CATEGORÍA", "CATEGORIA")) || null,
    descripcion: desc || nuevo,
    descripcion_corta: corta || desc || nuevo,
    unidad_medida: clean(get(row, hm, "UNIDAD", "JGO O PZ", "JGO o PZ")) || null,
    piezas_por_caja: clean(get(row, hm, "PIEZAS POR CAJA")) || null,
    precio: normNum(get(row, hm, "PRECIO", "PRECIO ")),
    stock: normInt(get(row, hm, "INVENTARIO")),
    visible_venta: mostrar !== "NO",
    no_lista: normInt(get(row, hm, "NO.")) || null,
    fuente_archivo: fuente,
    tipo_unidad_sugerido: tipoDesdeMarca(marca),
    compatibilidades: comps,
  };
}

/** Parsea un ArrayBuffer/File de la lista de precios DAZON. */
export function parseListaPreciosRefacciones(data: ArrayBuffer): RefaccionImportItem[] {
  const wb = XLSX.read(data, { type: "array", cellDates: false });
  const order = [
    "DAZON 2026 LÍNEA DORADA SEP.",
    "DAZON 2026 REF. MOTOCARRO SEP.",
    "DAZON 2026 LÍNEA AZUL SEP.",
  ];

  const products: RefaccionImportItem[] = [];
  const seen = new Set<string>();

  for (const name of order) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const linea = LINEAS[name];
    if (!linea) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
    // Encabezado en fila 5 (índice 4)
    const header = rows[4] ?? [];
    const hm = headerMap(header);
    for (const row of rows.slice(5)) {
      if (!Array.isArray(row)) continue;
      const prod = rowToProduct(row, hm, linea, name);
      if (!prod) continue;
      const codigo = prod.codigo_nuevo;
      if (seen.has(codigo)) continue;
      seen.add(codigo);
      if (prod.codigo_antiguo) seen.add(prod.codigo_antiguo);
      products.push(prod);
    }
  }

  return products;
}
