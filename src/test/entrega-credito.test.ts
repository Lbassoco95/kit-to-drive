import { describe, it, expect } from "vitest";
import { esPagoCredito, faltaRegistrarPaqueteria, validarRegistroPaqueteria } from "@/lib/entregaCredito";
import { explicarError } from "@/lib/dazon";

describe("entrega a crédito", () => {
  it("reconoce el tipo de pago crédito y no lo confunde con contra entrega", () => {
    expect(esPagoCredito("credito")).toBe(true);
    expect(esPagoCredito("contra_entrega")).toBe(false);
    expect(esPagoCredito("anticipado")).toBe(false);
    expect(esPagoCredito(null)).toBe(false);
  });

  it("pide paquetería y fecha estimada antes de dar la unidad por enviada", () => {
    expect(faltaRegistrarPaqueteria({ estatus_entrega: "NO_APLICA" })).toBe(true);
    expect(faltaRegistrarPaqueteria({
      estatus_entrega: "PROGRAMADA",
      paqueteria: "Estafeta",
    })).toBe(true);
    expect(faltaRegistrarPaqueteria({
      estatus_entrega: "EN_RUTA",
      paqueteria: "Estafeta",
      fecha_estimada_entrega: "2026-10-02",
    })).toBe(false);
    expect(faltaRegistrarPaqueteria({
      estatus_entrega: "ENTREGADA",
      paqueteria: "Estafeta",
      fecha_estimada_entrega: "2026-10-02",
    })).toBe(false);
  });

  it("no deja registrar la paquetería sin nombre ni sin fecha", () => {
    expect(validarRegistroPaqueteria({ paqueteria: "  ", fechaEstimada: "2026-10-02" })).toBe("paqueteria");
    expect(validarRegistroPaqueteria({ paqueteria: "Estafeta", fechaEstimada: "" })).toBe("fecha");
    expect(validarRegistroPaqueteria({ paqueteria: "Estafeta", fechaEstimada: "2026-10-02" })).toBeNull();
  });

  it("señala el script cuando la base todavía no acepta crédito", () => {
    const msg = explicarError(
      { code: "42703", message: "column motocarros.paqueteria does not exist" },
      "x",
    );
    expect(msg).toContain("20260925183000_credito_paqueteria_entrega.sql");

    const check = explicarError(
      { code: "23514", message: 'new row for relation "remisiones" violates check constraint "remisiones_tipo_pago_check"' },
      "x",
    );
    expect(check).toContain("20260925183000_credito_paqueteria_entrega.sql");
  });
});
