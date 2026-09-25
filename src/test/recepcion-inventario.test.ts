import { describe, expect, it } from "vitest";
import {
  estatusCompra,
  faltanteLinea,
  lineasDeInventario,
  lineasDeUnidades,
  resumenLineas,
} from "@/lib/recepcionInventario";

describe("documento de recepción", () => {
  it("arma una línea por unidad y por motor de la captura manual", () => {
    const lineas = lineasDeUnidades(
      [
        { ns_chasis: " lx1 ", ns_motor: "mot-1" },
        { ns_chasis: "", ns_motor: "mot-2" },
      ],
      "200cc 2025",
      "blanco",
    );
    expect(lineas).toEqual([
      { tipo: "unidad", clave: "LX1", modelo: "200cc 2025", color: "BLANCO", cantidad_esperada: 1, cantidad_recibida: 1 },
      { tipo: "motor", clave: "MOT-1", modelo: "200cc 2025", color: null, cantidad_esperada: 1, cantidad_recibida: 1 },
      { tipo: "motor", clave: "MOT-2", modelo: "200cc 2025", color: null, cantidad_esperada: 1, cantidad_recibida: 1 },
    ]);
  });

  it("toma el inventario real del contenedor, incluidas las partes que llegaron de menos", () => {
    const lineas = lineasDeInventario({
      chasis: [{ numero_chasis: "CH-1", modelo: "200cc", color: "rojo" }],
      motores: [{ numero_motor: "  ", modelo: "200cc" }],
      partes: [
        { descripcion: " Faro ", modelo: null, cantidad_esperada: 10, cantidad_recibida: 8 },
        { descripcion: "  ", modelo: "x", cantidad_esperada: 1, cantidad_recibida: 1 },
      ],
    });
    expect(lineas.map(l => l.clave)).toEqual(["CH-1", "Faro"]);
    expect(resumenLineas(lineas)).toEqual({
      esperadas: 11,
      recibidas: 9,
      faltantes: 1,
      diferencia: -2,
    });
  });
});

describe("estatus de la compra cuando llega de menos", () => {
  it("sigue abierta si todavía no llega nada", () => {
    expect(estatusCompra([{ cantidad_pedida: 10, cantidad_recibida: 0, cantidad_ajustada: null }])).toBe("abierta");
  });

  it("queda parcial mientras falte mercancía", () => {
    const linea = { cantidad_pedida: 10, cantidad_recibida: 8, cantidad_ajustada: null };
    expect(faltanteLinea(linea)).toBe(2);
    expect(estatusCompra([linea])).toBe("parcial");
  });

  it("al aceptar lo recibido el faltante se cierra y la compra queda ajustada", () => {
    const linea = { cantidad_pedida: 10, cantidad_recibida: 8, cantidad_ajustada: 8 };
    expect(faltanteLinea(linea)).toBe(0);
    expect(estatusCompra([linea])).toBe("ajustada");
  });

  it("queda completa cuando llega todo lo pedido, sin ajuste", () => {
    expect(estatusCompra([
      { cantidad_pedida: 4, cantidad_recibida: 4, cantidad_ajustada: null },
      { cantidad_pedida: 2, cantidad_recibida: 3, cantidad_ajustada: null },
    ])).toBe("completa");
  });

  it("reabrir el faltante vuelve a dejarla parcial", () => {
    expect(estatusCompra([{ cantidad_pedida: 10, cantidad_recibida: 8, cantidad_ajustada: null }])).toBe("parcial");
  });
});
