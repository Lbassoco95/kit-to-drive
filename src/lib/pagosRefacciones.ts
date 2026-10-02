/**
 * Reglas de aplicación de pago multi-remisión (refacciones).
 * La migración SQL replica estos límites en registrar_pago_refacciones.
 */

export type EstadoPagoRemision = "sin_pago" | "parcial" | "pagado";
export type EstadoPagoCabecera = "registrado" | "conciliado" | "con_deposito" | "anulado";
export type NaturalezaRemision = "cotizacion" | "remision_final";

export type RemisionSaldo = {
  remisionId: string;
  folio: string;
  montoTotal: number;
  montoPagado: number;
};

export type AplicacionPropuesta = {
  remisionId: string;
  monto: number;
};

export type ResultadoAplicacion =
  | {
      ok: true;
      aplicaciones: AplicacionPropuesta[];
      sumaAplicada: number;
      disponibleRestante: number;
    }
  | {
      ok: false;
      error:
        | "monto_pago"
        | "sin_aplicaciones"
        | "monto_invalido"
        | "excede_saldo"
        | "excede_disponible"
        | "duplicada";
      detalle?: string;
    };

/** Saldo pendiente de una remisión (nunca negativo). */
export function saldoRemision(montoTotal: number, montoPagado: number): number {
  return Math.max(0, round2(montoTotal) - round2(montoPagado));
}

/** Disponible del pago aún no asignado. */
export function disponiblePago(montoTotal: number, yaAplicado: number): number {
  return Math.max(0, round2(montoTotal) - round2(yaAplicado));
}

export function estadoPagoDeMontos(montoTotal: number, montoPagado: number): EstadoPagoRemision {
  const total = round2(montoTotal);
  const pagado = round2(montoPagado);
  if (pagado <= 0) return "sin_pago";
  if (total > 0 && pagado + 0.009 >= total) return "pagado";
  return "parcial";
}

/**
 * Valida y normaliza aplicaciones: nunca más del saldo de cada remisión
 * ni más del disponible del pago. No inventa montos.
 */
export function aplicarPagoARemisiones(
  montoPago: number,
  saldos: readonly RemisionSaldo[],
  propuestas: readonly AplicacionPropuesta[],
): ResultadoAplicacion {
  if (!Number.isFinite(montoPago) || montoPago <= 0) {
    return { ok: false, error: "monto_pago" };
  }
  if (!propuestas.length) return { ok: false, error: "sin_aplicaciones" };

  const porId = new Map(saldos.map(s => [s.remisionId, s]));
  const vistas = new Set<string>();
  const aplicaciones: AplicacionPropuesta[] = [];
  let suma = 0;

  for (const p of propuestas) {
    if (vistas.has(p.remisionId)) {
      return { ok: false, error: "duplicada", detalle: p.remisionId };
    }
    vistas.add(p.remisionId);
    const rem = porId.get(p.remisionId);
    if (!rem) return { ok: false, error: "monto_invalido", detalle: p.remisionId };
    const monto = round2(p.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return { ok: false, error: "monto_invalido", detalle: rem.folio };
    }
    const saldo = saldoRemision(rem.montoTotal, rem.montoPagado);
    if (monto > saldo + 0.009) {
      return { ok: false, error: "excede_saldo", detalle: `${rem.folio}:${saldo}` };
    }
    suma = round2(suma + monto);
    if (suma > round2(montoPago) + 0.009) {
      return { ok: false, error: "excede_disponible", detalle: String(round2(montoPago)) };
    }
    aplicaciones.push({ remisionId: p.remisionId, monto });
  }

  return {
    ok: true,
    aplicaciones,
    sumaAplicada: suma,
    disponibleRestante: disponiblePago(montoPago, suma),
  };
}

/**
 * Sugiere cuánto se puede aplicar a cada remisión con el disponible,
 * en el orden dado (FIFO por lista).
 */
export function sugerirAplicaciones(
  disponible: number,
  saldos: readonly RemisionSaldo[],
): AplicacionPropuesta[] {
  let rest = round2(disponible);
  const out: AplicacionPropuesta[] = [];
  if (rest <= 0) return out;
  for (const s of saldos) {
    const saldo = saldoRemision(s.montoTotal, s.montoPagado);
    if (saldo <= 0 || rest <= 0) continue;
    const monto = Math.min(saldo, rest);
    out.push({ remisionId: s.remisionId, monto });
    rest = round2(rest - monto);
  }
  return out;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Path de storage para comprobante de pago de refacciones. */
export function pathComprobantePagoRefaccion(pagoId: string, basename: string): string {
  const safe = (basename || "comprobante").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120) || "comprobante";
  return `pagos-refacciones/${pagoId}/${Date.now()}_${safe}`;
}
