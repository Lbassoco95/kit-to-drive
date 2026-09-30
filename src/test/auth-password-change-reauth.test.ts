import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const authContext = readFileSync(join(root, "src/contexts/AuthContext.tsx"), "utf8");
const edgeFunction = readFileSync(join(root, "supabase/functions/complete-password-change/index.ts"), "utf8");
const resetPage = readFileSync(join(root, "src/pages/ResetPassword.tsx"), "utf8");
const es = readFileSync(join(root, "src/i18n/es.ts"), "utf8");

describe("cambio de contraseña fuerza re-login", () => {
  it("cierra sesión local tras complete-password-change (tokens revocados)", () => {
    expect(authContext).toContain('signOut({ scope: "local" })');
    // No debe llamar refreshSession dentro de changePassword (sí puede mencionarlo en comentarios).
    const changeFn = authContext.match(/const changePassword = async[\s\S]*?return \{ error: null \};\n {2}\};/);
    expect(changeFn?.[0]).toBeTruthy();
    expect(changeFn?.[0]).not.toContain("refreshSession(");
    expect(changeFn?.[0]).toContain('signOut({ scope: "local" })');
  });

  it("la Edge Function avisa reauth_required", () => {
    expect(edgeFunction).toContain("reauth_required: true");
    expect(edgeFunction).toContain("revoca refresh tokens");
  });

  it("el reset de contraseña regresa a /auth tras guardar", () => {
    expect(resetPage).toContain('nav("/auth", { replace: true })');
  });

  it("el mensaje indica iniciar sesión de nuevo", () => {
    expect(es).toContain("Inicia sesión con tu nueva contraseña");
  });
});
