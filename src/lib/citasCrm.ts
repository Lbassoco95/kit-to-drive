/**
 * Visitas y reuniones agendadas en el CRM.
 *
 * Una cita «venció» cuando sigue programada y ya pasó su fecha. El aviso en
 * la aplicación sale de aquí. El correo sale aparte, y sólo a un correo real:
 * las cuentas de demostración (`@dazon.demo`) no son un buzón.
 */

export const TIPOS_CITA = ["visita", "videollamada", "reunion"] as const;

export type TipoCita = (typeof TIPOS_CITA)[number];

export type CitaComoFila = {
  tipo?: string | null;
  estatus?: string | null;
  fecha_actividad?: string | null;
  vendedor_id?: string | null;
  /** La pone el formulario «Programar». Sin esta marca no es una cita. */
  agendada?: boolean | null;
};

export function esTipoCita(tipo: string | null | undefined): tipo is TipoCita {
  return (TIPOS_CITA as readonly string[]).includes(tipo ?? "");
}

/**
 * ¿Esta fila es una visita o reunión que ya venció para `usuarioId`?
 * Sin `usuarioId` no filtra por vendedor: sirve para marcar la tarjeta.
 */
export function citaVencida(cita: CitaComoFila, ahora: Date, usuarioId?: string | null): boolean {
  if (cita.agendada !== true) return false;
  if (!esTipoCita(cita.tipo)) return false;
  if ((cita.estatus ?? "programada") !== "programada") return false;
  if (usuarioId && cita.vendedor_id !== usuarioId) return false;
  if (!cita.fecha_actividad) return false;
  const fecha = new Date(cita.fecha_actividad);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.getTime() <= ahora.getTime();
}

/** Dominios que no son un buzón al que se le pueda escribir. */
const DOMINIOS_NO_REALES = ["dazon.demo", "example.com", "example.org", "example.net", "test.com", "localhost", "invalid"];

/**
 * Correo al que sí se le avisa. Vacío, mal formado o de demostración → null,
 * y el aviso se queda sólo en la aplicación.
 */
export function correoReal(email: string | null | undefined): string | null {
  const limpio = (email ?? "").trim().toLowerCase();
  if (!limpio || limpio.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return null;
  const dominio = limpio.slice(limpio.lastIndexOf("@") + 1);
  if (DOMINIOS_NO_REALES.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return null;
  return limpio;
}

/** La base todavía no tiene la columna (el script no se ha corrido). */
export function faltaColumna(
  error: { code?: string; message?: string } | null | undefined,
  columna: string,
): boolean {
  if (!error) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  return (error.message ?? "").toLowerCase().includes(columna.toLowerCase());
}
