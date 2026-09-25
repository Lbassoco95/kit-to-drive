import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/**
 * La campana del encabezado es el aviso en la aplicación: si una visita o
 * reunión agendada ya venció, el vendedor la ve sin tener que entrar al CRM.
 */

type Fila = Record<string, unknown>;
const filas: Record<string, Fila[]> = { crm_actividades: [], clientes: [] };
const invocaciones: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select", "order", "eq", "in", "lte", "limit", "is"]) q[m] = paso;
      q.then = (res: (r: { data: Fila[]; error: null }) => void) =>
        res({ data: filas[tabla] ?? [], error: null });
      return q;
    },
    functions: {
      invoke: (...args: unknown[]) => {
        invocaciones.push(args);
        return Promise.resolve({ data: { enviados: 0 }, error: null });
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    perms: { puedeVer: () => true },
  }),
}));

vi.mock("@/contexts/LangContext", async () => {
  const { es } = await import("@/i18n/es");
  return { useLang: () => ({ t: es, lang: "es", toggleLang: () => {} }) };
});

import { CampanaCitas } from "@/components/CampanaCitas";

describe("Campana de citas vencidas", () => {
  beforeEach(() => {
    filas.crm_actividades = [];
    filas.clientes = [];
    invocaciones.length = 0;
  });

  it("no marca nada cuando no hay citas vencidas", async () => {
    render(<MemoryRouter><CampanaCitas /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Visitas y reuniones" })).toBeInTheDocument();
  });

  it("muestra la visita vencida del vendedor y pide el correo", async () => {
    filas.crm_actividades = [{
      id: "a1", tipo: "reunion", estatus: "programada", agendada: true,
      fecha_actividad: "2020-05-01T15:00:00Z", vendedor_id: "u1",
      cliente_id: "c1", objetivo_visita: "Revisar pedido",
    }];
    filas.clientes = [{ id: "c1", nombre_comercial: "Transportes del Norte" }];

    render(<MemoryRouter><CampanaCitas /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "1 visita o reunión vencida" })).toBeInTheDocument();
    expect(invocaciones.length).toBeGreaterThan(0);
  });
});
