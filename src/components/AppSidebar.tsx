import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Factory, FileText, Truck, Bike, Users, Database, ScrollText, Upload, Settings } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, AppRole } from "@/contexts/AuthContext";

type Item = { title: string; url: string; icon: any; roles: AppRole[]; group: "Operación" | "Catálogos" | "Sistema" | "Inicio" };

const ITEMS: Item[] = [
  { title: "Dashboard",     url: "/",              icon: LayoutDashboard, roles: ["admin","fabrica","logistica","ventas","coordinador"], group: "Inicio" },
  { title: "Producción",    url: "/produccion",    icon: Factory,         roles: ["admin","fabrica","logistica","coordinador"],          group: "Operación" },
  { title: "Remisiones",    url: "/remisiones",    icon: FileText,        roles: ["admin","fabrica","logistica","ventas","coordinador"], group: "Operación" },
  { title: "Entregas",      url: "/entregas",      icon: Truck,           roles: ["admin","logistica","coordinador"],                    group: "Operación" },
  { title: "Mis Motocarros",url: "/mis-motocarros",icon: Bike,            roles: ["ventas","admin","coordinador"],                       group: "Catálogos" },
  { title: "Clientes",      url: "/clientes",      icon: Users,           roles: ["admin","fabrica","coordinador"],                      group: "Catálogos" },
  { title: "Importar datos",url: "/importar",      icon: Upload,          roles: ["admin"],                                              group: "Sistema" },
  { title: "Usuarios",      url: "/usuarios",      icon: Database,        roles: ["admin"],                                              group: "Sistema" },
  { title: "Bitácora",      url: "/bitacora",      icon: ScrollText,      roles: ["admin"],                                              group: "Sistema" },
  { title: "Configuración", url: "/configuracion", icon: Settings,        roles: ["admin"],                                              group: "Sistema" },
];

const GROUPS: Array<Item["group"]> = ["Inicio", "Operación", "Catálogos", "Sistema"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const items = ITEMS.filter(i => role && i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-[#1F3864]">
        <div className={`px-4 py-5 border-b border-white/10 ${collapsed ? "text-center px-2" : ""}`}>
          <div className="text-white font-extrabold text-xl leading-tight tracking-wide">
            {collapsed ? "GD" : "GRUPO DAZON"}
          </div>
          {!collapsed && <div className="text-xs text-white/70 mt-0.5">Control de Producción</div>}
        </div>
        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <SidebarGroup key={g}>
              {!collapsed && g !== "Inicio" && (
                <SidebarGroupLabel className="text-white/50 uppercase text-[11px] tracking-widest px-3 pt-3">
                  {g}
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
                            {!collapsed && <span className="text-[15px]">{item.title}</span>}
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
      </SidebarContent>
    </Sidebar>
  );
}
