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
 * También se puede vender la cabina sola, sin motocarro. Esa remisión no tiene
 * renglón `motocarro`: la línea ES la cabina y, si acaso, le cuelgan instalación,
 * activación y el flete de la orden. No compromete chasis.
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
  /**
   * Venta de cabina sin motocarro. No hay renglón `motocarro`: el id de la
   * cabina vive en `_svcIds.cabina`.
   */
  solo_cabina?: boolean;
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
  // Sin motocarro no hay caja que montar: la instalación es un servicio de la cabina.
  if (siguiente.solo_cabina) {
    siguiente.con_cabina = true;
    siguiente.con_caja = false;
    return siguiente;
  }
  if (campo === "con_instalacion") siguiente.con_caja = valor === true;
  if (campo === "con_caja" && valor === false && linea.con_instalacion) siguiente.con_caja = true;
  return siguiente;
}

/** La remisión vende cabinas y no trae ningún motocarro. */
export function remisionEsSoloCabina(
  renglones: readonly { tipo_servicio?: string | null }[],
): boolean {
  let hayCabina = false;
  for (const r of renglones) {
    if (r.tipo_servicio === "motocarro") return false;
    if (r.tipo_servicio === "cabina") hayCabina = true;
  }
  return hayCabina;
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
    // En una venta de sola cabina no hay motocarro ni caja.
    if (tipo === "instalacion_cabina" && !linea.solo_cabina) linea.con_caja = true;
    return true;
  };

  const desdeCabina = (cabina: RenglonRemision): LineaMoto => ({
    ...lineaVacia(cabina.modelo || modeloPorDefecto, cabina.color || colorPorDefecto),
    solo_cabina: true,
    con_cabina: true,
    _svcIds: { cabina: cabina.id },
    cantidad: Math.max(1, Number(cabina.cantidad) || 1),
  });

  const lineas: LineaMoto[] = [];
  const sueltos: RenglonRemision[] = [];
  // Si la remisión SÍ trae motocarros, una cabina sin el suyo sigue siendo un
  // suelto (dato viejo que no se debe borrar). Si no trae ninguno, cada cabina
  // es una línea de venta por sí misma.
  const hayMotocarro = cuerpo.some(r => r.tipo_servicio === "motocarro");

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
      const cabina = grupo.find(r => r.tipo_servicio === "cabina");
      const ancla = moto ?? (!hayMotocarro ? cabina : undefined);
      if (!ancla) { sueltos.push(...grupo); continue; }
      const linea = moto ? desdeRenglon(moto) : desdeCabina(cabina!);
      for (const r of grupo) {
        if (r.id === ancla.id) continue;
        if (!colgar(linea, r)) sueltos.push(r);
      }
      lineas.push(linea);
    }
  } else if (!hayMotocarro) {
    for (const r of cuerpo) {
      if (r.tipo_servicio === "cabina") { lineas.push(desdeCabina(r)); continue; }
      const actual = lineas[lineas.length - 1];
      if (!actual || !colgar(actual, r)) sueltos.push(r);
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
  /** Suma de motocarros pedidos — va al encabezado. Cero si es solo cabina. */
  totalUnidades: number;
  /** Cabinas vendidas sin motocarro. */
  totalCabinas: number;
  /** Todas las líneas son venta de cabina, sin motocarro. */
  soloCabina: boolean;
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
      const prendido = (!!l.solo_cabina && tipo === "cabina") || !!l[BANDERA_SERVICIO[tipo]];
      if (id && prendido) vigentes.add(id);
    }
  }

  let totalUnidades = 0;
  let totalCabinas = 0;

  lineas.forEach((l, idx) => {
    const cantidad = Math.max(1, Number(l.cantidad) || 1);
    const solo = !!l.solo_cabina;

    if (solo) {
      totalCabinas += cantidad;
    } else {
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
    }

    for (const tipo of SERVICIOS_MOTO) {
      const id = l._svcIds?.[tipo];
      // En sola cabina la línea misma es el renglón `cabina`, aunque la bandera
      // no viniera prendida.
      const prendido = (solo && tipo === "cabina") || !!l[BANDERA_SERVICIO[tipo]];
      // La cabina se cotiza contra el modelo; los demás servicios no llevan
      // modelo ni color, igual que al capturar.
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

  return {
    inserts, updates, deleteIds: [...new Set(deleteIds)],
    totalUnidades, totalCabinas,
    soloCabina: lineas.length > 0 && lineas.every(l => !!l.solo_cabina),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Bajar el total: qué se suelta, qué se pide y qué no se puede
   ────────────────────────────────────────────────────────────────────────── */

/** Lo mínimo que hace falta saber de una unidad para decidir si se puede soltar. */
export interface UnidadAsignada {
  estatus_armado?: string | null;
  estatus_entrega?: string | null;
}

export interface RepartoAlBajar {
  asignadas: number;
  /** Sobran y todavía no se tocan: se sueltan solas. */
  liberables: number;
  /** Sobran pero Fábrica ya empezó: hay que pedírselas. */
  porPedir: number;
  /** Sobran y ya salieron del almacén: no hay forma. */
  imposible: number;
  /** Del total asignado, cuántas van en armado o ya salieron. Para explicar. */
  enArmado: number;
  yaSalieron: number;
}

/** Una unidad que ya salió del almacén no vuelve desde una pantalla. */
const salioDelAlmacen = (u: UnidadAsignada) =>
  ["ENTREGADA", "EN_RUTA"].includes(u?.estatus_entrega ?? "");

/**
 * `PENDIENTE` es lo único que la base guarda como «todavía no se toca»:
 * `ATRASADO` nunca se escribe, se calcula en pantalla para lo vencido. Desde
 * `EN_PROCESO` ya hay trabajo de Fábrica encima.
 */
const yaEntroAArmado = (u: UnidadAsignada) =>
  !salioDelAlmacen(u) && (u?.estatus_armado ?? "PENDIENTE") !== "PENDIENTE";

/**
 * Qué pasa con las unidades asignadas si el pedido baja a `objetivo`.
 *
 * Es el mismo reparto que hace `ajustar_unidades_remision()` en la base: se
 * calcula también aquí para poder decirlo ANTES de guardar, en vez de que la
 * persona se entere por el resultado.
 */
export function repartoAlBajar(unidades: readonly UnidadAsignada[], objetivo: number): RepartoAlBajar {
  const asignadas  = unidades.length;
  const enArmado   = unidades.filter(yaEntroAArmado).length;
  const yaSalieron = unidades.filter(salioDelAlmacen).length;
  const base = { asignadas, liberables: 0, porPedir: 0, imposible: 0, enArmado, yaSalieron };

  let sobran = asignadas - Math.max(0, objetivo);
  if (sobran <= 0) return base;

  const sinEmpezar = asignadas - enArmado - yaSalieron;

  const liberables = Math.min(sobran, sinEmpezar);
  sobran -= liberables;
  const porPedir = Math.min(sobran, enArmado);
  sobran -= porPedir;

  return { ...base, liberables, porPedir, imposible: sobran };
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

/**
 * Textos del aviso de inventario insuficiente. La pantalla pasa
 * `t.remisiones.faltantes`; el default en español conserva el contrato para
 * quien la llame sin idioma (y para las pruebas).
 */
export interface MensajesFaltantes {
  sinExistencia: (color: string, modelo: string, piden: number) => string;
  pidesDe: (piden: number, color: string, modelo: string, hay: number) => string;
  noAlcanza: (lista: string) => string;
}

export const MENSAJES_FALTANTES_ES: MensajesFaltantes = {
  sinExistencia: (color, modelo, piden) =>
    `ya no hay existencia de ${color} (${modelo}) y estás pidiendo ${piden}`,
  pidesDe: (piden, color, modelo, hay) =>
    `estás pidiendo ${piden} de ${color} (${modelo}) y sólo hay ${hay}`,
  noAlcanza: (lista) => `No alcanza el inventario: ${lista}.`,
};

/** Lo que se le dice a quien captura cuando no alcanza el inventario. */
export function mensajeFaltantes(
  faltantes: Faltante[],
  etiquetaColor: (c: string) => string = c => c,
  msgs: MensajesFaltantes = MENSAJES_FALTANTES_ES,
): string {
  if (!faltantes.length) return "";

  const frase = (f: Faltante) =>
    f.hay <= 0
      ? msgs.sinExistencia(etiquetaColor(f.color), f.modelo, f.piden)
      : msgs.pidesDe(f.piden, etiquetaColor(f.color), f.modelo, f.hay);

  if (faltantes.length === 1) {
    const t = frase(faltantes[0]);
    return t.charAt(0).toUpperCase() + t.slice(1) + ".";
  }
  return msgs.noAlcanza(faltantes.map(frase).join(" · "));
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
