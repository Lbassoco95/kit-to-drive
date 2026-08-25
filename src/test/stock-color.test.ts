import { describe, it, expect } from "vitest";
import { claveStock, disponiblesEnOrden, StockColor } from "@/lib/dazon";

const stock = (disponibles: number): StockColor => ({
  disponibles, unidadesLibres: 0, piezasDisponibles: disponibles, demandaPendiente: 0,
});

// El color es un factor propio: lo que limita cuántos motocarros de un color se
// pueden prometer no es el orden de armado, sino cuántos hay de ESE color menos
// lo ya comprometido — incluyendo lo que la misma orden lleva apartado.
describe("disponibilidad por color", () => {
  it("la llave cruza por nombre comercial y color normalizado", () => {
    expect(claveStock("200cc 2026", "blanco")).toBe(claveStock(" 200CC 2026 ", "WHITE"));
  });

  it("sin dato del color no inventa un número", () => {
    expect(disponiblesEnOrden(undefined, [{ modelo: "200cc 2026", color: "BLANCO", cantidad: 1 }], 0)).toBeNull();
  });

  it("una sola línea no se descuenta a sí misma", () => {
    const lineas = [{ modelo: "200cc 2026", color: "BLANCO", cantidad: 3 }];
    expect(disponiblesEnOrden(stock(10), lineas, 0)).toBe(10);
  });

  it("resta lo que apartaron las otras líneas del mismo modelo y color", () => {
    const lineas = [
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 3 },
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 2 },
    ];
    // La línea 0 ve 10 − 2 (lo de la línea 1); la línea 1 ve 10 − 3.
    expect(disponiblesEnOrden(stock(10), lineas, 0)).toBe(8);
    expect(disponiblesEnOrden(stock(10), lineas, 1)).toBe(7);
  });

  it("no mezcla colores ni modelos distintos", () => {
    const lineas = [
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 5 },
      { modelo: "200cc 2026", color: "AZUL",   cantidad: 4 },
      { modelo: "300cc 2026", color: "BLANCO", cantidad: 6 },
    ];
    expect(disponiblesEnOrden(stock(10), lineas, 0)).toBe(10);
  });

  it("cuenta igual aunque el color venga escrito distinto", () => {
    const lineas = [
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 4 },
      { modelo: "200cc 2026", color: "white",  cantidad: 2 },
    ];
    expect(disponiblesEnOrden(stock(10), lineas, 0)).toBe(8);
  });

  it("puede quedar en cero o en negativo: se avisa, no se bloquea", () => {
    const lineas = [
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 1 },
      { modelo: "200cc 2026", color: "BLANCO", cantidad: 5 },
    ];
    expect(disponiblesEnOrden(stock(2), lineas, 0)).toBe(-3);
  });
});
