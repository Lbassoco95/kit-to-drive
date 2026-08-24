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

export const claveCapacidad = (modelo: string, color: string) =>
  `${modelo}__${normColor(color)}`;
