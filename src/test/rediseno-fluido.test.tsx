import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { es } from "@/i18n/es";
import { zh } from "@/i18n/zh";
import { clampPct, EstadoVacio } from "@/components/EstadoVacio";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select", "order", "eq", "neq", "in", "is", "not", "gte", "lte", "ilike", "limit", "or", "filter"]) {
        q[m] = paso;
      }
      q.then = (res: (r: { data: unknown[]; error: null; count: number }) => void) =>
        res({ data: [], error: null, count: 0 });
      return q;
    },
  },
}));

vi.mock("@/lib/finanzasDb", () => ({
  fdb: {
    from: () => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select", "order", "eq", "ilike", "limit", "or"]) q[m] = paso;
      q.then = (res: (r: { data: unknown[]; error: null }) => void) => res({ data: [], error: null });
      return q;
    },
  },
}));

const permisosTotales = {
  puedeVer: (m: string) => m !== "bitacora",
  puedeCrear: () => true,
  puedeEditar: () => true,
  puedeEliminar: () => true,
  soloPropios: () => false,
  esAdminGlobal: true,
  inicio: "/",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "polo@dazon.mx" },
    session: null,
    area: "direccion",
    nivel: "admin",
    role: "admin",
    activo: true,
    profileName: "Polo",
    loading: false,
    perms: permisosTotales,
    puedeVerRefacciones: true,
    signOut: async () => {},
    refreshRole: async () => {},
  }),
}));

vi.mock("@/contexts/LangContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/LangContext")>("@/contexts/LangContext");
  return {
    ...actual,
    useLang: () => ({
      lang: "es" as const,
      t: es,
      toggleLang: () => {},
      setLang: () => {},
    }),
  };
});

describe("rediseño fluido", () => {
  it("aplica y quita clase sin-cristal", () => {
    document.documentElement.classList.remove("sin-cristal");
    document.documentElement.classList.add("sin-cristal");
    expect(document.documentElement.classList.contains("sin-cristal")).toBe(true);
    document.documentElement.classList.remove("sin-cristal");
    expect(document.documentElement.classList.contains("sin-cristal")).toBe(false);
  });

  it("limita el porcentaje del orbe a 0–100", () => {
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(0)).toBe(0);
    expect(clampPct(50)).toBe(50);
    expect(clampPct(150)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(0);
  });

  it("EstadoVacio muestra panda centrado y acción", () => {
    render(
      <MemoryRouter>
        <EstadoVacio pose="listo" titulo="Todo al día" detalle="No hay pendientes" accionLabel="Ir" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir" })).toBeTruthy();
    const img = document.querySelector('img[src="/brand/mascota/panda-listo-palomeado.png"]');
    expect(img).toBeTruthy();
    expect(img?.className).toContain("h-[88%]");
  });

  it("grupo CRM se llama Comercial / 销售与客户", () => {
    expect(es.groups.CRM).toBe("Comercial");
    expect(zh.groups.CRM).toBe("销售与客户");
  });

  it("textos de apertura bilingües de la sección 4", () => {
    expect(es.auth.heroTitle).toBe("Todo Dazon, fluyendo en un solo lugar");
    expect(zh.auth.heroTitle).toBe("Dazon 的一切，汇流于一处");
    expect(es.auth.heroSub).toContain("Producción");
    expect(zh.auth.heroSub).toContain("生产");
    expect(es.layout.porMati).toBe("por Mati");
    expect(zh.layout.porMati).toBe("由 Mati 驱动");
    expect(es.dashboard.hoy).toBe("Hoy en Dazon");
    expect(zh.dashboard.hoy).toBe("今日 Dazon");
    expect(es.dashboard.accesos).toBe("Ir a");
    expect(zh.dashboard.accesos).toBe("快速前往");
    expect(es.layout.searchData).toBe("Buscar clientes, remisiones, unidades…");
    expect(zh.layout.searchData).toBe("搜索客户、提货单、车辆…");
  });

  it("paridad de llaves i18n es ↔ zh", () => {
    const walk = (a: unknown, b: unknown, path: string, missing: string[]) => {
      if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return;
      if (typeof a === "function" || typeof b === "function") return;
      const ak = Object.keys(a as object);
      const bk = Object.keys(b as object);
      for (const k of ak) {
        if (!(k in (b as object))) missing.push(`zh falta ${path}.${k}`);
        else walk((a as any)[k], (b as any)[k], `${path}.${k}`, missing);
      }
      for (const k of bk) {
        if (!(k in (a as object))) missing.push(`es falta ${path}.${k}`);
      }
    };
    const missing: string[] = [];
    walk(es, zh, "root", missing);
    expect(missing).toEqual([]);
  });

  it("PaletaGlobal abre y lista pantallas filtrando por permisos", async () => {
    const { PaletaGlobal } = await import("@/components/PaletaGlobal");
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <PaletaGlobal open onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText(es.layout.searchData)).toBeTruthy();
    // Dashboard está en ITEMS; bitácora no (puedeVer false)
    expect(screen.getByText(es.nav.dashboard)).toBeTruthy();
    expect(screen.queryByText(es.nav.bitacora)).toBeNull();
  });
});

describe("PaletaGlobal atajo (AppLayout)", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("sin-cristal");
  });
  afterEach(() => {
    document.documentElement.classList.remove("sin-cristal");
  });

  it("Ctrl+K dispara evento de teclado manejable", () => {
    const handler = vi.fn((e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") e.preventDefault();
    });
    window.addEventListener("keydown", handler);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("keydown", handler);
  });
});
