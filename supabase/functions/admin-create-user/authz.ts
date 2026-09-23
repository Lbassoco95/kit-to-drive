/**
 * Reglas de quién puede renovar una cuenta que ya existe.
 * La edge function corre con la service role: si esto falla, un administrador
 * de área puede cambiarle la contraseña a una cuenta de otra área, incluido
 * el administrador global.
 */

export type RolCuenta = { area: string; nivel: string } | null;

export type DecisionCuenta =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** null si la contraseña sirve; si no, el mensaje para quien la capturó. */
export function passwordInvalida(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres";
  }
  if (password.length > 72) {
    return "La contraseña es demasiado larga";
  }
  return null;
}

/**
 * Qué hacer cuando el correo ya tiene cuenta en Auth.
 * Crear una cuenta nueva no pasa por aquí: eso ya lo limita el área del caller.
 *
 * Un administrador de área solo puede renovar la contraseña y el rol de
 * alguien que ya está en su área. Una cuenta sin rol, de otra área, o el
 * administrador de Dirección, solo la toca Dirección.
 */
export function decidirSobreCuentaExistente(opts: {
  esAdminGlobal: boolean;
  callerArea: string | null;
  target: RolCuenta;
}): DecisionCuenta {
  if (opts.esAdminGlobal) return { ok: true };

  if (!opts.target) {
    return {
      ok: false,
      status: 403,
      error: "Esa cuenta ya existe. Solo Dirección puede reasignarla.",
    };
  }

  if (opts.target.area === "direccion" && opts.target.nivel === "admin") {
    return {
      ok: false,
      status: 403,
      error: "No puedes modificar al administrador global",
    };
  }

  if (!opts.callerArea || opts.target.area !== opts.callerArea) {
    return {
      ok: false,
      status: 403,
      error: "Solo puedes actualizar usuarios de tu propia área",
    };
  }

  return { ok: true };
}
