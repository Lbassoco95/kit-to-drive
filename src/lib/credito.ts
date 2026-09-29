// ============================================================
// Crédito / Cuentas por cobrar — tipos y reglas de negocio
//
// Módulo puro: no importa Supabase. Las pantallas y Remisiones
// usan estas reglas para saber quién tiene crédito y cuándo
// hay que parar el proceso por cartera vencida.
// ============================================================

export type CxcEstatus = "ABIERTA" | "PARCIAL" | "PAGADA" | "CANCELADA";

export interface ClienteCredito {
  id: string;
  codigo_erp: string | null;
  folio_interno: string | null;
  nombre_comercial: string | null;
  razon_social: string | null;
  telefono: string | null;
  email_cobranza: string | null;
  limite_credito: number | null;
  dias_credito: number;
  moneda_credito: string;
  activo: boolean;
  saldo_abierto: number;
  saldo_vencido: number;
  cxc_abiertas: number;
  cxc_vencidas: number;
}

export interface CuentaPorCobrar {
  id: string;
  folio: string | null;
  cliente_id: string;
  remision_id: string | null;
  concepto: string;
  monto: number;
  saldo: number;
  moneda: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  estatus: CxcEstatus;
  notas: string | null;
  created_at?: string;
  /** Remisión ligada (si se pidió en el select). */
  remisiones?: { folio_remision: string } | null;
}

export interface CxcAbono {
  id: string;
  cxc_id: string;
  monto: number;
  fecha_abono: string;
  metodo_pago: string | null;
  referencia: string | null;
  notas: string | null;
  created_at?: string;
}

export interface CxcVencidaResumen {
  folio: string | null;
  saldo: number;
  fecha_vencimiento: string;
  dias_atraso: number;
}

export interface FormCxc {
  concepto: string;
  monto: string;
  moneda: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  remision_id: string;
  notas: string;
}

export interface FormAbono {
  monto: string;
  fecha_abono: string;
  metodo_pago: string;
  referencia: string;
  notas: string;
}

export type FiltroCartera = "TODOS" | "VENCIDOS" | "AL_CORRIENTE";

/** Cliente con línea de crédito formal (días o límite capturado). */
export function clienteTieneCredito(c: {
  dias_credito?: number | null;
  limite_credito?: number | null;
}): boolean {
  return (Number(c.dias_credito) || 0) > 0 || (Number(c.limite_credito) || 0) > 0;
}

