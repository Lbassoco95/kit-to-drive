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
const unicos: Record<string, Record<string, unknown> | null> = {};
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      const paso = () => q;
      for (const m of ["select","order","eq","neq","in","is","not","gte","lte","limit","range","or","ilike"]) q[m] = paso;
      q.single = () => Promise.resolve({ data: null, error: null });
      q.maybeSingle = () => Promise.resolve({ data: unicos[tabla] ?? null, error: null });
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
    profileName: "Eri", loading: false, puedeAsignarRemisiones: true,
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
  { modelo: "DZ300Q7", linea: "motocarro", nombre_comercial: "300cc 2026", activo: true },
];

const conPedido = (item: Record<string, unknown> | null) => {
  for (const k of Object.keys(filas)) delete filas[k];
  for (const k of Object.keys(unicos)) delete unicos[k];
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

/**
 * Dar de alta pasa por la confirmación: el botón del formulario abre el
 * diálogo, y el alta se hace desde ahí.
 */
const darDeAlta = async () => {
  await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });
  await act(async () => { fireEvent.click(boton(/Sí, ya estaba armada/i)!); });
};

/** Deja pasar el debounce de la búsqueda del chasis en inventario. */
const esperarBusquedaChasis = async () => {
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });
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
    await darDeAlta();

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
    await darDeAlta();

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
    await darDeAlta();

    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    // Sin pedido, arranca en el primer modelo del catálogo de fábrica.
    expect(alta!.args._modelo).toBe("200cc 2026");
    expect(alta!.args._color).toBe("BLANCO");
    expect(document.body.textContent).not.toContain("Captura primero la configuración del pedido");
  });
});

/**
 * El caso REM-015, que fue el primero que salió a producción: la remisión pedía
 * 300cc AZUL y el chasis del patio (3DVHCPZF9T1M00487) es un DZ300Q7 BLANCO.
 * Precargar el color del PEDIDO mandaba a repintar un chasis que estaba bien, y
 * el repintado se atoraba contra los juegos de piezas azules —todos ocupados—
 * con un error que dejaba a Fábrica sin salida.
 *
 * Lo que el sistema ya sabe del chasis manda sobre lo que capturó ventas.
 */
describe("Motocarro ya armado · el chasis que ya está en inventario manda", () => {
  const CHASIS_BLANCO = {
    numero_chasis: "3DVHCPZF9T1M00487",
    modelo: "DZ300Q7", color: "BLANCO", color_original: "BLANCO",
  };

  beforeEach(() => {
    // Pedido: 300cc AZUL. Chasis físico: el mismo modelo, pero BLANCO.
    conPedido({ tipo_servicio: "motocarro", modelo: "300cc 2026", color: "AZUL", cantidad: 1, con_caja: false });
    unicos.inventario_chasis = CHASIS_BLANCO;
    // Los juegos de piezas del embarque: los 31 azules ya están ocupados.
    filas.inventario_colores = [
      { modelo: "DZ300Q7", color: "AZUL", piezas_recibidas: 31, juegos_usados: 31 },
      { modelo: "DZ300Q7", color: "BLANCO", piezas_recibidas: 31, juegos_usados: 30 },
    ];
    // Y hay chasis azules libres: si la unidad es azul, es uno de ésos.
    filas.inventario_chasis = [
      ...Array.from({ length: 26 }, () => ({ color: "AZUL" })),
      ...Array.from({ length: 27 }, () => ({ color: "BLANCO" })),
    ];
  });

  it("corrige el color al del chasis en cuanto se captura el serial", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales(CHASIS_BLANCO.numero_chasis, "DZ170MMT2M00487");
    await esperarBusquedaChasis();

    // Dice qué es esa pieza, para que nadie declare a ciegas.
    expect(document.body.textContent).toContain("ya está en inventario como 300cc 2026 · Blanco");

    await darDeAlta();
    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    // El color del pedido era AZUL; se registra el del chasis.
    expect(alta!.args).toMatchObject({ _modelo: "300cc 2026", _color: "BLANCO" });
  });

  it("avisa que la remisión pedía otra cosa, en vez de repintar en silencio", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales(CHASIS_BLANCO.numero_chasis, "DZ170MMT2M00487");
    await esperarBusquedaChasis();
    expect(document.body.textContent).toContain("La remisión pide 300cc 2026 · Azul");
  });

  it("si fábrica insiste en un color sin juegos libres, lo dice y da la salida", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales(CHASIS_BLANCO.numero_chasis, "DZ170MMT2M00487");
    await esperarBusquedaChasis();

    // Fábrica cambia a AZUL a mano: de ese color ya no quedan juegos libres.
    const triggers = Array.from(document.body.querySelectorAll('[role="combobox"]'));
    await act(async () => { fireEvent.keyDown(triggers[1], { key: "Enter" }); });
    const azul = Array.from(document.body.querySelectorAll('[role="option"]'))
      .find(o => /^Azul$/.test(o.textContent || ""));
    await act(async () => { fireEvent.keyDown(azul!, { key: "Enter" }); });

    const texto = document.body.textContent || "";
    expect(texto).toContain("ya no quedan juegos de piezas libres en Azul");
    // Y la salida real: hay chasis azules libres, probablemente es uno de ésos.
    expect(texto).toContain("26 chasis libres en Azul");

    // Aun así se puede registrar: la unidad ya está armada, no se bloquea.
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(false);
  });
});

