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
