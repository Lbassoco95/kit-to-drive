import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import {
  normalizarDetalle,
  PRIORIDADES_SOPORTE,
  ESTATUS_TICKET_CLS,
  PRIORIDAD_TICKET_CLS,
} from "@/lib/matiSupport";

describe("soporte → mati-api", () => {
  it("conoce las prioridades del formulario de mati-app", () => {
    expect([...PRIORIDADES_SOPORTE]).toEqual(["baja", "normal", "alta", "urgente"]);
  });

  it("tiene estilos para los estatus que usa Mati", () => {
    for (const st of ["abierto", "en_proceso", "en_progreso", "resuelto", "cerrado"]) {
      expect(ESTATUS_TICKET_CLS[st]).toBeTruthy();
    }
    for (const p of PRIORIDADES_SOPORTE) {
      expect(PRIORIDAD_TICKET_CLS[p]).toBeTruthy();
    }
  });

  it("normaliza detalle envuelto en { detail: { ticket, messages } }", () => {
    const d = normalizarDetalle({
      detail: {
        ticket: { id: "1", asunto: "Falla", prioridad: "alta", status: "abierto", descripcion: "x" },
        messages: [{ id: "m1", mensaje: "hola", author_type: "admin" }],
      },
    });
    expect(d.ticket.id).toBe("1");
    expect(d.ticket.asunto).toBe("Falla");
    expect(d.messages).toHaveLength(1);
    expect(d.messages[0].author_type).toBe("admin");
  });

  it("normaliza ticket plano con messages en la raíz", () => {
    const d = normalizarDetalle({
      id: "9",
      asunto: "Sin PDF",
      prioridad: "normal",
      status: "en_proceso",
      messages: [],
    });
    expect(d.ticket.id).toBe("9");
    expect(d.ticket.status).toBe("en_proceso");
    expect(d.messages).toEqual([]);
  });

  it("no truena con payload vacío", () => {
    const d = normalizarDetalle(null);
    expect(d.ticket.asunto).toBe("");
    expect(d.messages).toEqual([]);
  });
});
