import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const filas: Record<string, Record<string, unknown>[]> = {};
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select","order","eq","neq","in","is","not","gte","lte","limit","or"]) q[m] = paso;
      q.single = () => Promise.resolve({ data: null, error: null });
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.insert = () => Promise.resolve({ data: null, error: null });
      q.update = () => paso();
      q.delete = () => paso();
      q.then = (res: (r: { data: unknown[]; error: null }) => void) => res({ data: filas[tabla] ?? [], error: null });
      return q;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: { liberadas: 2 }, error: null });
    },
    storage: { from: () => ({}) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" }, area: "comercial", nivel: "operador", role: "ventas", activo: true,
    profileName: "Ana Karen", loading: false,
    // Operador: sólo trabaja lo suyo. La remisión de la prueba es suya.
    perms: { puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => false,
             puedeEliminar: () => false, soloPropios: () => true, esAdminGlobal: false,
             nivel: "operador", area: "comercial" },
    signOut: async () => {}, refreshRole: async () => {},
  }),
}));

import Remisiones from "@/pages/Remisiones";

const boton = (texto: RegExp) =>
  Array.from(document.body.querySelectorAll("button")).find(b => texto.test(b.textContent || ""));

const REMISION = {
  id: "r1", folio_remision: "REM-012", estatus: "NUEVA",
  cliente_id: "c1", vendedor_id: "u1", fecha_remision: "2026-09-01",
  notas: null, created_at: "2026-09-01T10:00:00Z",
  clientes: { codigo_erp: "R195", nombre_comercial: "Ferretería del Sur" },
  profiles: { nombre_completo: "Ana Karen" },
};

const dibujar = async () => {
  render(<MemoryRouter><Remisiones /></MemoryRouter>);
  // Deja que corran los cargadores encadenados de load().
  await act(async () => { await Promise.resolve(); });
  return document.body;
};

describe("Remisiones · selector de cliente", () => {
  beforeEach(() => { for (const k of Object.keys(filas)) delete filas[k]; });

  it("ofrece los clientes del catálogo al capturar", async () => {
    filas.clientes = [
      { id: "c1", codigo_erp: "R195", folio_interno: null, nombre_comercial: "Ferretería del Sur" },
      { id: "c2", codigo_erp: null, folio_interno: "CLI-2026-004", nombre_comercial: "Motos del Bajío" },
    ];
    const cuerpo = await dibujar();
    await act(async () => { fireEvent.click(boton(/Nueva remisión/i)!); });

    // El desplegable de Radix sólo dibuja sus opciones al abrirse, pero el
    // buscador y el aviso de catálogo vacío viven fuera: si hubiera clientes y
    // no se hubieran cargado, saldría el aviso.
    expect(cuerpo.textContent).toContain("Selecciona cliente");
    expect(cuerpo.textContent).not.toContain("El catálogo de clientes está vacío");
  });

  it("explica por qué no hay a quién elegir cuando el catálogo llega vacío", async () => {
    const cuerpo = await dibujar();
    await act(async () => { fireEvent.click(boton(/Nueva remisión/i)!); });
    expect(cuerpo.textContent).toContain("El catálogo de clientes está vacío");
  });
});

describe("Remisiones · editar y complementar", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) delete filas[k];
    filas.remisiones = [REMISION];
    filas.clientes = [{ id: "c1", codigo_erp: "R195", folio_interno: null, nombre_comercial: "Ferretería del Sur" }];
    filas.remision_items = [
      { id: "i1", remision_id: "r1", tipo_servicio: "motocarro", modelo: "200cc 2026", color: "BLANCO", cantidad: 1, con_caja: false, orden_linea: 0 },
    ];
  });

  it("el operador ve «Editar» en la remisión que capturó", async () => {
    const cuerpo = await dibujar();
    expect(cuerpo.textContent).toContain("REM-012");
    expect(boton(/^\s*Editar\s*$/)).toBeTruthy();
  });

  it("el diálogo de edición no guarda hasta que se escribe el motivo", async () => {
    await dibujar();
    await act(async () => { fireEvent.click(boton(/^\s*Editar\s*$/)!); });

    const cuerpo = document.body;
    expect(cuerpo.textContent).toContain("Editar remisión REM-012");
    expect(cuerpo.textContent).toContain("Motivo de la modificación");

    const guardar = boton(/Guardar cambios/i)!;
    expect(guardar.hasAttribute("disabled")).toBe(true);

    const motivo = cuerpo.querySelector("textarea")!;
    await act(async () => {
      fireEvent.change(motivo, { target: { value: "corto" } });
    });
    expect(boton(/Guardar cambios/i)!.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      fireEvent.change(motivo, { target: { value: "El cliente agregó dos unidades azules" } });
    });
    expect(boton(/Guardar cambios/i)!.hasAttribute("disabled")).toBe(false);
  });

  it("el diálogo trae cargado lo que ya se había capturado", async () => {
    await dibujar();
    await act(async () => { fireEvent.click(boton(/^\s*Editar\s*$/)!); });

    const cuerpo = document.body;
    // Folio y líneas del pedido, listos para corregir o complementar.
    expect(cuerpo.querySelector<HTMLInputElement>('input[value="REM-012"]')).toBeTruthy();
    expect(cuerpo.textContent).toContain("Motocarro 1");
    expect(cuerpo.textContent).toContain("Agregar motocarro");
  });
});

