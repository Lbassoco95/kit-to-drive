import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Humo de pantallas.
 *
 * Un error al DIBUJAR desmonta el árbol de React y la app se queda en blanco;
 * ya pasó en CRM → Actividades con un `onClick={save}` que apuntaba a una
 * función inexistente. Estas pruebas dibujan cada pantalla con Supabase
 * simulado: no revisan la lógica de negocio, sólo que la pantalla exista.
 */

const filas: Record<string, unknown[]> = {};
const consulta = (tabla: string) => {
  const q: Record<string, unknown> = {};
  const paso = () => q;
  for (const m of ["select","order","eq","neq","in","is","not","gte","lte","lt","gt","like","ilike","limit","range","or","filter","contains","overlaps"]) q[m] = paso;
  q.single  = () => Promise.resolve({ data: null, error: null });
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.insert  = () => Promise.resolve({ data: null, error: null });
  q.update  = () => paso();
  q.delete  = () => paso();
  q.upsert  = () => Promise.resolve({ data: null, error: null });
  q.then = (res: (r: { data: unknown[]; error: null }) => void) => res({ data: filas[tabla] ?? [], error: null });
  return q;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: consulta,
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({
      upload: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: () => Promise.resolve({ data: null, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

const permisosTotales = {
  puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => true,
  puedeEliminar: () => true, soloPropios: () => false, esAdminGlobal: true,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "polo@dazon.mx" },
    session: null, area: "direccion", nivel: "admin", role: "admin",
    activo: true, profileName: "Polo", loading: false,
    perms: permisosTotales, signOut: async () => {}, refreshRole: async () => {},
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const paginas: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  "Dashboard":        () => import("@/pages/Dashboard"),
  "Producción":       () => import("@/pages/Produccion"),
  "Inventario":       () => import("@/pages/Inventario"),
  "Incidencias":      () => import("@/pages/Incidencias"),
  "Reportes de turno":() => import("@/pages/ReportesTurno"),
  "Remisiones":       () => import("@/pages/Remisiones"),
  "Remisiones refacciones": () => import("@/pages/RemisionesRefacciones"),
  "Entregas":         () => import("@/pages/Entregas"),
  "Mis motocarros":   () => import("@/pages/MisMotocarros"),
  "Clientes":         () => import("@/pages/Clientes"),
  "Importar":         () => import("@/pages/Importar"),
  "Usuarios":         () => import("@/pages/Usuarios"),
  "Bitácora":         () => import("@/pages/Bitacora"),
  "Configuración":    () => import("@/pages/Configuracion"),
  "Finanzas":         () => import("@/pages/Finanzas"),
  "Proveedores":      () => import("@/pages/Proveedores"),
  "CRM · Oportunidades": () => import("@/pages/crm/CrmOportunidades"),
  "CRM · Actividades":   () => import("@/pages/crm/CrmActividades"),
  "CRM · Rutas":         () => import("@/pages/crm/CrmRutas"),
  "CRM · Equipo":        () => import("@/pages/crm/CrmEquipo"),
  "CRM · Tracker":       () => import("@/pages/crm/CrmTracker"),
};

/**
 * Abre todo lo que se pueda abrir y revisa que la pantalla siga viva.
 * El contenido de un diálogo sólo se dibuja al abrirlo, así que un error ahí
 * no se ve hasta que alguien le da clic — y entonces se lleva la app entera.
 */
async function clicEnTodosLosBotones(container: HTMLElement) {
  const rotos: string[] = [];
  const botones = Array.from(container.querySelectorAll("button"));
  for (const boton of botones) {
    const etiqueta = (boton.textContent || boton.getAttribute("aria-label") || "«sin texto»").trim().slice(0, 40);
    try {
      await act(async () => { fireEvent.click(boton); });
    } catch (e) {
      rotos.push(`${etiqueta} → ${(e as Error).message}`);
    }
    if (!container.textContent?.trim()) {
      rotos.push(`${etiqueta} → dejó la pantalla en blanco`);
      break;
    }
  }
  return rotos;
}

describe("pantallas · se dibujan sin tronar", () => {
  beforeEach(() => { for (const k of Object.keys(filas)) delete filas[k]; });
  afterEach(() => { vi.restoreAllMocks(); });

  for (const [nombre, cargar] of Object.entries(paginas)) {
    it(nombre, async () => {
      const { default: Pagina } = await cargar();
      const { container } = render(<MemoryRouter><Pagina /></MemoryRouter>);
      // Sin datos, una pantalla puede quedar vacía de contenido — pero nunca
      // vacía del todo: siempre debe decir algo (título, «cargando», o el
      // motivo por el que no hay nada que mostrar).
      expect(container.textContent?.trim()).not.toBe("");
    });
  }
});

describe("inventario · recepciones", () => {
  it("abre el documento vacío y el alta de una compra", async () => {
    const { default: Pagina } = await paginas.Inventario();
    const { container } = render(<MemoryRouter><Pagina /></MemoryRouter>);
    await waitFor(() => {
      const tab = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Recepciones"));
      expect(tab).toBeTruthy();
    });
    const tab = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Recepciones"));
    await act(async () => { fireEvent.mouseDown(tab!, { button: 0, ctrlKey: false }); });
    await waitFor(() => {
      expect(container.textContent).toContain("Documentos de inventario");
      expect(container.textContent).toContain("Todavía no hay documentos");
    });
    const alta = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Nueva compra"));
    expect(alta).toBeTruthy();
    await act(async () => { fireEvent.click(alta!); });
    expect(document.body.textContent).toContain("Folio de compra");
    expect(document.body.textContent).toContain("Lo pedido");
  });
});

describe("pantallas · los botones no dejan la pantalla en blanco", () => {
  beforeEach(() => { for (const k of Object.keys(filas)) delete filas[k]; });
  afterEach(() => { vi.restoreAllMocks(); });

  for (const [nombre, cargar] of Object.entries(paginas)) {
    it(nombre, async () => {
      // Los `confirm()` se responden que no: la idea es abrir pantallas, no
      // disparar borrados.
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { default: Pagina } = await cargar();
      const { container } = render(<MemoryRouter><Pagina /></MemoryRouter>);
      const rotos = await clicEnTodosLosBotones(container);
      expect(rotos, `Botones que truenan en ${nombre}:\n${rotos.join("\n")}`).toEqual([]);
    }, 30_000);
  }
});


describe("Select · ninguna opción con valor vacío", () => {
  // Radix reserva la cadena vacía para «sin selección»: un <SelectItem value="">
  // truena al abrir el desplegable y, como pasa al dibujar, deja la app en
  // blanco. Fue lo que tumbaba «Nueva remisión».
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "test") recorrer(ruta); }
      else if (/\.tsx$/.test(e.name)) archivos.push(ruta);
    }
  };
  recorrer("src");

  // Los comentarios se quitan antes de buscar: si no, esta misma explicación
  // (y la que quedó en Remisiones) contarían como infracción.
  const sinComentarios = (código: string) =>
    código.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("ninguna opción de Select usa la cadena vacía como valor", () => {
    const culpables = archivos.filter(f =>
      /<SelectItem\s[^>]*value=""/.test(sinComentarios(readFileSync(f, "utf8"))));
    expect(culpables, `Usa un valor centinela en:\n${culpables.join("\n")}`).toEqual([]);
  });
});
