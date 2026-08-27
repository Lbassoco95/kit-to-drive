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
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: solo admin puede crear usuarios" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // 2. Parsear body
    const { email, password, nombre_completo, role, codigo_vendedor } = await req.json();

    if (!email || !password || !nombre_completo || !role) {
      return new Response(JSON.stringify({ error: "email, password, nombre_completo y role son obligatorios" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const validRoles = ["admin", "fabrica", "logistica", "ventas", "coordinador"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Rol inválido" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

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
      role,
    });

    return new Response(JSON.stringify({ user_id: uid, email, nombre_completo, role }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
