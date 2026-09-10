/**
 * Leer una tabla completa cuando tiene más de mil renglones.
 * ──────────────────────────────────────────────────────────
 * PostgREST **corta toda respuesta en 1000 filas** (`db-max-rows`, el valor
 * por omisión de Supabase). No es un error: contesta 200, con el encabezado
 * `Content-Range: 0-999/*` y mil renglones. La app hace `data ?? []` y se
 * queda tan tranquila con una lista incompleta.
 *
 * Así desaparecieron los clientes nuevos (2026-09-09): `clientes` llegó a
 * 1784 filas, el catálogo se pedía ordenado por `folio_interno, codigo_erp`,
 * y todo lo que caía después del lugar 1000 —de la J en adelante— dejó de
 * existir para el selector de la remisión. El cliente estaba en la base y se
 * encontraba por código; en la lista, no. Nadie vio un error porque no hubo
 * ninguno.
 *
 * `traerTodo` pide la consulta por tramos de mil hasta que un tramo vuelve
 * corto, que es la señal de que ya no hay más.
 *
 * Dos advertencias para quien lo use:
 *
 *  · **Ordena por algo único al final.** Entre una página y la siguiente son
 *    dos consultas distintas; si el orden empata (varios clientes sin
 *    `folio_interno`, por ejemplo) Postgres puede acomodar los empates de
 *    forma distinta en cada una y un renglón se repetiría o se perdería.
 *    Encadenar `.order("id")` al final rompe todo empate.
 *
 *  · **Si falla, no devuelve lo que alcanzó a juntar.** Media lista se ve
 *    igual que una lista completa y ese es justo el modo de fallar que esto
 *    viene a cerrar: un error se devuelve como error, con `data` en `null`.
 */

/** Lo que PostgREST devuelve como máximo en una sola respuesta. */
export const LIMITE_POSTGREST = 1000;

/**
 * Tope de seguridad: 100 páginas. Si una consulta llegara aquí es que algo
 * anda mal (un orden inestable que nunca acorta la página), y es preferible
 * una lista larga con un aviso en consola que un ciclo infinito en la cara
 * del usuario.
 */
const MAX_PAGINAS = 100;

type Respuesta<T, E> = { data: T[] | null; error: E | null };

/**
 * Corre la consulta por tramos y junta todos los renglones.
 *
 * @param pagina Arma la consulta para un tramo. Recibe los dos extremos, tal
 *               como los quiere `.range(desde, hasta)` de supabase-js (ambos
 *               inclusivos).
 * @param tamano Renglones por tramo. Se puede bajar en las pruebas.
 */
export async function traerTodo<T, E>(
  pagina: (desde: number, hasta: number) => PromiseLike<Respuesta<T, E>>,
  tamano: number = LIMITE_POSTGREST,
): Promise<Respuesta<T, E>> {
  const todo: T[] = [];

  for (let n = 0; n < MAX_PAGINAS; n++) {
    const desde = n * tamano;
    const { data, error } = await pagina(desde, desde + tamano - 1);
    if (error) return { data: null, error };

    const lote = data ?? [];
    todo.push(...lote);
    // Un tramo más corto que el pedido es el final de la tabla.
    if (lote.length < tamano) return { data: todo, error: null };
  }

  console.warn(
    `traerTodo se detuvo en ${MAX_PAGINAS} páginas (${todo.length} renglones). ` +
    "Revisa que la consulta ordene por una columna única al final.",
  );
  return { data: todo, error: null };
}
