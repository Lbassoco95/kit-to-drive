import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { LangProvider } from "@/contexts/LangContext";

/**
 * En crédito, logística no cobra: al registrar la paquetería deja la fecha
 * estimada, y al confirmar que ya llegó se avisa para notificar al cliente.
 */

const filas: Record<string, Record<string, unknown>[]> = {};
const updates: Record<string, unknown>[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select", "order", "eq", "neq", "in", "is", "not", "gte", "lte", "limit"]) q[m] = paso;
      q.update = (v: Record<string, unknown>) => { updates.push(v); return q; };
      q.then = (res: (r: { data: unknown[]; error: null }) => void) =>
        res({ data: filas[tabla] ?? [], error: null });
      return q;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: { entregada: true }, error: null });
    },
  },
}));

import Entregas from "@/pages/Entregas";

const unidad = (parcial: Record<string, unknown>) => ({
  id: "m1",
  orden_armado: 12,
  color: "AZUL",
  chasis_asignado: "CH-12",
  ns_chasis: "NSCH",
  ns_motor: "NSMO",
  estatus_armado: "LISTO",
  estatus_entrega: "NO_APLICA",
  fecha_estimada_entrega: null,
  fecha_real_entrega: null,
  paqueteria: null,
  numero_guia: null,
  cliente_avisado_at: null,
  remisiones: {
    folio_remision: "REM-9",
    tipo_pago: "credito",
    pagado: false,
    clientes: { codigo_erp: "C-1", folio_interno: null, nombre_comercial: "Taller Norte" },
    profiles: { nombre_completo: "Ana" },
  },
  ...parcial,
});

function pintar() {
  return render(
    <LangProvider>
      <Entregas />
    </LangProvider>,
  );
}

describe("Entregas · crédito", () => {
  beforeEach(() => {
    localStorage.setItem("dazon_lang", "es");
    updates.length = 0;
    rpcs.length = 0;
    filas.motocarros = [];
  });

  it("al registrar la paquetería pide la fecha estimada y la manda junta", async () => {
    filas.motocarros = [unidad({})];
    await act(async () => { pintar(); });

    expect(screen.getByText("Crédito")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Registrar paquetería/ }));

    expect(screen.getByText("Fecha estimada de entrega")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Estafeta/), { target: { value: "Paquetexpress" } });
    const fecha = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(fecha, { target: { value: "2026-10-08" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Registrar paquetería/ }).at(-1)!);

    await act(async () => { await Promise.resolve(); });

    expect(rpcs).toEqual([
      {
        fn: "registrar_paqueteria",
        args: {
          _motocarro_id: "m1",
          _paqueteria: "Paquetexpress",
          _numero_guia: "",
          _fecha_estimada: "2026-10-08",
        },
      },
    ]);
    expect(updates).toHaveLength(0);
  });

  it("confirmar que se entregó avisa para notificar al cliente", async () => {
    filas.motocarros = [unidad({
      estatus_entrega: "EN_RUTA",
      paqueteria: "Estafeta",
      numero_guia: "G-44",
      fecha_estimada_entrega: "2026-10-08",
    })];
    await act(async () => { pintar(); });

    expect(screen.getByText("Estafeta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar que se entregó/ }));
    await act(async () => { await Promise.resolve(); });

    expect(rpcs[0]).toEqual({ fn: "confirmar_entrega_credito", args: { _motocarro_id: "m1" } });
  });

  it("contra entrega sigue esperando el pago y no abre la paquetería", async () => {
    filas.motocarros = [unidad({
      remisiones: {
        folio_remision: "REM-1",
        tipo_pago: "contra_entrega",
        pagado: false,
        clientes: { codigo_erp: "C-1" },
        profiles: { nombre_completo: "Ana" },
      },
    })];
    await act(async () => { pintar(); });

    expect(screen.queryByRole("button", { name: /Registrar paquetería/ })).toBeNull();
    const programar = screen.getByRole("button", { name: /Programar entrega/ }) as HTMLButtonElement;
    expect(programar.disabled).toBe(true);
  });
});
