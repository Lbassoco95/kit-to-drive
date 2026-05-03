import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Factory, FileText, Truck, Bike, Users, Database, ScrollText, Upload, Settings } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, AppRole } from "@/contexts/AuthContext";

type Item = { title: string; url: string; icon: any; roles: AppRole[] };

const ITEMS: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin","fabrica","logistica","ventas"] },
  { title: "Producción", url: "/produccion", icon: Factory, roles: ["admin","fabrica","logistica"] },
  { title: "Remisiones", url: "/remisiones", icon: FileText, roles: ["admin","fabrica","logistica","ventas"] },
  { title: "Entregas", url: "/entregas", icon: Truck, roles: ["admin","logistica"] },
  { title: "Mis Motocarros", url: "/mis-motocarros", icon: Bike, roles: ["ventas","admin"] },
  { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin","fabrica"] },
  { title: "Importar datos", url: "/importar", icon: Upload, roles: ["admin"] },
  { title: "Usuarios", url: "/usuarios", icon: Database, roles: ["admin"] },
  { title: "Bitácora", url: "/bitacora", icon: ScrollText, roles: ["admin"] },
  { title: "Configuración", url: "/configuracion", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const items = ITEMS.filter(i => role && i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={`px-4 py-4 border-b border-sidebar-border ${collapsed ? "text-center px-2" : ""}`}>
          <div className="text-sidebar-foreground font-bold text-lg leading-tight">
            {collapsed ? "GD" : "GRUPO DAZON"}
          </div>
          {!collapsed && <div className="text-xs text-sidebar-foreground/70">Control de Producción</div>}
        </div>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/60">Módulos</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <NavLink to={item.url} end className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
