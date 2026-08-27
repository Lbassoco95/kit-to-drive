import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Los modelos del selector de Remisiones estaban escritos a mano, así que un
 * modelo nuevo del embarque quedaba invisible para ventas: existe en
 * inventario y no se puede vender. Pasó con DZ-K1.
 */
const respuesta: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.then = (res: (r: unknown) => void) => res(respuesta);
      return q;
    },
  },
}));

import { cargarModelosMotocarro, MODELOS_RESPALDO } from "@/lib/catalogoModelos";

describe("catálogo de modelos", () => {
  beforeEach(() => { respuesta.data = []; respuesta.error = null; });

  it("usa el nombre comercial del catálogo", async () => {
    respuesta.data = [
      { modelo: "DZ200Q1", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
      { modelo: "DZ300Q7", linea: "motocarro", nombre_comercial: "300cc 2026", activo: true },
    ];
    expect(await cargarModelosMotocarro()).toEqual(["200cc 2026", "300cc 2026"]);
  });

  it("un modelo sin nombre comercial entra con su código de fábrica, no se pierde", async () => {
    respuesta.data = [
      { modelo: "DZ200Q1", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
      { modelo: "DZ-K1",   linea: "motocarro", nombre_comercial: null,         activo: true },
    ];
    expect(await cargarModelosMotocarro()).toEqual(["200cc 2026", "DZ-K1"]);
  });

  it("no repite cuando varios códigos comparten nombre comercial", async () => {
    respuesta.data = [
      { modelo: "DZ200Q1", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
      { modelo: "DZ200Q2", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
    ];
    expect(await cargarModelosMotocarro()).toEqual(["200cc 2026"]);
  });

  it("deja fuera los inactivos y lo que no es motocarro", async () => {
    respuesta.data = [
      { modelo: "DZ200Q1", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
      { modelo: "DZ999",   linea: "motocarro", nombre_comercial: "Descontinuado", activo: false },
      { modelo: "CAB01",   linea: "otro",      nombre_comercial: "Cabina",      activo: true },
    ];
    expect(await cargarModelosMotocarro()).toEqual(["200cc 2026"]);
  });

  it("si el catálogo falla, la captura sigue siendo posible", async () => {
    respuesta.data = null;
    respuesta.error = { message: 'relation "modelos_producto" does not exist' };
    expect(await cargarModelosMotocarro()).toEqual(MODELOS_RESPALDO);
  });

  it("si el catálogo viene vacío, tampoco se queda el selector sin opciones", async () => {
    respuesta.data = [];
    expect(await cargarModelosMotocarro()).toEqual(MODELOS_RESPALDO);
  });
});
