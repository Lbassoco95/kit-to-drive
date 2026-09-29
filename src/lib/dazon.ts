// Las etiquetas de área y tipo de usuario viven en src/lib/permissions.ts

// Semáforo system shared
export const SEMAFORO = {
  PENDIENTE:  { bg: "#F3F4F6", text: "#6B7280", icon: "Clock",        label: "Pendiente"  },
  EN_PROCESO: { bg: "#DBEAFE", text: "#1E40AF", icon: "Wrench",       label: "En proceso" },
  ARMADO:     { bg: "#D1FAE5", text: "#065F46", icon: "CheckCircle",  label: "Armado"     },
  LISTO:      { bg: "#D1FAE5", text: "#065F46", icon: "CheckCircle",  label: "Listo"      },
  ATRASADO:   { bg: "#FEE2E2", text: "#991B1B", icon: "AlertTriangle",label: "Atrasado"   },
  ENTREGADA:  { bg: "#EDE9FE", text: "#5B21B6", icon: "Truck",        label: "Entregada"  },
  ENTREGADO:  { bg: "#EDE9FE", text: "#5B21B6", icon: "Truck",        label: "Entregado"  },
  PROGRAMADA: { bg: "#DBEAFE", text: "#1E40AF", icon: "Calendar",     label: "Programada" },
  EN_RUTA:    { bg: "#FEF3C7", text: "#92400E", icon: "Truck",        label: "En ruta"    },
  NO_APLICA:  { bg: "#F3F4F6", text: "#6B7280", icon: "Minus",        label: "—"          },
  NUEVA:      { bg: "#F3F4F6", text: "#6B7280", icon: "Clock",        label: "Nueva"      },
  PARCIAL:    { bg: "#FEF3C7", text: "#92400E", icon: "AlertTriangle",label: "Parcial"    },
  COMPLETA:   { bg: "#D1FAE5", text: "#065F46", icon: "CheckCircle",  label: "Completa"   },
  CANCELADA:  { bg: "#FEE2E2", text: "#991B1B", icon: "AlertTriangle",label: "Cancelada"  },
} as const;

// Legacy maps (kept for compatibility)
export const ESTATUS_ARMADO_COLOR: Record<string, string> = {
  PENDIENTE:  "bg-[#F3F4F6] text-[#6B7280]",
  EN_PROCESO: "bg-[#DBEAFE] text-[#1E40AF]",
  ARMADO:     "bg-[#D1FAE5] text-[#065F46]",
  LISTO:      "bg-[#D1FAE5] text-[#065F46]",
  ATRASADO:   "bg-[#FEE2E2] text-[#991B1B]",
};
export const ESTATUS_ENTREGA_COLOR: Record<string, string> = {
  NO_APLICA:  "bg-[#F3F4F6] text-[#6B7280]",
  PROGRAMADA: "bg-[#DBEAFE] text-[#1E40AF]",
  EN_RUTA:    "bg-[#FEF3C7] text-[#92400E]",
  ENTREGADA:  "bg-[#EDE9FE] text-[#5B21B6]",
};
export const ESTATUS_REMISION_COLOR: Record<string, string> = {
  NUEVA:     "bg-[#F3F4F6] text-[#6B7280]",
  PARCIAL:   "bg-[#FEF3C7] text-[#92400E]",
  COMPLETA:  "bg-[#D1FAE5] text-[#065F46]",
  CANCELADA: "bg-[#FEE2E2] text-[#991B1B]",
};

export const fmtDate = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// Catálogo único de colores — usado en captura manual, filtros y validación.
// Si aparece un color nuevo, agrégalo aquí (y a MAPA_COLOR si trae variantes en inglés).
export const COLORES = ["BLANCO", "AZUL", "ROJO", "NEGRO", "VERDE", "GRIS", "AMARILLO", "NARANJA", "PLATA"] as const;

