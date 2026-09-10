import { supabase } from "@/integrations/supabase/client";
import { traerTodo } from "@/lib/paginar";

/**
 * Catálogo compartido de clientes.
 *
 * Clientes y Remisiones leían la tabla con selects distintos; cuando se agregó
 * folio_interno, una base sin la migración hacía que la pantalla de Clientes
 * quedara en silencio y vacía. Este lector centraliza la consulta y, si la
 * columna nueva aún no existe, cae a un conjunto mínimo de columnas para que
 * los clientes anteriores sigan visibles mientras se aplica la migración.
 *
 * Se lee **por tramos** (`traerTodo`): PostgREST corta en 1000 filas y la
 * tabla ya pasa de 1700, así que sin paginar el catálogo llegaba mocho y los
 * clientes del final del abecedario —los nuevos entre ellos— no aparecían en
 * ningún selector. Ver `src/lib/paginar.ts`.
 */
export interface ClienteCatalogo {
  id: string;
  codigo_erp: string | null;
  folio_interno: string | null;
  nombre_comercial: string | null;
  telefono: string | null;
  activo: boolean;
  vendedor_id?: string | null;
  [extra: string]: unknown;
}

const COLUMNAS_RESPALDO =
  "id, created_at, updated_at, codigo_erp, nombre_comercial, telefono, " +
  "direccion, activo, razon_social, rfc, email, email_cobranza, " +
  "nombre_contacto, cargo_contacto, telefono_contacto, calle, num_exterior, " +
  "num_interior, colonia, municipio, estado, codigo_postal, pais, " +
  "limite_credito, dias_credito, moneda_credito, vendedor_id, notas, " +
  "fecha_alta, doc_constancia_sf_url, doc_comprobante_domicilio_url, " +
  "doc_ine_representante_url, doc_acta_constitutiva_url, doc_poder_notarial_url";

export async function cargarClientes(): Promise<{
  data: ClienteCatalogo[];
  error?: { code?: string; message?: string };
  /**
   * Se leyó con el respaldo (sin `folio_interno`) porque la base va atrás. La
   * pantalla funciona: los clientes se ven, sólo sin folio interno. Hace falta
   * distinguirlo porque `error` viene lleno en ese caso también —para poder
   * avisar en consola— y sin esta bandera quien llama no puede diferenciar
   * «funcionó degradado» de «no se pudo leer», que es justo la confusión que
   * dejó la pantalla de Clientes diciendo «Sin resultados».
   */
  degradado?: boolean;
}> {
  // El `.order("id")` del final no es decorativo: sin él los cientos de
  // clientes sin `folio_interno` empatan, y dos tramos consecutivos pueden
  // acomodar el empate distinto y perderse un renglón entre página y página.
  const { data, error } = await traerTodo((desde, hasta) =>
    supabase
      .from("clientes")
      .select("*")
      .order("folio_interno", { nullsFirst: false })
      .order("codigo_erp", { nullsFirst: false })
      .order("id")
      .range(desde, hasta),
  );

  if (!error) {
    return { data: ((data as unknown) as ClienteCatalogo[]) ?? [] };
  }

  const msg = error.message ?? "";
  const esFolio =
    msg.includes("folio_interno") ||
    (error.code === "42703" && msg.includes("column") && msg.includes("clientes"));

  if (esFolio) {
    console.warn("clientes.folio_interno no disponible:", msg);
    const { data: fallback, error: error2 } = await traerTodo((desde, hasta) =>
      supabase
        .from("clientes")
        .select(COLUMNAS_RESPALDO)
        .order("codigo_erp", { nullsFirst: false })
        .order("id")
        .range(desde, hasta),
    );
    if (error2) return { data: [], error: error2 };
    return {
      data: ((fallback as unknown) as ClienteCatalogo[]) ?? [],
      error,
      degradado: true,
    };
  }

  return { data: [], error };
}

/**
 * Orden por nombre comercial, como lo pedían las pantallas del CRM cuando
 * cada una leía la tabla por su cuenta. Ahora que el catálogo se pagina, el
 * orden se aplica aquí: son dos consultas y el servidor no puede garantizar
 * un orden global sin desempate. Los que no tienen nombre se van al final,
 * igual que hacía `.order("nombre_comercial")` en Postgres.
 */
export function porNombreComercial(a: ClienteCatalogo, b: ClienteCatalogo): number {
  const clave = (c: ClienteCatalogo) => c.nombre_comercial?.trim() || "\uffff";
  return clave(a).localeCompare(clave(b), "es");
}

export function displayCliente(c: ClienteCatalogo | null | undefined): string {
  return c?.folio_interno || c?.codigo_erp || "—";
}
