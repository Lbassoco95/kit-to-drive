import { NavLink, useLocation } from "react-router-dom";
import { Globe, ExternalLink, LayoutDashboard, Factory, FileText, Truck, Bike, Users, Database, ScrollText, Upload, Settings, ClipboardList, TrendingUp, BookOpen, MapPin, BarChart2, Wallet, Package, Building2, TriangleAlert, Boxes, Receipt, CreditCard } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Modulo } from "@/lib/permissions";
import { useLang } from "@/contexts/LangContext";

export type Group = "Inicio" | "Operación" | "Catálogos" | "CRM" | "Finanzas" | "Sistema";

export type Item = {
  key: keyof ReturnType<typeof useLang>["t"]["nav"];
  url: string;
  icon: any;
  modulo?: Modulo;
  /** Acceso por allowlist (p.ej. almacén de refacciones), no por área×nivel. */
  requiereRefacciones?: boolean;
  /** También visible para quien tiene el almacén de refacciones, aunque su área no vea el módulo. */
  oRefacciones?: boolean;
  group: Group;
};

// La visibilidad la resuelven los permisos del módulo (área × tipo de usuario),
// salvo ítems con `requiereRefacciones` (allowlist en base).
export const ITEMS: Item[] = [
  { key: "dashboard",       url: "/",                 icon: LayoutDashboard, modulo: "dashboard",     group: "Inicio"    },
  { key: "produccion",      url: "/produccion",       icon: Factory,         modulo: "produccion",    group: "Operación" },
  { key: "inventario",      url: "/inventario",       icon: Package,         modulo: "inventario",    group: "Operación" },
  { key: "almacenRefacciones", url: "/almacen-refacciones", icon: Boxes, requiereRefacciones: true, group: "Operación" },
  { key: "incidencias",     url: "/incidencias",      icon: TriangleAlert,   modulo: "inventario",    group: "Operación" },
  { key: "reportesTurno",   url: "/reportes-turno",   icon: ClipboardList,   modulo: "reportesTurno", group: "Operación" },
  { key: "remisiones",      url: "/remisiones",       icon: FileText,        modulo: "remisiones",    group: "Operación" },
  { key: "remisionesRefacciones", url: "/remisiones-refacciones", icon: Receipt, modulo: "remisiones", oRefacciones: true, group: "Operación" },
  { key: "entregas",        url: "/entregas",         icon: Truck,           modulo: "entregas",      group: "Operación" },
  { key: "misMotocarros",   url: "/mis-motocarros",   icon: Bike,            modulo: "misMotocarros", group: "Catálogos" },
  { key: "clientes",        url: "/clientes",         icon: Users,           modulo: "clientes",      group: "Catálogos" },
  { key: "crmOportunidades",url: "/crm/oportunidades",icon: TrendingUp,      modulo: "crm",           group: "CRM"       },
  { key: "crmEquipo",       url: "/crm/equipo",       icon: Users,           modulo: "crmEquipo",     group: "CRM"       },
  { key: "crmActividades",  url: "/crm/actividades",  icon: BookOpen,        modulo: "crm",           group: "CRM"       },
  { key: "crmRutas",        url: "/crm/rutas",        icon: MapPin,          modulo: "crm",           group: "CRM"       },
  { key: "crmTracker",      url: "/crm/tracker",      icon: BarChart2,       modulo: "crmEquipo",     group: "CRM"       },
  { key: "finanzas",        url: "/finanzas",         icon: Wallet,          modulo: "finanzas",      group: "Finanzas"  },
  { key: "credito",         url: "/credito",          icon: CreditCard,      modulo: "credito",       group: "Finanzas"  },
  { key: "proveedores",     url: "/proveedores",      icon: Building2,       modulo: "proveedores",   group: "Finanzas"  },
  { key: "importar",        url: "/importar",         icon: Upload,          modulo: "importar",      group: "Sistema"   },
  { key: "usuarios",        url: "/usuarios",         icon: Database,        modulo: "usuarios",      group: "Sistema"   },
  { key: "bitacora",        url: "/bitacora",         icon: ScrollText,      modulo: "bitacora",      group: "Sistema"   },
  { key: "configuracion",   url: "/configuracion",    icon: Settings,        modulo: "configuracion", group: "Sistema"   },
];

export const GROUPS: Group[] = ["Inicio", "Operación", "Catálogos", "CRM", "Finanzas", "Sistema"];