const MAPA_COLOR: Record<string, string> = {
  WHITE: "BLANCO", BLANC: "BLANCO", BLANCO: "BLANCO",
  BLUE: "AZUL", AZUL: "AZUL",
  ORANGE: "NARANJA", NARANJA: "NARANJA",
  RED: "ROJO", ROJO: "ROJO",
  BLACK: "NEGRO", NEGRO: "NEGRO",
  GREEN: "VERDE", VERDE: "VERDE",
  SILVER: "PLATA", PLATA: "PLATA",
  GRAY: "GRIS", GREY: "GRIS", GRIS: "GRIS",
  YELLOW: "AMARILLO", AMARILLO: "AMARILLO",
};

// Normaliza variantes de color (incluyendo inglés) a su equivalente en español.
export function normColor(c?: string | null): string {
  if (!c) return "—";
  const s = c.toString().toUpperCase().replace(/[^A-Z]/g, "");
  for (const [clave, valor] of Object.entries(MAPA_COLOR)) {
    if (s.includes(clave)) return valor;
  }
  return c.toString().toUpperCase();
}

// Sanea un número de serie (chasis o motor) al mismo criterio que valida la
// captura manual (NS_REGEX = ^[A-Z0-9-]{4,30}$): mayúsculas, sin espacios ni
// otros caracteres. Un serial con espacio ("DZ164FML T2M00654") no se puede
// ni teclear ni buscar, así que tiene que entrar limpio desde la importación.
export function normSerial(s?: string | null): string {
  if (!s) return "";
  return s.toString().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

// Línea de producto de un modelo, a partir del catálogo `modelos_producto`.
// Un modelo que no está en el catálogo se trata como "otro" — nunca se asume
// "motocarro" por default para no meter una línea desconocida al armado.
export type LineaProducto = "motocarro" | "mototaxi" | "otro";
export type ModeloInfo = { linea: LineaProducto; nombre_comercial: string | null };
export type CatalogoModelos = Map<string, ModeloInfo>;

export function lineaDe(modelo: string | null | undefined, catalogo: CatalogoModelos): LineaProducto {
  if (!modelo) return "otro";
  return catalogo.get(modelo)?.linea ?? "otro";
}

// Nombre comercial de un modelo (lo que habla ventas y dirección — Remisiones,
// Entregas, Clientes, Dashboard, Stock). Si el modelo no está en el catálogo
// o no tiene nombre comercial, cae de vuelta al código de fábrica.
export function nombreComercial(modelo: string | null | undefined, catalogo: CatalogoModelos): string {
  if (!modelo) return "—";
  return catalogo.get(modelo)?.nombre_comercial || modelo;
}

// Texto para pantallas de fábrica (Producción, Inventario, configurar unidad):
// código de fábrica con el comercial como secundario, p.ej. "DZ300Q7 · 300cc 2026".
export function displayFabrica(modelo: string | null | undefined, catalogo: CatalogoModelos): string {
  if (!modelo) return "—";
  const nc = catalogo.get(modelo)?.nombre_comercial;
  return nc && nc !== modelo ? `${modelo} · ${nc}` : modelo;
}

// Compute effective estatus armado (mark ATRASADO if overdue and not built)
export function effEstatusArmado(m: any): string {
  const e = m.estatus_armado;
  if (e === "ARMADO" || e === "LISTO") return e;
  const fe = m.fecha_estimada_armado;
  if (fe && !m.fecha_real_armado) {
    const today = new Date(); today.setHours(0,0,0,0);
    const est = new Date(fe + "T12:00:00");
    if (est < today) return "ATRASADO";
  }
  return e || "PENDIENTE";
}

// Days delta vs estimated armado date (positive = late)
export function diasDesvio(m: any): number | null {
  const fe = m.fecha_estimada_armado;
  if (!fe) return null;
  const ref = m.fecha_real_armado ? new Date(m.fecha_real_armado + "T12:00:00") : new Date();
  const est = new Date(fe + "T12:00:00");
  return Math.round((ref.getTime() - est.getTime()) / 86400000);
}

export const isDisponible = (m: any) =>
  (m.estatus_armado === "ARMADO" || m.estatus_armado === "LISTO");

// ── Incidencias de chasis ───────────────────────────────────────────────────
// Una pieza que llega mal (p.ej. un chasis sin el soporte del radiador) no se
// borra ni se deshabilita sola: se levanta un reporte, pasa por revisión y
// termina en adaptación, garantía o no útil — siempre con el registro pegado
// al chasis y a la unidad para darle seguimiento.

export const TIPOS_FALLA = [
  { key: "falta_parte",     label: "Falta una parte",        icon: "📦" },
  { key: "parte_danada",    label: "Parte dañada",           icon: "💥" },
  { key: "defecto_fabrica", label: "Defecto de fábrica",     icon: "🏭" },
  { key: "documental",      label: "Faltante documental",    icon: "📄" },
  { key: "otro",            label: "Otro",                   icon: "❓" },
] as const;

// Las partes que más se reportan — atajos de captura, no un catálogo cerrado.
export const PARTES_FRECUENTES = [
  "Soporte de radiador", "Radiador", "Bastidor trasero", "Caja / batea",
  "Cabina", "Suspensión", "Sistema eléctrico", "Tablero", "Llantas", "Frenos",
] as const;

export const SEVERIDADES = [
  { key: "menor",   label: "Menor",   cls: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "mayor",   label: "Mayor",   cls: "bg-amber-100 text-amber-800 border-amber-300" },
  { key: "critica", label: "Crítica", cls: "bg-red-100 text-red-700 border-red-300" },
] as const;

export type EstatusIncidencia =
  | "abierta" | "en_revision" | "adaptacion" | "garantia" | "no_util" | "descartada";

export const ESTATUS_INCIDENCIA: Record<EstatusIncidencia, {
  label: string; cls: string; ayuda: string; abierta: boolean; retiene: boolean;
}> = {
  abierta: {
    label: "Abierta", cls: "bg-[#FEF3C7] text-[#92400E] border-[#D97706]/40",
    ayuda: "Reportada, esperando revisión. El chasis se puede seguir usando salvo que se haya retenido.",
    abierta: true, retiene: false,
  },
  en_revision: {
    label: "En revisión", cls: "bg-[#DBEAFE] text-[#1E40AF] border-[#2E75B6]/40",
    ayuda: "Alguien la está revisando para decidir si se puede adaptar.",
    abierta: true, retiene: false,
  },
  adaptacion: {
    label: "Adaptada", cls: "bg-[#D1FAE5] text-[#065F46] border-[#065F46]/30",
    ayuda: "Se pudo adaptar. El chasis vuelve a servir y el registro se queda para seguimiento.",
    abierta: false, retiene: false,
  },
  garantia: {
    label: "Garantía", cls: "bg-[#EDE9FE] text-[#5B21B6] border-[#5B21B6]/30",
    ayuda: "Se reclamó a fábrica. El chasis queda identificado y fuera del disponible.",
    abierta: false, retiene: true,
  },
  no_util: {
    label: "No útil", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#C0392B]/40",
    ayuda: "No se pudo adaptar. No se elimina: deja de contar como disponible, pero sigue identificado.",
    abierta: false, retiene: true,
  },
  descartada: {
    label: "Descartada", cls: "bg-slate-100 text-slate-600 border-slate-200",
    ayuda: "Falsa alarma: la pieza estaba bien.",
    abierta: false, retiene: false,
  },
};

// Estatus de una pieza de chasis en inventario.
export const ESTATUS_CHASIS: Record<string, { label: string; cls: string }> = {
  disponible:  { label: "Disponible",  cls: "bg-green-100 text-green-700" },
  configurado: { label: "Configurado", cls: "bg-blue-100 text-blue-700" },
  asignado:    { label: "Asignado",    cls: "bg-blue-100 text-blue-700" },
  en_revision: { label: "En revisión", cls: "bg-amber-100 text-amber-800" },
  garantia:    { label: "Garantía",    cls: "bg-violet-100 text-violet-700" },
  no_util:     { label: "No útil",     cls: "bg-red-100 text-red-700" },
};

// Un chasis detenido no entra al armado ni cuenta como disponible, pero
// tampoco se borra: sigue en inventario con su historia.
export const CHASIS_DETENIDO = ["en_revision", "garantia", "no_util"] as const;
export const chasisDetenido = (estatus?: string | null) =>
  !!estatus && (CHASIS_DETENIDO as readonly string[]).includes(estatus);

// Una unidad sólo cierra proceso (armado, entrega, asignación) con los dos
// seriales capturados. Mismo criterio que el trigger de la base.
export const NS_REGEX = /^[A-Z0-9-]{4,30}$/;
export const serialesCompletos = (m: any) =>
  !!(m?.ns_chasis && String(m.ns_chasis).trim() && m?.ns_motor && String(m.ns_motor).trim());

// ── Capacidad de color ──────────────────────────────────────────────────────
// El VIN puede decir que un chasis es BLANCO y fábrica armarlo AZUL: eso está
// bien. Lo que no puede pasar es que existan más unidades de un color que
// juegos de piezas de ese color llegaron. La capacidad se lleva por
// (modelo de fábrica, color) — una cabina de 200cc no va en un 300cc.
export type CapacidadColor = { juegos: number; usados: number; libres: number };

// Ojo: `claveCapacidad` va por CÓDIGO DE FÁBRICA (DZ200Q1) porque los juegos
// de piezas son por modelo de fábrica. `claveStock`, más abajo, va por NOMBRE
// COMERCIAL ("200cc 2026") porque es lo que captura la remisión. No son
// intercambiables.
export const claveCapacidad = (modelo: string, color: string) =>
  `${modelo}__${normColor(color)}`;

// ── Cuando la base va atrás del código ──────────────────────────────────────
// Los scripts de supabase/migrations/ se aplican a mano en el SQL editor de
// Supabase; no hay tabla de migraciones que diga cuáles corrieron. Si uno se
// quedó sin aplicar, la app le pide a la base una columna que no existe y
// Postgres contesta 42703: «column inventario_chasis.color_original does not
// exist». Ese texto no le dice a nadie qué hacer, y el hueco se ve como si se
// hubiera perdido la información. Esto lo traduce al archivo que falta correr.
// Se recorre en orden: la primera que casa gana, así que lo específico va
// arriba. Ojo con `nombre_comercial`: existe en `modelos_producto` (KIT-3) y
// también en `inventario_colores` (KIT-4), y son scripts distintos.
const SCRIPT_DE_OBJETO: Array<[RegExp, string]> = [
  [/remisiones_bitacora|puede_editar_remision|puede_capturar_remision|rol_comercial|orden_linea/,
    "20260902000001_operador_edita_remisiones.sql"],
  // Los clientes se vieron «sin resultados» en producción por esto: la lista
  // pedía `clientes.folio_interno` en una base donde el script no se corrió.
  [/folio_interno|generar_folio_interno_cliente|clientes_folio_interno_seq/,
    "20260827000001_folio_interno_clientes_nuevos.sql"],
  [/color_original|piezas_recibidas|piezas_extra|juegos_usados|bitacora_color|capacidad_color|cambiar_color_chasis|intercambiar_color_chasis/,
    "20260823000003_color_efectivo_capacidad.sql"],
  // El script nuevo trae la función completa, así que es el que hay que correr
  // si no está: el viejo la dejaría sin el color declarado por fábrica.
  [/carga_ya_armado|limite_ya_armados|v_carga_ya_armados/,
    "20260908000002_tope_unidades_ya_armadas.sql"],
  [/crm_actividades_tipo_check/,
    "20260908000003_crm_tipos_actividad.sql"],
  [/record "new" has no field "cantidad_disponible"|impedir_inventario_negativo/,
    "20260925000005_inventario_trigger_sin_campo_ajeno.sql"],
  [/motivo_cancelacion|cancelada_at/,
    "20260925000004_remision_refacciones_canceladas.sql"],
  [/forma_pago|descuento_pct|remisiones_refacciones_forma_pago/,
    "20260925000003_remision_refacciones_pago_descuento.sql"],
  [/v_almacen_refacciones\.stock_bloqueado|v_almacen_refacciones\.stock_disponible/,
    "20260925000002_vista_refacciones_stock.sql"],
  [/avisar_faltante_refaccion|actualizar_envio_remision_refaccion|registrar_guia_remision_refaccion|entregar_remision_refaccion|marcar_pago_remision_refaccion|puede_operar_logistica_refacciones|puede_marcar_pago_refacciones|impedir_inventario_negativo|tipo_envio|direccion_entrega/,
    "20260925000001_remision_refacciones_seguimiento.sql"],
  [/stock_bloqueado_producto|stock_disponible|remisiones_refacciones|remision_refaccion_|crear_remision_refacciones|liberar_refaccion_remision|reportar_faltante_refaccion|confirmar_sin_existencia_refaccion|cancelar_linea_refaccion|cancelar_remision_refacciones|puede_capturar_refacciones|puede_operar_almacen_refacciones|puede_leer_remision_refaccion|recalcular_etapa_remision_refaccion/,
    "20260923000001_remisiones_refacciones.sql"],
  [/sincronizar_compat_refacciones/,
    "20260922000002_sincronizar_compat_refacciones.sql"],
  [/almacen_refacciones|importar_almacen_refacciones|puede_ver_almacen_refacciones|v_almacen_refacciones/,
    "20260922000001_almacen_refacciones.sql"],
  [/es_compras|es_compras_admin/,
    "20260922000004_area_compras.sql"],
  [/crear_motocarro_ya_armado/,
    "20260908000002_tope_unidades_ya_armadas.sql"],
  [/asignar_motocarro_a_remision|desasignar_motocarro_de_remision/,
    "20260826000003_asignacion_manual_remisiones.sql"],
  [/folio_interno|clientes_folio_interno_seq|generar_folio_interno_cliente|trg_clientes_folio_interno/,
    "20260827000001_folio_interno_clientes_nuevos.sql"],
  [/capturar_seriales_unidad/,
    "20260823000002_capturar_seriales_unidad.sql"],
  [/inventario_colores\.nombre_comercial|incidencia_chasis|piezas_total|piezas_en_revision|piezas_garantia|piezas_no_util|recalculado_at|asignar_remision_items|crementar_inventario_color/,
    "20260823000001_incidencias_chasis_colores_cierre.sql"],
  [/modelos_producto|bitacora_orden_armado|nombre_comercial|configurar_unidad|desconfigurar_unidad|cambiar_orden_armado|importar_vins_inventario|importar_motores_inventario/,
    "20260822000001_configuracion_manual_unidades.sql"],
  [/historial_conexiones|registrar_conexion/,
    "20260929000001_historial_conexiones.sql"],
  [/bitacora_eliminaciones/,
    "20260819000010_bitacora_eliminaciones.sql"],
  [/usuario_activo/,
    "20260824000003_usuario_activo_se_aplica.sql"],
  [/asignar_motocarro_a_remision|desasignar_motocarro_de_remision/,
    "20260826000003_asignacion_manual_remisiones.sql"],
  // El expediente del cliente (comentarios y bitácora) vive en su propio
  // script; sin él la ficha abre pero las pestañas salen vacías.
  [/clientes_comentarios|clientes_bitacora/,
    "20260819000011_clientes_crm.sql"],
  [/importar_packing_list/,
    "20260819000009_importar_packing_list.sql"],
  [/proponer_fecha_entrega|confirmar_fecha_entrega/,
    "20260503192333_cb78101f-581a-4ca7-ba6c-2917c43edb25.sql"],
  [/recibir_contenedor/,
    "20260503193601_1f2d647e-2717-44a2-a009-d1616587e0ac.sql"],
  // Las solicitudes cuelgan de la misma tabla `avisos`, así que lo específico
  // va primero: sin 20260904000001 la tabla existe pero sin esas columnas.
  [/responder_solicitud|requiere_respuesta|usuario_destino/,
    "20260904000001_solicitudes_a_fabrica.sql"],
  [/ajustar_unidades_remision|recibe_avisos_de|\bavisos\b/,
    "20260903000001_avisos_entre_areas.sql"],
  [/cliente_tiene_cxc_vencidas|cxc_vencidas_resumen|cliente_tiene_credito/,
    "20260925190000_modulo_credito_cxc.sql"],
];

/**
 * Mensaje de error para el usuario. Si la base viene atrás del código, dice
 * qué script hay que correr en vez de repetir el error crudo de Postgres.
 */
export function explicarError(e: unknown, fallback: string): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const crudo = err.message ?? "";
  // 42703 = undefined_column, 42P01 = undefined_table, 42883 = undefined_function.
  if (["42703", "42P01", "42883"].includes(err.code ?? "")) {
    const script = SCRIPT_DE_OBJETO.find(([re]) => re.test(crudo))?.[1];
    return script
      ? `La base de datos va atrás del sistema: falta correr supabase/migrations/${script} en el SQL editor de Supabase. (${crudo})`
      : `La base de datos va atrás del sistema. Corre supabase/diagnostico_esquema.sql en el SQL editor para ver qué script falta. (${crudo})`;
  }
  return crudo || fallback;
}

