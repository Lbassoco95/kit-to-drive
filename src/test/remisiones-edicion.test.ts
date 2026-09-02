import { describe, it, expect } from "vitest";
import {
  agruparRenglones, planEditarRenglones, motivoValido, MOTIVO_MIN, ORDEN_FLETE,
  type LineaMoto, type RenglonRemision,
} from "@/lib/remisionesEdicion";

const moto = (id: string, orden: number | null, extra: Partial<RenglonRemision> = {}): RenglonRemision => ({
  id, tipo_servicio: "motocarro", modelo: "200cc 2026", color: "BLANCO",
  cantidad: 1, con_caja: false, orden_linea: orden, ...extra,
});
const servicio = (id: string, tipo: string, orden: number | null): RenglonRemision => ({
  id, tipo_servicio: tipo, modelo: null, color: null, cantidad: 1, con_caja: false, orden_linea: orden,
});

describe("agruparRenglones", () => {
  it("agrupa por orden_linea sin importar cómo llegan de la base", () => {
    // A propósito desordenados: PostgREST no garantiza orden sin ORDER BY.
    const { lineas, sueltos } = agruparRenglones([
      servicio("s2", "activacion", 1),
      moto("m1", 0),
      servicio("s1", "cabina", 0),
      moto("m2", 1, { color: "ROJO", cantidad: 3 }),
    ]);

    expect(lineas).toHaveLength(2);
    expect(sueltos).toHaveLength(0);
    expect(lineas[0]._itemId).toBe("m1");
    expect(lineas[0].con_cabina).toBe(true);
    expect(lineas[0].con_activacion).toBe(false);
    expect(lineas[1]._itemId).toBe("m2");
    expect(lineas[1].color).toBe("ROJO");
    expect(lineas[1].cantidad).toBe(3);
    expect(lineas[1].con_activacion).toBe(true);
  });

  it("cae a la posición cuando la remisión es vieja y no trae orden_linea", () => {
    const { lineas } = agruparRenglones([
      moto("m1", null),
      servicio("s1", "cabina", null),
      moto("m2", null),
      servicio("s2", "activacion", null),
    ]);

    expect(lineas.map(l => l._itemId)).toEqual(["m1", "m2"]);
    expect(lineas[0].con_cabina).toBe(true);
    expect(lineas[0].con_activacion).toBe(false);
    expect(lineas[1].con_activacion).toBe(true);
  });

  it("detecta el flete y no lo confunde con una línea de motocarro", () => {
    const g = agruparRenglones([moto("m1", 0), servicio("f1", "flete", ORDEN_FLETE)]);
    expect(g.lineas).toHaveLength(1);
    expect(g.conFlete).toBe(true);
    expect(g.fleteId).toBe("f1");
  });

  it("no pierde los servicios que quedaron sin motocarro", () => {
    const g = agruparRenglones([servicio("s1", "cabina", null), moto("m1", null)]);
    expect(g.sueltos.map(r => r.id)).toEqual(["s1"]);
    expect(g.lineas).toHaveLength(1);
  });

  it("la instalación de cabina implica caja montada", () => {
    const g = agruparRenglones([moto("m1", 0), servicio("s1", "instalacion_cabina", 0)]);
    expect(g.lineas[0].con_instalacion).toBe(true);
    expect(g.lineas[0].con_caja).toBe(true);
  });
});

