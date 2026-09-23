// Edge function de demostración. Apagada salvo que Dirección la encienda
// a propósito: antes aceptaba cualquier llamada (verify_jwt = false) y creaba
// admin@dazon.demo con una contraseña fija, o le reponía el rol admin si ya
// existía.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO = [
  { email: "admin@dazon.demo",     password: "Dazon2026!", nombre: "Admin Dazon",     role: "admin" },
  { email: "fabrica@dazon.demo",   password: "Dazon2026!", nombre: "Fábrica Dazon",   role: "fabrica" },
  { email: "logistica@dazon.demo", password: "Dazon2026!", nombre: "Logística Dazon", role: "logistica" },
  { email: "ventas@dazon.demo",    password: "Dazon2026!", nombre: "Vendedor Demo",   role: "ventas", codigo_vendedor: "DEMO" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (Deno.env.get("ALLOW_DEMO_SEED") !== "true") {
    return json({ error: "El alta de usuarios demo está apagada" }, 403);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await caller.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("nivel, area, role").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("activo").eq("id", user.id).maybeSingle(),
    ]);

    const nivel = roleRow?.nivel ?? (roleRow?.role === "admin" ? "admin" : null);
    const area = roleRow?.area ?? (roleRow?.role === "admin" ? "direccion" : null);
    if (profile?.activo === false || nivel !== "admin" || area !== "direccion") {
      return json({ error: "Solo el administrador de Dirección puede sembrar usuarios demo" }, 403);
    }

    const created: string[] = [];
    const existed: string[] = [];

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const byEmail = new Map((list?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

    for (const d of DEMO) {
      let userId: string;
      const ex = byEmail.get(d.email);
      if (ex) {
        userId = ex.id;
        existed.push(d.email);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: d.email,
          password: d.password,
          email_confirm: true,
          user_metadata: { nombre_completo: d.nombre },
        });
        if (error) throw error;
        userId = data.user!.id;
        created.push(d.email);
      }

      await admin.from("profiles").upsert({
        id: userId,
        nombre_completo: d.nombre,
        codigo_vendedor: d.codigo_vendedor ?? null,
      });

      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: d.role });
    }

    return json({ ok: true, created, existed });
  } catch {
    return json({ error: "No se pudieron sembrar los usuarios demo" }, 500);
  }
});