// ── Disponibilidad por color ────────────────────────────────────────────────
// El color es un factor propio, independiente del orden de armado: lo que
// limita cuántos motocarros de un color se pueden prometer no es qué chasis se
// armó primero, sino cuántas unidades y cuántas piezas de ESE color hay, menos
// lo que ya está comprometido en otras remisiones abiertas.
export type StockColor = {
  /** Lo que todavía se puede prometer: unidades libres + piezas − demanda ya comprometida. */
  disponibles: number;
  /** Ya armadas, con los dos seriales y sin incidencia. */
  unidadesLibres: number;
  /** Chasis de ese color todavía sin configurar. */
  piezasDisponibles: number;
  /** Pedido en otras remisiones NUEVA/PARCIAL que aún no tiene unidad asignada. */
  demandaPendiente: number;
};

/**
 * Llave por **modelo comercial** + color. La vista `v_stock_modelo_color`
 * agrega por nombre comercial ("200cc 2026"), no por código de fábrica
 * (DZ200Q1), que es lo que la remisión captura.
 */
export const normModelo = (modelo?: string | null) => (modelo ?? "").trim().toUpperCase();

export const claveStock = (modelo: string, color: string) =>
  `${normModelo(modelo)}__${normColor(color)}`;

/**
 * Cuántas unidades de (modelo, color) le quedan a la línea `idx` de una orden.
 *
 * Al inventario disponible se le resta lo que YA se apartó en las otras líneas
 * de la misma remisión: si el motocarro 1 pide 3 blancos, el selector del
 * motocarro 2 debe mostrar 3 menos. La propia línea no se descuenta a sí misma
 * — si no, el color que acaba de elegir aparecería agotado por su propia
 * reserva.
 *
 * `null` cuando no hay dato de ese color: sin información no se inventa un
 * número ni se estorba la captura.
 */
export function disponiblesEnOrden(
  stock: StockColor | undefined,
  lineas: readonly { modelo: string; color: string; cantidad: number }[],
  idx: number,
): number | null {
  if (!stock) return null;
  const linea = lineas[idx];
  if (!linea) return null;
  const apartadas = lineas.reduce((suma, l, i) =>
    i !== idx && normModelo(l.modelo) === normModelo(linea.modelo)
      && normColor(l.color) === normColor(linea.color)
      ? suma + Number(l.cantidad || 0)
      : suma, 0);
  return stock.disponibles - apartadas;
}
