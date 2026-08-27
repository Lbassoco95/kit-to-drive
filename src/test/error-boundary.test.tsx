import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Truena(): JSX.Element {
  throw new Error("save is not defined");
}

describe("ErrorBoundary", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("deja pasar lo que funciona", () => {
    render(<ErrorBoundary><div>Contenido</div></ErrorBoundary>);
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("atrapa el error en vez de dejar la pantalla en blanco", () => {
    render(<ErrorBoundary area="/crm/actividades"><Truena /></ErrorBoundary>);
    expect(screen.getByText("Esta pantalla se quedó atorada")).toBeInTheDocument();
    // El mensaje técnico queda a la vista para poder reportarlo.
    expect(screen.getByText("save is not defined")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });
});
