/**
 * Quién se lleva la venta de una remisión de motocarro.
 *
 * Quien captura (Atenea, Ana Karen, Marco y quien se sume al equipo de
 * registro) queda en `vendedor_id`: es la cuenta con la que se guardó el
 * pedido. El vendedor de la venta es el nombre que se le asignó en la
 * remisión (`nombre_vendedor`). Esa cuenta sólo cuenta como vendedor cuando
 * ella misma quedó escrita ahí — o sea, cuando se seleccionó como vendedora.
 */

export type PerfilVendedor = { nombre_completo?: string | null } | null;

export type RemisionConVendedor = {
  nombre_vendedor?: string | null;
  notas?: string | null;
  estatus?: string | null;
  profiles?: PerfilVendedor | PerfilVendedor[] | null;
};

export type FilaVendedor = { nombre: string; n: number };

const PREFIJO_NOTAS = /vendedor original:\s*(.*)/i;

function limpio(valor?: string | null): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

function nombreCuenta(profiles: RemisionConVendedor["profiles"]): string {
  if (!profiles) return "";
  const perfil = Array.isArray(profiles) ? profiles[0] : profiles;
  return limpio(perfil?.nombre_completo);
}

function vendedorEnNotas(notas?: string | null): string {
  const texto = limpio(notas);
  if (!texto) return "";
  const hallado = texto.match(PREFIJO_NOTAS);
  return limpio(hallado?.[1]);
}

/** Nombre con el que se debe mostrar y contar al vendedor de esta remisión. */
export function nombreVendedorDe(r: RemisionConVendedor | null | undefined): string {
  if (!r) return "";
  return limpio(r.nombre_vendedor) || nombreCuenta(r.profiles) || vendedorEnNotas(r.notas);
}

/** Agrupa «Iván» / «Ivan» / «IVAN» y «Marco» / «MARCO» en la misma persona. */
export function claveVendedor(nombre: string): string {
  return limpio(nombre)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es");
}

function esMayusculas(nombre: string): boolean {
  return nombre === nombre.toLocaleUpperCase("es") && nombre !== nombre.toLocaleLowerCase("es");
}

function aTitulo(nombre: string): string {
  return nombre
    .toLocaleLowerCase("es")
    .replace(/(^|\s)(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"));
}

/**
 * «Marco» y «Marco Beltran» son la misma persona: el nombre corto es el
 * inicio, palabra por palabra, del nombre completo. No al revés.
 */
function mismaPersona(corta: string, larga: string): boolean {
  return corta.length >= 3 && larga.startsWith(`${corta} `);
}

function elegirNombre(variantes: Map<string, number>): string {
  const ordenadas = [...variantes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const ganadora = ordenadas[0]?.[0] ?? "";
  if (!ganadora) return "";
  if (!esMayusculas(ganadora)) return ganadora;
  const mixta = ordenadas.find(([nombre]) => !esMayusculas(nombre));
  return mixta?.[0] ?? aTitulo(ganadora);
}

/**
 * Ranking por remisión asignada. Una cancelada no es una venta.
 * El límite recorta después de agrupar, para que «Ivan» e «Iván» sumen juntos.
 */
export function topVendedores(
  rems: RemisionConVendedor[],
  opts?: { limite?: number; sinAsignar?: string },
): FilaVendedor[] {
  const limite = opts?.limite ?? 5;
  const sinAsignar = opts?.sinAsignar ?? "Sin asignar";
  const grupos = new Map<string, { total: number; variantes: Map<string, number> }>();

  for (const rem of rems) {
    if (rem.estatus === "CANCELADA") continue;
    const crudo = nombreVendedorDe(rem) || sinAsignar;
    const clave = claveVendedor(crudo) || claveVendedor(sinAsignar);
    const grupo = grupos.get(clave) ?? { total: 0, variantes: new Map() };
    grupo.total += 1;
    grupo.variantes.set(crudo, (grupo.variantes.get(crudo) ?? 0) + 1);
    grupos.set(clave, grupo);
  }

  const claves = [...grupos.keys()].sort((a, b) => a.length - b.length);
  for (const corta of claves) {
    for (const larga of claves) {
      if (!mismaPersona(corta, larga)) continue;
      const destino = grupos.get(corta);
      const origen = grupos.get(larga);
      if (!destino || !origen || destino === origen) continue;
      destino.total += origen.total;
      for (const [nombre, n] of origen.variantes) {
        destino.variantes.set(nombre, (destino.variantes.get(nombre) ?? 0) + n);
      }
      grupos.delete(larga);
    }
  }

  return [...grupos.values()]
    .map((grupo) => ({ nombre: elegirNombre(grupo.variantes), n: grupo.total }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, limite);
}
