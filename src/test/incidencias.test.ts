import { describe, it, expect } from "vitest";
import {
  chasisDetenido, serialesCompletos, normSerial, NS_REGEX,
  ESTATUS_INCIDENCIA, ESTATUS_CHASIS, TIPOS_FALLA,
} from "@/lib/dazon";

describe("chasisDetenido", () => {
  it("deja pasar las piezas sanas", () => {
    expect(chasisDetenido("disponible")).toBe(false);
    expect(chasisDetenido("configurado")).toBe(false);
    expect(chasisDetenido("asignado")).toBe(false);
  });

  it("detiene lo que está en revisión, en garantía o no es útil", () => {
    expect(chasisDetenido("en_revision")).toBe(true);
    expect(chasisDetenido("garantia")).toBe(true);
    expect(chasisDetenido("no_util")).toBe(true);
  });

  it("no truena con estatus vacío o desconocido", () => {
    expect(chasisDetenido(null)).toBe(false);
    expect(chasisDetenido(undefined)).toBe(false);
    expect(chasisDetenido("cualquier_cosa")).toBe(false);
  });
});

describe("serialesCompletos — el proceso no cierra sin NS chasis y NS motor", () => {
  it("exige los dos", () => {
    expect(serialesCompletos({ ns_chasis: "CH1", ns_motor: "MO1" })).toBe(true);
    expect(serialesCompletos({ ns_chasis: "CH1", ns_motor: null })).toBe(false);
    expect(serialesCompletos({ ns_chasis: null, ns_motor: "MO1" })).toBe(false);
    expect(serialesCompletos({})).toBe(false);
  });

  it("no acepta un serial en blanco", () => {
    expect(serialesCompletos({ ns_chasis: "   ", ns_motor: "MO1" })).toBe(false);
  });
});

describe("normSerial + NS_REGEX", () => {
  it("sanea un serial con espacios al formato que valida la captura", () => {
    const limpio = normSerial("DZ164FML T2M00654");
    expect(limpio).toBe("DZ164FMLT2M00654");
    expect(NS_REGEX.test(limpio)).toBe(true);
  });

  it("rechaza lo que quedó demasiado corto", () => {
    expect(NS_REGEX.test(normSerial("A B"))).toBe(false);
  });
});

describe("catálogos de incidencias", () => {
  it("sólo abierta y en_revision cuentan como abiertas", () => {
    const abiertas = Object.entries(ESTATUS_INCIDENCIA)
      .filter(([, v]) => v.abierta)
      .map(([k]) => k)
      .sort();
    expect(abiertas).toEqual(["abierta", "en_revision"]);
  });

  it("garantía y no útil sacan la pieza de circulación; la adaptación la regresa", () => {
    expect(ESTATUS_INCIDENCIA.garantia.retiene).toBe(true);
    expect(ESTATUS_INCIDENCIA.no_util.retiene).toBe(true);
    expect(ESTATUS_INCIDENCIA.adaptacion.retiene).toBe(false);
    expect(ESTATUS_INCIDENCIA.descartada.retiene).toBe(false);
  });

  it("todos los estatus de chasis del modelo tienen etiqueta", () => {
    ["disponible", "configurado", "asignado", "en_revision", "garantia", "no_util"]
      .forEach(e => expect(ESTATUS_CHASIS[e]?.label).toBeTruthy());
  });

  it("los tipos de falla coinciden con los que acepta la base", () => {
    expect(TIPOS_FALLA.map(t => t.key)).toEqual(
      ["falta_parte", "parte_danada", "defecto_fabrica", "documental", "otro"]
    );
  });
});
