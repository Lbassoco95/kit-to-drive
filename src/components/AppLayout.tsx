import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLang } from "@/contexts/LangContext";

export default function AppLayout() {
  const { profileName, area, nivel, signOut, user } = useAuth();
  const nav = useNavigate();
  const { t } = useLang();
  const [q, setQ] = useState("");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 bg-card border-b border-border flex items-center px-3 gap-3 shrink-0">
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
            <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
            <div className="text-right text-xs leading-tight hidden sm:block">
              <div className="font-semibold text-foreground">{profileName || user?.email}</div>
              <div className="text-muted-foreground">{area && nivel ? `${t.areas[area]} · ${t.niveles[nivel]}` : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); nav("/auth"); }}>
              <LogOut className="h-4 w-4 mr-1" /> {t.layout.signOut}
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 bg-surface">
            <Outlet />
          </main>
          <footer className="text-xs text-muted-foreground text-center py-2 border-t border-border bg-card">
            {t.footer}
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
