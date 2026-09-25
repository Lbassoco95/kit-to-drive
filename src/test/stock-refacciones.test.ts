import { describe, it, expect } from "vitest";
import {
  conStockResultante,
  etiquetaClienteMovimiento,
  labelTipoMovimiento,
} from "@/lib/stockRefacciones";

describe("conStockResultante", () => {
  it("reconstruye el saldo desde el stock actual hacia atrás", () => {
    // Stock actual 7. Del más reciente al más viejo: -2, -5, +10
    const movs = [
      { id: "c", cantidad: -2 },
      { id: "b", cantidad: -5 },
      { id: "a", cantidad: 10 },
    ];
    const con = conStockResultante(movs, 7);
    expect(con[0]).toMatchObject({ id: "c", stock_antes: 9, stock_despues: 7 });
    expect(con[1]).toMatchObject({ id: "b", stock_antes: 14, stock_despues: 9 });
    expect(con[2]).toMatchObject({ id: "a", stock_antes: 4, stock_despues: 14 });
  });

  it("tolera lista vacía", () => {
    expect(conStockResultante([], 12)).toEqual([]);
  });
});

describe("etiquetaClienteMovimiento", () => {
  it("prefiere la etiqueta lista", () => {
    expect(etiquetaClienteMovimiento({
      cliente_etiqueta: "C-01 — Taller Norte",
      cliente_nombre: "Otro",
    })).toBe("C-01 — Taller Norte");
  });

  it("arma código + nombre si no hay etiqueta", () => {
    expect(etiquetaClienteMovimiento({
      cliente_nombre: "Taller Norte",
      cliente_codigo_erp: "C-01",
    })).toBe("C-01 — Taller Norte");
  });
});

describe("labelTipoMovimiento", () => {
  it("traduce tipos conocidos", () => {
    expect(labelTipoMovimiento("venta", { venta: "Venta / remisión" })).toBe("Venta / remisión");
    expect(labelTipoMovimiento("ajuste")).toBe("Ajuste");
  });
});
