import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Search, ExternalLink } from "lucide-react";
import { PaletaGlobal } from "@/components/PaletaGlobal";
import { useEffect, useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function AppLayout() {
  const { profileName, area, nivel, signOut, user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const { t } = useLang();
  const [paleta, setPaleta] = useState(false);
  const iniciales = (profileName || user?.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta(v => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider>
      <div className="ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="glass-bar sticky top-3 z-30 mx-2 sm:mx-3 mt-3 min-h-14 rounded-full flex items-center pl-2 pr-2 sm:pr-3 gap-2 sm:gap-3 shrink-0">
            <SidebarTrigger className="rounded-full" />
            <button
              type="button"
              onClick={() => setPaleta(true)}
              className="flex-1 max-w-md h-10 flex items-center gap-2 rounded-full bg-white/70 border border-white/80 px-4 text-sm text-muted-foreground hover:bg-white transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{t.layout.searchShort}</span>
              <kbd className="hidden sm:inline rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Avisos"><Bell className="h-4 w-4" /></Button>
              <div className="text-right text-xs leading-tight hidden sm:block">
                <div className="font-semibold text-foreground">{profileName || user?.email}</div>
                <div className="text-muted-foreground">{area && nivel ? `${t.areas[area]} · ${t.niveles[nivel]}` : ""}</div>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold ring-2 ring-white/70" aria-hidden="true">{iniciales}</span>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={async () => { await signOut(); nav("/auth"); }} title={t.layout.signOut} aria-label={t.layout.signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 min-w-0 overflow-auto p-3 sm:p-4 md:p-6 ">
            {/* El boundary encierra el error en el área de contenido: si una
                pantalla truena, el menú y la sesión siguen ahí en vez de
                dejar la app en blanco. La `key` lo reinicia al navegar, para
                que el error de una pantalla no se quede pegado en la
                siguiente. */}
            <ErrorBoundary key={loc.pathname} area={loc.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          <footer className="text-xs text-muted-foreground text-center pb-3 pt-1">
            {t.auth.poweredBy} · {t.auth.developedBy} ·{" "}
            <a href="https://www.yoltik.mx/productos/mati" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
              {t.auth.learnMoreMati}<ExternalLink size={11} aria-hidden="true" />
            </a>
          </footer>
        </div>
      </div>
      <PaletaGlobal open={paleta} onOpenChange={setPaleta} />
    </SidebarProvider>
  );
}
