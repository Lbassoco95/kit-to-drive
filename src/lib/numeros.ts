// Formato numérico de plataforma: siempre coma (,) para miles y punto (.)
// para decimales. Así 25000 se lee 25,000 y no se ve “mal” en inputs/listas,
// sin depender del idioma activo (es/zh).

/** Separador de miles fijo de la plataforma. */
export const SEPARADOR_MILES = ",";
/** Separador decimal fijo de la plataforma. */
export const SEPARADOR_DECIMAL = ".";

/**
 * Inserta comas cada tres dígitos en la parte entera.
 * `25000` → `25,000` · `25000.5` con 2 decimales → `25,000.50`
 */
export function fmtMiles(valor: number | null | undefined, decimales = 0): string {
  if (valor == null || !Number.isFinite(Number(valor))) return "—";
  const n = Number(valor);
  const neg = n < 0;
  const abs = Math.abs(n);
  const fijo = abs.toFixed(Math.max(0, decimales));
  const [entero, frac] = fijo.split(".");
  const conComas = entero.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILES);
  const cuerpo = decimales > 0 ? `${conComas}${SEPARADOR_DECIMAL}${frac}` : conComas;
  return neg ? `-${cuerpo}` : cuerpo;
}

/** Monto con símbolo de moneda y siempre comas de miles. */
export function fmtMonedaPlataforma(
  monto: number | null | undefined,
  moneda = "MXN",
): string {
  if (monto == null || !Number.isFinite(Number(monto))) return "—";
  const prefijo =
    moneda === "MXN" ? "$" :
    moneda === "USD" ? "US$" :
    `${moneda}\u00a0`;
  return `${prefijo}${fmtMiles(Number(monto), 2)}`;
}

/**
 * Interpreta texto con comas/puntos/espacios como número.
 * Acepta `25,000`, `25,000.50`, `25000.5`.
 */
export function parseNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") {
    return Number.isFinite(texto) ? texto : null;
  }
  if (texto == null) return null;
  const limpio = String(texto).trim();
  if (!limpio) return null;
  // Quita símbolos de moneda y espacios; deja dígitos, coma, punto y signo.
  const sinRuido = limpio.replace(/[^\d.,\-]/g, "");
  // Si hay punto y coma, la coma es miles y el punto decimal (estilo plataforma).
  // Si sólo hay comas, la última puede ser decimal si hay exactamente 1–2 dígitos después…
  // Regla simple de plataforma: la coma SIEMPRE es miles; el punto es decimal.
  const normalizado = sinRuido.replace(/,/g, "");
  if (!normalizado || normalizado === "-" || normalizado === ".") return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mientras el usuario escribe: deja dígitos y un solo punto decimal,
 * y reaplica comas de miles a la parte entera.
 */
export function formatearEntradaNumerica(
  crudo: string,
  decimalesMax = 2,
): string {
  let s = crudo.replace(/[^\d.]/g, "");
  const neg = crudo.trim().startsWith("-");

  const primerPunto = s.indexOf(".");
  if (primerPunto >= 0) {
    const ent = s.slice(0, primerPunto);
    let frac = s.slice(primerPunto + 1).replace(/\./g, "");
    if (decimalesMax >= 0) frac = frac.slice(0, decimalesMax);
    const entLimpio = ent.replace(/^0+(?=\d)/, "") || (frac.length || s.endsWith(".") ? "0" : "");
    const conComas = (entLimpio || "0").replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILES);
    s = s.endsWith(".") && frac === ""
      ? `${conComas}.`
      : frac.length
        ? `${conComas}.${frac}`
        : conComas;
  } else {
    const digitos = s.replace(/^0+(?=\d)/, "");
    s = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILES);
  }

  return neg && s ? `-${s}` : s;
}

/** Valor numérico → texto listo para un input con comas. */
export function numeroATextoInput(
  valor: number | string | null | undefined,
  decimales = 2,
): string {
  if (valor == null || valor === "") return "";
  const n = typeof valor === "number" ? valor : parseNumero(valor);
  if (n == null) return "";
  // Si el original era entero y decimales>0, igual mostramos .00 al blur;
  // aquí respetamos decimales pedidos.
  return fmtMiles(n, decimales);
}
