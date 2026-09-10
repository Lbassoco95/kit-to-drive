import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClienteCatalogo } from "@/lib/catalogoClientes";

type Respuesta = { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null };

const respuesta: Respuesta = { data: [], error: null };
const respuestaFallback: { data: Record<string, unknown>[] | null; error?: Respuesta["error"] } = { data: [] };
/** Cuántas consultas se hicieron, para probar que el respaldo no se pide de gratis. */
let consultas = 0;

interface MockQuery {
  _select?: string;
  _desde: number;
  _hasta: number;
  select: (arg: string) => MockQuery;
  order: () => MockQuery;
  /** El catálogo se lee por tramos; el mock los recorta como lo hace PostgREST. */
  range: (desde: number, hasta: number) => MockQuery;
  then: (cb: (r: { data: Record<string, unknown>[] | null; error: unknown }) => unknown) => unknown;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: MockQuery = {
        _select: "*",
        _desde: 0,
        _hasta: Number.MAX_SAFE_INTEGER,
        select: (arg: string) => { q._select = arg; return q; },
        order: () => q,
        range: (desde: number, hasta: number) => { q._desde = desde; q._hasta = hasta; return q; },
        then: (cb) => {
          consultas++;
          const tramo = (filas: Record<string, unknown>[] | null) =>
            filas ? filas.slice(q._desde, q._hasta + 1) : filas;
          if (q._select === "*") {
            return cb({ data: tramo(respuesta.data), error: respuesta.error });
          }
          return cb({ data: tramo(respuestaFallback.data), error: respuestaFallback.error ?? null });
        },
      };
      return q;
    },
  },
}));

import { cargarClientes, displayCliente, porNombreComercial } from "@/lib/catalogoClientes";

describe("catálogo de clientes", () => {
  beforeEach(() => {
    respuesta.data = [];
    respuesta.error = null;
    respuestaFallback.data = [];
    respuestaFallback.error = null;
    consultas = 0;
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

  /*
   * `error` viene lleno tanto cuando el respaldo funcionó como cuando no se
   * pudo leer nada, así que quien llama no puede distinguir «funcionó
   * degradado» de «falló» — y esa confusión es justo la que dejó la pantalla
   * de Clientes diciendo «Sin resultados». De eso responde `degradado`.
   */
  it("marca `degradado` sólo cuando se leyó con el respaldo", async () => {
    respuesta.data = [{ id: "1", folio_interno: "CLI-2026-001", codigo_erp: null, nombre_comercial: "A", telefono: null, activo: true }];
    expect((await cargarClientes()).degradado).toBeFalsy();
    expect(consultas).toBe(1);

    respuesta.error = { code: "42703", message: "column clientes.folio_interno does not exist" };
    respuestaFallback.data = [{ id: "1", codigo_erp: "R123", nombre_comercial: "A", telefono: null, activo: true }];
    const degradada = await cargarClientes();
    expect(degradada.degradado).toBe(true);
    expect(degradada.data).toHaveLength(1);
  });

  it("no hay `degradado` si el respaldo tampoco se pudo leer", async () => {
    respuesta.error = { code: "42703", message: "column clientes.folio_interno does not exist" };
    respuestaFallback.error = { code: "42501", message: "permission denied for table clientes" };

    const { data, error, degradado } = await cargarClientes();
    // Nada que mostrar y nada que fingir: la pantalla tiene que avisar.
    expect(data).toEqual([]);
    expect(degradado).toBeFalsy();
    expect(error?.message).toContain("permission denied");
  });

  it("un error que no es folio_interno se reporta sin reintentar", async () => {
    respuesta.error = { code: "42501", message: "permission denied for table clientes" };

    const { data, error, degradado } = await cargarClientes();
    expect(data).toEqual([]);
    expect(degradado).toBeFalsy();
    expect(error?.code).toBe("42501");
    // Un permiso o la red no se arreglan pidiendo menos columnas.
    expect(consultas).toBe(1);
  });

  it("una tabla vacía de verdad no se confunde con una falla", async () => {
    const { data, error, degradado } = await cargarClientes();
    expect(data).toEqual([]);
    expect(error).toBeUndefined();
    expect(degradado).toBeFalsy();
  });

  it("displayCliente muestra folio, código ERP o guión", () => {
    const c1 = { id: "1", folio_interno: "CLI-2026-001", codigo_erp: null, nombre_comercial: "A", telefono: null, activo: true } as ClienteCatalogo;
    const c2 = { id: "2", folio_interno: null, codigo_erp: "R123", nombre_comercial: "B", telefono: null, activo: true } as ClienteCatalogo;
    expect(displayCliente(c1)).toBe("CLI-2026-001");
    expect(displayCliente(c2)).toBe("R123");
    expect(displayCliente(null)).toBe("—");
  });

  /**
   * El caso que dejó a Karen sin poder elegir a NESTOR GALLEGOS (2026-09-09):
   * `clientes` pasó de 1000 filas, PostgREST cortó la respuesta en el renglón
   * 1000 —sin error, con un 200 y `Content-Range: 0-999/*`— y todo lo que
   * caía después del corte dejó de existir para el selector.
   */
  it("trae el catálogo completo aunque pase de mil clientes", async () => {
    respuesta.data = Array.from({ length: 1784 }, (_, i) => ({
      id: `id-${String(i).padStart(4, "0")}`,
      codigo_erp: `C${String(i).padStart(4, "0")}`,
      folio_interno: null,
      nombre_comercial: `Cliente ${i}`,
      telefono: null,
      activo: true,
    }));

    const { data, error } = await cargarClientes();

    expect(error).toBeUndefined();
    expect(data).toHaveLength(1784);
    // El último del catálogo es justo el que se perdía.
    expect(data[1783].codigo_erp).toBe("C1783");
    // Dos tramos completos y uno corto que cierra.
    expect(consultas).toBe(2);
  });

  it("el respaldo también se lee por tramos", async () => {
    respuesta.error = { code: "42703", message: "column clientes.folio_interno does not exist" };
    respuestaFallback.data = Array.from({ length: 1200 }, (_, i) => ({
      id: `id-${i}`, codigo_erp: `C${i}`, nombre_comercial: `Cliente ${i}`, activo: true, telefono: null,
    }));

    const { data, degradado } = await cargarClientes();

    expect(degradado).toBe(true);
    expect(data).toHaveLength(1200);
  });

  it("ordena por nombre comercial y deja al final a los que no tienen", () => {
    const lista = [
      { id: "3", nombre_comercial: null },
      { id: "1", nombre_comercial: "Álvarez" },
      { id: "2", nombre_comercial: "Zapata" },
    ] as unknown as ClienteCatalogo[];
    expect([...lista].sort(porNombreComercial).map(c => c.id)).toEqual(["1", "2", "3"]);
  });
});
