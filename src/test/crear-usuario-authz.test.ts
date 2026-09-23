import { describe, expect, it } from "vitest";
import { decidirSobreCuentaExistente, passwordInvalida } from "../../supabase/functions/admin-create-user/authz";

describe("password de alta de usuario", () => {
  it("rechaza contraseñas cortas", () => {
    expect(passwordInvalida("abc")).toMatch(/8/);
    expect(passwordInvalida("")).toMatch(/8/);
    expect(passwordInvalida(null)).toMatch(/8/);
  });

  it("acepta una contraseña de al menos 8 caracteres", () => {
    expect(passwordInvalida("clave-segura")).toBeNull();
  });
});

describe("cuenta que ya existe", () => {
  const globalAdmin = { area: "direccion", nivel: "admin" };

  it("Dirección puede actualizar cualquier cuenta, incluida la suya", () => {
    expect(decidirSobreCuentaExistente({
      esAdminGlobal: true,
      callerArea: "direccion",
      target: globalAdmin,
    })).toEqual({ ok: true });
    expect(decidirSobreCuentaExistente({
      esAdminGlobal: true,
      callerArea: "direccion",
      target: null,
    })).toEqual({ ok: true });
  });

  it("un admin de área no se queda con la cuenta del administrador global", () => {
    const decision = decidirSobreCuentaExistente({
      esAdminGlobal: false,
      callerArea: "compras",
      target: globalAdmin,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok === false) expect(decision.status).toBe(403);
  });

  it("un admin de área no reasigna una cuenta de otra área", () => {
    const decision = decidirSobreCuentaExistente({
      esAdminGlobal: false,
      callerArea: "compras",
      target: { area: "comercial", nivel: "operador" },
    });
    expect(decision.ok).toBe(false);
  });

  it("un admin de área no adopta una cuenta que todavía no tiene rol", () => {
    const decision = decidirSobreCuentaExistente({
      esAdminGlobal: false,
      callerArea: "fabrica",
      target: null,
    });
    expect(decision.ok).toBe(false);
  });

  it("un admin de área sí renueva a alguien que ya es de su área", () => {
    expect(decidirSobreCuentaExistente({
      esAdminGlobal: false,
      callerArea: "comercial",
      target: { area: "comercial", nivel: "operador" },
    })).toEqual({ ok: true });
  });
});
