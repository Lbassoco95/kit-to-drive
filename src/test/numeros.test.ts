import { describe, it, expect } from "vitest";
import {
  fmtMiles, fmtMonedaPlataforma, parseNumero, formatearEntradaNumerica,
  numeroATextoInput,
} from "@/lib/numeros";

describe("fmtMiles", () => {
  it("pone coma cada tres dígitos", () => {
    expect(fmtMiles(25000, 0)).toBe("25,000");
    expect(fmtMiles(25000, 2)).toBe("25,000.00");
    expect(fmtMiles(1234567.8, 2)).toBe("1,234,567.80");
  });

  it("maneja negativos y vacíos", () => {
    expect(fmtMiles(-1500, 2)).toBe("-1,500.00");
    expect(fmtMiles(null)).toBe("—");
  });
});

describe("fmtMonedaPlataforma", () => {
  it("antepone $ y comas", () => {
    expect(fmtMonedaPlataforma(25000)).toBe("$25,000.00");
    expect(fmtMonedaPlataforma(25000, "USD")).toBe("US$25,000.00");
  });
});

describe("parseNumero", () => {
  it("entiende texto con comas de miles", () => {
    expect(parseNumero("25,000")).toBe(25000);
    expect(parseNumero("25,000.50")).toBe(25000.5);
    expect(parseNumero("$25,000.00")).toBe(25000);
  });

  it("devuelve null si está vacío", () => {
    expect(parseNumero("")).toBeNull();
    expect(parseNumero("   ")).toBeNull();
  });
});

describe("formatearEntradaNumerica", () => {
  it("va poniendo comas mientras se escribe", () => {
    expect(formatearEntradaNumerica("25000")).toBe("25,000");
    expect(formatearEntradaNumerica("25000.5")).toBe("25,000.5");
    expect(formatearEntradaNumerica("25,000")).toBe("25,000");
  });
});

describe("numeroATextoInput", () => {
  it("formatea el valor del formulario", () => {
    expect(numeroATextoInput(25000, 2)).toBe("25,000.00");
    expect(numeroATextoInput("", 2)).toBe("");
  });
});
