import { describe, expect, it } from "vitest";
import {
  aplicarPagoARemisiones,
  disponiblePago,
  estadoPagoDeMontos,
  pathComprobantePagoRefaccion,
  saldoRemision,
  sugerirAplicaciones,
} from "@/lib/pagosRefacciones";

const rem = (id: string, total: number, pagado = 0) => ({
  remisionId: id,
  folio: id,
  montoTotal: total,
  montoPagado: pagado,
});

describe("saldos y estados de pago", () => {
  it("nunca deja saldo negativo", () => {
    expect(saldoRemision(100, 40)).toBe(60);
    expect(saldoRemision(100, 100)).toBe(0);
    expect(saldoRemision(50, 80)).toBe(0);
  });

  it("clasifica sin_pago / parcial / pagado", () => {
    expect(estadoPagoDeMontos(100, 0)).toBe("sin_pago");
    expect(estadoPagoDeMontos(100, 30)).toBe("parcial");
    expect(estadoPagoDeMontos(100, 100)).toBe("pagado");
    expect(estadoPagoDeMontos(100, 100.005)).toBe("pagado");
  });
});

describe("aplicación multi-remisión", () => {
  it("aplica a varias remisiones sin pasar del disponible", () => {
    const r = aplicarPagoARemisiones(1000, [rem("a", 600), rem("b", 500)], [
      { remisionId: "a", monto: 600 },
      { remisionId: "b", monto: 400 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sumaAplicada).toBe(1000);
    expect(r.disponibleRestante).toBe(0);
  });

  it("rechaza si una aplicación supera el saldo de la remisión", () => {
    const r = aplicarPagoARemisiones(500, [rem("a", 200, 50)], [
      { remisionId: "a", monto: 200 },
    ]);
    expect(r).toMatchObject({ ok: false, error: "excede_saldo" });
  });

  it("rechaza si la suma supera el monto del pago", () => {
    const r = aplicarPagoARemisiones(100, [rem("a", 80), rem("b", 80)], [
      { remisionId: "a", monto: 80 },
      { remisionId: "b", monto: 80 },
    ]);
    expect(r).toMatchObject({ ok: false, error: "excede_disponible" });
  });

  it("permite remisiones parcialmente pagadas", () => {
    const r = aplicarPagoARemisiones(50, [rem("a", 200, 100)], [
      { remisionId: "a", monto: 50 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.disponibleRestante).toBe(0);
    expect(estadoPagoDeMontos(200, 150)).toBe("parcial");
  });
});

describe("sugerencia FIFO", () => {
  it("reparte el disponible en orden sin pasarse", () => {
    const sug = sugerirAplicaciones(250, [rem("a", 100), rem("b", 200), rem("c", 50)]);
    expect(sug).toEqual([
      { remisionId: "a", monto: 100 },
      { remisionId: "b", monto: 150 },
    ]);
    expect(disponiblePago(250, 250)).toBe(0);
  });
});

describe("path de comprobante", () => {
  it("guarda bajo pagos-refacciones/{id}/…", () => {
    const p = pathComprobantePagoRefaccion("abc-1", "vale cobro.pdf");
    expect(p.startsWith("pagos-refacciones/abc-1/")).toBe(true);
    expect(p.includes("vale")).toBe(true);
  });
});
