import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { explicarError } from "@/lib/dazon";

/**
 * Errores de consulta que ya rompieron pantallas en producción y que no se
 * ven al compilar: TypeScript los acepta, el navegador no truena, y la
 * pantalla simplemente sale vacía.
 */

const RAIZ = join(process.cwd(), "src");

const fuentes = (dir: string): string[] =>
  readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === "test" ? [] : fuentes(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });

/**
 * Quita los comentarios sin mover los renglones, para que el número de línea
 * del hallazgo siga siendo el del archivo. Hace falta porque estos mismos
 * errores están CONTADOS en los comentarios del código —es el ejemplo de qué
 * no hacer— y si no se descartan, el guardián se dispara con su propia
 * explicación.
 */
const sinComentarios = (texto: string): string =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " "))
    .split("\n")
    .map(l => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");

const codigo = fuentes(RAIZ).map(ruta => ({
  ruta: relative(process.cwd(), ruta),
  texto: sinComentarios(readFileSync(ruta, "utf8")),
}));

/** Las RPC que la app llama de verdad. */
const rpcs = (): Set<string> => {
  const nombres = new Set<string>();
  for (const { texto } of codigo) {
    for (const m of texto.matchAll(/\brpc\(\s*["'`]([a-z_0-9]+)["'`]/g)) nombres.add(m[1]);
  }
  return nombres;
};

/** El script que crea esa función, si alguno la crea. */
const MIGRACIONES = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(MIGRACIONES)
  .filter(f => f.endsWith(".sql"))
  .map(f => ({ archivo: f, texto: readFileSync(join(MIGRACIONES, f), "utf8") }));

const scriptQueLaCrea = (fn: string): string | undefined =>
  sql.filter(({ texto }) => texto.includes(`FUNCTION public.${fn}(`))
     .map(({ archivo }) => archivo)
     .sort()
     .pop();

describe("consultas a Supabase", () => {
  /**
   * `supabase-js` manda UNA columna por llamada a `.order()`. Al escribir
   * `.order("folio_interno, codigo_erp")` la petición sale como
   * `order=folio_interno, codigo_erp.asc`: PostgREST no puede leer el segundo
   * término —le queda un espacio pegado al nombre— y contesta 400. La consulta
   * devuelve `null` y la pantalla se queda vacía.
   *
   * Esto dejó sin clientes a la pantalla de Clientes y sin opciones al
   * selector de la remisión: se veía como que el sistema no permitía elegir
   * cliente. Lo correcto es encadenar: `.order("a").order("b")`.
   */
  it("no hay .order() con varias columnas en una sola llamada", () => {
    const malas: string[] = [];
    for (const { ruta, texto } of codigo) {
      for (const m of texto.matchAll(/\.order\(\s*(["'`])([^"'`]*,[^"'`]*)\1/g)) {
        const linea = texto.slice(0, m.index).split("\n").length;
        malas.push(`${ruta}:${linea} → .order("${m[2]}")`);
      }
    }
    expect(
      malas,
      'Encadena los `order`: .order("a").order("b"). Con varias columnas en ' +
      "una sola llamada PostgREST responde 400 y la lista llega vacía:\n" +
      malas.map(l => `  · ${l}`).join("\n"),
    ).toEqual([]);
  });

  /**
   * El catálogo de clientes se lee desde `@/lib/catalogoClientes`, que trae el
   * respaldo para una base sin `folio_interno` y devuelve el `error` en vez de
   * tragárselo. Cuando cada pantalla lo leía por su cuenta, sólo una de las
   * dos tenía respaldo — y la que no lo tenía es la que se vació.
   */
  it("nadie lee clientes por su cuenta pidiendo folio_interno", () => {
    const sueltas: string[] = [];
    for (const { ruta, texto } of codigo) {
      if (ruta.endsWith("src/lib/catalogoClientes.ts")) continue;
      // Alta de un cliente nuevo: devuelve la fila insertada, no es catálogo.
      for (const m of texto.matchAll(/\.from\(\s*["']clientes["']\s*\)\s*\.select\([^)]*folio_interno[^)]*\)(?!\s*\.single)/g)) {
        const linea = texto.slice(0, m.index).split("\n").length;
        if (/\.insert\(|\.update\(|\.upsert\(/.test(texto.slice(Math.max(0, (m.index ?? 0) - 200), m.index))) continue;
        sueltas.push(`${ruta}:${linea}`);
      }
    }
    expect(
      sueltas,
      "Usa cargarCatalogoClientes() de @/lib/catalogoClientes: trae el " +
      "respaldo para una base sin folio_interno y no se traga el error:\n" +
      sueltas.map(l => `  · ${l}`).join("\n"),
    ).toEqual([]);
  });

  /**
   * Cada RPC que la app llama tiene que existir en algún script de
   * `supabase/migrations/`. Si no, la base nunca va a poder tenerla: el botón
   * está roto de origen y no hay nada que correr para arreglarlo.
   */
  it("toda RPC que llama la app la crea alguna migración", () => {
    const huerfanas = [...rpcs()].filter(r => !scriptQueLaCrea(r));
    expect(
      huerfanas,
      "Estas RPC no las crea ninguna migración, así que no hay script que " +
      "correr para que existan:\n" + huerfanas.map(r => `  · ${r}`).join("\n"),
    ).toEqual([]);
  });

  /**
   * Y si falla porque la base va atrás, el mensaje tiene que nombrar el
   * archivo. `desasignar_motocarro_de_remision` e `importar_packing_list`
   * faltaban en producción y el usuario sólo veía «function public.… does not
   * exist»: un botón que no sirve y nadie sabe por qué.
   */
  it("un 42883 de cualquier RPC dice qué script correr", () => {
    const mudas: string[] = [];
    for (const r of rpcs()) {
      const msg = explicarError(
        { code: "42883", message: `function public.${r}(uuid) does not exist` },
        "x",
      );
      if (!/supabase\/migrations\/\S+\.sql/.test(msg)) mudas.push(r);
    }
    expect(
      mudas,
      "Agrega estas RPC a `SCRIPT_DE_OBJETO` en src/lib/dazon.ts; si no, el " +
      "usuario recibe el error crudo de Postgres y nadie sabe qué correr:\n" +
      mudas.map(r => `  · ${r}`).join("\n"),
    ).toEqual([]);
  });
});
