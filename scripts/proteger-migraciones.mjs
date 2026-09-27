/**
 * Las migraciones de este repo se pegan a mano y, además, un pull request
 * posterior puede reescribir el archivo o volver a crear una función con el
 * cuerpo viejo. Este guardián impide las dos cosas:
 *
 *   1. Un script que ya está en main no se edita ni se borra.
 *   2. Una función nueva tiene que partir del cuerpo vigente. Si el cuerpo
 *      nuevo quita líneas, el script tiene que decirlo con
 *      `-- acepto-reemplazo: nombre`.
 *
 *   npm run migraciones:verificar
 *   npm run migraciones:sellar
 *   npm run migracion:nueva -- descripcion_corta
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR_MIG = "supabase/migrations";
const DIR_VIG = "supabase/funciones-vigentes";
const SELLO = "supabase/migrations.lock";
const DIAG = "supabase/diagnostico_esquema.sql";
const NOMBRE_NUEVO = /^\d{14}_[a-z0-9_]+\.sql$/;

const ENCABEZADO_SELLO = [
  "# Sello de supabase/migrations.",
  "# Una línea: <sha256>  <archivo.sql>",
  "# No cambies el hash de un archivo que ya está aquí: eso borra una mejora ya guardada.",
  "# Un script nuevo se crea con `npm run migracion:nueva` y se sella con `npm run migraciones:sellar`.",
  "# merge=union: si dos pull requests agregan líneas, el merge se queda con las dos.",
].join("\n");

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function renderSello(entradas) {
  const lineas = [...entradas.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nombre, hash]) => `${hash}  ${nombre}`);
  return `${ENCABEZADO_SELLO}\n${lineas.join("\n")}\n`;
}

export function leerSello(texto) {
  if (texto.includes("<<<<<<<") || texto.includes(">>>>>>>")) {
    throw new Error(
      "supabase/migrations.lock tiene marcas de conflicto. Conserva las líneas de los dos lados y corre `npm run migraciones:sellar`.",
    );
  }
  const entradas = new Map();
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const m = /^([a-f0-9]{64})  (\S+\.sql)$/.exec(limpia);
    if (!m) {
      throw new Error(`Línea ilegible en supabase/migrations.lock: ${linea}`);
    }
    const [hash, nombre] = [m[1], m[2]];
    const previo = entradas.get(nombre);
    if (previo && previo !== hash) {
      throw new Error(
        `${nombre} quedó con dos hashes distintos en el sello (un merge se quedó con las dos versiones). ` +
          "No elijas una: la versión de main se conserva y el cambio va en un script nuevo.",
      );
    }
    entradas.set(nombre, hash);
  }
  return entradas;
}

function ordenMigracion(nombre) {
  const m = /^(\d{14})/.exec(nombre);
  return m ? `1-${m[1]}-${nombre}` : `0-${nombre}`;
}

function enComentarioDeLinea(sql, index) {
  const inicio = sql.lastIndexOf("\n", index - 1) + 1;
  return sql.slice(inicio, index).includes("--");
}

function cerrarParen(sql, abierto) {
  let profundidad = 0;
  let comilla = false;
  for (let i = abierto; i < sql.length; i++) {
    const c = sql[i];
    if (comilla) {
      if (c === "'" && sql[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (c === "'") comilla = false;
      continue;
    }
    if (c === "'") {
      comilla = true;
      continue;
    }
    if (c === "(") profundidad += 1;
    else if (c === ")") {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  throw new Error("Paréntesis sin cerrar en una firma de función");
}

/**
 * Definiciones de función, en orden. La última aparición de cada nombre
 * (el archivo más nuevo que la vuelve a crear) es la que queda en la base
 * cuando alguien pega los scripts de arriba hacia abajo.
 */
