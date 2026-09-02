import { describe, it, expect } from "vitest";
import {
  cargarCatalogoClientes, faltaFolioInterno, codigoCliente, etiquetaCliente,
  type RespuestaCatalogo,
} from "@/lib/catalogoClientes";

/**
 * El incidente: la lista de Clientes salió vacía en producción y se leyó como
 * «se perdieron los clientes». La base contestaba 42703 —le faltaba
 * `clientes.folio_interno`, el script 20260827000001 nunca se corrió— y la
 * pantalla tiraba el error a la basura y pintaba «Sin resultados».
 *
 * Estas pruebas fijan las tres salidas que importan: se leyó bien, se leyó con
 * respaldo, y no se pudo leer (y entonces hay que avisar).
 */

const ok = (filas: Record<string, unknown>[]): RespuestaCatalogo => ({ data: filas, error: null });
const falla = (code: string, message: string): RespuestaCatalogo => ({ data: null, error: { code, message } });

const SIN_COLUMNA = falla("42703", 'column clientes.folio_interno does not exist');
const R195 = { id: "c1", codigo_erp: "R195", nombre_comercial: "Ferretería del Sur" };
const CLI4 = { id: "c2", codigo_erp: null, folio_interno: "CLI-2026-004", nombre_comercial: "Motos del Bajío" };

/** Lector de prueba: registra con qué se le llamó y contesta por turno. */
const lector = (...respuestas: RespuestaCatalogo[]) => {
  const llamadas: boolean[] = [];
  const leer = (conFolioInterno: boolean) => {
    llamadas.push(conFolioInterno);
    return Promise.resolve(respuestas[llamadas.length - 1] ?? respuestas[respuestas.length - 1]);
  };
  return { leer, llamadas };
};

describe("cargarCatalogoClientes", () => {
  it("devuelve el catálogo cuando la base está al día", async () => {
    const { leer, llamadas } = lector(ok([R195, CLI4]));
    const carga = await cargarCatalogoClientes(leer);

    expect(carga.clientes.map(c => c.id)).toEqual(["c1", "c2"]);
    expect(carga.degradado).toBe(false);
    expect(carga.error).toBeNull();
    // Una sola ida a la base: el respaldo no se pide de gratis.
    expect(llamadas).toEqual([true]);
  });

  it("cae al catálogo sin folio_interno cuando la base va atrás", async () => {
    const { leer, llamadas } = lector(SIN_COLUMNA, ok([R195]));
    const carga = await cargarCatalogoClientes(leer);

    // Lo que importa: los clientes SE VEN aunque falte el script.
    expect(carga.clientes.map(c => c.id)).toEqual(["c1"]);
    expect(carga.degradado).toBe(true);
    expect(carga.error).toBeNull();
    expect(llamadas).toEqual([true, false]);
  });

  it("reconoce el hueco por el nombre de la columna aunque no venga el código", async () => {
    const { leer, llamadas } = lector(
      { data: null, error: { message: 'column "folio_interno" does not exist' } },
      ok([R195]),
    );
    const carga = await cargarCatalogoClientes(leer);

    expect(carga.degradado).toBe(true);
    expect(carga.clientes).toHaveLength(1);
    expect(llamadas).toEqual([true, false]);
  });

  it("no se reintenta —y reporta— cuando el problema no es folio_interno", async () => {
    const { leer, llamadas } = lector(falla("42501", "permission denied for table clientes"));
    const carga = await cargarCatalogoClientes(leer);

    expect(carga.clientes).toEqual([]);
    expect(carga.degradado).toBe(false);
    expect(carga.error?.code).toBe("42501");
    expect(llamadas).toEqual([true]);
  });

  it("devuelve el error del respaldo cuando tampoco se pudo leer sin folio", async () => {
    const { leer } = lector(SIN_COLUMNA, falla("42P01", 'relation "public.clientes" does not exist'));
    const carga = await cargarCatalogoClientes(leer);

    // Nunca «vacío en silencio»: quien llama tiene con qué avisar.
    expect(carga.clientes).toEqual([]);
    expect(carga.error?.code).toBe("42P01");
  });

  it("una tabla vacía de verdad no se confunde con una falla", async () => {
    const carga = await cargarCatalogoClientes(lector(ok([])).leer);
    expect(carga.clientes).toEqual([]);
    expect(carga.error).toBeNull();
  });

  it("aguanta un data que no es arreglo sin tronar la pantalla", async () => {
    const carga = await cargarCatalogoClientes(() => Promise.resolve({ data: null, error: null }));
    expect(carga.clientes).toEqual([]);
    expect(carga.error).toBeNull();
  });
});

describe("faltaFolioInterno", () => {
  it("distingue el hueco de esquema de los demás errores", () => {
    expect(faltaFolioInterno({ code: "42703", message: "column clientes.folio_interno does not exist" })).toBe(true);
    expect(faltaFolioInterno({ message: 'column "folio_interno" does not exist' })).toBe(true);
    expect(faltaFolioInterno({ code: "42501", message: "permission denied" })).toBe(false);
    expect(faltaFolioInterno({ message: "Failed to fetch" })).toBe(false);
    expect(faltaFolioInterno(null)).toBe(false);
  });
});

describe("codigoCliente / etiquetaCliente", () => {
  it("usa el folio interno de los clientes nuevos y el ERP de los migrados", () => {
    expect(codigoCliente(CLI4)).toBe("CLI-2026-004");
    expect(codigoCliente(R195)).toBe("R195");
    expect(codigoCliente({ id: "c3" })).toBe("—");
    expect(etiquetaCliente(CLI4)).toBe("CLI-2026-004 — Motos del Bajío");
    expect(etiquetaCliente({ id: "c3" })).toBe("—");
  });
});
