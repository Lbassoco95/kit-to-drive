import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PASOS_REMISION_REFACCION,
  cancelarApartado,
  confirmarSinExistencia,
  disponibleRefaccion,
  descuentoValido,
  envioListo,
  importeConDescuento,
  etapaDeLineas,
  faltantesDePedido,
  indicePaso,
  liberarLinea,
  puedeMarcarEntregada,
  siguienteFolioSerie,
  reportarFaltante,
  type LineaRefaccion,
} from "@/lib/remisionesRefacciones";

const apartada = (cantidad: number, extra: Partial<LineaRefaccion> = {}): LineaRefaccion => ({
  estatus: "bloqueada",
  cantidad,
  cantidad_bloqueada: cantidad,
  cantidad_surtida: 0,
  cantidad_faltante: 0,
  ...extra,
});

describe("folio de seguimiento", () => {
  it("asigna RF- y no se mezcla con la serie REM- de motocarros", () => {
    expect(siguienteFolioSerie([])).toBe("RF-00001");
    expect(siguienteFolioSerie(["RF-00001", "RF-00007", "REM-031"])).toBe("RF-00008");
    expect(siguienteFolioSerie(["REM-031", "REM-024"], "REM-", 3)).toBe("REM-032");
  });
});

describe("etapas visibles", () => {
  it("muestra ventas, almacén, contingencia y surtida", () => {
    expect(PASOS_REMISION_REFACCION).toEqual(["ventas", "almacen", "contingencia", "logistica", "entregada"]);
    expect(indicePaso("almacen")).toBe(1);
    expect(indicePaso("logistica")).toBe(3);
    expect(indicePaso("contingencia")).toBe(2);
    expect(indicePaso("cancelada")).toBe(-1);
  });
});

describe("existencia disponible de refacciones", () => {
  it("al levantar la remisión los demás pedidos ven menos", () => {
    expect(disponibleRefaccion(10, 0)).toBe(10);
    expect(disponibleRefaccion(10, 4)).toBe(6);
    expect(disponibleRefaccion(2, 5)).toBe(0);
  });

  it("no deja pedir más de lo disponible, sumando partidas del mismo producto", () => {
    const faltan = faltantesDePedido([
      { productoId: "a", cantidad: 3, disponible: 4, descripcion: "Balata" },
      { productoId: "a", cantidad: 2, disponible: 4, descripcion: "Balata" },
      { productoId: "b", cantidad: 1, disponible: 1 },
    ]);
    expect(faltan).toEqual([
      { productoId: "a", pedido: 5, disponible: 4, descripcion: "Balata" },
    ]);
  });
});

