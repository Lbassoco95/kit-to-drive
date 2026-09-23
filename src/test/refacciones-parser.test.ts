import { describe, it, expect } from "vitest";
import {
  extractCompat, splitClave, tipoDesdeMarca, normalizarNombreUnidad,
  siguienteCodigoEnSerie, seriesDesdeCodigos, serieDeCodigo,
} from "@/lib/refaccionesParser";

describe("splitClave", () => {
  it("separa código nuevo y antiguo por diagonal", () => {
    expect(splitClave("AMO-001/263RTF-25N")).toEqual({
      nuevo: "AMO-001",
      antiguo: "263RTF-25N",
    });
  });

  it("sin diagonal sólo deja el código nuevo", () => {
    expect(splitClave("327RTF-REP")).toEqual({
      nuevo: "327RTF-REP",
      antiguo: null,
    });
  });
});

describe("normalizarNombreUnidad", () => {
  it("unifica variantes del mismo código", () => {
    expect(normalizarNombreUnidad("FT125-DELIVERY")).toBe("FT-125 DELIVERY");
    expect(normalizarNombreUnidad("ft125")).toBe("FT-125");
    expect(normalizarNombreUnidad("IT FT-150")).toBe("FT-150");
  });
});

describe("extractCompat", () => {
  it("saca las motos después de COMPATIBLE C/", () => {
    const { corta, comps } = extractCompat(
      "AMORTIGUADOR NEGRO 1 PZA COMPATIBLE C/DIABOLO 150/GS150/GTS175 LARGO 34 cm HORQUILLA .",
    );
    expect(corta).toBe("AMORTIGUADOR NEGRO 1 PZA");
    expect(comps).toContain("DIABOLO 150");
    expect(comps).toContain("GS-150");
    expect(comps).toContain("GTS-175");
  });

  it("tolera el typo COMPATBLE", () => {
    const { comps } = extractCompat("BARRAS COMPATBLE C/DT125/FT125");
    expect(comps).toContain("DT-125");
    expect(comps).toContain("FT-125");
  });

  it("separa descripción + medidas de la lista de modelos con /", () => {
    const { corta, comps } = extractCompat(
      "CUBRE POLVO PARA BARRA largo 200 mm diametro 27 mm DT-125 CLASICA / DT-125 DELIVERY / DT-125 SPORT / DT-150 CLASICA / DT-150 DELIVERY / FT-125 / FORZA 125/FT-125 CLASICA / FT125-DELIVERY / FT-125 PLATA/ FT-125 / KURAZAI CLASSIC 125",
    );
    expect(corta).toMatch(/CUBRE POLVO PARA BARRA/i);
    expect(corta).toMatch(/200 mm/i);
    expect(corta).toMatch(/27 mm/i);
    expect(corta).not.toMatch(/DT-125/);
    expect(comps).toContain("DT-125 CLASICA");
    expect(comps).toContain("DT-125 DELIVERY");
    expect(comps).toContain("FT-125");
    expect(comps).toContain("FT-125 DELIVERY");
    expect(comps).toContain("FT-125 CLASICA");
    expect(comps).toContain("FORZA 125");
    expect(comps).toContain("KURAZAI CLASSIC 125");
    // No duplicar FT-125 ni meter medidas como “modelo”
    expect(comps.filter(c => c === "FT-125")).toHaveLength(1);
    expect(comps.some(c => /largo|diametro|mm/i.test(c))).toBe(false);
  });

  it("sin compatibilidad deja la descripción intacta", () => {
    const { corta, comps } = extractCompat("CILINDRO MOTOCARRO 200CC");
    expect(corta).toBe("CILINDRO MOTOCARRO 200CC");
    expect(comps).toEqual([]);
  });
});

describe("tipoDesdeMarca", () => {
  it("infiere tipo de unidad desde la marca del Excel", () => {
    expect(tipoDesdeMarca("ITALIKA-MOTONETA")).toBe("motoneta");
    expect(tipoDesdeMarca("ITALIKA-TRABAJO")).toBe("trabajo");
    expect(tipoDesdeMarca("MOTOCARRO")).toBe("motocarro");
  });
});

describe("siguienteCodigoEnSerie", () => {
  it("continúa la numeración de la lista", () => {
    expect(siguienteCodigoEnSerie(["AMO-001", "AMO-057", "AMO-012"], "AMO")).toBe("AMO-058");
    expect(siguienteCodigoEnSerie(["FRE-117"], "FRE")).toBe("FRE-118");
  });

  it("serieDeCodigo lee el prefijo", () => {
    expect(serieDeCodigo("AMO-057")).toBe("AMO");
    expect(serieDeCodigo("104RPF-MAN")).toBeNull();
  });

  it("seriesDesdeCodigos lista el siguiente por serie", () => {
    const s = seriesDesdeCodigos(["AMO-001", "AMO-057", "FRE-010", "FRE-117"]);
    expect(s.find(x => x.serie === "AMO")?.siguiente).toBe("AMO-058");
    expect(s.find(x => x.serie === "FRE")?.siguiente).toBe("FRE-118");
  });
});
