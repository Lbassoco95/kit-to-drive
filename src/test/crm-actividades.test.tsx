import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/**
 * CRM → Actividades se quedaba en blanco al entrar: el botón «Guardar» del
 * diálogo de edición apuntaba a `save`, una función que nunca se escribió.
 * Como la referencia se evalúa al DIBUJAR (no al hacer clic), la excepción
 * salía en cada render y, sin ErrorBoundary, desmontaba la app completa.
 * Estas pruebas dibujan la pantalla de verdad para que no vuelva a pasar.
 */

type Fila = Record<string, unknown>;
const filas: Record<string, Fila[]> = {
  crm_actividades: [], clientes: [], profiles: [], crm_oportunidades: [],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q = {
        select: () => q, order: () => q, eq: () => q,
        // El catálogo de clientes se lee por tramos (PostgREST corta en 1000).
        range: () => q,
        then: (res: (r: { data: Fila[]; error: null }) => void) =>
          res({ data: filas[tabla] ?? [], error: null }),
      };
      return q;
    },
    storage: { from: () => ({}) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    perms: { puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => true, puedeEliminar: () => true },
  }),
}));

// El diccionario real: la pantalla saca de aquí cada etiqueta, así que un mock
// vacío la tiraría al primer `t.crm…`.
vi.mock("@/contexts/LangContext", async () => {
  const { es } = await import("@/i18n/es");
  return { useLang: () => ({ t: es, lang: "es", toggleLang: () => {} }) };
});

import CrmActividades from "@/pages/crm/CrmActividades";

describe("CRM · Actividades", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) filas[k] = [];
  });

  it("dibuja la pantalla vacía sin tronar", async () => {
    render(<CrmActividades />);
    expect(await screen.findByText("Actividades")).toBeInTheDocument();
    expect(await screen.findByText("Sin actividades")).toBeInTheDocument();
  });

  it("dibuja una visita completada con su cliente y vendedor", async () => {
    filas.crm_actividades = [{
      id: "a1", tipo: "visita", estatus: "completada", titulo: "Visita",
      fecha_actividad: "2026-08-20T10:00:00Z",
      cliente_id: "c1", vendedor_id: "u1", resultado: "Cerró pedido",
    }];
    filas.clientes = [{ id: "c1", nombre_comercial: "Refaccionaria San Pablo" }];
    filas.profiles = [{ id: "u1", nombre_completo: "Marco" }];

    render(<CrmActividades />);
    expect(await screen.findByText("Refaccionaria San Pablo")).toBeInTheDocument();
    expect(await screen.findByText("Marco")).toBeInTheDocument();
    expect(await screen.findByText("Completada")).toBeInTheDocument();
  });

  it("aguanta filas incompletas: sin estatus, sin cliente y sin vendedor", async () => {
    // Las actividades viejas del CRM no traen estatus ni objetivo_visita.
    filas.crm_actividades = [{ id: "a2", tipo: "llamada", fecha_actividad: "2026-08-19T09:00:00Z" }];

    render(<CrmActividades />);
    expect(await screen.findByText("Sin cliente")).toBeInTheDocument();
    expect(await screen.findByText("Sin vendedor")).toBeInTheDocument();
  });
});
