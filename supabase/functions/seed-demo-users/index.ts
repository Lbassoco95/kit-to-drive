// Edge function: crea/confirma todos los usuarios (demo + reales). Idempotente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Demo users (contraseña genérica, para pruebas)
const DEMO = [
  { email: "admin@dazon.demo",     password: "Dazon2026!", nombre: "Admin Dazon",     role: "admin" },
  { email: "fabrica@dazon.demo",   password: "Dazon2026!", nombre: "Fábrica Dazon",   role: "fabrica" },
  { email: "logistica@dazon.demo", password: "Dazon2026!", nombre: "Logística Dazon", role: "logistica" },
  { email: "ventas@dazon.demo",    password: "Dazon2026!", nombre: "Vendedor Demo",   role: "ventas", codigo_vendedor: "DEMO" },
];

// Usuarios reales del equipo Grupo Dazon
const REAL = [
  { email: "lee@dazon.demo",       password: "%Fdw4ExZh6ds@#",  nombre: "Lee",       role: "admin" },
  { email: "marco@dazon.demo",     password: "dM5q&E8TvT$3CP",  nombre: "Marco",     role: "ventas",  codigo_vendedor: "MARCO" },
  { email: "anakaren@dazon.demo",  password: "r^xH7I^zzRjjty",  nombre: "Ana Karen", role: "ventas",  codigo_vendedor: "ANAKAREN" },
  { email: "edgar@dazon.demo",     password: "ctFoByH!BY1IQQ",  nombre: "Edgar",     role: "fabrica" },
  { email: "erika@dazon.demo",     password: "hHJ^r4WIbhI2Ni",  nombre: "Erika",     role: "fabrica" },
];

const ALL = [...DEMO, ...REAL];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const created: string[] = [];
    const confirmed: string[] = [];
    const existed: string[] = [];

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const byEmail = new Map((list?.users ?? []).map(u => [u.email?.toLowerCase(), u]));

    for (const d of ALL) {
      let userId: string;
      const ex = byEmail.get(d.email.toLowerCase());

      if (ex) {
        userId = ex.id;
        // Si existe pero no tiene email confirmado, confirmarlo y actualizar contraseña
        if (!ex.email_confirmed_at) {
          await admin.auth.admin.updateUserById(userId, {
            password: d.password,
            email_confirm: true,
          });
          confirmed.push(d.email);
        } else {
          existed.push(d.email);
        }
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

    return new Response(JSON.stringify({ ok: true, created, confirmed, existed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
