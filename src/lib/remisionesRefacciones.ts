/**
 * Remisión de refacciones.
 *
 * Distinta de la de motocarros: parte del catálogo de inventario y no arma
 * unidades. La existencia se aparta en cuanto ventas levanta la remisión
 * (los demás pedidos ven menos disponible) y sólo baja de verdad cuando
 * almacén libera. Estas funciones son la regla; la migración SQL tiene que
 * hacer el mismo cálculo.
 */

export type EtapaRefaccion =
  | "almacen"
  | "contingencia"
  | "surtida"
  | "logistica"
  | "entregada"
  | "cancelada";
export type AreaRemisionRefaccion = "ventas" | "almacen" | "logistica" | "finanzas";
export type TipoEnvioRefaccion = "paqueteria" | "directo" | "recoge";
export type TipoPagoRefaccion = "anticipado" | "contra_entrega" | "credito";
export type FormaPagoRefaccion = "efectivo" | "transferencia";
export type EstatusLineaRefaccion =
  | "bloqueada"
  | "surtida"
  | "faltante"
  | "sin_existencia"
  | "cancelada";

export type LineaRefaccion = {
  estatus: EstatusLineaRefaccion;
  cantidad: number;
  cantidad_bloqueada: number;
  cantidad_surtida: number;
  cantidad_faltante: number;
};

export const PASOS_REMISION_REFACCION = ["ventas", "almacen", "contingencia", "logistica", "entregada"] as const;
export type PasoRemisionRefaccion = (typeof PASOS_REMISION_REFACCION)[number];

/**
 * Siguiente folio de una serie. Refacciones usan RF-00001; motocarros usan REM-.
 * El número real lo confirma la base al guardar; esto es el que se va a asignar
 * si nadie más levanta una remisión antes.
 */
