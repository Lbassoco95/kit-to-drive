/**
 * Modelo de acceso: TIPO DE USUARIO × ÁREA
 * ────────────────────────────────────────────────────────────────────────────
 * Solo existen tres tipos de usuario (niveles):
 *   • operador   — ejecuta el trabajo del día a día de su área
 *   • supervisor — supervisa y corrige todo lo de su área
 *   • admin      — administra su área (incluye alta/baja de usuarios de su área)
 *
 * El área define QUÉ módulos toca; el nivel define QUÉ PUEDE HACER en ellos.
 * Dirección es un área con visibilidad transversal (ve todo); su admin es el
 * administrador global del sistema.
 */

export type Nivel = "operador" | "supervisor" | "admin";
export type Area = "comercial" | "fabrica" | "almacen_logistica" | "administracion" | "direccion";

export const NIVELES: Nivel[] = ["operador", "supervisor", "admin"];
export const AREAS: Area[] = ["comercial", "fabrica", "almacen_logistica", "administracion", "direccion"];

export const NIVEL_LABELS: Record<Nivel, string> = {
  operador: "Operador",
  supervisor: "Supervisor",
  admin: "Administrador",
};

export const NIVEL_DESC: Record<Nivel, string> = {
  operador: "Captura y da seguimiento a su propio trabajo dentro de su área.",
  supervisor: "Ve y corrige todo lo de su área, aprueba y consulta indicadores del equipo.",
  admin: "Control total de su área, incluida la gestión de usuarios de su área.",
};

export const AREA_LABELS: Record<Area, string> = {
  comercial: "Comercial",
  fabrica: "Fábrica",
  almacen_logistica: "Almacén y Logística",
  administracion: "Administración",
  direccion: "Dirección",
};

export const NIVEL_RANK: Record<Nivel, number> = { operador: 1, supervisor: 2, admin: 3 };

export const NIVEL_COLORS: Record<Nivel, string> = {
  operador: "bg-emerald-100 text-emerald-700 border-emerald-200",
  supervisor: "bg-blue-100 text-blue-700 border-blue-200",
  admin: "bg-red-100 text-red-700 border-red-200",
};

export const AREA_COLORS: Record<Area, string> = {
  comercial: "bg-teal-100 text-teal-700 border-teal-200",
  fabrica: "bg-amber-100 text-amber-700 border-amber-200",
  almacen_logistica: "bg-indigo-100 text-indigo-700 border-indigo-200",
  administracion: "bg-violet-100 text-violet-700 border-violet-200",
  direccion: "bg-slate-200 text-slate-700 border-slate-300",
};

/** Módulos de la aplicación sujetos a permiso. */
export type Modulo =
  | "dashboard"
  | "produccion"
  | "inventario"
  | "reportesTurno"
  | "remisiones"
  | "entregas"
  | "misMotocarros"
  | "clientes"
  | "crm"
  | "crmEquipo"
  | "finanzas"
  | "importar"
  | "usuarios"
  | "bitacora"
  | "configuracion";

/**
 * Áreas dueñas de cada módulo y nivel mínimo para entrar.
 * Dirección queda incluida siempre de forma implícita (visibilidad transversal),
 * pero solo su admin puede escribir fuera de Dirección.
 */
export const MODULOS: Record<Modulo, { areas: Area[]; minNivel: Nivel }> = {
  dashboard:     { areas: AREAS,                                                        minNivel: "operador"   },
  produccion:    { areas: ["fabrica", "almacen_logistica", "administracion"],           minNivel: "operador"   },
  inventario:    { areas: ["fabrica", "almacen_logistica", "administracion"],           minNivel: "operador"   },
  reportesTurno: { areas: ["fabrica", "almacen_logistica", "administracion"],           minNivel: "operador"   },
  remisiones:    { areas: ["comercial", "fabrica", "almacen_logistica", "administracion"], minNivel: "operador" },
  entregas:      { areas: ["almacen_logistica", "administracion"],                      minNivel: "operador"   },
  misMotocarros: { areas: ["comercial", "administracion"],                              minNivel: "operador"   },
  clientes:      { areas: ["comercial", "fabrica", "administracion"],                   minNivel: "operador"   },
  crm:           { areas: ["comercial", "administracion"],                              minNivel: "operador"   },
  crmEquipo:     { areas: ["comercial", "administracion"],                              minNivel: "supervisor" },
  finanzas:      { areas: ["administracion"],                                           minNivel: "operador"   },
  importar:      { areas: ["fabrica", "almacen_logistica"],                             minNivel: "admin"      },
  usuarios:      { areas: AREAS.filter(a => a !== "administracion"),                    minNivel: "admin"      },
  bitacora:      { areas: AREAS.filter(a => a !== "administracion"),                    minNivel: "admin"      },
  configuracion: { areas: [],                                                           minNivel: "admin"      },
};

/* ──────────────────────────────────────────────────────────────────────────
   Compatibilidad con el enum `app_role` histórico de la base de datos.
   La columna `role` de `user_roles` se sigue derivando de (área, nivel) para
   que las políticas RLS existentes sigan funcionando sin cambios.
   ────────────────────────────────────────────────────────────────────────── */