describe("almacén libera y la etapa dice en qué área está", () => {
  it("liberar baja la existencia y no devuelve esas piezas a otros pedidos", () => {
    const antes = disponibleRefaccion(10, 4);
    const efecto = liberarLinea(apartada(4), 4, 10);
    expect(efecto.ok).toBe(true);
    if (!efecto.ok) return;
    expect(efecto.stock).toBe(6);
    expect(efecto.stock).toBeGreaterThanOrEqual(0);
    expect(efecto.linea.cantidad_bloqueada).toBe(0);
    expect(efecto.linea.cantidad_surtida).toBe(4);
    expect(efecto.linea.estatus).toBe("surtida");
    expect(disponibleRefaccion(efecto.stock, efecto.linea.cantidad_bloqueada)).toBe(antes);
    expect(etapaDeLineas([efecto.linea])).toEqual({
      etapa: "logistica", area: "logistica", abierta: false,
    });
    expect(etapaDeLineas([efecto.linea], { entregada: true })).toEqual({
      etapa: "entregada", area: "logistica", abierta: false,
    });
  });

  it("si almacén no cubre lo pedido, no libera: hay que reportar el faltante", () => {
    expect(liberarLinea(apartada(4), 4, 1)).toEqual({ ok: false, error: "sin_existencia" });
  });

  it("reportar faltante mantiene el apartado mientras se averigua", () => {
    const efecto = reportarFaltante(apartada(4), 2, 10);
    expect(efecto.ok).toBe(true);
    if (!efecto.ok) return;
    expect(efecto.stock).toBe(10);
    expect(efecto.linea.estatus).toBe("faltante");
    expect(efecto.linea.cantidad_bloqueada).toBe(4);
    expect(efecto.linea.cantidad_faltante).toBe(2);
    expect(disponibleRefaccion(efecto.stock, efecto.linea.cantidad_bloqueada)).toBe(6);
    expect(etapaDeLineas([efecto.linea])).toEqual({
      etapa: "contingencia", area: "almacen", abierta: true,
    });
  });

  it("confirmar que no hay corrige la existencia y cierra la contingencia", () => {
    const reportada = apartada(4, { estatus: "faltante", cantidad_faltante: 4 });
    const antes = disponibleRefaccion(10, 4);
    const efecto = confirmarSinExistencia(reportada, 10);
    expect(efecto.ok).toBe(true);
    if (!efecto.ok) return;
    expect(efecto.stock).toBe(6);
    expect(efecto.linea.estatus).toBe("sin_existencia");
    expect(efecto.linea.cantidad_bloqueada).toBe(0);
    expect(disponibleRefaccion(efecto.stock, efecto.linea.cantidad_bloqueada)).toBe(antes);
    expect(etapaDeLineas([efecto.linea])).toEqual({
      etapa: "contingencia", area: "almacen", abierta: false,
    });
  });

  it("ventas puede soltar el apartado y la pieza vuelve a estar disponible", () => {
    const efecto = cancelarApartado(apartada(3), 8);
    expect(efecto.ok).toBe(true);
    if (!efecto.ok) return;
    expect(efecto.stock).toBe(8);
    expect(efecto.linea.estatus).toBe("cancelada");
    expect(disponibleRefaccion(efecto.stock, efecto.linea.cantidad_bloqueada)).toBe(8);
    expect(etapaDeLineas([efecto.linea])).toEqual({
      etapa: "cancelada", area: "ventas", abierta: false,
    });
  });

  it("logística recibe dirección y la paquetería no se cierra sin guía", () => {
    expect(envioListo({ tipo: "paqueteria", direccion: "Calle 1", tipoPago: "anticipado" })).toBe(false);
    expect(envioListo({ tipo: "directo", direccion: "Av. Reforma 120, Centro", tipoPago: "contra_entrega" })).toBe(true);
    expect(envioListo({ tipo: "recoge", direccion: "", tipoPago: "anticipado", formaPago: "efectivo" })).toBe(true);
    expect(envioListo({ tipo: "recoge", direccion: "", tipoPago: "anticipado", formaPago: "otro" })).toBe(false);
    expect(envioListo({ tipo: "recoge", direccion: "", tipoPago: "anticipado", formaPago: "credito" })).toBe(true);
    expect(envioListo({ tipo: "directo", direccion: "Av. Reforma 120", tipoPago: "contra_entrega", formaPago: "credito" })).toBe(true);
    expect(envioListo({ tipo: "recoge", direccion: "", tipoPago: "credito", formaPago: "credito" })).toBe(false);
    const moto = readFileSync(join(process.cwd(), "src/pages/Remisiones.tsx"), "utf8");
    const ref = readFileSync(join(process.cwd(), "src/pages/RemisionesRefacciones.tsx"), "utf8");
    expect(moto).not.toContain('value="credito"');
    expect(ref.match(/value="credito"/g)?.length).toBe(2);
    expect(descuentoValido(10)).toBe(true);
    expect(descuentoValido(101)).toBe(false);
    expect(importeConDescuento(100, 2, 10, 0)).toBe(180);
    expect(importeConDescuento(100, 2, 10, 50)).toBe(90);
    expect(puedeMarcarEntregada("logistica", "paqueteria", "")).toBe(false);
    expect(puedeMarcarEntregada("logistica", "paqueteria", "GUIDA-1")).toBe(true);
    expect(puedeMarcarEntregada("logistica", "directo", "")).toBe(true);
    expect(puedeMarcarEntregada("almacen", "directo", "")).toBe(false);
  });

  it("una partida surtida y otra en faltante sigue en almacén, en contingencia", () => {
    const surtida = apartada(2, {
      estatus: "surtida", cantidad_bloqueada: 0, cantidad_surtida: 2,
    });
    const faltante = apartada(1, { estatus: "faltante", cantidad_faltante: 1 });
    expect(etapaDeLineas([surtida, faltante])).toEqual({
      etapa: "contingencia", area: "almacen", abierta: true,
    });
  });
});