/**
 * El ingreso de unidades ya armadas es para un lote cerrado: lo que Fábrica
 * ensambló ANTES de que existiera el sistema, menos de 50 unidades. Si la
 * puerta queda abierta sin cuenta, en tres meses nadie distingue una unidad
 * que se cargó porque ya estaba armada de una que se saltó el armado.
 */
describe("Motocarro ya armado · el lote es cerrado y se cuenta", () => {
  beforeEach(() => {
    conPedido({ tipo_servicio: "motocarro", modelo: "300cc 2026", color: "AZUL", cantidad: 1, con_caja: false });
  });

  it("dice cuántas van y cuántas quedan del lote", async () => {
    unicos.v_carga_ya_armados = { cargadas: 23, limite: 50, restantes: 27 };
    await abrirManual();
    await marcarYaArmado();
    expect(document.body.textContent).toContain("cargadas: 23 de 50 — quedan 27");
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(true); // faltan seriales
  });

  it("cuando el lote se acabó no deja capturar, y dice quién sube el tope", async () => {
    unicos.v_carga_ya_armados = { cargadas: 50, limite: 50, restantes: 0 };
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");

    const texto = document.body.textContent || "";
    expect(texto).toContain("Ya se cargaron las 50 unidades");
    expect(texto).toContain("Dirección sube el tope en Configuración");
    // Con seriales completos y todo, el botón sigue cerrado.
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(true);
    expect(rpcs.find(r => r.fn === "crear_motocarro_ya_armado")).toBeUndefined();
  });

  it("si la base todavía no tiene el tope, la pantalla no inventa una cuenta", async () => {
    // `unicos.v_carga_ya_armados` sin definir = la vista no está.
    await abrirManual();
    await marcarYaArmado();
    expect(document.body.textContent).not.toContain("cargadas:");
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    expect(boton(/Crear y asignar unidad armada/i)!.hasAttribute("disabled")).toBe(false);
  });
});

/**
 * Por este camino entra al sistema una unidad que nadie vio armarse. El botón
 * del formulario no da de alta: abre una confirmación con lo que va a quedar
 * registrado, y Fábrica dice que sí con todas sus letras.
 */
describe("Motocarro ya armado · la confirmación es explícita", () => {
  beforeEach(() => {
    conPedido({ tipo_servicio: "motocarro", modelo: "300cc 2026", color: "AZUL", cantidad: 1, con_caja: false });
    unicos.v_carga_ya_armados = { cargadas: 23, limite: 50, restantes: 27 };
  });

  it("el botón no da de alta: pregunta si la unidad ya estaba armada", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });

    const texto = document.body.textContent || "";
    expect(texto).toContain("¿Esta unidad ya estaba armada?");
    // Con lo que va a quedar registrado enfrente, no de memoria.
    expect(texto).toContain("DZ164FMLT2M00654");
    expect(texto).toContain("T2M00654");
    expect(texto).toContain("300cc 2026");
    expect(texto).toContain("REM-044");
    // Y en qué lugar del lote queda.
    expect(texto).toContain("van 24 de 50");
    // Nada se registró todavía.
    expect(rpcs.find(r => r.fn === "crear_motocarro_ya_armado")).toBeUndefined();
  });

  it("si se cancela, no se registra nada", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });
    await act(async () => { fireEvent.click(boton(/No, cancelar/i)!); });

    expect(rpcs.find(r => r.fn === "crear_motocarro_ya_armado")).toBeUndefined();
    expect(document.body.textContent).not.toContain("¿Esta unidad ya estaba armada?");
  });

  it("al confirmar, ahí sí se da de alta", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("DZ164FMLT2M00654", "T2M00654");
    await darDeAlta();

    const alta = rpcs.find(r => r.fn === "crear_motocarro_ya_armado");
    expect(alta).toBeTruthy();
    expect(alta!.args).toMatchObject({ _ns_chasis: "DZ164FMLT2M00654", _ns_motor: "T2M00654" });
  });

  it("avisa cuando el chasis tampoco está en inventario", async () => {
    await abrirManual();
    await marcarYaArmado();
    await escribirSeriales("CHASIS-QUE-NO-EXISTE", "MOTOR-QUE-NO-EXISTE");
    await esperarBusquedaChasis();
    await act(async () => { fireEvent.click(boton(/Crear y asignar unidad armada/i)!); });
    expect(document.body.textContent).toContain("Este chasis tampoco está en inventario");
  });
});
