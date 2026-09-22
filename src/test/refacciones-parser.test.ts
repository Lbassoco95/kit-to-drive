import { describe, it, expect } from "vitest";
import { extractCompat, splitClave, tipoDesdeMarca } from "@/lib/refaccionesParser";

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

describe("extractCompat", () => {
  it("saca las motos después de COMPATIBLE C/", () => {
    const { corta, comps } = extractCompat(
      "AMORTIGUADOR NEGRO 1 PZA COMPATIBLE C/DIABOLO 150/GS150/GTS175 LARGO 34 cm HORQUILLA .",
    );
    expect(corta).toBe("AMORTIGUADOR NEGRO 1 PZA");
    expect(comps).toEqual(["DIABOLO 150", "GS150", "GTS175"]);
  });

  it("tolera el typo COMPATBLE", () => {
    const { comps } = extractCompat("BARRAS COMPATBLE C/DT125/FT125");
    expect(comps).toContain("DT125");
    expect(comps).toContain("FT125");
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
