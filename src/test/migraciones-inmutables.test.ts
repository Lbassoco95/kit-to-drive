import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Un pull request no puede reescribir ni borrar un script que ya está en
 * main, ni reemplazar una función con un cuerpo que tira mejoras, sin
 * decirlo. La regla vive en scripts/proteger-migraciones.mjs.
 */
describe("migraciones que no se pisan entre pull requests", () => {
  it("el sello cuadra con la carpeta y con lo que ya está en main", () => {
    const out = execFileSync(process.execPath, ["scripts/proteger-migraciones.mjs", "verificar"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/ok: \d+ migraciones selladas, \d+ funciones vigentes/);
  });

  it("detecta una reescritura y un cuerpo que tira líneas de la versión vigente", () => {
    const out = execFileSync(process.execPath, ["scripts/proteger-migraciones.mjs", "selftest"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/selftest ok/);
  });
});
