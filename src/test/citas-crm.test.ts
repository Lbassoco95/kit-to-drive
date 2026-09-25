import { describe, expect, it } from "vitest";
import { citaVencida, correoReal, faltaColumna } from "@/lib/citasCrm";

const AHORA = new Date("2026-09-25T18:00:00Z");

const cita = (parcial: Record<string, unknown> = {}) => ({
  tipo: "visita",
  estatus: "programada",
  agendada: true,
  fecha_actividad: "2026-09-25T17:00:00Z",
  vendedor_id: "u1",
  ...parcial,
});

describe("citaVencida", () => {
  it("avisa una visita o reunión agendada cuya hora ya pasó", () => {
    expect(citaVencida(cita(), AHORA, "u1")).toBe(true);
    expect(citaVencida(cita({ tipo: "reunion" }), AHORA, "u1")).toBe(true);
    expect(citaVencida(cita({ tipo: "videollamada" }), AHORA, "u1")).toBe(true);
  });

  it("no avisa si todavía no es la hora, no está agendada o ya se atendió", () => {
    expect(citaVencida(cita({ fecha_actividad: "2026-09-25T19:00:00Z" }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ agendada: false }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ agendada: null }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ estatus: "completada" }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ estatus: "cancelada" }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ tipo: "llamada" }), AHORA, "u1")).toBe(false);
    expect(citaVencida(cita({ tipo: "email" }), AHORA, "u1")).toBe(false);
  });

  it("el aviso de la campana es del vendedor asignado", () => {
    expect(citaVencida(cita(), AHORA, "otro")).toBe(false);
    expect(citaVencida(cita(), AHORA)).toBe(true);
  });
});

describe("correoReal", () => {
  it("acepta un correo de verdad", () => {
    expect(correoReal("  Polo@Dazon.mx ")).toBe("polo@dazon.mx");
  });

  it("rechaza demostración, vacíos y dominios de prueba", () => {
    expect(correoReal("ventas@dazon.demo")).toBeNull();
    expect(correoReal("a@b.dazon.demo")).toBeNull();
    expect(correoReal("")).toBeNull();
    expect(correoReal(null)).toBeNull();
    expect(correoReal("no-es-correo")).toBeNull();
    expect(correoReal("ana@example.com")).toBeNull();
    expect(correoReal("ana@test.com")).toBeNull();
  });
});

describe("faltaColumna", () => {
  it("reconoce que la base va atrás en agendada", () => {
    expect(faltaColumna({ code: "42703", message: 'column "agendada" does not exist' }, "agendada")).toBe(true);
    expect(faltaColumna({ code: "PGRST204", message: "Could not find the 'agendada' column" }, "agendada")).toBe(true);
    expect(faltaColumna({ code: "23514", message: "check constraint" }, "agendada")).toBe(false);
  });
});
