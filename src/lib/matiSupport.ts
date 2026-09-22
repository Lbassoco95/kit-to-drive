/**
 * Cliente del puente de soporte hacia la API de Mati.
 * La UI llama a la edge function `mati-support`; esa función autentica al
 * usuario de kit-to-drive y habla con mati-api (`/workspace/tickets`).
 */
import { supabase } from "@/integrations/supabase/client";

export const PRIORIDADES_SOPORTE = ["baja", "normal", "alta", "urgente"] as const;
export type PrioridadSoporte = (typeof PRIORIDADES_SOPORTE)[number];

export type TicketSoporte = {
  id: string;
  asunto: string;
  descripcion?: string;
  prioridad: PrioridadSoporte | string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type MensajeSoporte = {
  id: string;
  mensaje: string;
  author_type?: string;
  author_nombre?: string;
  created_at?: string;
};

export type DetalleTicket = {
  ticket: TicketSoporte;
  messages: MensajeSoporte[];
};

function functionsBase(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("Falta VITE_SUPABASE_URL");
  return `${base}/functions/v1/mati-support`;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    "Content-Type": "application/json",
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(init.headers || {}) };
  const res = await fetch(`${functionsBase()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `Error ${res.status}`) as Error & { code?: string; status?: number };
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

/** Normaliza la respuesta de detalle (mati-api a veces envuelve el ticket). */
export function normalizarDetalle(raw: unknown): DetalleTicket {
  const data = raw as Record<string, unknown> | null;
  if (!data) return { ticket: { id: "", asunto: "", prioridad: "normal", status: "abierto" }, messages: [] };

  // { detail: { ticket, messages } } o { detail: ticket+messages }
  const root = (data.detail ?? data) as Record<string, unknown>;
  const ticket = (root.ticket ?? root) as TicketSoporte;
  const messages = (root.messages ?? root.mensajes ?? []) as MensajeSoporte[];
  return {
    ticket: {
      id: String(ticket.id ?? ""),
      asunto: String(ticket.asunto ?? ""),
      descripcion: ticket.descripcion ? String(ticket.descripcion) : undefined,
      prioridad: (ticket.prioridad as PrioridadSoporte) || "normal",
      status: String(ticket.status ?? "abierto"),
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    messages: Array.isArray(messages) ? messages : [],
  };
}

export async function listarTicketsSoporte(): Promise<TicketSoporte[]> {
  const data = await call<{ tickets: TicketSoporte[] }>("/tickets");
  return data.tickets ?? [];
}

export async function crearTicketSoporte(input: {
  asunto: string;
  descripcion: string;
  prioridad?: PrioridadSoporte;
  ruta?: string;
}): Promise<TicketSoporte> {
  const data = await call<{ ticket: TicketSoporte }>("/tickets", {
    method: "POST",
    body: JSON.stringify({
      asunto: input.asunto,
      descripcion: input.descripcion,
      prioridad: input.prioridad ?? "normal",
      ruta: input.ruta ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }),
  });
  // mati-api puede devolver el ticket plano o envuelto
  const t = (data as { ticket?: TicketSoporte }).ticket ?? (data as unknown as TicketSoporte);
  return t;
}

export async function detalleTicketSoporte(id: string): Promise<DetalleTicket> {
  const data = await call<{ detail: unknown }>(`/tickets/${encodeURIComponent(id)}`);
  return normalizarDetalle(data);
}

export async function enviarMensajeSoporte(id: string, mensaje: string): Promise<MensajeSoporte> {
  const data = await call<{ message: MensajeSoporte }>(`/tickets/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ mensaje }),
  });
  return data.message ?? (data as unknown as MensajeSoporte);
}

export const ESTATUS_TICKET_CLS: Record<string, string> = {
  abierto: "bg-red-100 text-red-700",
  en_proceso: "bg-amber-100 text-amber-700",
  en_progreso: "bg-amber-100 text-amber-700",
  resuelto: "bg-emerald-100 text-emerald-700",
  cerrado: "bg-slate-100 text-slate-600",
};

export const PRIORIDAD_TICKET_CLS: Record<string, string> = {
  baja: "bg-slate-100 text-slate-600",
  normal: "bg-blue-100 text-blue-600",
  alta: "bg-amber-100 text-amber-700",
  urgente: "bg-red-100 text-red-700",
};