export type LegacyRole =
  | "admin" | "fabrica" | "logistica" | "ventas" | "coordinador"
  | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas"
  | "finanzas" | "admin_financiero";

const LEGACY_ROLE: Record<Area, Record<Nivel, LegacyRole>> = {
  comercial:         { operador: "ventas",     supervisor: "coordinador_ventas", admin: "director_ventas"  },
  fabrica:           { operador: "fabrica",    supervisor: "fabrica",            admin: "fabrica"          },
  almacen_logistica: { operador: "logistica",  supervisor: "logistica",          admin: "logistica"        },
  administracion:    { operador: "finanzas",   supervisor: "admin_financiero",   admin: "admin_financiero" },
  // El enum legacy no tenía rol para Dirección sin mando: 'coordinador' es el que
  // daba lectura amplia de operación, así que se reutiliza para eso.
  direccion:         { operador: "coordinador", supervisor: "coordinador",       admin: "admin"            },
};

/** Rol legacy equivalente a un par (área, nivel). */
export const rolLegacy = (area: Area, nivel: Nivel): LegacyRole => LEGACY_ROLE[area][nivel];

/** Traduce un rol legacy al par (área, nivel) — usado para usuarios sin migrar. */
export const desdeRolLegacy = (role?: string | null): { area: Area; nivel: Nivel } => {
  switch (role) {
    case "admin":              return { area: "direccion",         nivel: "admin"      };
    case "director_ventas":    return { area: "comercial",         nivel: "admin"      };
    case "coordinador_ventas":
    case "coordinador":        return { area: "comercial",         nivel: "supervisor" };
    case "ventas":
    case "auxiliar_ventas":    return { area: "comercial",         nivel: "operador"   };
    case "fabrica":            return { area: "fabrica",           nivel: "operador"   };
    case "logistica":          return { area: "almacen_logistica", nivel: "operador"   };
    case "admin_financiero":   return { area: "administracion",    nivel: "admin"      };
    case "finanzas":           return { area: "administracion",    nivel: "operador"   };
    default:                   return { area: "comercial",         nivel: "operador"   };
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   Permisos efectivos
   ────────────────────────────────────────────────────────────────────────── */

export interface Permisos {
  nivel: Nivel;
  area: Area;
  /** admin de Dirección: control total del sistema. */
  esAdminGlobal: boolean;
  /** Cualquier admin: puede dar de alta usuarios (de su área). */
  gestionaUsuarios: boolean;
  /** El módulo pertenece al área del usuario (o es admin global). */
  esAreaPropia: (m: Modulo) => boolean;
  /** Entrar al módulo / verlo en el menú. */
  puedeVer: (m: Modulo) => boolean;
  /** Crear registros propios en el módulo. */
  puedeCrear: (m: Modulo) => boolean;
  /** Editar cualquier registro del módulo (supervisor y admin). */
  puedeEditar: (m: Modulo) => boolean;
  /** Eliminar registros del módulo (solo admin). */
  puedeEliminar: (m: Modulo) => boolean;
  /** Aprobar / autorizar (supervisor y admin). */
  puedeAprobar: (m: Modulo) => boolean;
  /** El operador solo trabaja con sus propios registros. */
  soloPropios: (m: Modulo) => boolean;
  /** Módulo al que se envía al usuario al entrar. */
  inicio: string;
}

/**
 * Pantalla de entrada por área. Fábrica, Almacén y Dirección tienen su propio
 * bloque en el tablero, así que se quedan en él.
 */
const INICIO: Record<Area, string> = {
  comercial: "/crm/oportunidades",
  fabrica: "/",
  almacen_logistica: "/",
  administracion: "/finanzas",
  direccion: "/",
};

export const permisosDe = (area: Area, nivel: Nivel): Permisos => {
  const rank = NIVEL_RANK[nivel];
  const esAdminGlobal = area === "direccion" && nivel === "admin";
  const esAreaPropia = (m: Modulo) => esAdminGlobal || MODULOS[m].areas.includes(area);
  const puedeVer = (m: Modulo) => {
    const def = MODULOS[m];
    if (rank < NIVEL_RANK[def.minNivel]) return false;
    return area === "direccion" || def.areas.includes(area);
  };
  const escribe = (m: Modulo, min: Nivel) => puedeVer(m) && esAreaPropia(m) && rank >= NIVEL_RANK[min];

  return {
    nivel,
    area,
    esAdminGlobal,
    gestionaUsuarios: nivel === "admin",
    esAreaPropia,
    puedeVer,
    puedeCrear:    m => escribe(m, "operador"),
    puedeEditar:   m => escribe(m, "supervisor"),
    puedeEliminar: m => escribe(m, "admin"),
    puedeAprobar:  m => escribe(m, "supervisor"),
    soloPropios:   m => nivel === "operador" && puedeVer(m),
    inicio: INICIO[area],
  };
};

/** Permisos mínimos para un usuario sin nivel/área asignados. */
export const PERMISOS_VACIOS: Permisos = permisosDe("comercial", "operador");
