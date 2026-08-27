// ============================================================
// Control Financiero — tipos, catálogos y reglas de negocio
//
// Módulo puro a propósito: no importa el cliente de Supabase, para que las
// reglas se puedan probar solas. El acceso a datos vive en `finanzasDb.ts`.
// ============================================================

export const BUCKET_FINANZAS = "finanzas-docs";

// ── Tipos del dominio ───────────────────────────────────────
export type MovTipo = "INGRESO" | "EGRESO";
export type MovEstatus = "BORRADOR" | "PENDIENTE" | "CONFIRMADO" | "CANCELADO";
export type MetodoPago =
  | "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA" | "DEPOSITO" | "COMPENSACION" | "OTRO";
export type ContraparteTipo = "CLIENTE" | "PROVEEDOR" | "EMPLEADO" | "OTRO";
export type MovVia = "DIRECTO" | "INTERMEDIARIO";
export type CuentaTipo = "EFECTIVO" | "BANCO";
export type AdjuntoTipo =
  | "FACTURA" | "RECIBO" | "COMPROBANTE_PAGO" | "TICKET" | "VALE_EFECTIVO"
  | "FOTO_EFECTIVO" | "CONTRATO" | "IDENTIFICACION" | "ESTADO_CUENTA" | "COTIZACION" | "OTRO";

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: CuentaTipo;
  moneda: string;
  banco: string | null;
  numero_cuenta: string | null;
  saldo_inicial: number;
  activo: boolean;
  orden: number;
}

export interface SaldoCuenta extends Omit<Cuenta, "banco" | "numero_cuenta"> {
  total_ingresos: number;
  total_egresos: number;
  saldo_actual: number;
}