/** Fecha de vencimiento = emisión + días de crédito del cliente. */
export function calcularFechaVencimiento(
  fechaEmision: string,
  diasCredito: number,
): string {
  const [y, m, d] = fechaEmision.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fechaEmision.slice(0, 10);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + Math.max(0, Math.floor(diasCredito) || 0));
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Hoy en YYYY-MM-DD (zona local). */
export function hoyISO(ref: Date = new Date()): string {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, "0");
  const d = String(ref.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** CxC abierta con saldo y fecha de vencimiento ya pasada. */
export function cxcEstaVencida(
  cxc: Pick<CuentaPorCobrar, "estatus" | "saldo" | "fecha_vencimiento">,
  hoy: string = hoyISO(),
): boolean {
  if (cxc.estatus !== "ABIERTA" && cxc.estatus !== "PARCIAL") return false;
  if (Number(cxc.saldo) <= 0) return false;
  return cxc.fecha_vencimiento.slice(0, 10) < hoy.slice(0, 10);
}

/** El proceso comercial se detiene si hay al menos una CxC vencida. */
export function clienteBloqueadoPorCartera(
  cxcs: Pick<CuentaPorCobrar, "estatus" | "saldo" | "fecha_vencimiento">[],
  hoy: string = hoyISO(),
): boolean {
  return cxcs.some(c => cxcEstaVencida(c, hoy));
}

export function diasAtraso(
  fechaVencimiento: string,
  hoy: string = hoyISO(),
): number {
  const [y1, m1, d1] = fechaVencimiento.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = hoy.slice(0, 10).split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function formCxcVacio(diasCredito = 0): FormCxc {
  const emision = hoyISO();
  return {
    concepto: "",
    monto: "",
    moneda: "MXN",
    fecha_emision: emision,
    fecha_vencimiento: calcularFechaVencimiento(emision, diasCredito),
    remision_id: "",
    notas: "",
  };
}

export function formAbonoVacio(): FormAbono {
  return {
    monto: "",
    fecha_abono: hoyISO(),
    metodo_pago: "TRANSFERENCIA",
    referencia: "",
    notas: "",
  };
}

export interface MensajesValidacionCxc {
  conceptoObligatorio: string;
  montoInvalido: string;
  fechasInvalidas: string;
  vencimientoAntesEmision: string;
}

const MSG_CXC_DEFAULT: MensajesValidacionCxc = {
  conceptoObligatorio: "El concepto es obligatorio",
  montoInvalido: "El monto debe ser mayor a cero",
  fechasInvalidas: "Captura la fecha de emisión y de vencimiento",
  vencimientoAntesEmision: "El vencimiento no puede ser anterior a la emisión",
};

export function validarFormCxc(
  form: FormCxc,
  msgs: MensajesValidacionCxc = MSG_CXC_DEFAULT,
): string[] {
  const errores: string[] = [];
  if (!form.concepto.trim()) errores.push(msgs.conceptoObligatorio);
  const monto = parseFloat(form.monto);
  if (!form.monto.trim() || !Number.isFinite(monto) || monto <= 0) {
    errores.push(msgs.montoInvalido);
  }
  if (!form.fecha_emision || !form.fecha_vencimiento) {
    errores.push(msgs.fechasInvalidas);
  } else if (form.fecha_vencimiento < form.fecha_emision) {
    errores.push(msgs.vencimientoAntesEmision);
  }
  return errores;
}

export interface MensajesValidacionAbono {
  montoInvalido: string;
  superaSaldo: string;
  fechaObligatoria: string;
}

const MSG_ABONO_DEFAULT: MensajesValidacionAbono = {
  montoInvalido: "El monto del abono debe ser mayor a cero",
  superaSaldo: "El abono no puede superar el saldo pendiente",
  fechaObligatoria: "Captura la fecha del abono",
};

export function validarFormAbono(
  form: FormAbono,
  saldoPendiente: number,
  msgs: MensajesValidacionAbono = MSG_ABONO_DEFAULT,
): string[] {
  const errores: string[] = [];
  const monto = parseFloat(form.monto);
  if (!form.monto.trim() || !Number.isFinite(monto) || monto <= 0) {
    errores.push(msgs.montoInvalido);
  } else if (monto > Number(saldoPendiente) + 1e-9) {
    errores.push(msgs.superaSaldo);
  }
  if (!form.fecha_abono) errores.push(msgs.fechaObligatoria);
  return errores;
}

export function coincideBusquedaCredito(
  c: ClienteCredito,
  q: string,
): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [
    c.nombre_comercial,
    c.razon_social,
    c.codigo_erp,
    c.folio_interno,
    c.telefono,
    c.email_cobranza,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(term);
}

export function filtrarCartera(
  rows: ClienteCredito[],
  filtro: FiltroCartera,
  q: string,
): ClienteCredito[] {
  return rows.filter(c => {
    if (filtro === "VENCIDOS" && !(Number(c.saldo_vencido) > 0)) return false;
    if (filtro === "AL_CORRIENTE" && Number(c.saldo_vencido) > 0) return false;
    return coincideBusquedaCredito(c, q);
  });
}

/** Disponibilidad = límite − saldo abierto (null si no hay límite). */
export function creditoDisponible(c: ClienteCredito): number | null {
  if (c.limite_credito == null || !Number.isFinite(Number(c.limite_credito))) {
    return null;
  }
  return Number(c.limite_credito) - Number(c.saldo_abierto || 0);
}

/**
 * Mensaje corto para el toast de remisión cuando hay cartera vencida.
 * Si hay resumen de la RPC, menciona el primer folio.
 */
export function mensajeBloqueoCartera(
  resumen: CxcVencidaResumen[],
  plantilla: (folio: string, n: number) => string,
  plantillaSinDetalle: (n: number) => string,
): string {
  if (!resumen.length) return plantillaSinDetalle(1);
  const primero = resumen[0]?.folio || "—";
  return plantilla(primero, resumen.length);
}
