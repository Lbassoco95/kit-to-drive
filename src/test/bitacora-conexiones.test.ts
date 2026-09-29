import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const auth = readFileSync(join(root, "src/contexts/AuthContext.tsx"), "utf8");
const page = readFileSync(join(root, "src/pages/Bitacora.tsx"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260929000001_historial_conexiones.sql"), "utf8");

describe("historial de conexiones", () => {
  it("registra la sesión autenticada al iniciar y al recuperar una sesión", () => {
    expect(auth).toContain('supabase.rpc("registrar_conexion"');
    expect(auth).toContain('event === "SIGNED_IN"');
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("ON CONFLICT (usuario_id, sesion_id) DO NOTHING");
  });

  it("protege el historial para que solo Dirección pueda consultarlo", () => {
    expect(migration).toContain('public.es_area(auth.uid(), \'direccion\'::public.user_area)');
    expect(migration).not.toMatch(/FOR SELECT TO authenticated\s+USING \(true\)/);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.registrar_conexion() FROM PUBLIC, anon");
  });

  it("muestra la última conexión de cada usuario y el historial solo en Dirección", () => {
    expect(page).toContain('area === "direccion"');
    expect(page).toContain("latestConnection[profile.id]");
    expect(page).toContain("connections.map(connection");
    expect(page).toContain("t.bitacora.nunca");
  });
});
