import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decidirSobreCuentaExistente,
  passwordInvalida,
} from "./authz.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> };

/** Recorre las páginas: la primera no basta y, si el correo está más adelante, se creaba un duplicado o no se veía a quién se le iba a cambiar la contraseña. */
async function buscarUsuarioPorEmail(
  admin: SupabaseClient,
  email: string,
): Promise<AuthUser | null | undefined> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = (data?.users ?? []) as AuthUser[];
    const found = users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: CORS });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !caller) return new Response("Unauthorized", { status: 401, headers: CORS });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: roleRow }, { data: callerProfile }] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role, nivel, area")
        .eq("user_id", caller.id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("activo")
        .eq("id", caller.id)
        .maybeSingle(),
    ]);

    if (callerProfile?.activo === false) {
      return json({ error: "Tu usuario está desactivado" }, 403);
    }

    const callerNivel = roleRow?.nivel ?? (roleRow?.role === "admin" ? "admin" : null);
    const callerArea = roleRow?.area ?? (roleRow?.role === "admin" ? "direccion" : null);
    const esAdminGlobal = callerNivel === "admin" && callerArea === "direccion";

    if (callerNivel !== "admin") {
      return json({ error: "Forbidden: solo un administrador puede crear usuarios" }, 403);
    }

    const body = await req.json();
    const { email, password, nombre_completo, codigo_vendedor, force_password_change } = body;

    if (!email || !password || !nombre_completo) {
      return json({ error: "email, password y nombre_completo son obligatorios" }, 400);
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return json({ error: "Correo inválido" }, 400);
    }

    const passwordError = passwordInvalida(password);
    if (passwordError) return json({ error: passwordError }, 400);

    const mustChangePassword = force_password_change === true;

    const AREAS = ["comercial", "fabrica", "almacen_logistica", "administracion", "compras", "direccion"];
    const NIVELES = ["operador", "supervisor", "admin"];

    const desdeRolLegacy = (role: string) => {
      switch (role) {
        case "admin":              return { area: "direccion",         nivel: "admin"      };
        case "director_ventas":    return { area: "comercial",         nivel: "admin"      };
        case "coordinador_ventas":
        case "coordinador":        return { area: "comercial",         nivel: "supervisor" };
        case "ventas":
        case "auxiliar_ventas":    return { area: "comercial",         nivel: "operador"   };
        case "fabrica":            return { area: "fabrica",           nivel: "operador"   };
        case "logistica":          return { area: "almacen_logistica", nivel: "operador"   };
        case "admin_financiero":   return { area: "administracion",    nivel: "admin"      };
        case "finanzas":           return { area: "administracion",    nivel: "operador"   };
        case "compras":            return { area: "compras",           nivel: "operador"   };
        default:                   return null;
      }
    };

    let area = body.area;
    let nivel = body.nivel;
    if (!area || !nivel) {
      const equivalente = body.role ? desdeRolLegacy(body.role) : null;
      if (!equivalente) {
        return json({ error: "area y nivel son obligatorios" }, 400);
      }
      area = area ?? equivalente.area;
      nivel = nivel ?? equivalente.nivel;
    }

    if (!AREAS.includes(area)) return json({ error: "Área inválida" }, 400);
    if (!NIVELES.includes(nivel)) return json({ error: "Tipo de usuario inválido" }, 400);

    if (!esAdminGlobal && area !== callerArea) {
      return json({ error: "Solo puedes crear usuarios de tu propia área" }, 403);
    }

    const rolLegacy = (a: string, n: string) => {
      if (a === "comercial") return n === "admin" ? "director_ventas" : n === "supervisor" ? "coordinador_ventas" : "ventas";
      if (a === "fabrica") return "fabrica";
      if (a === "almacen_logistica") return "logistica";
      if (a === "administracion") return n === "operador" ? "finanzas" : "admin_financiero";
      if (a === "compras") return "compras";
      return n === "admin" ? "admin" : "coordinador";
    };
    const rolDerivado = rolLegacy(area, nivel);

    const existente = await buscarUsuarioPorEmail(supabaseAdmin, emailNorm);
    if (existente === undefined) {
      return json({
        error: "No se pudo confirmar si ese correo ya existe. Pide a Dirección que lo revise.",
      }, 409);
    }

    let uid: string;
    const userMetadata = {
      must_change_password: mustChangePassword,
      full_name: String(nombre_completo).trim(),
    };

    if (existente) {
      const { data: targetRole } = await supabaseAdmin
        .from("user_roles")
        .select("area, nivel")
        .eq("user_id", existente.id)
        .maybeSingle();

      const decision = decidirSobreCuentaExistente({
        esAdminGlobal,
        callerArea,
        target: targetRole?.area && targetRole?.nivel
          ? { area: targetRole.area, nivel: targetRole.nivel }
          : null,
      });
      if (!decision.ok) return json({ error: decision.error }, decision.status);

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existente.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(existente.user_metadata || {}), ...userMetadata },
      });
      if (updateErr) return json({ error: updateErr.message }, 400);
      uid = existente.id;
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailNorm,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (createErr) return json({ error: createErr.message }, 400);
      uid = newUser.user!.id;
    }

    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      email: emailNorm,
      nombre_completo: String(nombre_completo).trim(),
      codigo_vendedor: codigo_vendedor?.trim() || null,
      activo: true,
    });

    await supabaseAdmin.from("user_roles").upsert({
      user_id: uid,
      area,
      nivel,
      role: rolDerivado,
    }, { onConflict: "user_id" });

    return json({ user_id: uid, email: emailNorm, nombre_completo, area, nivel, role: rolDerivado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear el usuario";
    return json({ error: message }, 500);
  }
});
