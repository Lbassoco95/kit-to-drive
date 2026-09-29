import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import { es } from "@/i18n/es";

vi.mock("@/contexts/LangContext", () => ({
  useLang: () => ({ t: es }),
}));

import ForcePasswordChange from "@/components/ForcePasswordChange";

const renderizar = () => {
  const onChangePassword = vi.fn().mockResolvedValue({ error: null });
  const onSignOut = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <ForcePasswordChange onChangePassword={onChangePassword} onSignOut={onSignOut} />
  );
  return { ...utils, onChangePassword, onSignOut };
};

describe("ForcePasswordChange", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("muestra el checklist de requisitos de contraseña", () => {
    const { getByText } = renderizar();
    expect(getByText(es.auth.passwordRequirements.title)).toBeInTheDocument();
    expect(getByText(es.auth.passwordRequirements.minLength)).toBeInTheDocument();
    expect(getByText(es.auth.passwordRequirements.passwordsMatch)).toBeInTheDocument();
  });

  it("deshabilita el botón hasta que todos los requisitos se cumplan", async () => {
    const { getByLabelText, getByText } = renderizar();
    const guardar = getByText("Guardar y continuar").closest("button")!;
    expect(guardar).toBeDisabled();

    const nueva = getByLabelText("Contraseña nueva");
    const confirmar = getByLabelText("Confirmar contraseña");

    await act(async () => { fireEvent.change(nueva, { target: { value: "Corta1!" } }); });
    expect(guardar).toBeDisabled();

    await act(async () => { fireEvent.change(nueva, { target: { value: "NuevaPass123!" } }); });
    expect(guardar).toBeDisabled();

    await act(async () => { fireEvent.change(confirmar, { target: { value: "NuevaPass123!" } }); });
    expect(guardar).not.toBeDisabled();
  });

  it("rechaza contraseñas débiles como 'Dazon1234!' y refleja el checklist", async () => {
    const { getByLabelText, getByText } = renderizar();
    const nueva = getByLabelText("Contraseña nueva");

    await act(async () => { fireEvent.change(nueva, { target: { value: "Dazon1234!" } }); });

    expect(getByText(es.auth.passwordRequirements.noDazon)).toBeInTheDocument();
    expect(getByText(es.auth.passwordRequirements.no1234)).toBeInTheDocument();

    const itemDazon = getByText(es.auth.passwordRequirements.noDazon).closest("li")!;
    expect(itemDazon.textContent).toContain("No incluir");
  });

  it("envía la contraseña cuando todos los requisitos se cumplen", async () => {
    const { getByLabelText, getByText, onChangePassword } = renderizar();
    const nueva = getByLabelText("Contraseña nueva");
    const confirmar = getByLabelText("Confirmar contraseña");

    await act(async () => { fireEvent.change(nueva, { target: { value: "SeguraPass1!" } }); });
    await act(async () => { fireEvent.change(confirmar, { target: { value: "SeguraPass1!" } }); });

    const guardar = getByText("Guardar y continuar").closest("button")!;
    await act(async () => { fireEvent.click(guardar); });

    expect(onChangePassword).toHaveBeenCalledWith("SeguraPass1!");
  });
});
