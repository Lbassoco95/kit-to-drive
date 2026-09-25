import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CampanaCitas } from "@/components/CampanaCitas";

export default function AppLayout() {
  const { profileName, area, nivel, signOut, user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const { t } = useLang();
  const [q, setQ] = useState("");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 bg-card border-b border-border flex items-center px-2 sm:px-3 gap-2 sm:gap-3 shrink-0">
            <SidebarTrigger />
            <form
              onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/buscar?q=${encodeURIComponent(q)}`); }}
              className="flex-1 max-w-md relative"
            >
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t.layout.search}
                className="pl-8 h-9"
              />
            </form>
            <CampanaCitas />
            <div className="text-right text-xs leading-tight hidden sm:block">
              <div className="font-semibold text-foreground">{profileName || user?.email}</div>
              <div className="text-muted-foreground">{area && nivel ? `${t.areas[area]} · ${t.niveles[nivel]}` : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); nav("/auth"); }} title={t.layout.signOut}>
              <LogOut className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{t.layout.signOut}</span>
            </Button>
          </header>
          <main className="flex-1 min-w-0 overflow-auto p-3 sm:p-4 md:p-6 bg-surface">
            {/* El boundary encierra el error en el área de contenido: si una
                pantalla truena, el menú y la sesión siguen ahí en vez de
                dejar la app en blanco. La `key` lo reinicia al navegar, para
                que el error de una pantalla no se quede pegado en la
                siguiente. */}
            <ErrorBoundary key={loc.pathname} area={loc.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          <footer className="text-xs text-muted-foreground text-center py-2 border-t border-border bg-card">
            {t.footer}
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
