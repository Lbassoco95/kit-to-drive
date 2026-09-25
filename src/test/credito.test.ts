import { describe, it, expect } from "vitest";
import {
  clienteTieneCredito, calcularFechaVencimiento, cxcEstaVencida,
  clienteBloqueadoPorCartera, diasAtraso, validarFormCxc, validarFormAbono,
  filtrarCartera, creditoDisponible, mensajeBloqueoCartera, formCxcVacio,
  type ClienteCredito, type CuentaPorCobrar,
} from "@/lib/credito";

describe("clienteTieneCredito", () => {
  it("reconoce días de crédito", () => {
    expect(clienteTieneCredito({ dias_credito: 30, limite_credito: null })).toBe(true);
  });

  it("reconoce límite aunque días sea 0", () => {
    expect(clienteTieneCredito({ dias_credito: 0, limite_credito: 50000 })).toBe(true);
  });

  it("sin días ni límite no tiene crédito", () => {
    expect(clienteTieneCredito({ dias_credito: 0, limite_credito: null })).toBe(false);
    expect(clienteTieneCredito({ dias_credito: 0, limite_credito: 0 })).toBe(false);
  });
});

describe("calcularFechaVencimiento", () => {
  it("suma los días de crédito a la emisión", () => {
    expect(calcularFechaVencimiento("2026-09-01", 30)).toBe("2026-10-01");
  });

  it("con 0 días vence el mismo día", () => {
    expect(calcularFechaVencimiento("2026-09-25", 0)).toBe("2026-09-25");
  });
});

describe("cxcEstaVencida / bloqueo", () => {
  const abierta = (extra: Partial<CuentaPorCobrar> = {}): CuentaPorCobrar => ({
    id: "1",
    folio: "CxC-000001",
    cliente_id: "c1",
    remision_id: null,
    concepto: "Venta",
    monto: 10000,
    saldo: 10000,
    moneda: "MXN",
    fecha_emision: "2026-08-01",
    fecha_vencimiento: "2026-08-31",
    estatus: "ABIERTA",
    notas: null,
    ...extra,
  });

  it("marca vencida si la fecha ya pasó y hay saldo", () => {
    expect(cxcEstaVencida(abierta(), "2026-09-25")).toBe(true);
  });

  it("no marca vencida si aún no vence", () => {
    expect(cxcEstaVencida(abierta({ fecha_vencimiento: "2026-10-01" }), "2026-09-25")).toBe(false);
  });

  it("no marca vencida si ya está pagada", () => {
    expect(cxcEstaVencida(abierta({ estatus: "PAGADA", saldo: 0 }), "2026-09-25")).toBe(false);
  });

  it("no marca vencida si está cancelada aunque tenga saldo histórico", () => {
    expect(cxcEstaVencida(abierta({ estatus: "CANCELADA" }), "2026-09-25")).toBe(false);
  });

  it("bloquea el proceso cuando hay al menos una vencida", () => {
    expect(clienteBloqueadoPorCartera([
      abierta({ fecha_vencimiento: "2026-10-01" }),
      abierta({ id: "2", fecha_vencimiento: "2026-08-01" }),
    ], "2026-09-25")).toBe(true);
  });

  it("no bloquea si todas están al corriente", () => {
    expect(clienteBloqueadoPorCartera([
      abierta({ fecha_vencimiento: "2026-10-01" }),
    ], "2026-09-25")).toBe(false);
  });
});

describe("diasAtraso", () => {
  it("cuenta días naturales de atraso", () => {
    expect(diasAtraso("2026-09-20", "2026-09-25")).toBe(5);
  });

  it("es cero si aún no vence", () => {
    expect(diasAtraso("2026-09-30", "2026-09-25")).toBe(0);
  });
});

describe("validarFormCxc", () => {
  it("acepta un alta válida", () => {
    const f = { ...formCxcVacio(30), concepto: "Venta KTD", monto: "15000" };
    expect(validarFormCxc(f)).toEqual([]);
  });

  it("exige concepto y monto positivo", () => {
    expect(validarFormCxc({ ...formCxcVacio(), concepto: "  ", monto: "0" })).toEqual(
      expect.arrayContaining([
        "El concepto es obligatorio",
        "El monto debe ser mayor a cero",
      ]),
    );
  });

  it("rechaza vencimiento anterior a la emisión", () => {
    const f = {
      ...formCxcVacio(),
      concepto: "X",
      monto: "10",
      fecha_emision: "2026-09-25",
      fecha_vencimiento: "2026-09-01",
    };
    expect(validarFormCxc(f)).toContain("El vencimiento no puede ser anterior a la emisión");
  });
});

describe("validarFormAbono", () => {
  it("rechaza abono mayor al saldo", () => {
    expect(validarFormAbono({
      monto: "500",
      fecha_abono: "2026-09-25",
      metodo_pago: "EFECTIVO",
      referencia: "",
      notas: "",
    }, 100)).toContain("El abono no puede superar el saldo pendiente");
  });

  it("acepta abono igual al saldo", () => {
    expect(validarFormAbono({
      monto: "100",
      fecha_abono: "2026-09-25",
      metodo_pago: "EFECTIVO",
      referencia: "",
      notas: "",
    }, 100)).toEqual([]);
  });
});

describe("filtrarCartera / disponible", () => {
  const base = (extra: Partial<ClienteCredito>): ClienteCredito => ({
    id: "1",
    codigo_erp: "C001",
    folio_interno: "CLI-2026-001",
    nombre_comercial: "Motos del Sur",
    razon_social: null,
    telefono: null,
    email_cobranza: null,
    limite_credito: 100000,
    dias_credito: 30,
    moneda_credito: "MXN",
    activo: true,
    saldo_abierto: 0,
    saldo_vencido: 0,
    cxc_abiertas: 0,
    cxc_vencidas: 0,
    ...extra,
  });

  it("filtra vencidos y búsqueda", () => {
    const rows = [
      base({ id: "a", saldo_vencido: 5000, nombre_comercial: "Alpha" }),
      base({ id: "b", saldo_vencido: 0, nombre_comercial: "Beta" }),
    ];
    expect(filtrarCartera(rows, "VENCIDOS", "").map(c => c.id)).toEqual(["a"]);
    expect(filtrarCartera(rows, "AL_CORRIENTE", "bet").map(c => c.id)).toEqual(["b"]);
  });

  it("calcula crédito disponible", () => {
    expect(creditoDisponible(base({ limite_credito: 100000, saldo_abierto: 25000 }))).toBe(75000);
    expect(creditoDisponible(base({ limite_credito: null }))).toBeNull();
  });
});

describe("mensajeBloqueoCartera", () => {
  it("usa el primer folio del resumen", () => {
    const msg = mensajeBloqueoCartera(
      [{ folio: "CxC-000007", saldo: 1, fecha_vencimiento: "2026-01-01", dias_atraso: 10 }],
      (folio, n) => `${folio}/${n}`,
      n => `sin/${n}`,
    );
    expect(msg).toBe("CxC-000007/1");
  });
});
