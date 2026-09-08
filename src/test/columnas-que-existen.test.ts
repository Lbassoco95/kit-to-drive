import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Filtrar u ordenar por una columna que no existe vacía la pantalla en silencio.
 * ───────────────────────────────────────────────────────────────────────────
 * Es la forma en que este sistema se ha roto siempre, y no se ve al compilar:
 * `.order("fecha")` sobre una tabla cuya columna es `fecha_ruta` sale como
 * `order=fecha.desc`, PostgREST contesta **400**, la consulta devuelve `null`
 * y el código hace `data ?? []`. Resultado: «no hay rutas» en una pantalla que
 * sí tiene rutas. Nadie ve un error.
 *
 * Ya pasó tres veces:
 *   · Clientes salía «Sin resultados» por `clientes.folio_interno`.
 *   · El selector de cliente llegaba vacío por `.order("a, b")`.
 *   · **CRM → Rutas** salía siempre vacía por `.order("fecha")`, y los dos
 *     contadores del tablero de CRM daban 0 por `.gte("fecha")` sobre
 *     `crm_actividades` y `crm_rutas` (2026-09-08).
 *
 * Esta prueba lo cierra: los nombres de columna que la app usa para filtrar y
 * ordenar tienen que existir en `src/integrations/supabase/types.ts`, que es
 * el reflejo generado del esquema real. Si alguien filtra por una columna
 * inventada, o agrega una columna a la base y no a los tipos, esto falla aquí
 * y no en producción.
 *
 * Sólo se revisan filtros y orden —no las listas de `select`— porque ahí el
 * nombre es un literal pegado al `.from()` y no hay ambigüedad posible: ni
 * embeds, ni alias, ni plantillas.
 */

const RAIZ = process.cwd();
const TIPOS = join(RAIZ, "src", "integrations", "supabase", "types.ts");

/** Columnas por tabla/vista, leídas del archivo de tipos generado. */
function columnasPorTabla(): Map<string, Set<string>> {
  const lineas = readFileSync(TIPOS, "utf8").split("\n");
  const mapa = new Map<string, Set<string>>();
  let tabla: string | null = null;
  let enRow = false;

  for (const linea of lineas) {
    const nombre = /^ {6}(\w+): \{$/.exec(linea);
    if (nombre) { tabla = nombre[1]; enRow = false; continue; }
    if (!tabla) continue;
    if (/^ {8}Row: \{$/.test(linea)) { enRow = true; continue; }
    // El Row termina en su llave de cierre; lo que sigue (Insert, Update,
    // Relationships) repite los mismos nombres y no hace falta leerlo.
    if (enRow && /^ {8}\}$/.test(linea)) { enRow = false; continue; }
    if (!enRow) continue;
    const col = /^ {10}(\w+)\??:/.exec(linea);
    if (col) {
      if (!mapa.has(tabla)) mapa.set(tabla, new Set());
      mapa.get(tabla)!.add(col[1]);
    }
  }
  return mapa;
}

const fuentes = (dir: string): string[] =>
  readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === "test" ? [] : fuentes(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });

/** Quita comentarios sin mover renglones, para no señalar el ejemplo. */
const sinComentarios = (texto: string): string =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " "))
    .split("\n")
    .map(l => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");

/** Métodos donde el primer argumento es un nombre de columna, siempre. */
const FILTROS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "order"];

type Uso = { ruta: string; linea: number; tabla: string; col: string; metodo: string };

function usos(): Uso[] {
  const salida: Uso[] = [];
  for (const ruta of fuentes(join(RAIZ, "src"))) {
    const texto = sinComentarios(readFileSync(ruta, "utf8"));
    for (const m of texto.matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g)) {
      // La cadena de esta consulta termina donde empieza la siguiente: dentro
      // de un `Promise.all([...])` van pegadas y sin este corte los filtros de
      // una se le atribuirían a la otra.
      let ventana = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 900);
      for (const fin of [".from(", ";"]) {
        const corte = ventana.indexOf(fin);
        if (corte > 0) ventana = ventana.slice(0, corte);
      }
      const re = new RegExp(`\\.(${FILTROS.join("|")})\\(\\s*["'\`]([a-z_][a-z_0-9]*)["'\`]`, "g");
      for (const f of ventana.matchAll(re)) {
        salida.push({
          ruta: relative(RAIZ, ruta),
          linea: texto.slice(0, m.index).split("\n").length,
          tabla: m[1],
          col: f[2],
          metodo: f[1],
        });
      }
    }
  }
  return salida;
}

describe("columnas que existen", () => {
  const columnas = columnasPorTabla();
  const todos = usos();

  it("el archivo de tipos se pudo leer", () => {
    expect(columnas.size).toBeGreaterThan(20);
    expect(columnas.get("motocarros")?.has("ns_chasis")).toBe(true);
    expect(columnas.get("crm_rutas")?.has("fecha_ruta")).toBe(true);
  });

  it("hay consultas que revisar", () => {
    expect(todos.length).toBeGreaterThan(30);
  });

  it("toda columna con la que se filtra u ordena existe en su tabla", () => {
    const malas = todos
      // Una tabla que los tipos no conocen es otro problema (y lo caza
      // `consultas-supabase`); aquí sólo se revisan las que sí están.
      .filter(u => columnas.has(u.tabla))
      .filter(u => !columnas.get(u.tabla)!.has(u.col))
      .map(u => `${u.ruta}:${u.linea} → .${u.metodo}("${u.col}") sobre ${u.tabla}`);

    expect(
      malas,
      "Estas columnas no existen en su tabla. PostgREST contesta 400, la " +
      "consulta devuelve null y la pantalla se ve vacía — no rota, VACÍA, que " +
      "es peor porque nadie la reporta. Usa el nombre real (está en " +
      "src/integrations/supabase/types.ts) o agrega la columna a los tipos si " +
      "de verdad ya existe en la base:\n" +
      malas.map(l => `  · ${l}`).join("\n"),
    ).toEqual([]);
  });
});
