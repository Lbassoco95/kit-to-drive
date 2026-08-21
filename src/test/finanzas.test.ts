import { describe, it, expect } from "vitest";
import {
  validarMovimiento, requiereComprobacion, faltanteComprobacion, totalesMXN,
  coincideBusqueda, formVacio, fmtFecha, etiquetaVia, etiquetaIntermediario,
  type Cuenta, type Movimiento, type MovimientoForm,
} from "@/lib/finanzas";

const CUENTAS: Cuenta[] = [
  { id: "caja-mxn", nombre: "Caja chica", tipo: "EFECTIVO", moneda: "MXN", banco: null, numero_cuenta: null, saldo_inicial: 0, activo: true, orden: 1 },
  { id: "caja-usd", nombre: "Caja dólares", tipo: "EFECTIVO", moneda: "USD", banco: null, numero_cuenta: null, saldo_inicial: 0, activo: true, orden: 2 },
];

/** Ingreso válido base: el cliente vino a pagar en caja. */
function ingresoValido(): MovimientoForm {
  return {
    ...formVacio("INGRESO"),
    concepto: "Abono unidad KTD-40",
    monto: "25000",
    cuenta_id: "caja-mxn",
    contraparte_tipo: "CLIENTE",
    cliente_id: "cli-1",
    contraparte_nombre: "Motos del Sur",
  };
}

/** Egreso válido base: transferencia directa al proveedor. */
function egresoValido(): MovimientoForm {
  return {
    ...formVacio("EGRESO"),
    concepto: "Pago acero lote 12",
    monto: "40000",
    metodo_pago: "TRANSFERENCIA",
    cuenta_id: "caja-mxn",
    contraparte_tipo: "PROVEEDOR",
    proveedor_id: "prov-1",
    contraparte_nombre: "Aceros Bajío",
  };
}

describe("validarMovimiento", () => {
  it("acepta un ingreso bien capturado", () => {
    expect(validarMovimiento(ingresoValido(), CUENTAS)).toEqual([]);
  });

  it("acepta un egreso bien capturado", () => {
    expect(validarMovimiento(egresoValido(), CUENTAS)).toEqual([]);
  });

  it("exige concepto", () => {
    const f = { ...ingresoValido(), concepto: "   " };
    expect(validarMovimiento(f, CUENTAS)).toContain("El concepto es obligatorio");
  });

  it("exige saber quién pagó en un ingreso", () => {
    const f = { ...ingresoValido(), contraparte_nombre: "" };
    expect(validarMovimiento(f, CUENTAS)).toContain("Falta indicar quién pagó");
  });

  it("exige saber a quién se le pagó en un egreso", () => {
    const f = { ...egresoValido(), contraparte_nombre: "" };
    expect(validarMovimiento(f, CUENTAS)).toContain("Falta indicar a quién se le pagó");
  });

  it("rechaza monto cero o negativo", () => {
    expect(validarMovimiento({ ...ingresoValido(), monto: "0" }, CUENTAS))
      .toContain("El monto debe ser mayor a cero");
    expect(validarMovimiento({ ...ingresoValido(), monto: "-5" }, CUENTAS))
      .toContain("El monto debe ser mayor a cero");
  });

  it("rechaza monto vacío o no numérico", () => {
    expect(validarMovimiento({ ...ingresoValido(), monto: "" }, CUENTAS))
      .toContain("El monto es obligatorio");
    expect(validarMovimiento({ ...ingresoValido(), monto: "abc" }, CUENTAS))
      .toContain("El monto es obligatorio");
  });

  it("exige tipo de cambio en moneda extranjera", () => {
    const f = { ...ingresoValido(), moneda: "USD", cuenta_id: "caja-usd", tipo_cambio: "" };
    expect(validarMovimiento(f, CUENTAS)).toContain("Captura el tipo de cambio de USD a MXN");
  });

  it("no pide tipo de cambio en pesos", () => {
    expect(validarMovimiento(ingresoValido(), CUENTAS)).toEqual([]);
  });

  it("exige elegir el cliente del catálogo, no solo escribir el nombre", () => {
    const f = { ...ingresoValido(), cliente_id: null };
    expect(validarMovimiento(f, CUENTAS)).toContain("Selecciona el cliente de la lista");
  });

  it("exige elegir el proveedor del catálogo", () => {
    const f = { ...egresoValido(), proveedor_id: null };
    expect(validarMovimiento(f, CUENTAS)).toContain("Selecciona el proveedor de la lista");
  });

  it("permite contraparte de texto libre cuando es OTRO", () => {
    const f: MovimientoForm = {
      ...ingresoValido(),
      contraparte_tipo: "OTRO",
      cliente_id: null,
      contraparte_nombre: "Señor del mostrador",
    };
    expect(validarMovimiento(f, CUENTAS)).toEqual([]);
  });

  it("exige decir quién trajo el dinero cuando la vía es intermediario", () => {
    const f: MovimientoForm = { ...ingresoValido(), via: "INTERMEDIARIO" };
    expect(validarMovimiento(f, CUENTAS)).toContain(etiquetaIntermediario("INGRESO"));
  });

  it("acepta intermediario del equipo", () => {
    const f: MovimientoForm = { ...ingresoValido(), via: "INTERMEDIARIO", intermediario_id: "perfil-1" };
    expect(validarMovimiento(f, CUENTAS)).toEqual([]);
  });

  it("acepta intermediario externo escrito a mano", () => {
    const f: MovimientoForm = { ...ingresoValido(), via: "INTERMEDIARIO", intermediario_nombre: "Beto el chofer" };
    expect(validarMovimiento(f, CUENTAS)).toEqual([]);
  });

  it("no acepta un intermediario en blanco", () => {
    const f: MovimientoForm = { ...ingresoValido(), via: "INTERMEDIARIO", intermediario_nombre: "   " };
    expect(validarMovimiento(f, CUENTAS)).toContain(etiquetaIntermediario("INGRESO"));
  });

  it("impide mezclar monedas entre movimiento y cuenta", () => {
    const f = { ...ingresoValido(), moneda: "USD", tipo_cambio: "18.5", cuenta_id: "caja-mxn" };
    expect(validarMovimiento(f, CUENTAS))
      .toContain("«Caja chica» maneja MXN; el movimiento está en USD");
  });

  it("acepta USD contra la caja en dólares", () => {
    const f = { ...ingresoValido(), moneda: "USD", tipo_cambio: "18.5", cuenta_id: "caja-usd" };
    expect(validarMovimiento(f, CUENTAS)).toEqual([]);
  });

  it("exige fecha del movimiento", () => {
    const f = { ...ingresoValido(), fecha_movimiento: "" };
    expect(validarMovimiento(f, CUENTAS)).toContain("La fecha del movimiento es obligatoria");
  });
});

