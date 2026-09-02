/**
 * Catálogo de clientes — una sola forma de leerlo.
 * ───────────────────────────────────────────────────────────────────────────
 * Los clientes desaparecieron de producción dos veces por la misma razón, y
 * las dos veces se vio igual: la pantalla decía «Sin resultados», como si la
 * empresa no tuviera clientes.
 *
 *  1. El `order` de dos columnas. `.order("folio_interno, codigo_erp")` viaja
 *     como `order=folio_interno, codigo_erp.asc`; PostgREST no puede leer el
 *     segundo término y responde 400. Ya está corregido: van encadenados.
 *  2. `folio_interno` todavía no existe en la base. Los scripts de
 *     `supabase/migrations/` se aplican A MANO en el SQL editor y no hay tabla
 *     de migraciones: si 20260827000001 no se corrió, pedir esa columna —en el
 *     `select` o en el `order`— devuelve 42703 y la lista llega vacía.
 *
 * Lo que convirtió un error de la base en «no hay clientes» fue el silencio:
 * `const [{ data: cs }] = await Promise.all([...])` tira el `error` a la
 * basura y `data` viene `null`. Aquí no se descarta nunca: si la base va
 * atrás se reintenta sin `folio_interno` (el catálogo viejo sigue sirviendo
 * para trabajar), y si de plano no se pudo leer, el error se devuelve para
 * que la pantalla lo diga en vez de fingir una lista vacía.
 *
 * Lo usan Clientes y el selector de Remisiones. Es a propósito: eran dos
 * implementaciones distintas del mismo catálogo y sólo una tenía respaldo.
 */

/** Error tal como lo devuelve supabase-js (`PostgrestError`), o nada. */
export type ErrorBase = { code?: string; message?: string } | null | undefined;

/** Un cliente del catálogo. Las pantallas piden distintas columnas. */
export interface ClienteCatalogo {
  id: string;
  codigo_erp?: string | null;
  folio_interno?: string | null;
  nombre_comercial?: string | null;
  [columna: string]: unknown;
}

/**
 * Lo que contesta una consulta a Supabase.
 *
 * `data` va como `unknown` a propósito: cada pantalla pide columnas distintas
 * —y Remisiones las arma en una cadena que se decide en tiempo de ejecución—,
 * así que el tipo que infiere `supabase-js` no es el mismo en las dos. Aquí se
 * valida que sea un arreglo antes de usarlo, que es lo que importa.
 */
export interface RespuestaCatalogo {
  data: unknown;
  error: ErrorBase;
}

/**
 * Lector inyectable del catálogo. Recibe si la base puede con `folio_interno`
 * y devuelve la consulta correspondiente; así cada pantalla pide las columnas
 * que necesita y esta función se puede probar sin base de datos.
 */
export type LeerClientes = (conFolioInterno: boolean) => PromiseLike<RespuestaCatalogo>;

/** `data` de PostgREST convertido a filas. Nunca `null`, nunca un no-arreglo. */
const filas = (data: unknown): ClienteCatalogo[] =>
  Array.isArray(data) ? (data as ClienteCatalogo[]) : [];

export interface CargaClientes {
  /** Los clientes leídos. Vacío sólo si de verdad no hay o no se pudo leer. */
  clientes: ClienteCatalogo[];
  /**
   * Se leyó sin `folio_interno` porque la base va atrás. La pantalla funciona,
   * pero los clientes nuevos se ven sin folio: hay que correr 20260827000001.
   */
  degradado: boolean;
  /** Nada se pudo leer. Con esto la pantalla avisa en vez de quedarse vacía. */
  error: ErrorBase;
}

/** Script que hay que correr cuando la base no tiene `folio_interno`. */
export const SCRIPT_FOLIO_INTERNO = "20260827000001_folio_interno_clientes_nuevos.sql";

/**
 * ¿El error es «esta base no conoce folio_interno»?
 *
 * 42703 es `undefined_column` y es lo que contesta Postgres tanto si la
 * columna se pidió en el `select` como en el `order`. El texto se revisa
 * aparte porque PostgREST no siempre propaga el `code` (una URL mal armada
 * sale como 400 sin código), y ahí el nombre de la columna es la única pista.
 */
export function faltaFolioInterno(error: ErrorBase): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return (error.message ?? "").toLowerCase().includes("folio_interno");
}

/**
 * Lee el catálogo de clientes, con respaldo si la base va atrás del código.
 *
 * Nunca lanza: devuelve `error` para que quien la llame decida cómo avisar.
 * El respaldo se intenta SÓLO cuando el problema es `folio_interno`; un error
 * de permisos o de red no se reintenta, se reporta tal cual.
 */
export async function cargarCatalogoClientes(leer: LeerClientes): Promise<CargaClientes> {
  const conFolio = await leer(true);
  if (!conFolio.error) {
    return { clientes: filas(conFolio.data), degradado: false, error: null };
  }

  if (!faltaFolioInterno(conFolio.error)) {
    return { clientes: [], degradado: false, error: conFolio.error };
  }

  const sinFolio = await leer(false);
  if (!sinFolio.error) {
    return { clientes: filas(sinFolio.data), degradado: true, error: null };
  }
  return { clientes: [], degradado: false, error: sinFolio.error };
}

/**
 * Código con el que el negocio identifica a un cliente.
 *
 * Los clientes migrados del ERP traen `codigo_erp` (R195, J494); los dados de
 * alta en este sistema traen `folio_interno` (CLI-2026-007). Nunca los dos, y
 * en una base sin 20260827000001 nunca `folio_interno`.
 */
export const codigoCliente = (c: ClienteCatalogo | null | undefined): string =>
  (c?.folio_interno as string) || (c?.codigo_erp as string) || "—";

/** Etiqueta para selectores y tarjetas: código y, si lo hay, nombre comercial. */
export const etiquetaCliente = (c: ClienteCatalogo | null | undefined): string => {
  const nombre = c?.nombre_comercial as string | null | undefined;
  return `${codigoCliente(c)}${nombre ? ` — ${nombre}` : ""}`;
};
