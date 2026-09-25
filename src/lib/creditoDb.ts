// Acceso a tablas y RPCs del módulo de crédito.
// Separado de `credito.ts` para que las reglas se prueben sin Supabase.
import { supabase } from "@/integrations/supabase/client";
import type {
  ClienteCredito,
  CuentaPorCobrar,
  CxcAbono,
  CxcVencidaResumen,
} from "@/lib/credito";

// Las tablas de crédito aún no están en el Database generado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function schemaFalta(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" || // undefined_table
    error.code === "42883" || // undefined_function
    msg.includes("does not exist") ||
    msg.includes("no existe") ||
    msg.includes("schema cache")
  );
}

export async function listarClientesCredito(): Promise<{
  data: ClienteCredito[];
  error?: { code?: string; message?: string };
  schemaFalta?: boolean;
}> {
  const { data, error } = await db
    .from("v_clientes_credito")
    .select("*")
    .order("nombre_comercial");
  if (error) {
    return { data: [], error, schemaFalta: schemaFalta(error) };
  }
  return { data: (data as ClienteCredito[]) ?? [] };
}

export async function listarCxCDeCliente(clienteId: string): Promise<{
  data: CuentaPorCobrar[];
  error?: { code?: string; message?: string };
  schemaFalta?: boolean;
}> {
  const { data, error } = await db
    .from("cuentas_por_cobrar")
    .select("*, remisiones(folio_remision)")
    .eq("cliente_id", clienteId)
    .order("fecha_vencimiento", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    return { data: [], error, schemaFalta: schemaFalta(error) };
  }
  return { data: (data as CuentaPorCobrar[]) ?? [] };
}

export async function listarAbonosDeCxC(cxcId: string): Promise<{
  data: CxcAbono[];
  error?: { code?: string; message?: string };
}> {
  const { data, error } = await db
    .from("cxc_abonos")
    .select("*")
    .eq("cxc_id", cxcId)
    .order("fecha_abono", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { data: [], error };
  return { data: (data as CxcAbono[]) ?? [] };
}

export async function crearCxC(payload: {
  cliente_id: string;
  concepto: string;
  monto: number;
  saldo: number;
  moneda: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  remision_id: string | null;
  notas: string | null;
  created_by: string | undefined;
}): Promise<{ data: CuentaPorCobrar | null; error?: { message?: string } }> {
  const { data, error } = await db
    .from("cuentas_por_cobrar")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { data: null, error };
  return { data: data as CuentaPorCobrar };
}

export async function registrarAbono(payload: {
  cxc_id: string;
  monto: number;
  fecha_abono: string;
  metodo_pago: string | null;
  referencia: string | null;
  notas: string | null;
  created_by: string | undefined;
}): Promise<{ error?: { message?: string } }> {
  const { error } = await db.from("cxc_abonos").insert(payload);
  return { error: error ?? undefined };
}

export async function cancelarCxC(
  cxcId: string,
): Promise<{ error?: { message?: string } }> {
  const { error } = await db
    .from("cuentas_por_cobrar")
    .update({ estatus: "CANCELADA" })
    .eq("id", cxcId)
    .in("estatus", ["ABIERTA", "PARCIAL"]);
  return { error: error ?? undefined };
}

/**
 * ¿Se debe detener el proceso (remisión) por cartera vencida?
 * Si la migración aún no corre, NO bloquea (fail-open) para no tumbar
 * operación mientras se pega el SQL — ver docs/no-romper-produccion.md.
 */
export async function evaluarBloqueoPorCartera(clienteId: string): Promise<{
  bloqueado: boolean;
  resumen: CxcVencidaResumen[];
  schemaFalta?: boolean;
  error?: { code?: string; message?: string };
}> {
  if (!clienteId) {
    return { bloqueado: false, resumen: [] };
  }

  const { data: vencido, error: errFlag } = await db.rpc(
    "cliente_tiene_cxc_vencidas",
    { _cliente_id: clienteId },
  );

  if (errFlag) {
    if (schemaFalta(errFlag)) {
      return { bloqueado: false, resumen: [], schemaFalta: true, error: errFlag };
    }
    // Error real de red/permiso: no bloqueamos a ciegas, pero avisamos.
    return { bloqueado: false, resumen: [], error: errFlag };
  }

  if (!vencido) {
    return { bloqueado: false, resumen: [] };
  }

  const { data: resumen, error: errRes } = await db.rpc("cxc_vencidas_resumen", {
    _cliente_id: clienteId,
  });

  return {
    bloqueado: true,
    resumen: ((resumen as CxcVencidaResumen[]) ?? []),
    error: errRes ?? undefined,
  };
}
