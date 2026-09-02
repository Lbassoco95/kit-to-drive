/**
 * Edición de remisiones ya capturadas — y su complemento.
 * ───────────────────────────────────────────────────────────────────────────
 * Una remisión se guarda en dos piezas: el encabezado (`remisiones`) y sus
 * renglones (`remision_items`). Los renglones no son una lista plana: cada
 * motocarro es un renglón y sus servicios (cabina, instalación, activación)
 * son renglones aparte que le cuelgan; el flete es uno solo para toda la orden.
 *
 * Al capturar, esa jerarquía quedaba implícita en el ORDEN de inserción, y así
 * la leía la tarjeta de la bandeja. Eso se rompe en cuanto se edita: si a la
 * línea 1 se le agrega una cabina después de haber capturado la línea 2, el
 * renglón nuevo llega al final y la cabina se vería colgada de la línea
 * equivocada. Por eso `remision_items.orden_linea` guarda a qué línea pertenece
 * cada renglón (ver la migración 20260902000001). Para las remisiones viejas,
 * que no lo traen, se sigue usando la posición como respaldo.
 *
 * Aquí vive sólo la parte que se puede probar sin base de datos: reconstruir el
 * formulario desde los renglones guardados, y calcular qué se inserta, qué se
 * actualiza y qué se borra al guardar los cambios.
 */

/** Servicios que cuelgan de un motocarro, en el orden en que se capturan. */
export const SERVICIOS_MOTO = ["cabina", "instalacion_cabina", "activacion"] as const;
export type ServicioMoto = (typeof SERVICIOS_MOTO)[number];

/** Bandera del formulario que prende cada servicio. */
export const BANDERA_SERVICIO: Record<ServicioMoto, "con_cabina" | "con_instalacion" | "con_activacion"> = {
  cabina: "con_cabina",
  instalacion_cabina: "con_instalacion",
  activacion: "con_activacion",
};

/** El flete es de toda la orden: se guarda con una línea propia, al final. */
export const ORDEN_FLETE = 999;

/** Caracteres mínimos del motivo con el que se justifica una modificación. */
export const MOTIVO_MIN = 10;

/** ¿El motivo capturado alcanza para dejar constancia de la modificación? */
export const motivoValido = (motivo?: string | null): boolean =>
  (motivo ?? "").trim().length >= MOTIVO_MIN;

/** Motivos de uso frecuente, para no obligar a redactar lo mismo cada vez. */
export const MOTIVOS_EDICION = [
  "Complemento: el cliente agregó unidades o servicios",
  "Corrección de modelo o color",
  "Corrección de cantidad",
  "Cambio de cliente",
  "Corrección del folio",
  "Cambio de tipo de pago",
  "Corrección de la fecha de remisión",
] as const;

export interface RenglonRemision {
  id: string;
  tipo_servicio?: string | null;
  modelo?: string | null;
  color?: string | null;
  cantidad?: number | null;
  con_caja?: boolean | null;
  orden_linea?: number | null;
}

/** Una línea del formulario: un motocarro con sus servicios. */
export interface LineaMoto {
  _key: string;
  /** Renglón `motocarro` que ya existe en la base (vacío si es línea nueva). */
  _itemId?: string | null;
  /** Renglones de servicio que ya existen, por tipo. */
  _svcIds?: Partial<Record<ServicioMoto, string>>;
  modelo: string;
  color: string;
  cantidad: number;
  con_caja: boolean;
  con_cabina: boolean;
  con_instalacion: boolean;
  con_activacion: boolean;
}

/**
 * Aplica un cambio a una línea respetando las reglas del pedido.
 *
 * La instalación de cabina no se puede vender sin la caja montada: prenderla
 * prende la caja, apagarla la apaga, y mientras esté prendida la caja no se
 * puede desmarcar. Vive aquí para que capturar y editar se comporten igual.
 */
export function aplicarCambioMoto<T extends LineaMoto>(linea: T, campo: keyof LineaMoto, valor: unknown): T {
  const siguiente = { ...linea, [campo]: valor } as T;
  if (campo === "con_instalacion") siguiente.con_caja = valor === true;
  if (campo === "con_caja" && valor === false && linea.con_instalacion) siguiente.con_caja = true;
  return siguiente;
}

export interface AgrupadoRemision {
  lineas: LineaMoto[];
  conFlete: boolean;
  fleteId: string | null;
  /**
   * Renglones que no se pudieron colgar de ninguna línea (servicios sin su
   * motocarro, de una captura vieja). No se editan ni se borran: se respetan.
   */
  sueltos: RenglonRemision[];
}

const nuevaClave = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `linea-${Math.random().toString(36).slice(2)}`;

const lineaVacia = (modelo: string, color: string): LineaMoto => ({
  _key: nuevaClave(),
  _svcIds: {},
  modelo,
  color,
  cantidad: 1,
  con_caja: false,
  con_cabina: false,
  con_instalacion: false,
  con_activacion: false,
});

