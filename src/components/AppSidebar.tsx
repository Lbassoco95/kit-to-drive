import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Factory, FileText, Truck, Bike, Users, Database, ScrollText, Upload, Settings, ClipboardList, TrendingUp, BookOpen, MapPin, BarChart2, Wallet, Package, Building2, TriangleAlert, Boxes } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Modulo } from "@/lib/permissions";
import { useLang } from "@/contexts/LangContext";

type Group = "Inicio" | "Operación" | "Catálogos" | "CRM" | "Finanzas" | "Sistema";

type Item = {
  key: keyof ReturnType<typeof useLang>["t"]["nav"];
  url: string;
  icon: any;
  modulo?: Modulo;
  /** Acceso por allowlist (p.ej. almacén de refacciones), no por área×nivel. */
  requiereRefacciones?: boolean;
  group: Group;
};

// La visibilidad la resuelven los permisos del módulo (área × tipo de usuario),
// salvo ítems con `requiereRefacciones` (allowlist en base).
const ITEMS: Item[] = [
  { key: "dashboard",       url: "/",                 icon: LayoutDashboard, modulo: "dashboard",     group: "Inicio"    },
  { key: "produccion",      url: "/produccion",       icon: Factory,         modulo: "produccion",    group: "Operación" },
  { key: "inventario",      url: "/inventario",       icon: Package,         modulo: "inventario",    group: "Operación" },
  { key: "almacenRefacciones", url: "/almacen-refacciones", icon: Boxes, requiereRefacciones: true, group: "Operación" },
  { key: "incidencias",     url: "/incidencias",      icon: TriangleAlert,   modulo: "inventario",    group: "Operación" },
  { key: "reportesTurno",   url: "/reportes-turno",   icon: ClipboardList,   modulo: "reportesTurno", group: "Operación" },
  { key: "remisiones",      url: "/remisiones",       icon: FileText,        modulo: "remisiones",    group: "Operación" },
  { key: "entregas",        url: "/entregas",         icon: Truck,           modulo: "entregas",      group: "Operación" },
  { key: "misMotocarros",   url: "/mis-motocarros",   icon: Bike,            modulo: "misMotocarros", group: "Catálogos" },
  { key: "clientes",        url: "/clientes",         icon: Users,           modulo: "clientes",      group: "Catálogos" },
  { key: "crmOportunidades",url: "/crm/oportunidades",icon: TrendingUp,      modulo: "crm",           group: "CRM"       },
  { key: "crmEquipo",       url: "/crm/equipo",       icon: Users,           modulo: "crmEquipo",     group: "CRM"       },
  { key: "crmActividades",  url: "/crm/actividades",  icon: BookOpen,        modulo: "crm",           group: "CRM"       },
  { key: "crmRutas",        url: "/crm/rutas",        icon: MapPin,          modulo: "crm",           group: "CRM"       },
  { key: "crmTracker",      url: "/crm/tracker",      icon: BarChart2,       modulo: "crmEquipo",     group: "CRM"       },
  { key: "finanzas",        url: "/finanzas",         icon: Wallet,          modulo: "finanzas",      group: "Finanzas"  },
  { key: "proveedores",     url: "/proveedores",      icon: Building2,       modulo: "finanzas",      group: "Finanzas"  },
  { key: "importar",        url: "/importar",         icon: Upload,          modulo: "importar",      group: "Sistema"   },
  { key: "usuarios",        url: "/usuarios",         icon: Database,        modulo: "usuarios",      group: "Sistema"   },
  { key: "bitacora",        url: "/bitacora",         icon: ScrollText,      modulo: "bitacora",      group: "Sistema"   },
  { key: "configuracion",   url: "/configuracion",    icon: Settings,        modulo: "configuracion", group: "Sistema"   },
];

const GROUPS: Group[] = ["Inicio", "Operación", "Catálogos", "CRM", "Finanzas", "Sistema"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { perms, area, nivel, puedeVerRefacciones } = useAuth();
  const { t, toggleLang } = useLang();
  const items = area && nivel
    ? ITEMS.filter(i => {
        if (i.requiereRefacciones) return puedeVerRefacciones;
        return i.modulo ? perms.puedeVer(i.modulo) : false;
      })
    : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-[#1F3864]">
        <div className={`px-4 py-5 border-b border-white/10 ${collapsed ? "text-center px-2" : ""}`}>
          <div className={collapsed ? "" : "flex items-center gap-3"}>
            <img
              src="/mati-icon-white.png"
              alt="Mati"
              className={collapsed ? "h-8 w-8 object-contain mx-auto" : "h-9 w-9 object-contain"}
            />
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="text-white font-extrabold text-xl tracking-tight">mati</span>
                <span className="text-[10px] text-white/70 -mt-0.5">{t.subtitle}</span>
              </div>
            )}
          </div>
        </div>
        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <SidebarGroup key={g}>
              {!collapsed && g !== "Inicio" && (
                <SidebarGroupLabel className="text-white/50 uppercase text-[11px] tracking-widest px-3 pt-3">
                  {t.groups[g]}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {list.map(item => {
                    const active = item.url === "/"
                      ? pathname === "/"
                      : pathname === item.url || pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={active} className="h-12 my-0.5">
                          <NavLink
                            to={item.url}
                            end
                            className={`relative flex items-center gap-3 px-3 rounded-md text-white/90 hover:bg-white/10 ${active ? "bg-[#EFF6FF]/10 text-white font-semibold" : ""}`}
                          >
                            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-white" />}
                            <item.icon size={28} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                            {!collapsed && <span className="text-[15px]">{t.nav[item.key]}</span>}
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

        {/* Language toggle at the bottom */}
        <div className={`mt-auto p-3 border-t border-white/10 ${collapsed ? "flex justify-center" : ""}`}>
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-all text-sm font-medium w-full"
            title={collapsed ? t.otherLang : undefined}
          >
            <span className="text-lg leading-none">🌐</span>
            {!collapsed && (
              <span className="flex items-center gap-1">
                <span className="font-bold text-white">{t.langLabel}</span>
                <span className="text-white/40 mx-1">|</span>
                <span className="text-white/60">{t.otherLang}</span>
              </span>
            )}
          </button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
