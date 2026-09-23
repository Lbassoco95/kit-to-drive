/**
 * Remisión de refacciones.
 *
 * Distinta de la de motocarros: parte del catálogo de inventario y no arma
 * unidades. La existencia se aparta en cuanto ventas levanta la remisión
 * (los demás pedidos ven menos disponible) y sólo baja de verdad cuando
 * almacén libera. Estas funciones son la regla; la migración SQL tiene que
 * hacer el mismo cálculo.
 */

export type EtapaRefaccion = "almacen" | "contingencia" | "surtida" | "cancelada";
export type AreaRemisionRefaccion = "ventas" | "almacen";
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

export const PASOS_REMISION_REFACCION = ["ventas", "almacen", "contingencia", "surtida"] as const;
export type PasoRemisionRefaccion = (typeof PASOS_REMISION_REFACCION)[number];

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

/**
 * Etapa del encabezado y área donde se ve la remisión.
 * Abierta mientras haya piezas apartadas (en revisión o en contingencia).
 */
export function etapaDeLineas(lineas: readonly Pick<LineaRefaccion, "estatus" | "cantidad_surtida">[]): {
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
  if (haySurtida) return { etapa: "surtida", area: "almacen", abierta: false };
  if (haySin) return { etapa: "contingencia", area: "almacen", abierta: false };
  return { etapa: "cancelada", area: "ventas", abierta: false };
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
