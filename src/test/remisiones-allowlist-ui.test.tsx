import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

/**
 * Atenea (Comercial) recibe el mismo flujo de asignación que Fábrica
 * sin entrar a Producción: la bandeja Manual vive en Remisiones.
 */

const filas: Record<string, Record<string, unknown>[]> = {};
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select", "order", "eq", "neq", "in", "is", "not", "gte", "lte", "limit", "range", "or", "ilike"]) {
        q[m] = paso;
      }
      q.single = () => Promise.resolve({ data: null, error: null });
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.insert = () => Promise.resolve({ data: null, error: null });
      q.update = () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: [{ id: "r1" }], error: null }),
          then: (res: (r: { data: unknown; error: null }) => void) => res({ data: null, error: null }),
        }),
      });
      q.delete = () => paso();
      q.then = (res: (r: { data: unknown[]; error: null }) => void) =>
        res({ data: filas[tabla] ?? [], error: null });
      return q;
    },
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ fn, args });
      if (fn === "marcar_unidad_entregada") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      if (fn === "marcar_remision_entregada") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      if (fn === "configurar_pedido_remision") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: () => {} }),
    removeChannel: () => {},
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "2dbcd716-388c-4541-b921-f43f7a2c955a", email: "atenea@dazon.demo.com" },
    area: "comercial",
    nivel: "operador",
    role: "ventas",
    activo: true,
    profileName: "Atenea Olivera Portilla",
    loading: false,
    puedeAsignarRemisiones: true,
    perms: {
      puedeVer: () => true,
      puedeCrear: () => true,
      puedeEditar: () => false,
      puedeEliminar: () => false,
      soloPropios: () => true,
      esAdminGlobal: false,
      nivel: "operador",
      area: "comercial",
    },
    signOut: async () => {},
    refreshRole: async () => {},
  }),
}));

vi.mock("@/lib/catalogoModelos", () => ({
  MODELOS_RESPALDO: ["200cc 2026"],
  cargarModelosMotocarro: async () => ["200cc 2026"],
}));

vi.mock("@/lib/catalogoClientes", () => ({
  cargarClientes: async () => [],
}));

vi.mock("@/components/BandejaAvisos", () => ({
  BandejaAvisos: () => <div data-testid="avisos" />,
}));

vi.mock("@/components/ColorChasis", () => ({
  cargarCapacidadColor: async () => new Map(),
}));

vi.mock("sonner", () => ({
  toast: { success: () => {}, error: () => {}, info: () => {}, warning: () => {} },
}));

import Remisiones from "@/pages/Remisiones";

const boton = (texto: RegExp) =>
  Array.from(document.body.querySelectorAll("button")).find(b => texto.test(b.textContent || ""));

const REMISION = {
  id: "r1",
  folio_remision: "REM-099",
  estatus: "NUEVA",
  fecha_remision: "2026-09-29",
  notas: null,
  documento_url: null,
  tipo_pago: "anticipado",
  pagado: true,
  created_at: "2026-09-29T10:00:00Z",
  vendedor_id: "otro-vendedor",
  total_unidades_solicitadas: 1,
  clientes: { codigo_erp: "R200", nombre_comercial: "Cliente Demo" },
  profiles: { nombre_completo: "Otro Vendedor" },
  remision_items: [
    {
      id: "i1",
      tipo_servicio: "motocarro",
      modelo: "200cc 2026",
      color: "BLANCO",
      cantidad: 1,
      con_caja: false,
    },
  ],
  motocarros: [
    {
      id: "m1",
      remision_id: "r1",
      orden_armado: 12,
      modelo: "200cc 2026",
      color: "BLANCO",
      ns_chasis: "CHASISDEMO01",
      ns_motor: "MOTORDEMO01",
      chasis_asignado: "CHASISDEMO01",
      estatus_armado: "LISTO",
      estatus_entrega: "PROGRAMADA",
      fecha_estimada_armado: null,
      fecha_real_armado: "2026-09-28",
      fecha_estimada_entrega: "2026-09-30",
      fecha_real_entrega: null,
    },
  ],
};

describe("Remisiones · allowlist Atenea (sin Producción)", () => {
  beforeEach(() => {
    for (const k of Object.keys(filas)) delete filas[k];
    rpcs.length = 0;
    filas.remisiones = [REMISION];
    filas.motocarros = REMISION.motocarros;
    filas.remision_items = REMISION.remision_items;
    filas.inventario_colores = [];
    filas.modelos_producto = [];
    filas.profiles = [];
    filas.remisiones_bitacora = [];
    filas.config_general = [{ id: 1, limite_ya_armados: 50 }];
  });

  it("monta la bandeja de asignación y el botón Manual en Remisiones", async () => {
    render(
      <MemoryRouter>
        <Remisiones />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Remisiones pendientes de asignar/);
    });

    expect(boton(/^\s*Manual\s*$/)).toBeTruthy();
    expect(boton(/Entregar/i)).toBeTruthy();
  });

  it("permite marcar la unidad como entregada desde la fila de chasis", async () => {
    render(
      <MemoryRouter>
        <Remisiones />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(boton(/Ver chasis y entregas/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(boton(/Ver chasis y entregas/i)!);
    });

    await waitFor(() => {
      expect(boton(/Marcar entregada/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(boton(/Marcar entregada/i)!);
    });

    await waitFor(() => {
      expect(rpcs.some(r => r.fn === "marcar_unidad_entregada")).toBe(true);
    });
  });

  it("guarda la configuración del pedido ajeno por la función, no escribiendo renglones directo", async () => {
    filas.remision_items = REMISION.remision_items.map(it => ({ ...it, remision_id: "r1" }));
    render(
      <MemoryRouter>
        <Remisiones />
      </MemoryRouter>,
    );

    const editarConfig = () =>
      Array.from(document.body.querySelectorAll("button")).find(
        b => (b.textContent || "").trim() === "Editar" && b.querySelector("svg"),
      );

    await waitFor(() => {
      expect(editarConfig()).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(editarConfig()!);
    });

    await waitFor(() => {
      expect(boton(/Guardar configuración/)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(boton(/Guardar configuración/)!);
    });

    await waitFor(() => {
      const llamada = rpcs.find(r => r.fn === "configurar_pedido_remision");
      expect(llamada?.args).toEqual({
        _remision_id: "r1",
        _items: [
          { tipo_servicio: "motocarro", modelo: "200cc 2026", color: "BLANCO", cantidad: 1, con_caja: false },
        ],
      });
    });
  });
});
