import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1. Verificar que el que llama es admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: CORS });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !caller) return new Response("Unauthorized", { status: 401, headers: CORS });

    // Verificar rol admin usando service_role para saltear RLS en la lectura
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role, nivel, area")
      .eq("user_id", caller.id)
      .single();

    // Solo un administrador (de cualquier área) puede crear usuarios.
    const callerNivel = roleRow?.nivel ?? (roleRow?.role === "admin" ? "admin" : null);
    const callerArea = roleRow?.area ?? (roleRow?.role === "admin" ? "direccion" : null);
    const esAdminGlobal = callerNivel === "admin" && callerArea === "direccion";

    if (callerNivel !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: solo un administrador puede crear usuarios" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // 2. Parsear body
    const body = await req.json();
    const { email, password, nombre_completo, codigo_vendedor } = body;

    if (!email || !password || !nombre_completo) {
      return new Response(JSON.stringify({ error: "email, password y nombre_completo son obligatorios" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const AREAS = ["comercial", "fabrica", "almacen_logistica", "administracion", "direccion"];
    const NIVELES = ["operador", "supervisor", "admin"];

    // Traduce un rol del enum legacy al par (área, nivel), para clientes que
    // todavía no se han actualizado al modelo nuevo.
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
        default:                   return null;
      }
    };

    // El modelo vigente es (área, nivel); `role` se acepta solo por compatibilidad.
    let area = body.area;
    let nivel = body.nivel;
    if (!area || !nivel) {
      const equivalente = body.role ? desdeRolLegacy(body.role) : null;
      if (!equivalente) {
        return new Response(JSON.stringify({ error: "area y nivel son obligatorios" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      area = area ?? equivalente.area;
      nivel = nivel ?? equivalente.nivel;
    }

    if (!AREAS.includes(area)) {
      return new Response(JSON.stringify({ error: "Área inválida" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (!NIVELES.includes(nivel)) {
      return new Response(JSON.stringify({ error: "Tipo de usuario inválido" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Un admin de área solo puede crear usuarios dentro de su propia área.
    if (!esAdminGlobal && area !== callerArea) {
      return new Response(JSON.stringify({ error: "Solo puedes crear usuarios de tu propia área" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Rol legacy derivado de (área, nivel) — el trigger de la BD lo recalcula igual.
    const rolLegacy = (a: string, n: string) => {
      if (a === "comercial") return n === "admin" ? "director_ventas" : n === "supervisor" ? "coordinador_ventas" : "ventas";
      if (a === "fabrica") return "fabrica";
      if (a === "almacen_logistica") return "logistica";
      if (a === "administracion") return n === "operador" ? "finanzas" : "admin_financiero";
      return n === "admin" ? "admin" : "coordinador"; // direccion
    };
    const rolDerivado = rolLegacy(area, nivel);

    // 3. Crear usuario en Supabase Auth
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirmar email automáticamente (no requiere verificación)
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const uid = newUser.user.id;

    // 4. Crear perfil
    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      email: email.toLowerCase().trim(),
      nombre_completo: nombre_completo.trim(),
      codigo_vendedor: codigo_vendedor?.trim() || null,
      activo: true,
    });

    // 5. Asignar rol
    await supabaseAdmin.from("user_roles").upsert({
      user_id: uid,
      area,
      nivel,
      role: rolDerivado,
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ user_id: uid, email, nombre_completo, area, nivel, role: rolDerivado }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