/** Ítems de navegación visibles para la sesión actual (menú y paleta de búsqueda). */
export function useNavItems(): Item[] {
  const { perms, area, nivel, puedeVerRefacciones } = useAuth();
  return area && nivel
    ? ITEMS.filter(i => {
        if (i.requiereRefacciones) return puedeVerRefacciones;
        if (i.oRefacciones && puedeVerRefacciones) return true;
        return i.modulo ? perms.puedeVer(i.modulo) : false;
      })
    : [];
}

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();
  const { t, toggleLang } = useLang();
  const items = useNavItems();

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarContent className="bg-transparent gap-0 px-0">
        <div className={`pt-4 pb-2 shrink-0 ${collapsed ? "px-0 flex justify-center" : "px-4"}`}>
          <div className={collapsed ? "flex justify-center" : "flex items-center gap-3"}>
            <span
              className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_8px_20px_-8px_hsl(214_94%_5%/0.7)] ring-2 ring-white/30"
              aria-hidden={!collapsed}
            >
              <img
                src="/brand/dazon-app-icono.png"
                alt={collapsed ? "Dazon" : ""}
                className="h-[88%] w-[88%] object-contain"
              />
            </span>
            {!collapsed && (
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-white font-extrabold text-xl tracking-tight">Dazon</span>
                <span className="text-[11px] text-white/75 -mt-0.5 truncate">{t.layout.porMati}</span>
              </div>
            )}
          </div>
        </div>

        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <SidebarGroup key={g} className={`py-1 ${collapsed ? "p-1.5" : ""}`}>
              {!collapsed && g !== "Inicio" && (
                <SidebarGroupLabel className="text-white/75 uppercase text-[11px] tracking-widest px-4 pt-3">
                  {t.groups[g]}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className={collapsed ? "items-center gap-1.5" : ""}>
                  {list.map(item => {
                    const active = item.url === "/"
                      ? pathname === "/"
                      : pathname === item.url || pathname.startsWith(item.url + "/");
                    const label = t.nav[item.key];
                    return (
                      <SidebarMenuItem key={item.url} className={collapsed ? "flex justify-center w-auto" : ""}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          size="lg"
                          tooltip={label}
                          className={
                            collapsed
                              ? "h-11 w-11 !p-0 my-0 justify-center"
                              : "h-12 my-0.5"
                          }
                        >
                          <NavLink
                            to={item.url}
                            end
                            title={collapsed ? label : undefined}
                            aria-label={label}
                            className={
                              collapsed
                                ? `grid h-11 w-11 place-items-center rounded-full text-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                                    active
                                      ? "glass-pill-active text-white bg-white/20"
                                      : "bg-white/[0.07] hover:bg-white/15"
                                  }`
                                : `relative flex items-center gap-3 pl-2 pr-4 rounded-full text-white/90 hover:bg-white/10 transition-colors ${
                                    active ? "glass-pill-active text-white font-semibold" : ""
                                  }`
                            }
                          >
                            {collapsed ? (
                              <item.icon size={20} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                            ) : (
                              <>
                                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${active ? "bg-white/20" : "bg-white/[0.07]"}`}>
                                  <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
                                </span>
                                <span className="text-[14px] truncate">{label}</span>
                                {active && <span className="ml-auto h-2 w-2 rounded-full bg-dazon-gold shadow-[0_0_10px_hsl(var(--dazon-gold))]" aria-hidden="true" />}
                              </>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        <div className={`mt-auto shrink-0 pb-3 pt-2 ${collapsed ? "flex flex-col items-center gap-2 px-0" : "p-3 space-y-2"}`}>
          <button
            type="button"
            onClick={toggleLang}
            className={
              collapsed
                ? "grid h-11 w-11 place-items-center rounded-full bg-white/[0.07] text-white/85 hover:bg-white/15 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                : "flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.07] text-white/85 hover:bg-white/15 hover:text-white transition-colors text-sm font-medium w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            }
            title={t.otherLang}
            aria-label={t.otherLang}
          >
            <Globe size={18} aria-hidden="true" className="shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1 min-w-0">
                <span className="font-bold text-white">{t.langLabel}</span>
                <span className="text-white/40 mx-1">|</span>
                <span className="text-white/70 truncate">{t.otherLang}</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <a
              href="https://www.yoltik.mx/productos/mati"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-white/[0.07] pl-1.5 pr-3 py-1.5 text-xs text-white/85 hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <img src="/brand/mati-icono.png" alt="" aria-hidden="true" className="h-7 w-7 rounded-full object-contain" />
              <span className="flex-1 leading-tight truncate">{t.auth.learnMoreMati}</span>
              <ExternalLink size={13} aria-hidden="true" className="shrink-0" />
            </a>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
