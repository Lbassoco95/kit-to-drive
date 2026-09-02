import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClienteCatalogo } from "@/lib/catalogoClientes";

type Respuesta = { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null };

const respuesta: Respuesta = { data: [], error: null };
const respuestaFallback: { data: Record<string, unknown>[] | null } = { data: [] };

interface MockQuery {
  _select?: string;
  select: (arg: string) => MockQuery;
  order: () => MockQuery;
  then: (cb: (r: { data: Record<string, unknown>[] | null; error: unknown }) => unknown) => unknown;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: MockQuery = {
        _select: "*",
        select: (arg: string) => { q._select = arg; return q; },
        order: () => q,
        then: (cb) => {
          if (q._select === "*") {
            return cb({ data: respuesta.data, error: respuesta.error });
          }
          return cb({ data: respuestaFallback.data, error: null });
        },
      };
      return q;
    },
  },
}));

import { cargarClientes, displayCliente } from "@/lib/catalogoClientes";

describe("catálogo de clientes", () => {
  beforeEach(() => {
    respuesta.data = [];
    respuesta.error = null;
    respuestaFallback.data = [];
  });

  it("lee folio_interno cuando la columna existe", async () => {
    respuesta.data = [{ id: "1", folio_interno: "CLI-2026-001", nombre_comercial: "Cliente A", activo: true, codigo_erp: null, telefono: null }];
    const { data, error } = await cargarClientes();
    expect(error).toBeUndefined();
    expect(data[0].folio_interno).toBe("CLI-2026-001");
  });

  it("cae a columnas de respaldo si folio_interno falta", async () => {
    respuesta.error = { code: "42703", message: "column clientes.folio_interno does not exist" };
    respuestaFallback.data = [{ id: "1", codigo_erp: "R123", nombre_comercial: "Cliente A", activo: true, telefono: null }];
    const { data, error } = await cargarClientes();
    expect(data).toHaveLength(1);
    expect(data[0].codigo_erp).toBe("R123");
    // Conserva el error original para que la UI pueda advertir que falta la migración.
    expect(error?.message).toContain("folio_interno");
  });

  it("displayCliente muestra folio, código ERP o guión", () => {
    const c1 = { id: "1", folio_interno: "CLI-2026-001", codigo_erp: null, nombre_comercial: "A", telefono: null, activo: true } as ClienteCatalogo;
    const c2 = { id: "2", folio_interno: null, codigo_erp: "R123", nombre_comercial: "B", telefono: null, activo: true } as ClienteCatalogo;
    expect(displayCliente(c1)).toBe("CLI-2026-001");
    expect(displayCliente(c2)).toBe("R123");
    expect(displayCliente(null)).toBe("—");
  });
});
