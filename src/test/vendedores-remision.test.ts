import { describe, expect, it } from "vitest";
import { nombreVendedorDe, topVendedores, type RemisionConVendedor } from "@/lib/vendedoresRemision";

const rem = (parcial: Partial<RemisionConVendedor>): RemisionConVendedor => ({
  estatus: "NUEVA",
  ...parcial,
});

describe("nombreVendedorDe", () => {
  it("cuenta al vendedor escrito en la remisión, no a quien la capturó", () => {
    expect(nombreVendedorDe(rem({
      nombre_vendedor: "Iván",
      profiles: { nombre_completo: "Ana Karen" },
    }))).toBe("Iván");
  });

  it("cuenta a quien captura sólo cuando quedó seleccionada como vendedora", () => {
    expect(nombreVendedorDe(rem({
      nombre_vendedor: "Marco",
      profiles: { nombre_completo: "Marco" },
    }))).toBe("Marco");
    expect(nombreVendedorDe(rem({
      nombre_vendedor: "  ",
      profiles: { nombre_completo: "Atenea Olivera Portilla" },
    }))).toBe("Atenea Olivera Portilla");
  });

  it("usa el vendedor original de una importación si nadie más quedó escrito", () => {
    expect(nombreVendedorDe(rem({
      notas: "Vendedor original: Carlos",
    }))).toBe("Carlos");
    expect(nombreVendedorDe(rem({
      notas: "Cliente paga al término",
      profiles: { nombre_completo: "Ana Karen" },
    }))).toBe("Ana Karen");
  });
});

describe("topVendedores", () => {
  const rems: RemisionConVendedor[] = [
    rem({ nombre_vendedor: "Iván", profiles: { nombre_completo: "Ana Karen" } }),
    rem({ nombre_vendedor: "Iván", profiles: { nombre_completo: "Ana Karen" } }),
    rem({ nombre_vendedor: "Ivan", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    rem({ nombre_vendedor: "MARCO", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    rem({ nombre_vendedor: "Marco", profiles: { nombre_completo: "Marco" } }),
    rem({ nombre_vendedor: "Marco", profiles: { nombre_completo: "Ana Karen" } }),
    rem({ nombre_vendedor: "IRENE", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    rem({ nombre_vendedor: "IRENE", profiles: { nombre_completo: "Marco" } }),
    rem({ nombre_vendedor: "Irene", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    rem({
      nombre_vendedor: "Atenea Olivera Portilla",
      profiles: { nombre_completo: "Atenea Olivera Portilla" },
      estatus: "CANCELADA",
    }),
    rem({ nombre_vendedor: "Abelardo", profiles: { nombre_completo: "Marco" } }),
  ];

  it("agrupa el mismo vendedor aunque el nombre cambie de acento o de mayúsculas", () => {
    const top = topVendedores(rems);
    expect(top.map((f) => [f.nombre, f.n])).toEqual([
      ["Irene", 3],
      ["Iván", 3],
      ["Marco", 3],
      ["Abelardo", 1],
    ]);
  });

  it("no suma una remisión cancelada aunque la haya capturado una vendedora", () => {
    const atenea = topVendedores(rems).find((f) => f.nombre.includes("Atenea"));
    expect(atenea).toBeUndefined();
  });

  it("junta el nombre corto con el nombre completo de la misma persona", () => {
    const top = topVendedores([
      rem({ nombre_vendedor: "Marco", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
      rem({ nombre_vendedor: "Marco", profiles: { nombre_completo: "Marco" } }),
      rem({ nombre_vendedor: "MARCO BELTRAN", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    ]);
    expect(top).toEqual([{ nombre: "Marco", n: 3 }]);
  });

  it("pone en mayúsculas y minúsculas un nombre que sólo se capturó en mayúsculas", () => {
    expect(topVendedores([
      rem({ nombre_vendedor: "CARLOS CHAVARRIA", profiles: { nombre_completo: "Atenea Olivera Portilla" } }),
    ])).toEqual([{ nombre: "Carlos Chavarria", n: 1 }]);
  });

  it("no deja que una nota cualquiera se vuelva el nombre del vendedor", () => {
    const top = topVendedores([
      rem({ notas: "RM260813012 - está pagado solamente uno", profiles: { nombre_completo: "Ana Karen" } }),
    ]);
    expect(top).toEqual([{ nombre: "Ana Karen", n: 1 }]);
  });
});