/**
 * Reconstruye las líneas del formulario a partir de los renglones guardados.
 *
 * Si todos los renglones traen `orden_linea` se agrupa por ahí (determinista,
 * sin importar en qué orden los devuelva la base). Si alguno no lo trae —
 * remisiones capturadas antes de la migración — se cae al criterio viejo: un
 * renglón `motocarro` abre línea y los servicios que le siguen son suyos.
 */
export function agruparRenglones(
  renglones: RenglonRemision[],
  { modeloPorDefecto = "", colorPorDefecto = "BLANCO" } = {},
): AgrupadoRemision {
  const flete = renglones.find(r => r.tipo_servicio === "flete") ?? null;
  const cuerpo = renglones.filter(r => r.tipo_servicio !== "flete");

  const desdeRenglon = (moto: RenglonRemision): LineaMoto => ({
    ...lineaVacia(moto.modelo || modeloPorDefecto, moto.color || colorPorDefecto),
    _itemId: moto.id,
    cantidad: Math.max(1, Number(moto.cantidad) || 1),
    con_caja: !!moto.con_caja,
  });

  const colgar = (linea: LineaMoto, servicio: RenglonRemision) => {
    const tipo = servicio.tipo_servicio as ServicioMoto;
    if (!SERVICIOS_MOTO.includes(tipo)) return false;
    linea._svcIds = { ...linea._svcIds, [tipo]: servicio.id };
    linea[BANDERA_SERVICIO[tipo]] = true;
    // Instalación de cabina implica caja montada, igual que en la captura.
    if (tipo === "instalacion_cabina") linea.con_caja = true;
    return true;
  };

  const lineas: LineaMoto[] = [];
  const sueltos: RenglonRemision[] = [];

  const todosConOrden = cuerpo.length > 0 && cuerpo.every(r => r.orden_linea != null);
  if (todosConOrden) {
    const grupos = new Map<number, RenglonRemision[]>();
    for (const r of cuerpo) {
      const k = Number(r.orden_linea);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(r);
    }
    for (const k of [...grupos.keys()].sort((a, b) => a - b)) {
      const grupo = grupos.get(k)!;
      const moto = grupo.find(r => r.tipo_servicio === "motocarro");
      if (!moto) { sueltos.push(...grupo); continue; }
      const linea = desdeRenglon(moto);
      for (const r of grupo) {
        if (r.id === moto.id) continue;
        if (!colgar(linea, r)) sueltos.push(r);
      }
      lineas.push(linea);
    }
  } else {
    for (const r of cuerpo) {
      if (r.tipo_servicio === "motocarro") { lineas.push(desdeRenglon(r)); continue; }
      const actual = lineas[lineas.length - 1];
      if (!actual || !colgar(actual, r)) sueltos.push(r);
    }
  }

  return { lineas, conFlete: !!flete, fleteId: flete?.id ?? null, sueltos };
}

export interface RenglonNuevo {
  remision_id: string;
  tipo_servicio: string;
  modelo: string | null;
  color: string | null;
  cantidad: number;
  con_caja: boolean;
  orden_linea: number;
}

export interface RenglonCambio {
  id: string;
  cambios: {
    modelo: string | null;
    color: string | null;
    cantidad: number;
    con_caja: boolean;
    orden_linea: number;
  };
}

export interface PlanEdicion {
  inserts: RenglonNuevo[];
  updates: RenglonCambio[];
  deleteIds: string[];
  /** Suma de unidades pedidas — va al encabezado de la remisión. */
  totalUnidades: number;
}

/**
 * Qué hay que escribir para que los renglones guardados queden como el
 * formulario.
 *
 * Sólo se borra lo que el formulario conoce: los ids que venían de esta misma
 * remisión y que el usuario quitó. Un renglón que el formulario no pudo
 * reconstruir (`sueltos`) nunca entra a `deleteIds` — es mejor dejar un dato de
 * más que perderlo.
 */
