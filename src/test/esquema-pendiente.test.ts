import { describe, it, expect } from "vitest";
import { explicarError } from "@/lib/dazon";

// El incidente real: KIT-4c nunca se corrió en producción, la app pidió
// inventario_chasis.color_original y Producción → Configurar unidad se quedó
// sin chasis, sin motores y con un toast que no decía qué hacer.
describe("explicarError", () => {
  it("nombra el script que falta cuando la base va atrás", () => {
    const msg = explicarError(
      { code: "42703", message: "column inventario_chasis.color_original does not exist" },
      "Error al cargar piezas disponibles",
    );
    expect(msg).toContain("20260823000003_color_efectivo_capacidad.sql");
    expect(msg).toContain("SQL editor");
  });

  it("manda al diagnóstico si no reconoce el objeto", () => {
    const msg = explicarError(
      { code: "42P01", message: 'relation "public.tabla_nueva" does not exist' },
      "Error al cargar inventario",
    );
    expect(msg).toContain("diagnostico_esquema.sql");
  });

  it("reconoce KIT-4 por sus columnas de inventario_colores", () => {
    const msg = explicarError(
      { code: "42703", message: "column inventario_colores.piezas_total does not exist" },
      "x",
    );
    expect(msg).toContain("20260823000001_incidencias_chasis_colores_cierre.sql");
  });

  it("no toca los errores normales", () => {
    expect(explicarError({ code: "P0001", message: "Solo admin/fábrica puede configurar unidades" }, "x"))
      .toBe("Solo admin/fábrica puede configurar unidades");
    expect(explicarError({}, "Error al cargar inventario")).toBe("Error al cargar inventario");
  });
});

describe("explicarError · a qué script apunta cada objeto", () => {
  const casos: [string, string][] = [
    ["column inventario_chasis.color_original does not exist", "20260823000003"],
    ["column inventario_colores.piezas_recibidas does not exist", "20260823000003"],
    ["function public.capturar_seriales_unidad(uuid, text, text) does not exist", "20260823000002"],
    ["function public.crear_motocarro_ya_armado(text, text, text, text, uuid) does not exist", "20260828000001"],
    ["column inventario_colores.piezas_total does not exist", "20260823000001"],
    ["column inventario_colores.nombre_comercial does not exist", "20260823000001"],
    ["column modelos_producto.nombre_comercial does not exist", "20260822000001"],
    ['relation "public.bitacora_eliminaciones" does not exist', "20260819000010"],
    ["function public.usuario_activo(uuid) does not exist", "20260824000003"],
    // El incidente de Clientes: la lista salía vacía porque la base no tenía
    // esta columna, y el mensaje no decía qué correr.
    ["column clientes.folio_interno does not exist", "20260827000001"],
    ["function public.generar_folio_interno_cliente() does not exist", "20260827000001"],
    ['relation "public.clientes_bitacora" does not exist', "20260819000011"],
    ['relation "public.remisiones_bitacora" does not exist', "20260902000001"],
    ["function public.puede_editar_remision(uuid, uuid) does not exist", "20260902000001"],
    ["column remision_items.orden_linea does not exist", "20260902000001"],
    ["function public.asignar_motocarro_a_remision(uuid, uuid) does not exist", "20260826000003"],
    ["function public.desasignar_motocarro_de_remision(uuid) does not exist", "20260826000003"],
  ];

  for (const [crudo, esperado] of casos) {
    it(crudo.slice(0, 55), () => {
      const codigo = crudo.startsWith("relation") ? "42P01" : crudo.startsWith("function") ? "42883" : "42703";
      expect(explicarError({ code: codigo, message: crudo }, "x")).toContain(esperado);
    });
  }
});