describe("requiereComprobacion", () => {
  it("marca el efectivo entregado a un tercero para que pague", () => {
    expect(requiereComprobacion({ tipo: "EGRESO", metodo_pago: "EFECTIVO", via: "INTERMEDIARIO" })).toBe(true);
  });

  it("no marca el pago directo en efectivo", () => {
    expect(requiereComprobacion({ tipo: "EGRESO", metodo_pago: "EFECTIVO", via: "DIRECTO" })).toBe(false);
  });

  it("no marca transferencias, aunque vayan vía intermediario", () => {
    expect(requiereComprobacion({ tipo: "EGRESO", metodo_pago: "TRANSFERENCIA", via: "INTERMEDIARIO" })).toBe(false);
  });

  it("no marca ingresos: el efectivo que llega ya está en caja", () => {
    expect(requiereComprobacion({ tipo: "INGRESO", metodo_pago: "EFECTIVO", via: "INTERMEDIARIO" })).toBe(false);
  });
});

describe("faltanteComprobacion", () => {
  it("queda en cero cuando comprobado + cambio cubren lo entregado", () => {
    expect(faltanteComprobacion({ monto: 8000, monto_comprobado: 7500, monto_devuelto: 500 })).toBe(0);
  });

  it("detecta el faltante cuando no cuadra", () => {
    expect(faltanteComprobacion({ monto: 8000, monto_comprobado: 7000, monto_devuelto: 500 })).toBe(500);
  });

  it("cuenta todo como faltante mientras no se comprueba nada", () => {
    expect(faltanteComprobacion({ monto: 8000, monto_comprobado: null, monto_devuelto: null })).toBe(8000);
  });

  it("no arrastra errores de punto flotante", () => {
    expect(faltanteComprobacion({ monto: 100.1, monto_comprobado: 0.2, monto_devuelto: 0.1 })).toBe(99.8);
  });
});

