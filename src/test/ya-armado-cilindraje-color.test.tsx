import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import React from "react";

/**
 * Fábrica ingresa el motocarro que tiene enfrente, no el que capturó ventas.
 * ───────────────────────────────────────────────────────────────────────────
 * La unidad "ya armada" se creaba con el modelo y el color copiados de la
 * configuración del pedido: si el motocarro físico era de otro cilindraje o de
 * otro color, se subía «como está guardado en el sistema» y no había manera de
 * corregirlo. Eso es lo que pidió Fábrica.
 *
 * Estas pruebas cuidan las tres partes del arreglo:
 *   · los dos campos existen y arrancan en lo que pide la remisión,
 *   · lo que se manda a la base es lo que quedó en el formulario,
 *   · una remisión sin configuración capturada ya no bloquea el ingreso.
 */

const filas: Record<string, Record<string, unknown>[]> = {};
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select","order","eq","neq","in","is","not","gte","lte","limit","or","ilike"]) q[m] = paso;
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
      return Promise.resolve({ data: { ok: true, orden_armado: 41 }, error: null });
    },
    storage: { from: () => ({}) },
  },
}));

// Fábrica: es quien ingresa las unidades ya armadas.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u9" }, area: "fabrica", nivel: "coordinador", role: "fabrica", activo: true,
    profileName: "Eri", loading: false,
    perms: { puedeVer: () => true, puedeCrear: () => true, puedeEditar: () => true,
             puedeEliminar: () => false, soloPropios: () => false, esAdminGlobal: false,
             nivel: "coordinador", area: "fabrica" },
    signOut: async () => {}, refreshRole: async () => {},
  }),
}));

import { BandejaRemisiones } from "@/components/BandejaRemisiones";

const boton = (texto: RegExp) =>
  Array.from(document.body.querySelectorAll("button")).find(b => texto.test(b.textContent || ""));

const REMISION = {
  id: "r1", folio_remision: "REM-044", estatus: "NUEVA",
  fecha_remision: "2026-09-07", notas: null, created_at: "2026-09-07T10:00:00Z",
  total_unidades_solicitadas: 1,
  clientes: { codigo_erp: "R195", nombre_comercial: "Ferretería del Sur" },
  profiles: { nombre_completo: "Ana Karen" },
  motocarros: [],
};

/** Catálogo de fábrica: el cilindraje viaja en el nombre comercial. */
const CATALOGO = [
  { modelo: "DZ200Q1", linea: "motocarro", nombre_comercial: "200cc 2026", activo: true },
  { modelo: "DZ300Q1", linea: "motocarro", nombre_comercial: "300cc 2026", activo: true },
];

const conPedido = (item: Record<string, unknown> | null) => {
  for (const k of Object.keys(filas)) delete filas[k];
  rpcs.length = 0;
  filas.remisiones = [REMISION];
  filas.modelos_producto = CATALOGO;
  filas.motocarros = [];
  filas.remision_items = item ? [{ id: "i1", remision_id: "r1", ...item }] : [];
};

/** Abre la bandeja y el diálogo de asignación manual de la remisión. */
const abrirManual = async () => {
  render(<BandejaRemisiones />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { fireEvent.click(boton(/^\s*Manual\s*$/)!); });
  return document.body;
};

/** Marca «Es un motocarro ya armado». */
const marcarYaArmado = async () => {
  await act(async () => { fireEvent.click(document.getElementById("yaArmado")!); });
};

const escribirSeriales = async (chasis: string, motor: string) => {
  const cuerpo = document.body;
  const inChasis = cuerpo.querySelector<HTMLInputElement>('input[placeholder="Buscar o registrar chasis…"]')!;
  const inMotor = cuerpo.querySelector<HTMLInputElement>('input[placeholder="Buscar o registrar motor…"]')!;
  await act(async () => { fireEvent.change(inChasis, { target: { value: chasis } }); });
  await act(async () => { fireEvent.change(inMotor, { target: { value: motor } }); });
};

describe("Motocarro ya armado · cilindraje y color los declara fábrica", () => {
  beforeEach(() => {
    conPedido({ tipo_servicio: "motocarro", modelo: "300cc 2026", color: "AZUL", cantidad: 1, con_caja: false });
  });

  it("los dos campos sólo salen cuando la unidad es «ya armada»", async () => {
    const cuerpo = await abrirManual();
    expect(cuerpo.textContent).toContain("Es un motocarro ya armado");
    expect(cuerpo.textContent).not.toContain("Cilindraje / modelo");

    await marcarYaArmado();
    expect(document.body.textContent).toContain("Cilindraje / modelo");
    // Y se dice de dónde salen, para que nadie los deje como vinieron sin verlos.
    expect(document.body.textContent).toContain("corrígelos si el motocarro que tienes enfrente");
  });

  it("manda a la base lo que pide la remisión mientras nadie lo cambie", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });

    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    expect(alta!.args).toMatchObject({
      _ns_chasis: "DZ164FMLT2M00654",
      _ns_motor: "T2M00654",
      _modelo: "300cc 2026",
      _color: "AZUL",
      _remision_id: "r1",
    });
  });

  /** Abre uno de los dos desplegables y elige una opción por su texto. */
  const elegirEn = async (indice: number, opcion: RegExp) => {
    const triggers = Array.from(document.body.querySelectorAll('[role="combobox"]'));
    expect(triggers.length).toBe(2);   // cilindraje y color, en ese orden
    await act(async () => { fireEvent.keyDown(triggers[indice], { key: "Enter" }); });
    const item = Array.from(document.body.querySelectorAll('[role="option"]'))
      .find(o => opcion.test(o.textContent || ""));
    expect(item, `no salió la opción ${opcion}`).toBeTruthy();
    await act(async () => { fireEvent.keyDown(item!, { key: "Enter" }); });
  };

  it("la unidad se registra con el cilindraje y el color que corrige fábrica", async () => {
    await abrirManual();
    await marcarYaArmado();

    // La remisión pide 300cc azul; el motocarro que llegó al piso es 200cc rojo.
    await elegirEn(0, /^200cc 2026$/);
    await elegirEn(1, /^Rojo$/);

    // Y se dice que ya no es lo que pide la remisión, antes de guardar.
    expect(document.body.textContent).toContain("La remisión pide 300cc 2026 · Azul");

    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });

    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    expect(alta!.args).toMatchObject({ _modelo: "200cc 2026", _color: "ROJO" });
  });

  it("el botón espera a que haya cilindraje, color y los dos seriales", async () => {
    await abrirManual();
    await marcarYaArmado();
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(true);

    await escribirSeriales("DZ164FMLT2M00654", "");
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(true);

    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(false);
  });

  /**
   * Antes esto era un muro: sin configuración del pedido no había de dónde
   * copiar el modelo y el color, así que la unidad no se podía ingresar. Ahora
   * los declara fábrica, así que se puede — y se avisa que lo que elija ahí es
   * lo que queda registrado.
   */
  it("una remisión sin configuración capturada ya no bloquea el ingreso", async () => {
    conPedido(null);
    await abrirManual();
    await marcarYaArmado();
    expect(document.body.textContent).toContain("no tiene configuración capturada");

    await escribirSeriales("DZ164FMLT2M00999", "T2M00999");
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });

    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    // Sin pedido, arranca en el primer modelo del catálogo de fábrica.
    expect(alta!.args._modelo).toBe("200cc 2026");
    expect(alta!.args._color).toBe("BLANCO");
    expect(document.body.textContent).not.toContain("Captura primero la configuración del pedido");
  });
});
