/**
 * Kit-to-Drive pertenece a la familia Mati. La administración canónica del
 * sistema (usuarios, roles, configuración) se hace desde mati-admin.
 *
 * Cuando `VITE_MATI_ADMIN_URL` está definida, la UI local de Sistema avisa y
 * deja de ofrecer altas/ediciones destructivas: el puente real es la edge
 * function `mati-admin-bridge`, consumida por mati-api.
 */

const DEFAULT_ADMIN = "https://mati-admin.vercel.app";

/** URL base del panel mati-admin (sin slash final). */
export function matiAdminBaseUrl(): string {
  const raw = import.meta.env.VITE_MATI_ADMIN_URL?.trim();
  if (!raw) return DEFAULT_ADMIN;
  return raw.replace(/\/+$/, "");
}

/**
 * ¿La gestión de usuarios/config debe considerarse externalizada a Mati?
 * Se activa con cualquier valor truthy de VITE_MATI_ADMIN_MANAGED, o cuando
 * hay URL de admin explícita distinta del default (señal de que ya cablearon
 * el entorno).
 */
export function adminGestionadoDesdeMati(): boolean {
  const flag = import.meta.env.VITE_MATI_ADMIN_MANAGED?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  // Por defecto: sí — kit-to-drive se administra desde Mati.
  return true;
}

/** Ruta prevista en mati-admin para este producto. */
export function matiAdminKitPath(): string {
  return "/admin/kit-to-drive";
}

export function matiAdminKitUrl(): string {
  return `${matiAdminBaseUrl()}${matiAdminKitPath()}`;
}

/** Meta que el bridge expone; útil para tests y docs. */
export const KIT_TO_DRIVE_SYSTEM = {
  system: "kit-to-drive",
  brand: "mati",
  bridgeFunction: "mati-admin-bridge",
  areas: ["comercial", "fabrica", "almacen_logistica", "administracion", "direccion"],
  niveles: ["operador", "supervisor", "admin"],
} as const;
