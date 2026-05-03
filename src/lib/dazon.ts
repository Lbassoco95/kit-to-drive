export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  fabrica: "Fábrica",
  logistica: "Logística",
  ventas: "Ventas",
};

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

// Normalize color variants → BLANCO | AZUL
export function normColor(c?: string | null): "BLANCO" | "AZUL" | string {
  if (!c) return "—";
  const s = c.toString().toUpperCase().replace(/[^A-Z]/g, "");
  if (s.includes("AZUL")) return "AZUL";
  if (s.includes("BLANC")) return "BLANCO";
  return c;
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
