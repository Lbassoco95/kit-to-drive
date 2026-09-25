/** Movimiento de stock de refacciones (vista o tabla cruda). */
export type MovimientoStockRefaccion = {
  id: string;
  producto_id: string;
  tipo: string;
  cantidad: number;
  precio_unitario?: number | null;
  cliente_id?: string | null;
  notas?: string | null;
  created_at: string;
  codigo_nuevo?: string | null;
  codigo_antiguo?: string | null;
  descripcion?: string | null;
  descripcion_corta?: string | null;
  stock_actual?: number | null;
  cliente_etiqueta?: string | null;
  cliente_nombre?: string | null;
  cliente_codigo_erp?: string | null;
  cliente_folio_interno?: string | null;
};

export type MovimientoConSaldo<T extends { cantidad: number }> = T & {
  stock_antes: number;
  stock_despues: number;
};

/**
 * Parte del stock actual y recorre los movimientos del más reciente al más
 * viejo para reconstruir cuánto quedó después de cada salida/entrada.
 * `cantidad` ya viene con signo (negativo = baja de existencia).
 */
export function conStockResultante<T extends { cantidad: number }>(
  movimientosDesc: T[],
  stockActual: number,
): MovimientoConSaldo<T>[] {
  let running = stockActual;
  return movimientosDesc.map(m => {
    const stock_despues = running;
    const stock_antes = running - m.cantidad;
    running = stock_antes;
    return { ...m, stock_antes, stock_despues };
  });
}

export function etiquetaClienteMovimiento(m: {
  cliente_etiqueta?: string | null;
  cliente_nombre?: string | null;
  cliente_codigo_erp?: string | null;
  cliente_folio_interno?: string | null;
}): string {
  if (m.cliente_etiqueta && m.cliente_etiqueta.trim()) return m.cliente_etiqueta.trim();
  const codigo = m.cliente_codigo_erp || m.cliente_folio_interno;
  if (m.cliente_nombre && codigo) return `${codigo} — ${m.cliente_nombre}`;
  return m.cliente_nombre || codigo || "—";
}

export function labelTipoMovimiento(
  tipo: string,
  labels?: Partial<Record<"venta" | "entrada" | "ajuste" | "salida", string>>,
): string {
  const map = {
    venta: labels?.venta ?? "Venta / remisión",
    entrada: labels?.entrada ?? "Entrada",
    ajuste: labels?.ajuste ?? "Ajuste",
    salida: labels?.salida ?? "Salida",
  } as const;
  return (map as Record<string, string>)[tipo] ?? tipo;
}
