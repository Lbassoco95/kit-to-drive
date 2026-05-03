export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  fabrica: "Fábrica",
  logistica: "Logística",
  ventas: "Ventas",
};

export const ESTATUS_ARMADO_COLOR: Record<string, string> = {
  PENDIENTE: "bg-muted text-muted-foreground",
  EN_PROCESO: "bg-secondary text-secondary-foreground",
  ARMADO: "bg-success/20 text-success border border-success/30",
  LISTO: "bg-success text-success-foreground",
  ATRASADO: "bg-warning text-warning-foreground",
};

export const ESTATUS_ENTREGA_COLOR: Record<string, string> = {
  NO_APLICA: "bg-muted text-muted-foreground",
  PROGRAMADA: "bg-secondary/20 text-secondary border border-secondary/30",
  EN_RUTA: "bg-warning/30 text-warning border border-warning/40",
  ENTREGADA: "bg-success text-success-foreground",
};

export const ESTATUS_REMISION_COLOR: Record<string, string> = {
  NUEVA: "bg-secondary text-secondary-foreground",
  PARCIAL: "bg-warning text-warning-foreground",
  COMPLETA: "bg-success text-success-foreground",
  CANCELADA: "bg-destructive text-destructive-foreground",
};

export const fmtDate = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
