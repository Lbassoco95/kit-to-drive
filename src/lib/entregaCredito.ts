/**
 * En crédito, logística no espera el pago: confirma cuándo le llega la
 * mercancía. Eso se captura al registrar la paquetería (fecha estimada) y se
 * cierra cuando confirma que ya se entregó, para avisarle al cliente.
 */

export const esPagoCredito = (tipo?: string | null) => tipo === "credito";

/** La paquetería todavía no sale: hay que capturar paquetería y fecha. */
export const faltaRegistrarPaqueteria = (unidad: {
  estatus_entrega?: string | null;
  paqueteria?: string | null;
  fecha_estimada_entrega?: string | null;
}) => {
  if (unidad.estatus_entrega === "ENTREGADA") return false;
  return !unidad.paqueteria || !unidad.fecha_estimada_entrega;
};

export type ErrorPaqueteria = "paqueteria" | "fecha";

export function validarRegistroPaqueteria(input: {
  paqueteria: string;
  fechaEstimada: string;
}): ErrorPaqueteria | null {
  if (!input.paqueteria.trim()) return "paqueteria";
  if (!input.fechaEstimada) return "fecha";
  return null;
}
