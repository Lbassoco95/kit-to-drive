import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import React from "react";

/**
 * La bandeja de avisos es el único canal entre áreas: cuando Comercial baja
 * una remisión, las unidades de más se liberan solas y Fábrica se entera por
 * aquí. Lo que se prueba es lo que puede dejar a alguien sin enterarse.
 */
const filas: Record<string, Record<string, unknown>[]> = {};
const updates: Record<string, unknown>[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let errorDeTabla: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select","order","eq","neq","in","is","not","gte","lte","limit","or"]) q[m] = paso;
      q.single = () => Promise.resolve({ data: null, error: null });
      q.insert = () => Promise.resolve({ data: null, error: null });
      q.update = (v: Record<string, unknown>) => { updates.push(v); return q; };
      q.delete = () => paso();
      q.then = (res: (r: { data: unknown[] | null; error: unknown }) => void) =>
        res(errorDeTabla ? { data: null, error: errorDeTabla } : { data: filas[tabla] ?? [], error: null });
      return q;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: { aceptada: args._aceptar, liberadas: 1 }, error: null });
    },
    storage: { from: () => ({}) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-fabrica" }, area: "fabrica", nivel: "admin", role: "fabrica", activo: true }),
}));

import { BandejaAvisos, ResumenAvisos } from "@/components/BandejaAvisos";

const SOLICITUD = {
  id: "sol1", tipo: "solicitud_liberar",
  titulo: "REM-012 pide soltar 1 unidad(es) en armado",
  cuerpo: "REM-012 pide soltar 1 unidad(es) que ya están en armado: DZ...103 (EN_PROCESO).",
  folio_remision: "REM-012", nombre_creador: "Ana Karen",
  created_at: "2026-09-04T09:00:00Z", visto_at: null,
  requiere_respuesta: true, estado: "pendiente",
};

const AVISO = {
  id: "av1", tipo: "unidades_liberadas", requiere_respuesta: false, estado: "pendiente",
  titulo: "REM-012 liberó 2 unidad(es)",
  cuerpo: "REM-012 bajó de 5 a 3 unidades. Se liberaron 2: DZ...104, DZ...105.",
  folio_remision: "REM-012", nombre_creador: "Ana Karen",
  created_at: "2026-09-03T14:32:00Z", visto_at: null,
};

const dibujar = async (nodo: React.ReactElement) => {
  render(nodo);
  await act(async () => { await Promise.resolve(); });
  return document.body;
};

describe("BandejaAvisos", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) delete filas[k];
    updates.length = 0;
    errorDeTabla = null;
  });

  it("muestra el aviso con quién lo mandó y qué se liberó", async () => {
    filas.avisos = [AVISO];
    const cuerpo = await dibujar(<BandejaAvisos />);
    expect(cuerpo.textContent).toContain("1 aviso de otra área");
    expect(cuerpo.textContent).toContain("REM-012 liberó 2 unidad(es)");
    expect(cuerpo.textContent).toContain("DZ...104");
    expect(cuerpo.textContent).toContain("Ana Karen");
  });

  it("no ocupa espacio cuando no hay nada pendiente", async () => {
    const cuerpo = await dibujar(<BandejaAvisos />);
    expect(cuerpo.textContent).not.toContain("aviso");
  });

  it("«Visto» sella el acuse con la fecha y quién lo vio", async () => {
    filas.avisos = [AVISO];
    const cuerpo = await dibujar(<BandejaAvisos />);
    const visto = Array.from(cuerpo.querySelectorAll("button")).find(b => /Visto/.test(b.textContent || ""))!;
    await act(async () => { fireEvent.click(visto); });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ visto_por: "u-fabrica" });
    expect(typeof updates[0].visto_at).toBe("string");
  });

  it("si la tabla todavía no existe, la pantalla no se cae ni estorba", async () => {
    // Es el estado real entre desplegar el código y correr la migración.
    errorDeTabla = { message: 'relation "public.avisos" does not exist' };
    const cuerpo = await dibujar(<BandejaAvisos />);
    expect(cuerpo.textContent).not.toContain("aviso");
  });
});

describe("ResumenAvisos", () => {
  beforeEach(() => { for (const k of Object.keys(filas)) delete filas[k]; errorDeTabla = null; });

  it("cuenta los pendientes y adelanta el primero", async () => {
    filas.avisos = [AVISO, { ...AVISO, id: "av2", titulo: "REM-013 liberó 1 unidad(es)" }];
    const cuerpo = await dibujar(<ResumenAvisos />);
    expect(cuerpo.textContent).toContain("2 avisos sin ver");
    expect(cuerpo.textContent).toContain("REM-012 liberó 2 unidad(es)");
    expect(cuerpo.textContent).toContain("y 1 más");
  });

  it("no se dibuja si no hay pendientes", async () => {
    const cuerpo = await dibujar(<ResumenAvisos />);
    expect(cuerpo.querySelector("button")).toBeNull();
  });
});

describe("BandejaAvisos · solicitudes que esperan respuesta", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) delete filas[k];
    updates.length = 0; rpcs.length = 0; errorDeTabla = null;
  });

  it("una solicitud se distingue de un aviso y no se despacha con «Visto»", async () => {
    filas.avisos = [SOLICITUD];
    const cuerpo = await dibujar(<BandejaAvisos />);
    expect(cuerpo.textContent).toContain("Necesita tu respuesta");
    expect(cuerpo.textContent).toContain("espera tu respuesta");
    const botones = Array.from(cuerpo.querySelectorAll("button")).map(b => b.textContent || "");
    expect(botones.some(t => /Aceptar y liberar/.test(t))).toBe(true);
    expect(botones.some(t => /No se puede/.test(t))).toBe(true);
    expect(botones.some(t => /Visto/.test(t))).toBe(false);
  });

  it("aceptar manda la respuesta escrita junto con el sí", async () => {
    filas.avisos = [SOLICITUD];
    const cuerpo = await dibujar(<BandejaAvisos />);
    const texto = cuerpo.querySelector("textarea")!;
    await act(async () => { fireEvent.change(texto, { target: { value: "Va, la paso a otra orden" } }); });
    const aceptar = Array.from(cuerpo.querySelectorAll("button")).find(b => /Aceptar y liberar/.test(b.textContent || ""))!;
    await act(async () => { fireEvent.click(aceptar); });

    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].fn).toBe("responder_solicitud");
    expect(rpcs[0].args).toMatchObject({ _aviso_id: "sol1", _aceptar: true, _respuesta: "Va, la paso a otra orden" });
  });

  it("rechazar también pasa por la función, nunca por un UPDATE suelto", async () => {
    filas.avisos = [SOLICITUD];
    const cuerpo = await dibujar(<BandejaAvisos />);
    const rechazar = Array.from(cuerpo.querySelectorAll("button")).find(b => /No se puede/.test(b.textContent || ""))!;
    await act(async () => { fireEvent.click(rechazar); });

    expect(rpcs[0].args).toMatchObject({ _aviso_id: "sol1", _aceptar: false });
    expect(updates).toHaveLength(0);
  });
});