describe("planEditarRenglones", () => {
  const linea = (over: Partial<LineaMoto> = {}): LineaMoto => ({
    _key: "k", _svcIds: {}, modelo: "200cc 2026", color: "BLANCO", cantidad: 1,
    con_caja: false, con_cabina: false, con_instalacion: false, con_activacion: false, ...over,
  });

  it("actualiza en su lugar el motocarro que ya existía", () => {
    const originales = [moto("m1", 0)];
    const plan = planEditarRenglones("r1", [
      linea({ _itemId: "m1", color: "ROJO", cantidad: 4, con_caja: true }),
    ], false, originales);

    expect(plan.inserts).toHaveLength(0);
    expect(plan.deleteIds).toHaveLength(0);
    expect(plan.updates).toEqual([
      { id: "m1", cambios: { modelo: "200cc 2026", color: "ROJO", cantidad: 4, con_caja: true, orden_linea: 0 } },
    ]);
    expect(plan.totalUnidades).toBe(4);
  });

  it("complementar la remisión sólo agrega renglones: no toca ni borra lo capturado", () => {
    const originales = [moto("m1", 0)];
    const plan = planEditarRenglones("r1", [
      linea({ _itemId: "m1" }),
      linea({ _key: "k2", color: "AZUL", cantidad: 2 }),
    ], false, originales);

    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([{
      remision_id: "r1", tipo_servicio: "motocarro", modelo: "200cc 2026",
      color: "AZUL", cantidad: 2, con_caja: false, orden_linea: 1,
    }]);
    expect(plan.totalUnidades).toBe(3);
  });

  it("da de baja la línea que se quitó, con todo lo que le colgaba", () => {
    const originales = [moto("m1", 0), servicio("s1", "cabina", 0), moto("m2", 1)];
    const plan = planEditarRenglones("r1", [linea({ _itemId: "m2" })], false, originales);

    expect(plan.deleteIds.sort()).toEqual(["m1", "s1"]);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates.map(u => u.id)).toEqual(["m2"]);
  });

  it("prender y apagar un servicio lo inserta y lo borra, sin duplicar", () => {
    const originales = [moto("m1", 0), servicio("s1", "activacion", 0)];

    const prendiendoCabina = planEditarRenglones("r1", [
      linea({ _itemId: "m1", _svcIds: { activacion: "s1" }, con_activacion: true, con_cabina: true }),
    ], false, originales);
    expect(prendiendoCabina.deleteIds).toEqual([]);
    expect(prendiendoCabina.inserts).toHaveLength(1);
    expect(prendiendoCabina.inserts[0].tipo_servicio).toBe("cabina");
    // La cabina se cotiza contra el modelo del motocarro.
    expect(prendiendoCabina.inserts[0].modelo).toBe("200cc 2026");

    const apagando = planEditarRenglones("r1", [
      linea({ _itemId: "m1", _svcIds: { activacion: "s1" }, con_activacion: false }),
    ], false, originales);
    expect(apagando.deleteIds).toEqual(["s1"]);
    expect(apagando.inserts).toHaveLength(0);
  });

  it("el flete se prende y se apaga una sola vez", () => {
    const sinFlete = [moto("m1", 0)];
    const conFlete = [moto("m1", 0), servicio("f1", "flete", ORDEN_FLETE)];

    const prende = planEditarRenglones("r1", [linea({ _itemId: "m1" })], true, sinFlete);
    expect(prende.inserts.filter(i => i.tipo_servicio === "flete")).toHaveLength(1);

    const conserva = planEditarRenglones("r1", [linea({ _itemId: "m1" })], true, conFlete);
    expect(conserva.inserts.filter(i => i.tipo_servicio === "flete")).toHaveLength(0);
    expect(conserva.deleteIds).toEqual([]);

    const apaga = planEditarRenglones("r1", [linea({ _itemId: "m1" })], false, conFlete);
    expect(apaga.deleteIds).toEqual(["f1"]);
  });

  it("nunca borra los renglones sueltos que no pudo reconstruir", () => {
    // "s1" viene antes de cualquier motocarro: el formulario no lo muestra, y
    // por eso mismo no se le puede borrar.
    const originales = [servicio("s1", "cabina", null), moto("m1", null)];
    const plan = planEditarRenglones("r1", [linea({ _itemId: "m1" })], false, originales);
    expect(plan.deleteIds).not.toContain("s1");
  });

  it("renumera orden_linea al reordenar, para que los servicios no se cuelguen de otra línea", () => {
    const originales = [moto("m1", 0), servicio("s1", "cabina", 0), moto("m2", 1)];
    const plan = planEditarRenglones("r1", [
      linea({ _itemId: "m2" }),
      linea({ _itemId: "m1", _svcIds: { cabina: "s1" }, con_cabina: true }),
    ], false, originales);

    const porId = Object.fromEntries(plan.updates.map(u => [u.id, u.cambios.orden_linea]));
    expect(porId).toEqual({ m2: 0, m1: 1, s1: 1 });
    expect(plan.deleteIds).toEqual([]);
  });
});

describe("motivoValido", () => {
  it("exige una justificación con contenido", () => {
    expect(motivoValido("")).toBe(false);
    expect(motivoValido("   ")).toBe(false);
    expect(motivoValido("error")).toBe(false);
    expect(motivoValido("x".repeat(MOTIVO_MIN - 1))).toBe(false);
    expect(motivoValido("x".repeat(MOTIVO_MIN))).toBe(true);
    expect(motivoValido("El cliente pidió dos unidades más")).toBe(true);
  });
});
