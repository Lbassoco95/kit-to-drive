import { describe, it, expect } from "vitest";
import {
  KIT_TO_DRIVE_SYSTEM,
  adminGestionadoDesdeMati,
  matiAdminBaseUrl,
  matiAdminKitPath,
  matiAdminKitUrl,
} from "@/lib/matiAdmin";

describe("matiAdmin", () => {
  it("identifica el sistema como producto Mati", () => {
    expect(KIT_TO_DRIVE_SYSTEM.system).toBe("kit-to-drive");
    expect(KIT_TO_DRIVE_SYSTEM.brand).toBe("mati");
    expect(KIT_TO_DRIVE_SYSTEM.bridgeFunction).toBe("mati-admin-bridge");
    expect(KIT_TO_DRIVE_SYSTEM.areas).toContain("direccion");
    expect(KIT_TO_DRIVE_SYSTEM.niveles).toEqual(["operador", "supervisor", "admin"]);
  });

  it("por defecto la administración se considera gestionada desde Mati", () => {
    // Sin VITE_MATI_ADMIN_MANAGED en el entorno de test → true.
    expect(adminGestionadoDesdeMati()).toBe(true);
  });

  it("arma la URL del panel de Kit-to-Drive en mati-admin", () => {
    expect(matiAdminBaseUrl()).toMatch(/^https?:\/\//);
    expect(matiAdminKitPath()).toBe("/admin/kit-to-drive");
    expect(matiAdminKitUrl()).toBe(`${matiAdminBaseUrl()}/admin/kit-to-drive`);
  });
});