export function planEditarRenglones(
  remisionId: string,
  lineas: LineaMoto[],
  conFlete: boolean,
  renglonesOriginales: RenglonRemision[],
): PlanEdicion {
  const original = agruparRenglones(renglonesOriginales);

  const inserts: RenglonNuevo[] = [];
  const updates: RenglonCambio[] = [];
  const deleteIds: string[] = [];

  // Todo lo que el formulario sigue trayendo puesto — lo que no esté aquí y sí
  // estaba en la remisión es una baja.
  const vigentes = new Set<string>();
  for (const l of lineas) {
    if (l._itemId) vigentes.add(l._itemId);
    for (const tipo of SERVICIOS_MOTO) {
      const id = l._svcIds?.[tipo];
      if (id && l[BANDERA_SERVICIO[tipo]]) vigentes.add(id);
    }
  }

  let totalUnidades = 0;

  lineas.forEach((l, idx) => {
    const cantidad = Math.max(1, Number(l.cantidad) || 1);
    totalUnidades += cantidad;

    if (l._itemId) {
      updates.push({
        id: l._itemId,
        cambios: { modelo: l.modelo, color: l.color, cantidad, con_caja: !!l.con_caja, orden_linea: idx },
      });
    } else {
      inserts.push({
        remision_id: remisionId, tipo_servicio: "motocarro",
        modelo: l.modelo, color: l.color, cantidad, con_caja: !!l.con_caja, orden_linea: idx,
      });
    }

    for (const tipo of SERVICIOS_MOTO) {
      const id = l._svcIds?.[tipo];
      const prendido = !!l[BANDERA_SERVICIO[tipo]];
      // La cabina se cotiza contra el modelo del motocarro; los demás servicios
      // no llevan modelo ni color, igual que al capturar.
      const modelo = tipo === "cabina" ? l.modelo : null;

      if (prendido && id) {
        updates.push({ id, cambios: { modelo, color: null, cantidad, con_caja: false, orden_linea: idx } });
      } else if (prendido) {
        inserts.push({
          remision_id: remisionId, tipo_servicio: tipo,
          modelo, color: null, cantidad, con_caja: false, orden_linea: idx,
        });
      } else if (id) {
        deleteIds.push(id);
      }
    }
  });

  // Líneas que el usuario quitó por completo.
  for (const l of original.lineas) {
    const ids = [l._itemId, ...Object.values(l._svcIds ?? {})].filter(Boolean) as string[];
    for (const id of ids) if (!vigentes.has(id)) deleteIds.push(id);
  }

  // Flete: se prende y se apaga como un renglón suelto de toda la orden.
  if (conFlete && !original.fleteId) {
    inserts.push({
      remision_id: remisionId, tipo_servicio: "flete",
      modelo: null, color: null, cantidad: 1, con_caja: false, orden_linea: ORDEN_FLETE,
    });
  } else if (!conFlete && original.fleteId) {
    deleteIds.push(original.fleteId);
  }

  return { inserts, updates, deleteIds: [...new Set(deleteIds)], totalUnidades };
}

/* ──────────────────────────────────────────────────────────────────────────
   Existencia: no comprometer lo que no hay
   ────────────────────────────────────────────────────────────────────────── */

/** Una línea que pide más unidades de las que quedan de ese color. */
export interface Faltante {
  indice: number;
  modelo: string;
  color: string;
  piden: number;
  /** Lo que queda de ese (modelo, color) una vez descontado el resto del pedido. */
  hay: number;
}

/**
 * Qué líneas del pedido no alcanzan con el inventario.
 *
 * `disponibles` devuelve `null` cuando no hay dato de ese (modelo, color): eso
 * NO es cero. Sin información no se bloquea la captura — inventar un cero
 * pararía la venta por un color que nunca se dio de alta en el catálogo.
 */
export function faltantesDeExistencia(
  lineas: readonly { modelo: string; color: string; cantidad: number }[],
  disponibles: (indice: number, modelo: string, color: string) => number | null,
): Faltante[] {
  const faltantes: Faltante[] = [];
  lineas.forEach((l, indice) => {
    const hay = disponibles(indice, l.modelo, l.color);
    if (hay === null) return;
    const piden = Math.max(1, Number(l.cantidad) || 1);
    if (piden > hay) faltantes.push({ indice, modelo: l.modelo, color: l.color, piden, hay: Math.max(0, hay) });
  });
  return faltantes;
}

/** Lo que se le dice a quien captura cuando no alcanza el inventario. */
export function mensajeFaltantes(
  faltantes: Faltante[],
  etiquetaColor: (c: string) => string = c => c,
): string {
  if (!faltantes.length) return "";

  const frase = (f: Faltante) =>
    f.hay <= 0
      ? `ya no hay existencia de ${etiquetaColor(f.color)} (${f.modelo}) y estás pidiendo ${f.piden}`
      : `estás pidiendo ${f.piden} de ${etiquetaColor(f.color)} (${f.modelo}) y sólo hay ${f.hay}`;

  if (faltantes.length === 1) {
    const t = frase(faltantes[0]);
    return t.charAt(0).toUpperCase() + t.slice(1) + ".";
  }
  return `No alcanza el inventario: ${faltantes.map(frase).join(" · ")}.`;
}

/** Resumen legible de lo que cambió, para guardarlo junto al motivo. */
export function describirCambios(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  campos: string[],
): { campo: string; antes: unknown; despues: unknown }[] {
  return campos
    .filter(c => (antes?.[c] ?? null) !== (despues?.[c] ?? null))
    .map(c => ({ campo: c, antes: antes?.[c] ?? null, despues: despues?.[c] ?? null }));
}
