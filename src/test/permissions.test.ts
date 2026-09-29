import { describe, it, expect } from "vitest";
import {
  AREAS, NIVELES, MODULOS, permisosDe, rolLegacy, desdeRolLegacy,
  Area, Nivel, Modulo,
} from "@/lib/permissions";

describe("tipos de usuario y áreas", () => {
  it("solo existen tres tipos de usuario", () => {
    expect(NIVELES).toEqual(["operador", "supervisor", "admin"]);
  });

  it("las áreas son las seis del negocio", () => {
    expect(AREAS).toEqual(["comercial", "fabrica", "almacen_logistica", "administracion", "compras", "direccion"]);
  });
});

describe("acceso por área", () => {
  it("cada área solo ve sus módulos", () => {
    const fabrica = permisosDe("fabrica", "supervisor");
    expect(fabrica.puedeVer("produccion")).toBe(true);
    expect(fabrica.puedeVer("crm")).toBe(false);
    expect(fabrica.puedeVer("finanzas")).toBe(false);

    const comercial = permisosDe("comercial", "operador");
    expect(comercial.puedeVer("crm")).toBe(true);
    expect(comercial.puedeVer("produccion")).toBe(false);

    // Administración es el área transversal del ERP: desde 40b0800 también ve
    // la operación, no sólo finanzas. Lo que sigue fuera de su alcance es la
    // administración del sistema (usuarios y bitácora).
    const admin = permisosDe("administracion", "operador");
    expect(admin.puedeVer("finanzas")).toBe(true);
    expect(admin.puedeVer("produccion")).toBe(true);
    expect(admin.puedeVer("crm")).toBe(true);
    expect(admin.puedeVer("usuarios")).toBe(false);
    expect(admin.puedeVer("bitacora")).toBe(false);

    // Compras opera proveedores e inventario; no entra a finanzas ni al CRM.
    const compras = permisosDe("compras", "operador");
    expect(compras.puedeVer("proveedores")).toBe(true);
    expect(compras.puedeCrear("proveedores")).toBe(true);
    expect(compras.puedeVer("inventario")).toBe(true);
    expect(compras.puedeVer("finanzas")).toBe(false);
    expect(compras.puedeVer("credito")).toBe(false);
    expect(compras.puedeVer("crm")).toBe(false);
    expect(compras.inicio).toBe("/proveedores");

    // Crédito: Administración captura; Comercial consulta.
    const finanzasOp = permisosDe("administracion", "operador");
    expect(finanzasOp.puedeVer("credito")).toBe(true);
    expect(finanzasOp.puedeCrear("credito")).toBe(true);
    const ventas = permisosDe("comercial", "operador");
    expect(ventas.puedeVer("credito")).toBe(true);
    expect(ventas.puedeCrear("credito")).toBe(true);
  });

  it("Dirección tiene visibilidad transversal pero no escribe fuera de su área", () => {
    const dir = permisosDe("direccion", "supervisor");
    expect(dir.puedeVer("produccion")).toBe(true);
    expect(dir.puedeVer("finanzas")).toBe(true);
    expect(dir.puedeVer("crm")).toBe(true);
    expect(dir.puedeCrear("produccion")).toBe(false);
    expect(dir.puedeEliminar("finanzas")).toBe(false);
  });
});

describe("qué puede hacer cada tipo de usuario", () => {
  const modulo: Modulo = "crm";

  it("operador crea lo propio pero no edita todo ni borra", () => {
    const p = permisosDe("comercial", "operador");
    expect(p.puedeCrear(modulo)).toBe(true);
    expect(p.puedeEditar(modulo)).toBe(false);
    expect(p.puedeEliminar(modulo)).toBe(false);
    expect(p.soloPropios(modulo)).toBe(true);
  });

  it("supervisor edita y aprueba todo lo de su área, sin borrar", () => {
    const p = permisosDe("comercial", "supervisor");
    expect(p.puedeEditar(modulo)).toBe(true);
    expect(p.puedeAprobar(modulo)).toBe(true);
    expect(p.puedeEliminar(modulo)).toBe(false);
    expect(p.soloPropios(modulo)).toBe(false);
  });

  it("admin de área borra y gestiona usuarios de su área", () => {
    const p = permisosDe("comercial", "admin");
    expect(p.puedeEliminar(modulo)).toBe(true);
    expect(p.gestionaUsuarios).toBe(true);
    expect(p.esAdminGlobal).toBe(false);
    expect(p.puedeVer("usuarios")).toBe(true);
    // la configuración general es solo del admin global
    expect(p.puedeVer("configuracion")).toBe(false);
  });

  it("solo el admin de Dirección es admin global", () => {
    const p = permisosDe("direccion", "admin");
    expect(p.esAdminGlobal).toBe(true);
    expect(p.puedeVer("configuracion")).toBe(true);
    expect(p.puedeEliminar("produccion")).toBe(true);
    expect(p.puedeEliminar("finanzas")).toBe(true);
  });

  it("ningún operador ni supervisor gestiona usuarios", () => {
    for (const area of AREAS) {
      expect(permisosDe(area, "operador").gestionaUsuarios).toBe(false);
      expect(permisosDe(area, "supervisor").gestionaUsuarios).toBe(false);
      expect(permisosDe(area, "admin").gestionaUsuarios).toBe(true);
    }
  });

  it("el nivel mínimo del módulo se respeta", () => {
    expect(MODULOS.crmEquipo.minNivel).toBe("supervisor");
    expect(permisosDe("comercial", "operador").puedeVer("crmEquipo")).toBe(false);
    expect(permisosDe("comercial", "supervisor").puedeVer("crmEquipo")).toBe(true);
  });
});

describe("compatibilidad con el rol legacy", () => {
  it("cada par (área, nivel) tiene un rol legacy", () => {
    for (const area of AREAS) {
      for (const nivel of NIVELES) {
        expect(typeof rolLegacy(area as Area, nivel as Nivel)).toBe("string");
      }
    }
  });

  it("el rol legacy vuelve a un par coherente", () => {
    expect(desdeRolLegacy("admin")).toEqual({ area: "direccion", nivel: "admin" });
    expect(desdeRolLegacy("ventas")).toEqual({ area: "comercial", nivel: "operador" });
    expect(desdeRolLegacy("coordinador_ventas")).toEqual({ area: "comercial", nivel: "supervisor" });
    expect(desdeRolLegacy("logistica")).toEqual({ area: "almacen_logistica", nivel: "operador" });
    expect(desdeRolLegacy("finanzas")).toEqual({ area: "administracion", nivel: "operador" });
  });

  it("el ida y vuelta conserva el área", () => {
    for (const area of AREAS) {
      for (const nivel of NIVELES) {
        const vuelta = desdeRolLegacy(rolLegacy(area as Area, nivel as Nivel));
        if (area === "direccion" && nivel !== "admin") {
          // El enum legacy no tenía un rol para Dirección sin mando: se apoya en
          // 'coordinador' (el antiguo "coordinador comercial") para dar lectura amplia.
          expect(vuelta.area).toBe("comercial");
        } else {
          expect(vuelta.area).toBe(area);
        }
      }
    }
  });
});
