/**
 * Puente de soporte Kit-to-Drive → mati-api.
 *
 * Los usuarios de esta app reportan fallas desde /soporte. Esta edge function
 * autentica al usuario con el JWT de Supabase y reenvía a la API de Mati
 * (`POST /workspace/tickets`, mensajes, listado) con una cuenta de servicio
 * del tenant de soporte.
 *
 * Secretos (Supabase → Edge Functions → Secrets):
 *   MATI_API_URL              (default https://mati-api-six.vercel.app)
 *   MATI_SUPPORT_TOKEN        (opcional: Bearer ya emitido)
 *   MATI_SUPPORT_EMAIL        (login si no hay token)
 *   MATI_SUPPORT_PASSWORD
 *
 * Rutas relativas a /functions/v1/mati-support:
 *   GET    /tickets
 *   POST   /tickets            { asunto, descripcion, prioridad? }
 *   GET    /tickets/:id
 *   POST   /tickets/:id/messages  { mensaje }
 *   GET    /health
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PRIORIDADES = ["baja", "normal", "alta", "urgente"] as const;
type Prioridad = (typeof PRIORIDADES)[number];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

function matiBase(): string {
  const raw = Deno.env.get("MATI_API_URL")?.trim() || "https://mati-api-six.vercel.app";
  return raw.replace(/\/+$/, "");
}

function relativePath(req: Request): string {
  const url = new URL(req.url);
  const marker = "/mati-support";
  const idx = url.pathname.indexOf(marker);
  const rest = idx >= 0 ? url.pathname.slice(idx + marker.length) : url.pathname;
  return rest.replace(/\/+$/, "") || "/";
}

async function callerFromJwt(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const [{ data: profile }, { data: role }] = await Promise.all([
    admin.from("profiles").select("nombre_completo, email, activo").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("area, nivel").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profile?.activo === false) return null;

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    nombre: profile?.nombre_completo ?? user.email ?? user.id,
    area: role?.area ?? null,
    nivel: role?.nivel ?? null,
  };
}

/** Token de servicio hacia mati-api (cuenta del tenant de soporte). */
async function matiServiceToken(): Promise<string> {
  const cached = Deno.env.get("MATI_SUPPORT_TOKEN")?.trim();
  if (cached) return cached;

  const email = Deno.env.get("MATI_SUPPORT_EMAIL")?.trim();
  const password = Deno.env.get("MATI_SUPPORT_PASSWORD");
  if (!email || !password) {
    throw new Error(
      "Bridge de soporte no configurado: define MATI_SUPPORT_TOKEN o MATI_SUPPORT_EMAIL + MATI_SUPPORT_PASSWORD",
    );
  }

  const res = await fetch(`${matiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new Error(body?.error || `No se pudo autenticar contra mati-api (${res.status})`);
  }
  return String(body.token);
}

async function matiFetch(path: string, init: RequestInit = {}) {
  const token = await matiServiceToken();
  const res = await fetch(`${matiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

function enrichDescripcion(
  descripcion: string,
  caller: { nombre: string; email: string; area: string | null; nivel: string | null; id: string },
  meta?: { ruta?: string; userAgent?: string },
) {
  const lineas = [
    "[Origen: kit-to-drive]",
    `Reporta: ${caller.nombre} <${caller.email}>`,
    `Usuario id: ${caller.id}`,
    caller.area || caller.nivel
      ? `Área/nivel: ${caller.area ?? "—"} · ${caller.nivel ?? "—"}`
      : null,
    meta?.ruta ? `Pantalla: ${meta.ruta}` : null,
    meta?.userAgent ? `Agente: ${meta.userAgent}` : null,
    "",
    descripcion.trim(),
  ].filter((x) => x !== null);
  return lineas.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const path = relativePath(req);

    if (req.method === "GET" && path === "/health") {
      const configured = !!(
        Deno.env.get("MATI_SUPPORT_TOKEN")?.trim() ||
        (Deno.env.get("MATI_SUPPORT_EMAIL")?.trim() && Deno.env.get("MATI_SUPPORT_PASSWORD"))
      );
      return json({
        status: "ok",
        system: "kit-to-drive",
        bridge: "mati-support",
        mati_api: matiBase(),
        configured,
      });
    }

    const caller = await callerFromJwt(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    // GET /tickets
    if (req.method === "GET" && path === "/tickets") {
      const { res, data } = await matiFetch("/workspace/tickets");
      if (!res.ok) {
        return json({ error: (data as { error?: string })?.error || "Error al listar tickets" }, res.status);
      }
      // Filtra a los abiertos por este usuario cuando el ticket trae el email/id en la descripción.
      const all = Array.isArray(data) ? data : (data as { tickets?: unknown[] })?.tickets ?? [];
      const propios = (all as Record<string, unknown>[]).filter((t) => {
        const blob = `${t.descripcion ?? ""} ${t.asunto ?? ""}`;
        return blob.includes(caller.id) || blob.includes(caller.email);
      });
      return json({ tickets: propios });
    }

    // POST /tickets
    if (req.method === "POST" && path === "/tickets") {
      const body = await req.json().catch(() => ({}));
      const asunto = String(body.asunto ?? "").trim();
      const descripcion = String(body.descripcion ?? "").trim();
      const prioridad = (String(body.prioridad ?? "normal").trim() || "normal") as Prioridad;
      if (!asunto || !descripcion) {
        return json({ error: "asunto y descripcion son obligatorios" }, 400);
      }
      if (!PRIORIDADES.includes(prioridad)) {
        return json({ error: "prioridad inválida" }, 400);
      }

      const payload = {
        asunto: `[kit-to-drive] ${asunto}`.slice(0, 200),
        descripcion: enrichDescripcion(descripcion, caller, {
          ruta: body.ruta ? String(body.ruta) : undefined,
          userAgent: body.user_agent ? String(body.user_agent) : req.headers.get("user-agent") || undefined,
        }),
        prioridad,
      };

      const { res, data } = await matiFetch("/workspace/tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return json({ error: (data as { error?: string })?.error || "No se pudo crear el ticket" }, res.status);
      }
      return json({ ticket: data }, 201);
    }

    // GET /tickets/:id
    const getMatch = path.match(/^\/tickets\/([^/]+)$/);
    if (req.method === "GET" && getMatch) {
      const id = getMatch[1];
      const { res, data } = await matiFetch(`/workspace/tickets/${id}`);
      if (!res.ok) {
        return json({ error: (data as { error?: string })?.error || "Ticket no encontrado" }, res.status);
      }
      return json({ detail: data });
    }

    // POST /tickets/:id/messages
    const msgMatch = path.match(/^\/tickets\/([^/]+)\/messages$/);
    if (req.method === "POST" && msgMatch) {
      const id = msgMatch[1];
      const body = await req.json().catch(() => ({}));
      const mensaje = String(body.mensaje ?? "").trim();
      if (!mensaje) return json({ error: "mensaje es obligatorio" }, 400);

      const texto = `[${caller.nombre} <${caller.email}>]\n${mensaje}`;
      const { res, data } = await matiFetch(`/workspace/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ mensaje: texto }),
      });
      if (!res.ok) {
        return json({ error: (data as { error?: string })?.error || "No se pudo enviar el mensaje" }, res.status);
      }
      return json({ message: data }, 201);
    }

    return json({ error: "Ruta no encontrada" }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("no configurado") ? 503 : 500;
    return json({ error: msg, code: code === 503 ? "BRIDGE_NOT_CONFIGURED" : "INTERNAL" }, code);
  }
});
