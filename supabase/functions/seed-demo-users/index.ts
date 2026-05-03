// Edge function: crea los 4 usuarios demo y les asigna roles. Idempotente.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const created: string[] = [];
    const existed: string[] = [];

    // List existing users (paginated)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const byEmail = new Map((list?.users ?? []).map(u => [u.email?.toLowerCase(), u]));

    for (const d of DEMO) {
      let userId: string;
      const ex = byEmail.get(d.email);
      if (ex) {
        userId = ex.id;
        existed.push(d.email);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: d.email, password: d.password, email_confirm: true,
          user_metadata: { nombre_completo: d.nombre },
        });
        if (error) throw error;
        userId = data.user!.id;
        created.push(d.email);
      }

      // upsert profile
      await admin.from("profiles").upsert({
        id: userId,
        nombre_completo: d.nombre,
        codigo_vendedor: d.codigo_vendedor ?? null,
      });

      // upsert role (delete previous then insert to avoid duplicates of other roles)
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: d.role });
    }

    return new Response(JSON.stringify({ ok: true, created, existed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
