import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Avisa por correo que una visita o reunión del CRM ya venció.
 *
 * Sólo escribe a un correo real. `@dazon.demo` y los dominios de prueba no
 * son un buzón: esas citas se quedan en la campana de la aplicación.
 * Si faltan RESEND_API_KEY o RESEND_FROM, no marca la cita como avisada
 * para poder enviarla cuando el correo quede configurado.
 *
 * La misma regla de «correo real» vive en src/lib/citasCrm.ts (`correoReal`).
 */

const ALLOWED_ORIGINS = [
  "https://kit-to-drive.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const TIPOS = ["visita", "videollamada", "reunion"];
const DOMINIOS_NO_REALES = ["dazon.demo", "example.com", "example.org", "example.net", "test.com", "localhost", "invalid"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function correoReal(email: string | null | undefined): string | null {
  const limpio = (email ?? "").trim().toLowerCase();
  if (!limpio || limpio.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return null;
  const dominio = limpio.slice(limpio.lastIndexOf("@") + 1);
  if (DOMINIOS_NO_REALES.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return null;
  return limpio;
}

function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type Cita = {
  id: string;
  tipo: string;
  fecha_actividad: string;
  vendedor_id: string | null;
  cliente_id: string | null;
  objetivo_visita: string | null;
};

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await anon.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: perfilCaller } = await admin.from("profiles").select("activo").eq("id", caller.id).maybeSingle();
    if (perfilCaller && perfilCaller.activo === false) return json({ error: "Forbidden" }, 403);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM");
    if (!apiKey || !from) {
      return json({ revisadas: 0, enviados: 0, sin_correo_real: 0, sin_configurar: true });
    }

    const { data: filas, error: lectura } = await admin
      .from("crm_actividades")
      .select("id, tipo, fecha_actividad, vendedor_id, cliente_id, objetivo_visita")
      .eq("agendada", true)
      .eq("estatus", "programada")
      .is("aviso_correo_at", null)
      .in("tipo", TIPOS)
      .lte("fecha_actividad", new Date().toISOString())
      .order("fecha_actividad", { ascending: true })
      .limit(40);

    if (lectura) {
      // La columna o la tabla todavía no están: la campana de la app no depende de esto.
      return json({ revisadas: 0, enviados: 0, sin_correo_real: 0, sin_configurar: false, pendiente: true });
    }

    const citas = (filas ?? []) as Cita[];
    if (!citas.length) return json({ revisadas: 0, enviados: 0, sin_correo_real: 0, sin_configurar: false });

    const vendedorIds = [...new Set(citas.map((c) => c.vendedor_id).filter((id): id is string => !!id))];
    const clienteIds = [...new Set(citas.map((c) => c.cliente_id).filter((id): id is string => !!id))];

    const [{ data: perfiles }, { data: clientes }] = await Promise.all([
      vendedorIds.length
        ? admin.from("profiles").select("id, email, nombre_completo").in("id", vendedorIds)
        : Promise.resolve({ data: [] as { id: string; email: string | null; nombre_completo: string | null }[] }),
      clienteIds.length
        ? admin.from("clientes").select("id, nombre_comercial").in("id", clienteIds)
        : Promise.resolve({ data: [] as { id: string; nombre_comercial: string | null }[] }),
    ]);

    const perfilDe = new Map((perfiles ?? []).map((p) => [p.id, p]));
    const clienteDe = new Map((clientes ?? []).map((c) => [c.id, c.nombre_comercial]));
    const correoDe = new Map<string, string | null>();

    const correoDeVendedor = async (vendedorId: string): Promise<string | null> => {
      if (correoDe.has(vendedorId)) return correoDe.get(vendedorId) ?? null;
      const perfil = perfilDe.get(vendedorId);
      let correo = correoReal(perfil?.email);
      if (!correo) {
        const { data: authUser } = await admin.auth.admin.getUserById(vendedorId);
        correo = correoReal(authUser?.user?.email);
      }
      correoDe.set(vendedorId, correo);
      return correo;
    };

    const appUrl = (Deno.env.get("APP_URL") ?? "https://kit-to-drive.vercel.app").replace(/\/$/, "");
    const enlace = `${appUrl}/crm/actividades`;
    const replyTo = Deno.env.get("RESEND_REPLY_TO");

    let enviados = 0;
    let sinCorreo = 0;

    for (const cita of citas) {
      if (!cita.vendedor_id) continue;
      const para = await correoDeVendedor(cita.vendedor_id);
      if (!para) {
        sinCorreo += 1;
        continue;
      }

      const { data: reclamada } = await admin
        .from("crm_actividades")
        .update({ aviso_correo_at: new Date().toISOString() })
        .eq("id", cita.id)
        .is("aviso_correo_at", null)
        .select("id")
        .maybeSingle();
      if (!reclamada) continue;

      const tipo = cita.tipo === "visita" ? "visita" : "reunión";
      const cliente = (cita.cliente_id && clienteDe.get(cita.cliente_id)) || "un cliente";
      const cuando = new Date(cita.fecha_actividad).toLocaleString("es-MX", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });
      const nombre = perfilDe.get(cita.vendedor_id)?.nombre_completo || "";
      const objetivo = cita.objetivo_visita?.trim() || "";
      const asunto = `Venció tu ${tipo} con ${cliente}`;
      const saludo = nombre ? `Hola ${nombre},` : "Hola,";
      const texto = [
        saludo,
        "",
        `Tu ${tipo} con ${cliente} estaba programada para el ${cuando} y ya venció. Sigue pendiente en el CRM.`,
        objetivo ? `Objetivo: ${objetivo}` : "",
        "",
        `Ábrela aquí: ${enlace}`,
      ].filter(Boolean).join("\n");

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapar(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;">
  <div style="display:none;max-height:0;overflow:hidden;">Programada para el ${escapar(cuando)}. Sigue pendiente en el CRM.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
        <tr><td style="font-size:22px;line-height:1.3;font-weight:700;color:#1F3864;">${escapar(asunto)}</td></tr>
        <tr><td style="font-size:16px;line-height:1.5;padding-top:16px;">${escapar(saludo)}</td></tr>
        <tr><td style="font-size:16px;line-height:1.5;padding-top:8px;">Tu ${escapar(tipo)} con <strong>${escapar(cliente)}</strong> estaba programada para el ${escapar(cuando)} y ya venció. Sigue pendiente en el CRM.</td></tr>
        ${objetivo ? `<tr><td style="font-size:16px;line-height:1.5;padding-top:8px;"><strong>Objetivo:</strong> ${escapar(objetivo)}</td></tr>` : ""}
        <tr><td style="padding-top:20px;">
          <a href="${escapar(enlace)}" style="display:inline-block;background:#1F3864;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:12px 20px;border-radius:8px;">Ver en actividades</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      let resp: Response;
      try {
        resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `cita-vencida/${cita.id}`,
          },
          body: JSON.stringify({
            from,
            to: [para],
            subject: asunto,
            html,
            text: texto,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
      } catch {
        await admin.from("crm_actividades").update({ aviso_correo_at: null }).eq("id", cita.id);
        continue;
      }

      if (resp.ok || resp.status === 409) {
        enviados += 1;
        continue;
      }

      // 4xx distinto de 409: el destinatario no se va a poder entregar. Se deja
      // marcada para no reintentar el mismo rechazo en cada visita a la app.
      // 5xx: se suelta la marca y el siguiente pase lo vuelve a intentar.
      if (resp.status >= 500) {
        await admin.from("crm_actividades").update({ aviso_correo_at: null }).eq("id", cita.id);
      }
    }

    return json({
      revisadas: citas.length,
      enviados,
      sin_correo_real: sinCorreo,
      sin_configurar: false,
    });
  } catch {
    return json({ error: "No se pudieron avisar las citas" }, 500);
  }
});
