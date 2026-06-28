import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Factory, FileText, Truck, Bike, Users, Database, ScrollText, Upload, Settings } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";

type Group = "Inicio" | "Operación" | "Catálogos" | "Sistema";

type Item = { key: keyof ReturnType<typeof useLang>["t"]["nav"]; url: string; icon: any; roles: AppRole[]; group: Group };

const ITEMS: Item[] = [
  { key: "dashboard",      url: "/",              icon: LayoutDashboard, roles: ["admin","fabrica","logistica","ventas","coordinador"], group: "Inicio" },
  { key: "produccion",     url: "/produccion",    icon: Factory,         roles: ["admin","fabrica","logistica","coordinador"],          group: "Operación" },
  { key: "remisiones",     url: "/remisiones",    icon: FileText,        roles: ["admin","fabrica","logistica","ventas","coordinador"], group: "Operación" },
  { key: "entregas",       url: "/entregas",      icon: Truck,           roles: ["admin","logistica","coordinador"],                    group: "Operación" },
  { key: "misMotocarros",  url: "/mis-motocarros",icon: Bike,            roles: ["ventas","admin","coordinador"],                       group: "Catálogos" },
  { key: "clientes",       url: "/clientes",      icon: Users,           roles: ["admin","fabrica","coordinador"],                      group: "Catálogos" },
  { key: "importar",       url: "/importar",      icon: Upload,          roles: ["admin"],                                              group: "Sistema" },
  { key: "usuarios",       url: "/usuarios",      icon: Database,        roles: ["admin"],                                              group: "Sistema" },
  { key: "bitacora",       url: "/bitacora",      icon: ScrollText,      roles: ["admin"],                                              group: "Sistema" },
  { key: "configuracion",  url: "/configuracion", icon: Settings,        roles: ["admin"],                                              group: "Sistema" },
];

const GROUPS: Group[] = ["Inicio", "Operación", "Catálogos", "Sistema"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const { t, toggleLang } = useLang();
  const items = ITEMS.filter(i => role && i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-[#1F3864]">
        <div className={`px-4 py-5 border-b border-white/10 ${collapsed ? "text-center px-2" : ""}`}>
          <div className="text-white font-extrabold text-xl leading-tight tracking-wide">
            {collapsed ? "GD" : "GRUPO DAZON"}
          </div>
          {!collapsed && <div className="text-xs text-white/70 mt-0.5">{t.subtitle}</div>}
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
                    const active = pathname === item.url;
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
