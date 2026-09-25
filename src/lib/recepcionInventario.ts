/**
 * Reglas de la recepción de inventario.
 *
 * El documento guarda qué llegó en un contenedor. La compra compara eso
 * contra lo pedido. `_recalcular_compra` en la migración usa la misma
 * definición de estatus que `estatusCompra`.
 */

export const TIPOS_LINEA = ["chasis", "motor", "parte", "unidad"] as const;
export type TipoLineaRecepcion = (typeof TIPOS_LINEA)[number];
export type EstatusCompra = "abierta" | "parcial" | "completa" | "ajustada";
export type OrigenRecepcion = "excel" | "manual" | "partes";

export type LineaRecepcion = {
  tipo: TipoLineaRecepcion;
  clave: string;
  modelo: string | null;
  color: string | null;
  cantidad_esperada: number;
  cantidad_recibida: number;
};

export type LineaCompraEstado = {
  cantidad_pedida: number;
  cantidad_recibida: number;
  cantidad_ajustada: number | null;
};

const limpio = (valor: string | null | undefined): string | null => {
  const texto = (valor ?? "").trim();
  return texto ? texto : null;
};

/** Lo que hay que cubrir: lo ajustado si Compras ya aceptó un faltante, si no lo pedido. */
export function objetivoLinea(linea: LineaCompraEstado): number {
  return linea.cantidad_ajustada ?? linea.cantidad_pedida;
}

export function faltanteLinea(linea: LineaCompraEstado): number {
  return Math.max(0, objetivoLinea(linea) - linea.cantidad_recibida);
}

export function estatusCompra(lineas: LineaCompraEstado[]): EstatusCompra {
  if (lineas.length === 0) return "abierta";
  const todasCubiertas = lineas.every(l => l.cantidad_recibida >= objetivoLinea(l));
  const algunAjuste = lineas.some(
    l => l.cantidad_ajustada != null && l.cantidad_ajustada < l.cantidad_pedida,
  );
  const algunaActividad = lineas.some(l => l.cantidad_recibida > 0 || l.cantidad_ajustada != null);
  if (todasCubiertas && algunAjuste) return "ajustada";
  if (todasCubiertas) return "completa";
  if (!algunaActividad) return "abierta";
  return "parcial";
}

export function lineaSerial(
  tipo: "chasis" | "motor" | "unidad",
  clave: string,
  modelo: string | null | undefined,
  color: string | null | undefined,
  recibida = true,
): LineaRecepcion | null {
  const claveLimpia = limpio(clave)?.toUpperCase() ?? null;
  if (!claveLimpia) return null;
  return {
    tipo,
    clave: claveLimpia,
    modelo: limpio(modelo),
    color: limpio(color)?.toUpperCase() ?? null,
    cantidad_esperada: 1,
    cantidad_recibida: recibida ? 1 : 0,
  };
}

/** Captura manual: una línea por unidad y otra por motor, para que el documento diga qué llegó. */
export function lineasDeUnidades(
  unidades: { ns_chasis: string; ns_motor?: string | null }[],
  modelo: string,
  color: string,
): LineaRecepcion[] {
  const out: LineaRecepcion[] = [];
  for (const u of unidades) {
    const chasis = lineaSerial("unidad", u.ns_chasis, modelo, color, true);
    if (chasis) out.push(chasis);
    if (u.ns_motor) {
      const motor = lineaSerial("motor", u.ns_motor, modelo, null, true);
      if (motor) out.push(motor);
    }
  }
  return out;
}

export function lineasDeInventario(input: {
  chasis?: { numero_chasis: string; modelo?: string | null; color?: string | null }[];
  motores?: { numero_motor: string; modelo?: string | null }[];
  partes?: { descripcion: string; modelo?: string | null; cantidad_esperada: number; cantidad_recibida: number }[];
}): LineaRecepcion[] {
  const out: LineaRecepcion[] = [];
  for (const c of input.chasis ?? []) {
    const linea = lineaSerial("chasis", c.numero_chasis, c.modelo, c.color, true);
    if (linea) out.push(linea);
  }
  for (const m of input.motores ?? []) {
    const linea = lineaSerial("motor", m.numero_motor, m.modelo, null, true);
    if (linea) out.push(linea);
  }
  for (const p of input.partes ?? []) {
    const clave = limpio(p.descripcion);
    if (!clave) continue;
    out.push({
      tipo: "parte",
      clave,
      modelo: limpio(p.modelo),
      color: null,
      cantidad_esperada: Math.max(0, Math.trunc(Number(p.cantidad_esperada)) || 0),
      cantidad_recibida: Math.max(0, Math.trunc(Number(p.cantidad_recibida)) || 0),
    });
  }
  return out;
}

export function resumenLineas(lineas: LineaRecepcion[]) {
  const esperadas = lineas.reduce((s, l) => s + l.cantidad_esperada, 0);
  const recibidas = lineas.reduce((s, l) => s + l.cantidad_recibida, 0);
  const faltantes = lineas.filter(l => l.cantidad_recibida < l.cantidad_esperada).length;
  return { esperadas, recibidas, faltantes, diferencia: recibidas - esperadas };
}