/**
 * `supabase-js` acepta UNA columna por llamada a `.order()`. Escribir
 * `.order("a, b")` no ordena por dos columnas: manda `order=a, b.asc`,
 * PostgREST no puede leer el segundo término y responde 400 — la consulta
 * completa se pierde y la pantalla se queda sin datos, sin ningún error a la
 * vista. Fue exactamente lo que dejó vacío el selector de cliente.
 */
describe("consultas a Supabase", () => {
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(nombre)) archivos.push(ruta);
    }
  };
  recorrer("src");

  it("ningún .order() pide varias columnas de una sola vez", () => {
    const culpables: string[] = [];
    for (const archivo of archivos) {
      // Este archivo escribe la forma incorrecta a propósito, en la regla y en
      // los comentarios que la explican.
      if (archivo.includes("remisiones-edicion-ui")) continue;
      readFileSync(archivo, "utf8").split("\n").forEach((linea, i) => {
        const codigo = linea.trim();
        if (codigo.startsWith("*") || codigo.startsWith("//")) return;
        if (/\.order\(\s*["'`][^"'`]*,/.test(linea)) culpables.push(`${archivo}:${i + 1}`);
      });
    }
    expect(culpables).toEqual([]);
  });
});

/**
 * Fábrica no puede frenar a Ventas: bajar una remisión con chasis asignados se
 * resuelve liberando las unidades de más y avisando, no impidiendo el cambio.
 */
describe("Remisiones · bajar una remisión con chasis asignados", () => {
  const conAsignados = (estatusEntrega: string[]) => {
    for (const k of Object.keys(filas)) delete filas[k];
    rpcs.length = 0;
    filas.remisiones = [{
      ...REMISION,
      total_unidades_solicitadas: estatusEntrega.length,
      motocarros: estatusEntrega.map((e, i) => ({
        id: `m${i}`, remision_id: "r1", orden_armado: 100 + i, estatus_entrega: e, estatus_armado: "PENDIENTE",
      })),
    }];
    filas.clientes = [{ id: "c1", codigo_erp: "R195", folio_interno: null, nombre_comercial: "Ferretería del Sur" }];
    filas.remision_items = [
      { id: "i1", remision_id: "r1", tipo_servicio: "motocarro", modelo: "200cc 2026", color: "BLANCO", cantidad: 3, con_caja: false, orden_linea: 0 },
    ];
  };

  it("avisa cuántas se van a liberar en vez de impedir el cambio", async () => {
    conAsignados(["PROGRAMADA", "PROGRAMADA", "PROGRAMADA"]);
    await dibujar();
    await act(async () => { fireEvent.click(boton(/^\s*Editar\s*$/)!); });

    const cantidad = document.body.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(cantidad, { target: { value: "1" } }); });

    const texto = document.body.textContent || "";
    expect(texto).toContain("se");
    expect(texto).toMatch(/liberar[aá]n 2/);
    expect(texto).toContain("Fábrica queda avisada");
    // Y sobre todo: no aparece el candado viejo.
    expect(texto).not.toContain("libéralos en Producción");
    // El botón sigue vivo en cuanto hay motivo.
    const motivo = document.body.querySelector("textarea")!;
    await act(async () => { fireEvent.change(motivo, { target: { value: "El cliente canceló dos unidades" } }); });
    expect(boton(/Guardar cambios/i)!.hasAttribute("disabled")).toBe(false);
  });

  it("avisa que no se puede bajar por debajo de lo que ya salió del almacén", async () => {
    conAsignados(["ENTREGADA", "EN_RUTA", "PROGRAMADA"]);
    await dibujar();
    await act(async () => { fireEvent.click(boton(/^\s*Editar\s*$/)!); });

    const cantidad = document.body.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(cantidad, { target: { value: "1" } }); });

    expect(document.body.textContent).toContain("2 ya salieron del almacén");
  });

  it("al guardar, pide liberar las unidades sobrantes", async () => {
    conAsignados(["PROGRAMADA", "PROGRAMADA", "PROGRAMADA"]);
    await dibujar();
    await act(async () => { fireEvent.click(boton(/^\s*Editar\s*$/)!); });

    const cantidad = document.body.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(cantidad, { target: { value: "1" } }); });
    const motivo = document.body.querySelector("textarea")!;
    await act(async () => { fireEvent.change(motivo, { target: { value: "El cliente canceló dos unidades" } }); });
    await act(async () => { fireEvent.click(boton(/Guardar cambios/i)!); });

    const ajuste = rpcs.find(r => r.fn === "ajustar_unidades_remision");
    expect(ajuste).toBeTruthy();
    expect(ajuste!.args).toMatchObject({ _remision_id: "r1", _total_objetivo: 1 });
    expect(String(ajuste!.args._motivo)).toContain("canceló dos");
  });
});
