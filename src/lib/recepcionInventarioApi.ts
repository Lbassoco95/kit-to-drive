import { fdb } from "@/lib/finanzasDb";
import { lineasDeInventario, type LineaRecepcion, type OrigenRecepcion } from "@/lib/recepcionInventario";

export type DocumentoGuardado = {
  ok: true;
  folio: string;
  faltantes: number;
  sinEmparejar: number;
};

export async function documentarContenedor(opts: {
  contenedorId: string;
  compraId?: string | null;
  origen: OrigenRecepcion;
  notas?: string | null;
  lineas?: LineaRecepcion[];
}): Promise<DocumentoGuardado | { ok: false; error: unknown }> {
  let lineas = opts.lineas;
  if (!lineas) {
    const [chasis, motores, partes] = await Promise.all([
      fdb.from("inventario_chasis").select("numero_chasis, modelo, color").eq("contenedor_id", opts.contenedorId).limit(1000),
      fdb.from("inventario_motor").select("numero_motor, modelo").eq("contenedor_id", opts.contenedorId).limit(1000),
      fdb.from("inventario_partes").select("descripcion, modelo, cantidad_esperada, cantidad_recibida").eq("contenedor_id", opts.contenedorId).limit(1000),
    ]);
    const error = chasis.error || motores.error || partes.error;
    if (error) return { ok: false, error };
    lineas = lineasDeInventario({
      chasis: chasis.data ?? [],
      motores: motores.data ?? [],
      partes: partes.data ?? [],
    });
  }
  if (!lineas.length) {
    return { ok: false, error: { message: "No hay piezas para documentar en este contenedor" } };
  }

  const { data, error } = await fdb.rpc("registrar_documento_inventario", {
    _contenedor_id: opts.contenedorId,
    _compra_id: opts.compraId || null,
    _origen: opts.origen,
    _notas: opts.notas ?? null,
    _lineas: lineas,
  });
  if (error) return { ok: false, error };
  const row = (data ?? {}) as {
    ok?: boolean;
    folio?: string;
    error?: string;
    sin_emparejar?: number;
    faltantes?: unknown[];
  };
  if (!row.ok) return { ok: false, error: { message: row.error ?? "No se guardó el documento" } };
  return {
    ok: true,
    folio: row.folio ?? "",
    faltantes: Array.isArray(row.faltantes) ? row.faltantes.length : 0,
    sinEmparejar: Number(row.sin_emparejar ?? 0),
  };
}
