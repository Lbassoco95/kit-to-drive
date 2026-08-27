import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/**
 * La disponibilidad por color tiene que cruzar por **nombre comercial**
 * ("200cc 2026"), que es lo que la remisión captura — no por código de fábrica
 * (DZ200Q1). Antes se cruzaba mal y el aviso de existencias no salía nunca.
 */
const filas: Record<string, Record<string, unknown>[]> = {};

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
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({}) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" }, area: "direccion", nivel: "admin", role: "admin", activo: true,
    profileName: "Polo", loading: false,
    perms: { puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => true,
             puedeEliminar: () => true, soloPropios: () => false, esAdminGlobal: true },
    signOut: async () => {}, refreshRole: async () => {},
  }),
}));

import Remisiones from "@/pages/Remisiones";

// El diálogo se dibuja en un portal, fuera del contenedor que devuelve render():
// hay que buscar en todo el documento.
const boton = (texto: RegExp) =>
  Array.from(document.body.querySelectorAll("button")).find(b => texto.test(b.textContent || ""));

const abrirNueva = async () => {
  render(<MemoryRouter><Remisiones /></MemoryRouter>);
  await act(async () => { fireEvent.click(boton(/Nueva remisión/i)!); });
  return document.body;
};

describe("Remisiones · disponibilidad por color", () => {
  beforeEach(() => { for (const k of Object.keys(filas)) delete filas[k]; });

  it("«Nueva remisión» abre el formulario sin dejar la pantalla en blanco", async () => {
    const cuerpo = await abrirNueva();
    expect(cuerpo.textContent).toContain("Motocarros");
  });

  it("muestra las existencias del color contra el nombre comercial", async () => {
    filas.v_stock_modelo_color = [
      { modelo_comercial: "200cc 2026", color: "BLANCO", unidades_libres: 4, piezas_disponibles: 9, demanda_pendiente: 1 },
    ];
    await abrirNueva();
    // 4 libres + 9 piezas − 1 comprometida = 12
    expect(await screen.findByText(/12 disponibles de Blanco/)).toBeInTheDocument();
  });

  it("avisa cuando la cantidad pedida pasa de lo que hay", async () => {
    filas.v_stock_modelo_color = [
      { modelo_comercial: "200cc 2026", color: "BLANCO", unidades_libres: 0, piezas_disponibles: 2, demanda_pendiente: 0 },
    ];
    const cuerpo = await abrirNueva();
    const cantidad = cuerpo.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(cantidad, { target: { value: "5" } }); });
    expect(await screen.findByText(/faltarían 3 por armar/)).toBeInTheDocument();
  });

  it("descuenta lo que ya apartaron las otras líneas de la misma orden", async () => {
    filas.v_stock_modelo_color = [
      { modelo_comercial: "200cc 2026", color: "BLANCO", unidades_libres: 10, piezas_disponibles: 0, demanda_pendiente: 0 },
    ];
    const cuerpo = await abrirNueva();
    await act(async () => { fireEvent.click(boton(/Agregar motocarro/i)!); });

    const cantidades = cuerpo.querySelectorAll('input[type="number"]');
    expect(cantidades.length).toBe(2);
    await act(async () => { fireEvent.change(cantidades[0], { target: { value: "4" } }); });

    // La línea 2 ya sólo ve 6 (10 − los 4 que apartó la línea 1).
    expect(await screen.findByText(/6 disponibles de Blanco/)).toBeInTheDocument();
  });

  it("ofrece los modelos del catálogo, no una lista escrita a mano", async () => {
    // DZ-K1 existe en inventario pero no tiene nombre comercial. Con la lista
    // escrita a mano quedaba fuera del selector y esa unidad no se podía vender.
    filas.modelos_producto = [
      { modelo: "DZ-K1", linea: "motocarro", nombre_comercial: null, activo: true },
    ];
    const cuerpo = await abrirNueva();
    // Una línea nueva arranca con el primer modelo del catálogo cargado.
    await act(async () => { fireEvent.click(boton(/Agregar motocarro/i)!); });
    expect(cuerpo.textContent).toContain("DZ-K1");
  });
});