describe("totalesMXN", () => {
  const mov = (p: Partial<Movimiento>): Movimiento => ({
    estatus: "CONFIRMADO", tipo: "INGRESO", monto_mxn: 0, ...p,
  } as Movimiento);

  it("suma ingresos y egresos ya normalizados a pesos", () => {
    const t = totalesMXN([
      mov({ tipo: "INGRESO", monto_mxn: 25000 }),
      mov({ tipo: "INGRESO", monto_mxn: 12000 }),
      mov({ tipo: "EGRESO", monto_mxn: 8000 }),
    ]);
    expect(t).toEqual({ ingresos: 37000, egresos: 8000, neto: 29000 });
  });

  it("ignora lo que no está confirmado", () => {
    const t = totalesMXN([
      mov({ tipo: "INGRESO", monto_mxn: 1000 }),
      mov({ tipo: "INGRESO", monto_mxn: 5000, estatus: "PENDIENTE" }),
      mov({ tipo: "EGRESO", monto_mxn: 900, estatus: "CANCELADO" }),
    ]);
    expect(t).toEqual({ ingresos: 1000, egresos: 0, neto: 1000 });
  });

  it("da neto negativo cuando se gastó más de lo que entró", () => {
    const t = totalesMXN([
      mov({ tipo: "INGRESO", monto_mxn: 100 }),
      mov({ tipo: "EGRESO", monto_mxn: 400 }),
    ]);
    expect(t.neto).toBe(-300);
  });

  it("no rompe con la lista vacía", () => {
    expect(totalesMXN([])).toEqual({ ingresos: 0, egresos: 0, neto: 0 });
  });
});

describe("coincideBusqueda", () => {
  const m = {
    folio: "ING-000012",
    concepto: "Abono unidad KTD-40",
    contraparte_nombre: "Motos del Sur",
    categoria: "Abono a crédito",
    descripcion: null,
    referencia: "SPEI-99881",
    factura_folio: null,
    cuenta_nombre: "Caja chica",
    intermediario_display: "Beto Chofer",
    cliente_codigo: "CLI-001",
    folio_remision: "REM-2026-004",
  } as Movimiento;

  it("todo coincide con la búsqueda vacía", () => {
    expect(coincideBusqueda(m, "")).toBe(true);
    expect(coincideBusqueda(m, "   ")).toBe(true);
  });

  it("busca por folio, cliente, referencia, remisión y quién lo trajo", () => {
    for (const term of ["ING-000012", "motos del sur", "spei-99881", "REM-2026", "beto", "CLI-001"]) {
      expect(coincideBusqueda(m, term), term).toBe(true);
    }
  });

  it("ignora mayúsculas y espacios de sobra", () => {
    expect(coincideBusqueda(m, "  MOTOS  ".trim())).toBe(true);
  });

  it("no inventa coincidencias", () => {
    expect(coincideBusqueda(m, "aceros bajío")).toBe(false);
  });
});

describe("fmtFecha", () => {
  it("no corre la fecha un día por zona horaria", () => {
    // Un `date` de Postgres llega como YYYY-MM-DD sin hora: si se parsea como
    // UTC, en México se vería el día anterior.
    expect(fmtFecha("2026-01-01")).toContain("2026");
    expect(fmtFecha("2026-01-01")).toContain("1");
  });

  it("tolera nulos y basura", () => {
    expect(fmtFecha(null)).toBe("—");
    expect(fmtFecha("no-es-fecha")).toBe("—");
  });
});

describe("etiquetaVia", () => {
  it("explica la vía en los términos de cada operación", () => {
    expect(etiquetaVia("INGRESO", "DIRECTO")).toBe("El cliente pagó directo en caja");
    expect(etiquetaVia("INGRESO", "INTERMEDIARIO")).toBe("Alguien trajo el dinero");
    expect(etiquetaVia("EGRESO", "DIRECTO")).toBe("Le pagamos directo al beneficiario");
    expect(etiquetaVia("EGRESO", "INTERMEDIARIO")).toBe("Entregamos el efectivo a alguien para que pagara");
  });
});

describe("formVacio", () => {
  it("propone cliente como contraparte de un ingreso", () => {
    expect(formVacio("INGRESO").contraparte_tipo).toBe("CLIENTE");
  });

  it("propone proveedor como contraparte de un egreso", () => {
    expect(formVacio("EGRESO").contraparte_tipo).toBe("PROVEEDOR");
  });

  it("arranca en efectivo, pago directo y con la fecha de hoy", () => {
    const f = formVacio("INGRESO");
    expect(f.metodo_pago).toBe("EFECTIVO");
    expect(f.via).toBe("DIRECTO");
    expect(f.fecha_movimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
