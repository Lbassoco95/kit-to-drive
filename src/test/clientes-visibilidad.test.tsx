import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/**
 * «Los clientes no se están viendo en producción».
 *
 * La pantalla leía el catálogo así:
 *
 *     const [{ data: cs }, { data: ms }] = await Promise.all([...]);
 *     setRows(cs ?? []);
 *
 * El `error` se tiraba a la basura. Cuando la base contestaba 42703 —le
 * faltaba `clientes.folio_interno`, porque los scripts de
 * supabase/migrations/ se corren A MANO y 20260827000001 no se había
 * corrido— `data` venía `null`, la lista quedaba vacía y la pantalla decía
 * «Sin resultados»: exactamente lo mismo que se ve cuando de verdad no hay
 * clientes. Por eso se leyó como «se perdieron los clientes».
 *
 * Estas pruebas fijan las dos mitades del arreglo:
 *  · con la base atrás, los clientes SE VEN (respaldo sin folio_interno);
 *  · si de plano no se pudo leer, la pantalla lo DICE y nombra el script,
 *    en vez de fingir una lista vacía.
 */

const filas: Record<string, Record<string, unknown>[]> = {};
/** Simula una base sin el script 20260827000001 aplicado. */
let baseConFolioInterno = true;
/** Falla dura del catálogo (permisos, tabla ausente, red). */
let fallaClientes: { code?: string; message?: string } | null = null;
/** Falla de las estadísticas de unidades, que son un adorno de la tarjeta. */
let fallaMotocarros: { code?: string; message?: string } | null = null;
/** Con qué columnas se ordenó cada intento, para probar el respaldo. */
const intentos: string[][] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const columnas: string[] = [];
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select","eq","neq","in","is","not","gte","lte","limit","or"]) q[m] = paso;
      q.order = (columna: string) => { columnas.push(columna); return q; };
      q.single = () => Promise.resolve({ data: null, error: null });
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.insert = () => Promise.resolve({ data: null, error: null });
      q.update = () => paso();
      q.delete = () => paso();
      q.then = (res: (r: { data: unknown; error: unknown }) => void) => {
        if (tabla === "motocarros" && fallaMotocarros) return res({ data: null, error: fallaMotocarros });
        if (tabla !== "clientes") return res({ data: filas[tabla] ?? [], error: null });
        intentos.push([...columnas]);
        if (fallaClientes) return res({ data: null, error: fallaClientes });
        if (!baseConFolioInterno && columnas.includes("folio_interno")) {
          return res({ data: null, error: { code: "42703", message: "column clientes.folio_interno does not exist" } });
        }
        // Una base sin el script tampoco devuelve la columna en el `select *`.
        const rows = (filas.clientes ?? []).map(c => {
          if (baseConFolioInterno) return c;
          const { folio_interno: _fuera, ...resto } = c;
          return resto;
        });
        return res({ data: rows, error: null });
      };
      return q;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" }, area: "comercial", nivel: "admin", role: "admin", activo: true,
    profileName: "Lee", loading: false,
    perms: { puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => true,
             puedeEliminar: () => true, soloPropios: () => false, esAdminGlobal: true,
             nivel: "admin", area: "comercial" },
    signOut: async () => {}, refreshRole: async () => {},
  }),
}));

import Clientes from "@/pages/Clientes";

const CLIENTES = [
  { id: "c1", codigo_erp: "R195", folio_interno: null, nombre_comercial: "Ferretería del Sur", activo: true },
  { id: "c2", codigo_erp: null, folio_interno: "CLI-2026-004", nombre_comercial: "Motos del Bajío", activo: true },
];

const dibujar = async () => {
  render(<MemoryRouter><Clientes /></MemoryRouter>);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return document.body;
};

describe("Clientes · la lista nunca se queda vacía en silencio", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) delete filas[k];
    intentos.length = 0;
    baseConFolioInterno = true;
    fallaClientes = null;
    fallaMotocarros = null;
    document.body.innerHTML = "";
  });

  it("muestra los clientes cuando la base está al día", async () => {
    filas.clientes = CLIENTES;
    const cuerpo = await dibujar();

    expect(cuerpo.textContent).toContain("Ferretería del Sur");
    expect(cuerpo.textContent).toContain("Motos del Bajío");
    expect(cuerpo.textContent).toContain("CLI-2026-004");
    expect(cuerpo.textContent).not.toContain("Sin resultados");
    expect(cuerpo.textContent).not.toContain("No se pudo cargar la lista de clientes");
    // Un solo viaje: el respaldo no se pide cuando no hace falta.
    expect(intentos).toEqual([["folio_interno", "codigo_erp"]]);
  });

  it("los clientes se ven aunque a la base le falte folio_interno", async () => {
    baseConFolioInterno = false;
    filas.clientes = CLIENTES;
    const cuerpo = await dibujar();

    // Esto es lo que se rompió en producción: aquí SÍ salen.
    expect(cuerpo.textContent).toContain("Ferretería del Sur");
    expect(cuerpo.textContent).toContain("Motos del Bajío");
    expect(cuerpo.textContent).not.toContain("Sin resultados");
    expect(cuerpo.textContent).not.toContain("No se pudo cargar la lista de clientes");
    // Primero con folio_interno; al fallar, el catálogo de siempre.
    expect(intentos).toEqual([["folio_interno", "codigo_erp"], ["codigo_erp"]]);
  });

  it("dice qué pasó —y no «Sin resultados»— cuando el catálogo no se pudo leer", async () => {
    fallaClientes = { code: "42501", message: "permission denied for table clientes" };
    const cuerpo = await dibujar();

    expect(cuerpo.textContent).toContain("No se pudo cargar la lista de clientes");
    expect(cuerpo.textContent).toContain("permission denied for table clientes");
    expect(cuerpo.textContent).toContain("Reintentar");
    expect(cuerpo.textContent).not.toContain("Sin resultados");
  });

  it("nombra el script que falta cuando la base va atrás de verdad", async () => {
    fallaClientes = { code: "42P01", message: 'relation "public.clientes" does not exist' };
    const cuerpo = await dibujar();

    expect(cuerpo.textContent).toContain("La base de datos va atrás del sistema");
    expect(cuerpo.textContent).toContain("diagnostico_esquema.sql");
  });

  it("«Sin resultados» queda sólo para cuando de verdad no hay clientes", async () => {
    filas.clientes = [];
    const cuerpo = await dibujar();

    expect(cuerpo.textContent).toContain("Sin resultados");
    expect(cuerpo.textContent).not.toContain("No se pudo cargar la lista de clientes");
  });

  it("las estadísticas de unidades no arrastran a la lista si fallan", async () => {
    filas.clientes = CLIENTES;
    // `motocarros` va en su propia consulta a propósito: las unidades
    // entregadas son un adorno de la tarjeta, los clientes son la pantalla.
    // Antes iban en el mismo `Promise.all` sin revisar errores.
    fallaMotocarros = { code: "42P01", message: 'relation "public.motocarros" does not exist' };
    const cuerpo = await dibujar();

    expect(cuerpo.textContent).toContain("Ferretería del Sur");
    expect(cuerpo.textContent).toContain("Motos del Bajío");
    expect(cuerpo.textContent).not.toContain("No se pudo cargar la lista de clientes");
  });
});
