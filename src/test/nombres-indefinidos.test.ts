import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Vite compila con esbuild, que borra los tipos sin revisarlos: un identificador
 * que no existe pasa el build y revienta en el navegador. Así llegó a
 * producción `onClick={save}` en CRM → Actividades — `save` nunca se escribió, y
 * como la excepción ocurre al dibujar, la app entera se quedaba en blanco.
 * TypeScript sí lo veía (TS2304), pero nadie corría `tsc`.
 *
 * Esta prueba corre el chequeo de tipos y falla SÓLO con los errores de esa
 * clase — nombres que no existen. El resto de los errores de tipo del repo
 * quedan fuera a propósito: son deuda vieja y bloquear por ellos haría que
 * nadie pudiera desplegar.
 */
const CLASE_MORTAL = /error TS(2304|2552):/;

describe("chequeo de tipos", () => {
  it("no hay identificadores que no existan", () => {
    let salida = "";
    try {
      execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.app.json"], { encoding: "utf8" });
    } catch (e: unknown) {
      salida = (e as { stdout?: string }).stdout ?? "";
    }
    const graves = salida.split("\n").filter((l) => CLASE_MORTAL.test(l));
    expect(graves, `Identificadores inexistentes:\n${graves.join("\n")}`).toEqual([]);
  }, 120_000);
});