export interface Proveedor {
  id: string;
  codigo: string | null;
  nombre_comercial: string;
  razon_social: string | null;
  rfc: string | null;
  categoria: string | null;
  telefono: string | null;
  email: string | null;
  nombre_contacto: string | null;
  direccion: string | null;
  banco: string | null;
  clabe: string | null;
  cuenta_bancaria: string | null;
  moneda_preferida: string;
  dias_credito: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface Movimiento {
  id: string;
  folio: string | null;
  tipo: MovTipo;
  estatus: MovEstatus;
  concepto: string;
  categoria: string | null;
  descripcion: string | null;

  monto: number;
  moneda: string;
  tipo_cambio: number | null;
  monto_mxn: number;

  fecha_movimiento: string;
  metodo_pago: MetodoPago;
  cuenta_id: string | null;
  referencia: string | null;

  contraparte_tipo: ContraparteTipo;
  cliente_id: string | null;
  proveedor_id: string | null;
  empleado_id: string | null;
  contraparte_nombre: string;

  via: MovVia;
  intermediario_id: string | null;
  intermediario_nombre: string | null;
  recibido_por: string | null;

  requiere_comprobacion: boolean;
  comprobado: boolean;
  monto_comprobado: number | null;
  monto_devuelto: number | null;
  comprobado_at: string | null;

  tiene_factura: boolean;
  factura_folio: string | null;
  factura_uuid: string | null;
  factura_rfc: string | null;

  remision_id: string | null;
  oportunidad_id: string | null;
  contenedor_id: string | null;

  autorizado_nombre: string | null;
  autorizado_at: string | null;
  confirmado_at: string | null;
  cancelado_at: string | null;
  motivo_cancelacion: string | null;

  created_by: string | null;
  created_at: string;

  // Campos que agrega la vista v_movimientos_financieros
  cuenta_nombre?: string | null;
  cuenta_tipo?: CuentaTipo | null;
  cliente_nombre?: string | null;
  cliente_codigo?: string | null;
  proveedor_nombre?: string | null;
  empleado_nombre?: string | null;
  intermediario_display?: string | null;
  recibido_por_nombre?: string | null;
  registrado_por_nombre?: string | null;
  folio_remision?: string | null;
  adjuntos_count?: number;
  efecto_mxn?: number;
}

export interface Adjunto {
  id: string;
  movimiento_id: string;
  tipo_documento: AdjuntoTipo;
  nombre_archivo: string;
  storage_path: string;
  mime_type: string | null;
  tamano_bytes: number | null;
  notas: string | null;
  subido_por: string | null;
  created_at: string;
}

export interface BitacoraEntrada {
  id: string;
  movimiento_id: string;
  accion: string;
  usuario_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detalle: any;
  created_at: string;
}

// ── Catálogos de etiquetas ──────────────────────────────────
export const MONEDAS = ["MXN", "USD", "EUR", "CNY"];

export const METODOS_PAGO: { value: MetodoPago; label: string }[] = [
  { value: "EFECTIVO",      label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "CHEQUE",        label: "Cheque" },
  { value: "TARJETA",       label: "Tarjeta" },
  { value: "DEPOSITO",      label: "Depósito" },
  { value: "COMPENSACION",  label: "Compensación" },
  { value: "OTRO",          label: "Otro" },
];

export const ESTATUS_MOV: Record<MovEstatus, { label: string; clase: string }> = {
  BORRADOR:   { label: "Borrador",   clase: "border-slate-200 bg-slate-50 text-slate-600" },
  PENDIENTE:  { label: "Pendiente",  clase: "border-amber-200 bg-amber-50 text-amber-700" },
  CONFIRMADO: { label: "Confirmado", clase: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  CANCELADO:  { label: "Cancelado",  clase: "border-red-200 bg-red-50 text-red-600" },
};

export const TIPOS_ADJUNTO: { value: AdjuntoTipo; label: string }[] = [
  { value: "FACTURA",          label: "Factura / CFDI" },
  { value: "RECIBO",           label: "Recibo" },
  { value: "COMPROBANTE_PAGO", label: "Comprobante de pago" },
  { value: "TICKET",           label: "Ticket / nota" },
  { value: "VALE_EFECTIVO",    label: "Vale de efectivo" },
  { value: "FOTO_EFECTIVO",    label: "Foto del efectivo" },
  { value: "CONTRATO",         label: "Contrato / convenio" },
  { value: "IDENTIFICACION",   label: "Identificación" },
  { value: "ESTADO_CUENTA",    label: "Estado de cuenta" },
  { value: "COTIZACION",       label: "Cotización" },
  { value: "OTRO",             label: "Otro documento" },
];

export const MIME_ADJUNTOS =
  "application/pdf,application/xml,text/xml,image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Etiqueta de la contraparte según el tipo de movimiento. */
export function etiquetaContraparte(tipo: MovTipo): string {
  return tipo === "INGRESO" ? "¿Quién nos pagó?" : "¿A quién le pagamos?";
}

/** Etiqueta de la vía según el tipo de movimiento. */
export function etiquetaVia(tipo: MovTipo, via: MovVia): string {
  if (tipo === "INGRESO") {
    return via === "DIRECTO"
      ? "El cliente pagó directo en caja"
      : "Alguien trajo el dinero";
  }
  return via === "DIRECTO"
    ? "Le pagamos directo al beneficiario"
    : "Entregamos el efectivo a alguien para que pagara";
}

export function etiquetaIntermediario(tipo: MovTipo): string {
  return tipo === "INGRESO" ? "¿Quién trajo el dinero?" : "¿A quién le dimos el efectivo?";
}

// ── Formato ─────────────────────────────────────────────────
export function fmtMoneda(monto: number, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(monto ?? 0);
}

export function fmtFecha(fecha: string | null): string {
  if (!fecha) return "—";
  // Las fechas `date` de Postgres llegan como YYYY-MM-DD; partirlas evita que
  // el navegador las corra un día por zona horaria.
  const [y, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Reglas de negocio (puras, probadas con vitest) ──────────

/** Lo que la UI captura antes de mandarlo a la base. */
export interface MovimientoForm {
  tipo: MovTipo;
  concepto: string;
  categoria: string;
  descripcion: string;
  monto: string;
  moneda: string;
  tipo_cambio: string;
  fecha_movimiento: string;
  metodo_pago: MetodoPago;
  cuenta_id: string;
  referencia: string;
  contraparte_tipo: ContraparteTipo;
  cliente_id: string | null;
  proveedor_id: string | null;
  empleado_id: string | null;
  contraparte_nombre: string;
  via: MovVia;
  intermediario_id: string | null;
  intermediario_nombre: string;
  recibido_por: string | null;
  factura_folio: string;
  factura_uuid: string;
  factura_rfc: string;
  remision_id: string | null;
}

export function formVacio(tipo: MovTipo): MovimientoForm {
  return {
    tipo,
    concepto: "",
    categoria: "",
    descripcion: "",
    monto: "",
    moneda: "MXN",
    tipo_cambio: "",
    fecha_movimiento: new Date().toISOString().slice(0, 10),
    metodo_pago: "EFECTIVO",
    cuenta_id: "",
    referencia: "",
    contraparte_tipo: tipo === "INGRESO" ? "CLIENTE" : "PROVEEDOR",
    cliente_id: null,
    proveedor_id: null,
    empleado_id: null,
    contraparte_nombre: "",
    via: "DIRECTO",
    intermediario_id: null,
    intermediario_nombre: "",
    recibido_por: null,
    factura_folio: "",
    factura_uuid: "",
    factura_rfc: "",
    remision_id: null,
  };
}

/**
 * Espeja en el cliente las restricciones de la base, para dar el error en el
 * formulario en lugar de esperar el rechazo de Postgres.
 */
export function validarMovimiento(f: MovimientoForm, cuentas: Cuenta[] = []): string[] {
  const errores: string[] = [];

  if (!f.concepto.trim()) errores.push("El concepto es obligatorio");
  if (!f.contraparte_nombre.trim()) {
    errores.push(f.tipo === "INGRESO" ? "Falta indicar quién pagó" : "Falta indicar a quién se le pagó");
  }

  const monto = parseFloat(f.monto);
  if (!f.monto || isNaN(monto)) errores.push("El monto es obligatorio");
  else if (monto <= 0) errores.push("El monto debe ser mayor a cero");

  if (f.moneda !== "MXN") {
    const tc = parseFloat(f.tipo_cambio);
    if (!f.tipo_cambio || isNaN(tc) || tc <= 0) {
      errores.push(`Captura el tipo de cambio de ${f.moneda} a MXN`);
    }
  }

  if (f.contraparte_tipo === "CLIENTE"   && !f.cliente_id)   errores.push("Selecciona el cliente de la lista");
  if (f.contraparte_tipo === "PROVEEDOR" && !f.proveedor_id) errores.push("Selecciona el proveedor de la lista");
  if (f.contraparte_tipo === "EMPLEADO"  && !f.empleado_id)  errores.push("Selecciona la persona de la lista");

  if (f.via === "INTERMEDIARIO" && !f.intermediario_id && !f.intermediario_nombre.trim()) {
    errores.push(etiquetaIntermediario(f.tipo));
  }

  if (!f.fecha_movimiento) errores.push("La fecha del movimiento es obligatoria");

  if (f.cuenta_id) {
    const cuenta = cuentas.find(c => c.id === f.cuenta_id);
    if (cuenta && cuenta.moneda !== f.moneda) {
      errores.push(`«${cuenta.nombre}» maneja ${cuenta.moneda}; el movimiento está en ${f.moneda}`);
    }
  }

  return errores;
}

/**
 * Entregar efectivo a un tercero para que pague deja una cuenta abierta:
 * hay que exigirle comprobante y cambio.
 */
export function requiereComprobacion(f: Pick<MovimientoForm, "tipo" | "metodo_pago" | "via">): boolean {
  return f.tipo === "EGRESO" && f.metodo_pago === "EFECTIVO" && f.via === "INTERMEDIARIO";
}

/** Faltante de una comprobación de efectivo: lo entregado menos comprobado y devuelto. */
export function faltanteComprobacion(mov: Pick<Movimiento, "monto" | "monto_comprobado" | "monto_devuelto">): number {
  const comprobado = mov.monto_comprobado ?? 0;
  const devuelto = mov.monto_devuelto ?? 0;
  return Math.round((mov.monto - comprobado - devuelto) * 100) / 100;
}

/** Totales de un conjunto de movimientos, ya normalizados a MXN. */
export function totalesMXN(movs: Movimiento[]) {
  let ingresos = 0;
  let egresos = 0;
  for (const m of movs) {
    if (m.estatus !== "CONFIRMADO") continue;
    if (m.tipo === "INGRESO") ingresos += Number(m.monto_mxn ?? 0);
    else egresos += Number(m.monto_mxn ?? 0);
  }
  ingresos = Math.round(ingresos * 100) / 100;
  egresos = Math.round(egresos * 100) / 100;
  return { ingresos, egresos, neto: Math.round((ingresos - egresos) * 100) / 100 };
}

/** Búsqueda libre sobre un movimiento: folio, concepto, contraparte, referencia… */
export function coincideBusqueda(m: Movimiento, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [
    m.folio, m.concepto, m.contraparte_nombre, m.categoria, m.descripcion,
    m.referencia, m.factura_folio, m.cuenta_nombre, m.intermediario_display,
    m.cliente_codigo, m.folio_remision,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(term);
}

/** Ruta del archivo dentro del bucket de expedientes. */
export function rutaAdjunto(movimientoId: string, nombreArchivo: string): string {
  const ext = nombreArchivo.includes(".") ? nombreArchivo.split(".").pop() : "bin";
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `movimientos/${movimientoId}/${slug}.${ext}`;
}
