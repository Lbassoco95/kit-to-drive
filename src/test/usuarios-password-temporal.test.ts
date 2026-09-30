import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = readFileSync(join(root, "src/pages/Usuarios.tsx"), "utf8");
const edgeFunction = readFileSync(join(root, "supabase/functions/admin-reset-user-password/index.ts"), "utf8");

describe("contraseña temporal de usuarios", () => {
  it("invoca la función de restablecimiento con el usuario seleccionado", () => {
    expect(page).toContain('supabase.functions.invoke("admin-reset-user-password"');
    expect(page).toContain("body: { user_id: resetTarget.id }");
  });

  it("obliga al usuario a cambiar la contraseña generada", () => {
    expect(edgeFunction).toContain("password: temporaryPassword");
    expect(edgeFunction).toContain("app_metadata:");
    expect(edgeFunction).toContain("must_change_password: true");
    expect(edgeFunction).toContain("debe_cambiar_password: true");
  });

  it("restringe el restablecimiento a administradores y a su área", () => {
    expect(edgeFunction).toContain('callerNivel !== "admin"');
    expect(edgeFunction).toContain("targetRole?.area !== callerArea");
  });

  it("genera la contraseña en el servidor y sólo la devuelve al crearla", () => {
    expect(edgeFunction).toContain("crypto.getRandomValues");
    expect(edgeFunction).toContain("temporary_password: temporaryPassword");
  });
});
