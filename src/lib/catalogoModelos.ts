import { supabase } from "@/integrations/supabase/client";

/**
 * Modelos comerciales de motocarro que Remisiones ofrece para capturar.
 *
 * Estaban escritos a mano (`["200cc 2026", "300cc 2026"]`), así que un modelo
 * nuevo en el embarque quedaba invisible para ventas: existe en inventario y
 * no se puede vender porque no aparece en el selector. Pasó con DZ-K1.
 *
 * Ahora se leen de `modelos_producto`, igual que el resto del sistema
 * (Producción, Inventario, Incidencias). La lista de respaldo es la vieja: si
 * la consulta falla o el catálogo viene vacío, se sigue pudiendo capturar en
 * vez de dejar el selector sin opciones.
 */
export const MODELOS_RESPALDO = ["200cc 2026", "300cc 2026"];

export async function cargarModelosMotocarro(): Promise<string[]> {
  const { data, error } = await supabase
    .from("modelos_producto")
    .select("modelo, linea, nombre_comercial, activo")
    .order("nombre_comercial");

  if (error) {
    console.warn("modelos_producto no disponible:", error.message);
    return MODELOS_RESPALDO;
  }

  const nombres = (data ?? [])
    .filter((m) => m.activo !== false && (m.linea ?? "motocarro") === "motocarro")
    // Sin nombre comercial se usa el código de fábrica: mejor un modelo con
    // nombre feo que un modelo que no se puede vender.
    .map((m) => (m.nombre_comercial?.trim() || m.modelo?.trim() || ""))
    .filter(Boolean);

  // Varios códigos de fábrica pueden compartir nombre comercial.
  const unicos = [...new Set(nombres)];
  return unicos.length ? unicos : MODELOS_RESPALDO;
}