export function siguienteFolioSerie(
  folios: readonly string[],
  prefijo = "RF-",
  digitos = 5,
): string {
  const re = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let max = 0;
  for (const folio of folios) {
    const m = (folio || "").trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}${String(max + 1).padStart(digitos, "0")}`;
}

/** Lo que otros pedidos pueden tomar: existencia física menos lo apartado. */
export function disponibleRefaccion(stock: number, bloqueado: number): number {
  return Math.max(0, Math.trunc(stock) - Math.trunc(bloqueado));
}

export type PedidoRefaccion = {
  productoId: string;
  cantidad: number;
  disponible: number;
  descripcion?: string;
};

export type FaltantePedido = {
  productoId: string;
  pedido: number;
  disponible: number;
  descripcion?: string;
};

/** Suma partidas repetidas y rechaza lo que pasa de lo disponible. */
export function faltantesDePedido(lineas: readonly PedidoRefaccion[]): FaltantePedido[] {
  const porId = new Map<string, { cantidad: number; disponible: number; descripcion?: string }>();
  for (const l of lineas) {
    const prev = porId.get(l.productoId);
    if (prev) prev.cantidad += l.cantidad;
    else porId.set(l.productoId, {
      cantidad: l.cantidad,
      disponible: l.disponible,
      descripcion: l.descripcion,
    });
  }
  const faltantes: FaltantePedido[] = [];
  for (const [productoId, v] of porId) {
    if (!Number.isInteger(v.cantidad) || v.cantidad < 1 || v.cantidad > v.disponible) {
      faltantes.push({
        productoId,
        pedido: v.cantidad,
        disponible: v.disponible,
        descripcion: v.descripcion,
      });
    }
  }
  return faltantes;
}

export type CierreRefaccion = { entregada?: boolean };

/**
 * Etapa del encabezado y área donde se ve la remisión.
 * Con piezas surtidas y nada apartado, pasa a logística. Si ya se entregó,
 * el cierre queda en entregada. `surtida` se conserva como alias histórico.
 */
export function etapaDeLineas(
  lineas: readonly Pick<LineaRefaccion, "estatus" | "cantidad_surtida">[],
  cierre: CierreRefaccion = {},
): {
  etapa: EtapaRefaccion;
  area: AreaRemisionRefaccion;
  abierta: boolean;
} {
  if (lineas.length === 0) {
    return { etapa: "cancelada", area: "ventas", abierta: false };
  }
  const abierta = lineas.some(l => l.estatus === "bloqueada" || l.estatus === "faltante");
  const hayFaltante = lineas.some(l => l.estatus === "faltante");
  const haySurtida = lineas.some(l => l.cantidad_surtida > 0);
  const haySin = lineas.some(l => l.estatus === "sin_existencia");

  if (abierta && hayFaltante) return { etapa: "contingencia", area: "almacen", abierta: true };
  if (abierta) return { etapa: "almacen", area: "almacen", abierta: true };
  if (haySurtida && cierre.entregada) return { etapa: "entregada", area: "logistica", abierta: false };
  if (haySurtida) return { etapa: "logistica", area: "logistica", abierta: false };
  if (haySin) return { etapa: "contingencia", area: "almacen", abierta: false };
  return { etapa: "cancelada", area: "ventas", abierta: false };
}

/** La dirección y el medio de envío tienen que ir completos para logística. */
export function envioListo(envio: {
  tipo: string;
  direccion: string;
  tipoPago: string;
  formaPago?: string;
}): boolean {
  const dir = envio.direccion.trim();
  const tipoOk = envio.tipo === "paqueteria" || envio.tipo === "directo" || envio.tipo === "recoge";
  const dirOk = envio.tipo === "recoge" || dir.length >= 8;
  const cuandoOk = envio.tipoPago === "anticipado" || envio.tipoPago === "contra_entrega" || envio.tipoPago === "credito";
  const forma = envio.formaPago ?? "efectivo";
  // A crédito no hay forma de cobro todavía: el pago queda pendiente.
  const formaOk = envio.tipoPago === "credito" || forma === "efectivo" || forma === "transferencia";
  return tipoOk && dirOk && cuandoOk && formaOk;
}

/** Porcentaje de descuento entre 0 y 100. */
export function descuentoValido(pct: number): boolean {
  return Number.isFinite(pct) && pct >= 0 && pct <= 100;
}

/**
 * Precio de lista menos el descuento de la pieza y, después, el de toda la remisión.
 * El resultado no baja de cero.
 */
export function importeConDescuento(
  precio: number,
  cantidad: number,
  descuentoPieza: number,
  descuentoGeneral: number,
): number {
  const base = Math.max(0, precio) * Math.max(0, cantidad);
  const pieza = Math.min(100, Math.max(0, descuentoPieza));
  const general = Math.min(100, Math.max(0, descuentoGeneral));
  const neto = base * (1 - pieza / 100) * (1 - general / 100);
  return Math.round(neto * 100) / 100;
}

/** Paquetería no se cierra como entregada sin número de guía. */
export function puedeMarcarEntregada(etapa: EtapaRefaccion, tipoEnvio: string | null, guia: string | null): boolean {
  if (etapa !== "logistica") return false;
  if (tipoEnvio === "paqueteria") return (guia ?? "").trim().length > 0;
  return true;
}

/** Índice del paso visible. Cancelada no recorre el resto del camino. */
export function indicePaso(etapa: EtapaRefaccion): number {
  if (etapa === "cancelada") return -1;
  return PASOS_REMISION_REFACCION.indexOf(etapa);
}

export type EfectoLinea =
  | { ok: true; linea: LineaRefaccion; stock: number }
  | { ok: false; error: "no_apartada" | "cantidad" | "sin_existencia" };

function lineaNueva(linea: LineaRefaccion, patch: Partial<LineaRefaccion>, stock: number): EfectoLinea {
  return { ok: true, linea: { ...linea, ...patch }, stock };
}

/**
 * Almacén surte. Baja la existencia física y suelta el mismo apartado, así
 * la disponible de los demás pedidos no se mueve: ya se les había descontado.
 */
export function liberarLinea(linea: LineaRefaccion, qty: number, stock: number): EfectoLinea {
  if (linea.estatus !== "bloqueada" && linea.estatus !== "faltante") {
    return { ok: false, error: "no_apartada" };
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > linea.cantidad_bloqueada) {
    return { ok: false, error: "cantidad" };
  }
  if (stock < qty) return { ok: false, error: "sin_existencia" };
  const bloqueada = linea.cantidad_bloqueada - qty;
  const faltante = Math.max(0, linea.cantidad_faltante - qty);
  const estatus: EstatusLineaRefaccion =
    bloqueada === 0 ? "surtida" : faltante > 0 ? "faltante" : "bloqueada";
  return lineaNueva(linea, {
    cantidad_bloqueada: bloqueada,
    cantidad_surtida: linea.cantidad_surtida + qty,
    cantidad_faltante: faltante,
    estatus,
  }, stock - qty);
}

/**
 * Almacén no tiene la pieza (o ya no la tiene). El apartado NO se suelta:
 * mientras se averigua, los demás pedidos siguen viendo menos disponible.
 */
export function reportarFaltante(linea: LineaRefaccion, qty: number, stock: number): EfectoLinea {
  if (linea.estatus !== "bloqueada" && linea.estatus !== "faltante") {
    return { ok: false, error: "no_apartada" };
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > linea.cantidad_bloqueada) {
    return { ok: false, error: "cantidad" };
  }
  return lineaNueva(linea, { cantidad_faltante: qty, estatus: "faltante" }, stock);
}

/**
 * Almacén confirma que esas piezas no están. Se suelta el apartado y se
 * corrige la existencia para que no reaparezcan como disponibles.
 */
export function confirmarSinExistencia(linea: LineaRefaccion, stock: number): EfectoLinea {
  if (linea.estatus !== "bloqueada" && linea.estatus !== "faltante") {
    return { ok: false, error: "no_apartada" };
  }
  const pedido = linea.cantidad_faltante > 0 ? linea.cantidad_faltante : linea.cantidad_bloqueada;
  const soltar = Math.min(pedido, linea.cantidad_bloqueada);
  if (soltar < 1) return { ok: false, error: "cantidad" };
  const baja = Math.min(soltar, Math.max(0, stock));
  const bloqueada = linea.cantidad_bloqueada - soltar;
  const estatus: EstatusLineaRefaccion =
    bloqueada === 0 && linea.cantidad_surtida > 0 ? "surtida"
    : bloqueada === 0 ? "sin_existencia"
    : "bloqueada";
  return lineaNueva(linea, {
    cantidad_bloqueada: bloqueada,
    cantidad_faltante: 0,
    estatus,
  }, stock - baja);
}

/** Ventas suelta el apartado que aún no se surtió. La existencia física no cambia. */
export function cancelarApartado(linea: LineaRefaccion, stock: number): EfectoLinea {
  if (linea.cantidad_bloqueada <= 0) return { ok: false, error: "no_apartada" };
  const estatus: EstatusLineaRefaccion = linea.cantidad_surtida > 0 ? "surtida" : "cancelada";
  return lineaNueva(linea, {
    cantidad_bloqueada: 0,
    cantidad_faltante: 0,
    estatus,
  }, stock);
}
