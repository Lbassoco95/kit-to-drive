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

/** Prefijos / nombres de modelo de moto o unidad. */
/** Prefijos cortos (DT-125) y marcas con nombre (KURAZAI CLASSIC 125). */
const MODELO_INICIO =
  /\b(?:IT\s+)?(?:(?:DT|FT|GS|GSC|GTS|DS|WS|DM|CG|RC|AT|XS|XFT|RT|NS|CS|VS|YZ|YFZ|D|W|GN)[\s\-]?\d{2,4}|(?:FORZA|DIABOLO|KURAZAI|PHANTOM|FIERA|RISKY|CARGO|DINAMO|VENTO|BAJAJ|PULSAR|HONDA|YAMAHA|SPARTHA|TERRA|XROAD|ITALIKA)(?:\s+[A-ZÁÉÍÓÚÑ]+)*[\s\-]?\d{2,4})/i;

const PALABRA_MEDIDA =
  /^(largo|ancho|alto|diametro|diámetro|medida|horquilla|buje|mm|cm|pza|par|jgo|juego|negro|negra|roja|azul|completo|completa|trasero|delantero)$/i;

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

/**
 * Canoniza el nombre de una unidad/moto para reutilizar el mismo registro
 * entre muchas refacciones (FT125-DELIVERY → FT-125 DELIVERY).
 */
export function normalizarNombreUnidad(raw: string): string {
  let s = clean(raw).toUpperCase();
  if (!s) return "";
  s = s.replace(/^IT\s+/, "");
  // FT125 → FT-125 ; GS150 → GS-150 (si no traía guion)
  s = s.replace(/\b([A-Z]{1,6})(\d{2,4}[A-Z]?)\b/g, "$1-$2");
  // FT-125-DELIVERY → FT-125 DELIVERY
  s = s.replace(/\b([A-Z]{1,6}-\d{2,4}[A-Z]?)-([A-ZÁÉÍÓÚÑ])/g, "$1 $2");
  s = s.replace(/--+/g, "-");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function esTokenModelo(token: string): boolean {
  const t = clean(token);
  if (!t || t.length < 2) return false;
  if (PALABRA_MEDIDA.test(t)) return false;
  if (/^[\d.,\s]+(mm|cm)?$/i.test(t)) return false;
  // Talla de llanta 90/90-18
  if (/^\d{2,3}\s*\/\s*\d{2,3}/.test(t)) return false;
  // Debe parecer modelo: letras + número, o nombre conocido
  if (MODELO_INICIO.test(t)) return true;
  // Variantes sueltas tipo "CLASICA" no son modelo por sí solas
  return false;
}

function limpiarPartesModelo(parts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    let p = clean(raw).replace(/^IT\s+/i, "");
    // Si el primer token arrastró medidas ("largo 200 mm diametro 27 mm DT-125 CLASICA")
    const idx = p.search(MODELO_INICIO);
    if (idx > 0) p = clean(p.slice(idx));
    if (!esTokenModelo(p)) continue;
    // Quitar sobras físicas al final del token
    p = clean(p.replace(/\b(LARGO|DIAMETRO|DIÁMETRO|HORQUILLA|BUJE|mm|CM)\b.*$/i, ""));
    if (!p || !esTokenModelo(p)) continue;
    const canon = normalizarNombreUnidad(p);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
}

/**
 * Separa la descripción del producto de la lista de motos/unidades compatibles.
 * Ej: "CUBRE POLVO … 27 mm DT-125 CLASICA / FT-125 / FORZA 125"
 *  → corta: "CUBRE POLVO … 27 mm"
 *  → comps: ["DT-125 CLASICA", "FT-125", "FORZA-125"] (normalizados)
 */
export function extractCompat(descRaw: string): { corta: string; comps: string[] } {
  const d = clean(descRaw);
  if (!d) return { corta: "", comps: [] };

  // 1) Marcador explícito COMPATIBLE C/ …
  const mCompat = d.match(/COMPAT\w*\s*C\s*\/\s*(.+)$/i);
  if (mCompat && mCompat.index !== undefined) {
    const corta = clean(d.slice(0, mCompat.index));
    // Cortar notas físicas al final del bloque de modelos
    let rest = mCompat[1];
    const nota = rest.search(/\b(LARGO|HORQUILLA|BUJE)\b\s*[\d.]/i);
    if (nota > 0) rest = rest.slice(0, nota);
    const comps = limpiarPartesModelo(rest.split("/"));
    return { corta: corta || d, comps };
  }

  // 2) Lista tras la descripción: primer modelo real + diagonales
  if (!d.includes("/")) return { corta: d, comps: [] };

  // Evitar tallas de llanta como única diagonal
  if (/^\S+\s+\d{2,3}\s*\/\s*\d{2,3}/.test(d) && (d.match(/\//g) || []).length === 1) {
    return { corta: d, comps: [] };
  }

  const start = d.search(MODELO_INICIO);
  if (start < 0) return { corta: d, comps: [] };

  // Debe haber al menos una diagonal en la zona de modelos
  const zona = d.slice(start);
  if (!zona.includes("/")) return { corta: d, comps: [] };

  const corta = clean(d.slice(0, start));
  const comps = limpiarPartesModelo(zona.split("/"));
  if (!comps.length) return { corta: d, comps: [] };
  return { corta: corta || d, comps };
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