export function extraerFunciones(sql, archivo) {
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/gi;
  const defs = [];
  let m;
  while ((m = re.exec(sql))) {
    if (enComentarioDeLinea(sql, m.index)) continue;
    const inicio = m.index;
    let i = m.index + m[0].length;
    const nombreM = /^(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/.exec(sql.slice(i));
    if (!nombreM) {
      throw new Error(`No pude leer el nombre de una función en ${archivo}`);
    }
    const nombre = nombreM[1].toLowerCase();
    i += nombreM[0].length;
    if (sql[i] === "(") i = cerrarParen(sql, i) + 1;
    const resto = sql.slice(i);
    const asM = /\bAS\s+(\$[A-Za-z0-9_]*\$)/i.exec(resto);
    if (!asM) {
      throw new Error(`No encontré el cuerpo de ${nombre} en ${archivo}`);
    }
    const etiqueta = asM[1];
    const cuerpoDesde = i + asM.index + asM[0].length;
    const cierre = sql.indexOf(etiqueta, cuerpoDesde);
    if (cierre < 0) {
      throw new Error(`El cuerpo de ${nombre} en ${archivo} no cierra ${etiqueta}`);
    }
    let fin = cierre + etiqueta.length;
    while (sql[fin] === " " || sql[fin] === "\t" || sql[fin] === "\r" || sql[fin] === "\n") fin += 1;
    if (sql[fin] === ";") fin += 1;
    defs.push({ nombre, archivo, texto: sql.slice(inicio, fin).trim() });
    re.lastIndex = fin;
  }
  return defs;
}

export function funcionesVigentes(archivos) {
  const porNombre = new Map();
  const ordenados = [...archivos.keys()].sort((a, b) => ordenMigracion(a).localeCompare(ordenMigracion(b)));
  for (const nombreArchivo of ordenados) {
    const sql = archivos.get(nombreArchivo).toString("utf8");
    // En un mismo archivo manda la última definición: es la que queda en
    // Postgres. Guardar también la anterior escondería líneas que el cuerpo
    // final ya tiró.
    const ultimo = new Map();
    for (const def of extraerFunciones(sql, nombreArchivo)) {
      ultimo.set(def.nombre, def.texto);
    }
    for (const [nombre, texto] of ultimo) {
      porNombre.set(nombre, { archivo: nombreArchivo, textos: [texto] });
    }
  }
  return porNombre;
}

export function archivoVigente(nombre) {
  return `funcion__${nombre}.sql`;
}

export function renderVigente(info) {
  return (
    "-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.\n" +
    `-- fuente: ${info.archivo}\n\n` +
    `${info.textos.join("\n\n")}\n`
  );
}

/** Líneas de SQL que estaban y ya no están. Reordenar no cuenta; quitar, sí. */
export function lineasQuitadas(antes, despues) {
  const disponibles = new Map();
  for (const linea of lineasSql(despues)) {
    disponibles.set(linea, (disponibles.get(linea) ?? 0) + 1);
  }
  const quitadas = [];
  for (const linea of lineasSql(antes)) {
    const n = disponibles.get(linea) ?? 0;
    if (n > 0) disponibles.set(linea, n - 1);
    else quitadas.push(linea);
  }
  return quitadas;
}

function lineasSql(texto) {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"));
}

export function tieneAceptacion(sql, nombre) {
  const re = new RegExp(`^\\s*--\\s*acepto-reemplazo:\\s*${nombre}\\s*$`, "m");
  return re.test(sql);
}

export function prefijo(nombre) {
  const m = /^(\d{14})_/.exec(nombre);
  return m ? m[1] : null;
}

export function scriptsDelDiagnostico(sql) {
  return new Set(Array.from(sql.matchAll(/^\s*\('([^']+)',/gm), (m) => m[1]));
}

function hashesDe(archivos) {
  return new Map([...archivos.entries()].map(([nombre, bytes]) => [nombre, sha256(bytes)]));
}

/**
 * @param {object} ctx
 * @param {Map<string, Buffer>} ctx.migraciones
 * @param {string|null} ctx.selloTexto  null si todavía no existe
 * @param {Map<string, string>} ctx.vigentesDisco
 * @param {Map<string, Buffer>|null} ctx.baseMigraciones
 * @param {Map<string, string>|null} ctx.baseVigentes
 * @param {string|null} ctx.diagnostico
 * @param {string|null} ctx.baseDiagnostico
 */
export function evaluar(ctx) {
  const errores = [];
  const migraciones = ctx.migraciones;
  const hashes = hashesDe(migraciones);

  let sello = new Map();
  if (ctx.selloTexto == null) {
    errores.push("Falta supabase/migrations.lock. Corre `npm run migraciones:sellar`.");
  } else {
    try {
      sello = leerSello(ctx.selloTexto);
    } catch (error) {
      errores.push(error.message);
    }
    if (errores.length === 0 && ctx.selloTexto !== renderSello(sello)) {
      errores.push(
        "supabase/migrations.lock no está en su forma canónica (líneas repetidas o desordenadas, típico de un merge). Corre `npm run migraciones:sellar` para guardarlo sin perder entradas.",
      );
    }
  }

  for (const [nombre, hash] of hashes) {
    if (!sello.has(nombre)) {
      errores.push(`${nombre} no está sellado. Corre \`npm run migraciones:sellar\` en el mismo cambio que lo agrega.`);
    } else if (sello.get(nombre) !== hash) {
      errores.push(
        `${nombre} está sellado y su contenido cambió. No reescribas un script ya guardado: déjalo como está y pon la mejora en un archivo nuevo (\`npm run migracion:nueva\`).`,
      );
    }
  }
  for (const nombre of sello.keys()) {
    if (!migraciones.has(nombre)) {
      errores.push(
        `Se borró ${nombre}, que ya estaba sellado. Vuelve a ponerlo. Un merge tiene que quedarse con los scripts de los dos lados.`,
      );
    }
  }

  const prefijos = new Map();
  for (const nombre of migraciones.keys()) {
    const p = prefijo(nombre);
    if (!p) continue;
    if (prefijos.has(p)) {
      errores.push(
        `${nombre} y ${prefijos.get(p)} comparten el número ${p}. El que no está en main se renumera con \`npm run migracion:nueva\`; no se borra ninguno.`,
      );
    } else {
      prefijos.set(p, nombre);
    }
  }

  let vigentes;
  try {
    vigentes = funcionesVigentes(migraciones);
  } catch (error) {
    errores.push(error.message);
    vigentes = new Map();
  }

  if (vigentes.size < 30 && migraciones.size > 10) {
    errores.push(
      `Sólo se leyeron ${vigentes.size} funciones vigentes. El lector de scripts falló: no se puede saber si una mejora se pisó.`,
    );
  }

  const esperados = new Map();
  for (const [nombre, info] of vigentes) {
    esperados.set(archivoVigente(nombre), renderVigente(info));
  }
  for (const [archivo, texto] of esperados) {
    if (ctx.vigentesDisco.get(archivo) !== texto) {
      errores.push(
        `${DIR_VIG}/${archivo} no coincide con la última definición de las migraciones. No lo edites a mano: corre \`npm run migraciones:sellar\`.`,
      );
    }
  }
  for (const archivo of ctx.vigentesDisco.keys()) {
    if (!esperados.has(archivo)) {
      errores.push(`${DIR_VIG}/${archivo} sobra. Corre \`npm run migraciones:sellar\` para dejar sólo las funciones que siguen vigentes.`);
    }
  }

  if (ctx.baseMigraciones) {
    let maxBase = "";
    for (const nombre of ctx.baseMigraciones.keys()) {
      const p = prefijo(nombre);
      if (p && p > maxBase) maxBase = p;
    }
    for (const [nombre, bytes] of ctx.baseMigraciones) {
      if (!migraciones.has(nombre)) {
        errores.push(
          `El merge eliminó ${nombre}, que ya está en main. Hay que conservarlo. Si chocó con otro script, se renumera el nuevo, no se tira el viejo.`,
        );
        continue;
      }
      if (!bytes.equals(migraciones.get(nombre))) {
        errores.push(
          `${nombre} ya está en main y este cambio lo reescribe. Las mejoras anteriores se quedan en ese archivo. Lo nuevo va en otro script.`,
        );
      }
    }
    for (const nombre of migraciones.keys()) {
      if (ctx.baseMigraciones.has(nombre)) continue;
      if (!NOMBRE_NUEVO.test(nombre)) {
        errores.push(
          `${nombre} no sigue la forma AAAAMMDDNNNNNN_descripcion.sql. Crearlo con \`npm run migracion:nueva -- descripcion\`.`,
        );
        continue;
      }
      const p = prefijo(nombre);
      if (maxBase && p <= maxBase) {
        errores.push(
          `${nombre} no es posterior al último script de main (${maxBase}). Trae main y vuelve a crearlo con \`npm run migracion:nueva\`, para que no se meta en medio del historial ni choque con otro pull request.`,
        );
      }
    }
  }

  if (ctx.baseVigentes) {
    for (const [nombre, info] of vigentes) {
      const archivo = archivoVigente(nombre);
      const previo = ctx.baseVigentes.get(archivo);
      if (previo == null) continue;
      const nuevo = renderVigente(info);
      const quitadas = lineasQuitadas(previo, nuevo);
      if (quitadas.length === 0) continue;
      const sql = migraciones.get(info.archivo)?.toString("utf8") ?? "";
      if (tieneAceptacion(sql, nombre)) continue;
      const muestra = quitadas.slice(0, 8).map((l) => `    ${l}`).join("\n");
      errores.push(
        `La versión nueva de \`${nombre}\` (en ${info.archivo}) quita ${quitadas.length} línea(s) de la versión vigente. ` +
          `Parte de ${DIR_VIG}/${archivo} y aplica el cambio encima, sin traer el cuerpo de un script viejo.\n` +
          `${muestra}\n` +
          `  Si de verdad hay que quitarlas, escribe en ese script nuevo la línea \`-- acepto-reemplazo: ${nombre}\` y explica por qué en la cabecera.`,
      );
    }
  }

  if (ctx.diagnostico != null && ctx.baseDiagnostico != null) {
    const ahora = scriptsDelDiagnostico(ctx.diagnostico);
    for (const script of scriptsDelDiagnostico(ctx.baseDiagnostico)) {
      if (!ahora.has(script)) {
        errores.push(
          `El diagnóstico dejó de revisar \`${script}\`. No se borra un renglón de \`esperado\` / \`superado\` al mergear: se agregan los del script nuevo.`,
        );
      }
    }
  }

  return { ok: errores.length === 0, errores };
}

function git(args, opciones = {}) {
  return execFileSync("git", args, {
    cwd: RAIZ,
    maxBuffer: 32 * 1024 * 1024,
    ...opciones,
  });
}

function gitOk(args) {
  try {
    git(args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolverBase() {
  const explicito = process.env.MIGRACIONES_BASE;
  const candidatos = explicito ? [explicito] : ["origin/main", "main"];
  for (const ref of candidatos) {
    if (!gitOk(["rev-parse", "--verify", "--quiet", ref])) continue;
    if (!gitOk(["merge-base", "HEAD", ref])) continue;
    return git(["merge-base", "HEAD", ref], { encoding: "utf8" }).trim();
  }
  return null;
}

function blob(rev, ruta) {
  try {
    return git(["show", `${rev}:${ruta}`]);
  } catch {
    return null;
  }
}

function listarArbol(rev, dir) {
  try {
    const out = git(["ls-tree", "-r", "--name-only", rev, dir], { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function leerMigracionesDisco() {
  const dir = path.join(RAIZ, DIR_MIG);
  const archivos = new Map();
  for (const nombre of readdirSync(dir)) {
    if (!nombre.endsWith(".sql")) continue;
    archivos.set(nombre, readFileSync(path.join(dir, nombre)));
  }
  return archivos;
}

function leerVigentesDisco() {
  const dir = path.join(RAIZ, DIR_VIG);
  const archivos = new Map();
  if (!existsSync(dir)) return archivos;
  for (const nombre of readdirSync(dir)) {
    if (!nombre.endsWith(".sql")) continue;
    archivos.set(nombre, readFileSync(path.join(dir, nombre), "utf8"));
  }
  return archivos;
}

function cargarBase(rev) {
  if (!rev) {
    return { migraciones: null, vigentes: null, diagnostico: null };
  }
  const migraciones = new Map();
  for (const ruta of listarArbol(rev, DIR_MIG)) {
    if (!ruta.endsWith(".sql")) continue;
    const bytes = blob(rev, ruta);
    if (bytes) migraciones.set(path.posix.basename(ruta), bytes);
  }
  const vigentes = new Map();
  for (const ruta of listarArbol(rev, DIR_VIG)) {
    if (!ruta.endsWith(".sql")) continue;
    const bytes = blob(rev, ruta);
    if (bytes) vigentes.set(path.posix.basename(ruta), bytes.toString("utf8"));
  }
  const diagnostico = blob(rev, DIAG);
  return {
    migraciones,
    vigentes,
    diagnostico: diagnostico ? diagnostico.toString("utf8") : null,
  };
}

function contextoActual() {
  const base = cargarBase(resolverBase());
  const selloRuta = path.join(RAIZ, SELLO);
  return {
    migraciones: leerMigracionesDisco(),
    selloTexto: existsSync(selloRuta) ? readFileSync(selloRuta, "utf8") : null,
    vigentesDisco: leerVigentesDisco(),
    baseMigraciones: base.migraciones,
    baseVigentes: base.vigentes,
    diagnostico: existsSync(path.join(RAIZ, DIAG)) ? readFileSync(path.join(RAIZ, DIAG), "utf8") : null,
    baseDiagnostico: base.diagnostico,
  };
}

function escribirVigentes(vigentes) {
  const dir = path.join(RAIZ, DIR_VIG);
  mkdirSync(dir, { recursive: true });
  const esperados = new Set();
  for (const [nombre, info] of vigentes) {
    const archivo = archivoVigente(nombre);
    esperados.add(archivo);
    writeFileSync(path.join(dir, archivo), renderVigente(info));
  }
  for (const nombre of readdirSync(dir)) {
    if (nombre.endsWith(".sql") && !esperados.has(nombre)) {
      rmSync(path.join(dir, nombre));
    }
  }
}

function comandoCheck() {
  const resultado = evaluar(contextoActual());
  if (!resultado.ok) {
    console.error(resultado.errores.join("\n\n"));
    process.exit(1);
  }
  const n = leerMigracionesDisco().size;
  const f = funcionesVigentes(leerMigracionesDisco()).size;
  console.log(`ok: ${n} migraciones selladas, ${f} funciones vigentes`);
}

function comandoSellar() {
  const ctx = contextoActual();
  const hashes = hashesDe(ctx.migraciones);
  const vigentes = funcionesVigentes(ctx.migraciones);
  const vigentesDisco = new Map();
  for (const [nombre, info] of vigentes) {
    vigentesDisco.set(archivoVigente(nombre), renderVigente(info));
  }
  const resultado = evaluar({
    ...ctx,
    selloTexto: renderSello(hashes),
    vigentesDisco,
  });
  if (!resultado.ok) {
    console.error(resultado.errores.join("\n\n"));
    process.exit(1);
  }
  writeFileSync(path.join(RAIZ, SELLO), renderSello(hashes));
  escribirVigentes(vigentes);
  console.log(`sellado: ${hashes.size} migraciones, ${vigentes.size} funciones vigentes`);
}

function hoyUtc() {
  const d = new Date();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mes}${dia}`;
}

export function siguientePrefijo(prefijos, hoy) {
  let max = "00000000000000";
  for (const p of prefijos) if (p > max) max = p;
  const fecha = max.slice(0, 8);
  const seq = Number(max.slice(8));
  if (hoy > fecha) return `${hoy}000001`;
  return `${fecha}${String(seq + 1).padStart(6, "0")}`;
}

function comandoNueva(descripcion) {
  if (!descripcion || !/^[a-z0-9_]+$/.test(descripcion)) {
    console.error("Uso: npm run migracion:nueva -- descripcion_en_snake_case");
    process.exit(1);
  }
  const ctx = contextoActual();
  const prefijos = [];
  for (const nombre of ctx.migraciones.keys()) {
    const p = prefijo(nombre);
    if (p) prefijos.push(p);
  }
  if (ctx.baseMigraciones) {
    for (const nombre of ctx.baseMigraciones.keys()) {
      const p = prefijo(nombre);
      if (p) prefijos.push(p);
    }
  }
  const id = siguientePrefijo(prefijos, hoyUtc());
  const nombre = `${id}_${descripcion}.sql`;
  const destino = path.join(RAIZ, DIR_MIG, nombre);
  if (existsSync(destino)) {
    console.error(`${nombre} ya existe.`);
    process.exit(1);
  }
  const fecha = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
  const cuerpo = `-- ============================================================================
-- ${descripcion.replaceAll("_", " ")}
-- Fecha: ${fecha}
--
-- Script NUEVO. No edites ni borres archivos que ya están en main: si no,
-- el merge se lleva las mejoras que ya se habían guardado.
--
-- Si reemplazas una función, copia el cuerpo de
-- supabase/funciones-vigentes/funcion__<nombre>.sql y cambia encima de eso.
-- No partes de un script viejo. Si el cuerpo nuevo quita líneas del vigente,
-- declara la línea de abajo (y explica en este encabezado qué se quitó y por qué):
--   -- acepto-reemplazo: nombre_funcion
--
-- Después:
--   1. Registra este archivo en supabase/diagnostico_esquema.sql (esperado).
--      No borres renglones de scripts anteriores.
--   2. npm run migraciones:sellar
--   3. npm test
--
-- Idempotente. Se pega completo en el SQL editor. NO usar supabase db push.
-- ============================================================================

`;
  writeFileSync(destino, cuerpo);
  console.log(path.join(DIR_MIG, nombre));
}

function comandoSelftest() {
  const falla = (mensaje) => {
    throw new Error(mensaje);
  };
  const sqlVieja = Buffer.from(
    "CREATE OR REPLACE FUNCTION public.rol_legacy()\nRETURNS void LANGUAGE sql AS $$\n  SELECT 1;\n  SELECT 'mejora-previa';\n$$;\n",
  );
  const sqlNueva = Buffer.from(
    "-- acepto-reemplazo: rol_legacy\nCREATE OR REPLACE FUNCTION public.rol_legacy()\nRETURNS void LANGUAGE sql AS $$\n  SELECT 2;\n$$;\n",
  );
  const migraciones = new Map([
    ["20260101000001_base.sql", sqlVieja],
    ["20260102000001_nueva.sql", sqlNueva],
  ]);
  const vigentes = funcionesVigentes(migraciones);
  if (vigentes.get("rol_legacy")?.archivo !== "20260102000001_nueva.sql") {
    falla("la función vigente no salió del script más nuevo");
  }
  if (!renderVigente(vigentes.get("rol_legacy")).includes("SELECT 2")) {
    falla("se perdió el cuerpo nuevo");
  }
  const quitadas = lineasQuitadas(
    "SELECT 1;\nSELECT 'mejora-previa';\n",
    "SELECT 2;\n",
  );
  if (quitadas.length !== 2) falla(`esperaba 2 líneas quitadas, hubo ${quitadas.length}`);
  if (!tieneAceptacion(sqlNueva.toString("utf8"), "rol_legacy")) falla("no leyó la aceptación");

  const baseVig = new Map([
    [archivoVigente("rol_legacy"), renderVigente({ archivo: "20260101000001_base.sql", textos: [
      "CREATE OR REPLACE FUNCTION public.rol_legacy()\nRETURNS void LANGUAGE sql AS $$\n  SELECT 1;\n  SELECT 'mejora-previa';\n$$;",
    ] })],
  ]);
  const discoVig = new Map([[archivoVigente("rol_legacy"), renderVigente(vigentes.get("rol_legacy"))]]);
  const conMarca = evaluar({
    migraciones,
    selloTexto: renderSello(hashesDe(migraciones)),
    vigentesDisco: discoVig,
    baseMigraciones: new Map([["20260101000001_base.sql", sqlVieja]]),
    baseVigentes: baseVig,
    diagnostico: "('20260101000001_base', 'tabla|x'),\n('20260102000001_nueva', 'tabla|y'),\n",
    baseDiagnostico: "('20260101000001_base', 'tabla|x'),\n",
  });
  if (!conMarca.ok) falla(`con aceptación debía pasar: ${conMarca.errores.join(" | ")}`);

  const sinMarcaSql = Buffer.from(sqlNueva.toString("utf8").replace("-- acepto-reemplazo: rol_legacy\n", ""));
  const sinMarcaMig = new Map(migraciones);
  sinMarcaMig.set("20260102000001_nueva.sql", sinMarcaSql);
  const sinMarcaVig = funcionesVigentes(sinMarcaMig);
  const sinMarca = evaluar({
    migraciones: sinMarcaMig,
    selloTexto: renderSello(hashesDe(sinMarcaMig)),
    vigentesDisco: new Map([[archivoVigente("rol_legacy"), renderVigente(sinMarcaVig.get("rol_legacy"))]]),
    baseMigraciones: new Map([["20260101000001_base.sql", sqlVieja]]),
    baseVigentes: baseVig,
    diagnostico: null,
    baseDiagnostico: null,
  });
  if (sinMarca.ok || !sinMarca.errores.some((e) => e.includes("rol_legacy"))) {
    falla("sin aceptación debía rechazar el cuerpo que tira la mejora");
  }

  const reescrita = evaluar({
    migraciones: new Map([["20260101000001_base.sql", Buffer.from("cambiado")]]),
    selloTexto: renderSello(new Map([["20260101000001_base.sql", sha256(Buffer.from("cambiado"))]])),
    vigentesDisco: new Map(),
    baseMigraciones: new Map([["20260101000001_base.sql", Buffer.from("original")]]),
    baseVigentes: new Map(),
    diagnostico: null,
    baseDiagnostico: null,
  });
  if (reescrita.ok || !reescrita.errores.some((e) => e.includes("reescribe"))) {
    falla("reescribir un script de main debía fallar aunque el sello se actualice");
  }

  const borrada = evaluar({
    migraciones: new Map(),
    selloTexto: renderSello(new Map()),
    vigentesDisco: new Map(),
    baseMigraciones: new Map([["20260101000001_base.sql", Buffer.from("original")]]),
    baseVigentes: new Map(),
    diagnostico: "('otra', 'tabla|z'),\n",
    baseDiagnostico: "('20260101000001_base', 'tabla|x'),\n",
  });
  if (!borrada.errores.some((e) => e.includes("eliminó"))) falla("borrar un script de main debía fallar");
  if (!borrada.errores.some((e) => e.includes("diagnóstico"))) falla("borrar un script del diagnóstico debía fallar");

  const choque = siguientePrefijo(["20260922000004"], "20260923");
  if (choque !== "20260923000001") falla(`prefijo del día siguiente: ${choque}`);
  const mismoDia = siguientePrefijo(["20260923000002", "20260922000004"], "20260923");
  if (mismoDia !== "20260923000003") falla(`prefijo del mismo día: ${mismoDia}`);

  const doble = Buffer.from(
    "CREATE OR REPLACE FUNCTION public.foo()\nRETURNS void LANGUAGE sql AS $$\n  SELECT 'vieja';\n$$;\n" +
      "CREATE OR REPLACE FUNCTION public.foo()\nRETURNS void LANGUAGE sql AS $$\n  SELECT 'nueva';\n$$;\n",
  );
  const queda = funcionesVigentes(new Map([["20260101000001_doble.sql", doble]]));
  const textoDoble = renderVigente(queda.get("foo"));
  if (textoDoble.includes("vieja") || !textoDoble.includes("nueva")) {
    falla("en un mismo archivo debe quedar la última definición, no las dos");
  }

  const repetido = "a".repeat(64);
  const selloSucio = `${ENCABEZADO_SELLO}\n${repetido}  a.sql\n${repetido}  a.sql\n`;
  const leido = leerSello(selloSucio);
  if (leido.get("a.sql") !== repetido) falla("el sello union no conservó el hash");
  if (selloSucio === renderSello(leido)) falla("el sello con líneas repetidas no debía ser canónico");

  console.log("selftest ok");
}

function main() {
  const [comando, ...resto] = process.argv.slice(2);
  if (comando === "check" || comando === "verificar" || !comando) comandoCheck();
  else if (comando === "sellar") comandoSellar();
  else if (comando === "nueva") comandoNueva(resto[0]);
  else if (comando === "selftest") comandoSelftest();
  else {
    console.error("Comandos: verificar | sellar | nueva <nombre> | selftest");
    process.exit(1);
  }
}

const invocado = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (invocado) main();
