import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fdb } from "@/lib/finanzasDb";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Search } from "lucide-react";

type Hit = { id: string; grupo: string; label: string; sub?: string; url: string };

/**
 * Página /buscar: misma búsqueda de datos que la paleta, para enlaces compartidos.
 */
export default function Buscar() {
  const { t } = useLang();
  const { perms } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") || "";
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    const handle = setTimeout(async () => {
      setParams(term ? { q: term } : {}, { replace: true });
      if (term.length < 2) {
        setHits([]);
        return;
      }
      setLoading(true);
      const like = `%${term}%`;
      const next: Hit[] = [];
      const tasks: Promise<void>[] = [];

      if (perms.puedeVer("clientes")) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("clientes")
            .select("id, nombre_comercial, codigo_erp")
            .or(`nombre_comercial.ilike.${like},codigo_erp.ilike.${like}`)
            .limit(5);
          for (const c of data ?? []) {
            next.push({
              id: `c-${c.id}`,
              grupo: t.layout.paletteClientes,
              label: c.nombre_comercial || c.codigo_erp || c.id,
              sub: c.codigo_erp || undefined,
              url: `/clientes?q=${encodeURIComponent(c.nombre_comercial || term)}`,
            });
          }
        })());
      }
      if (perms.puedeVer("remisiones")) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("remisiones")
            .select("id, folio_remision, clientes(nombre_comercial)")
            .ilike("folio_remision", like)
            .limit(5);
          for (const r of data ?? []) {
            next.push({
              id: `r-${r.id}`,
              grupo: t.layout.paletteRemisiones,
              label: r.folio_remision,
              sub: (r as any).clientes?.nombre_comercial,
              url: `/remisiones?q=${encodeURIComponent(r.folio_remision)}`,
            });
          }
        })());
      }
      if (perms.puedeVer("inventario") || perms.puedeVer("produccion")) {
        tasks.push((async () => {
          const { data } = await supabase
            .from("motocarros")
            .select("id, orden_armado, ns_chasis, ns_motor, modelo")
            .or(`ns_chasis.ilike.${like},ns_motor.ilike.${like},modelo.ilike.${like}`)
            .limit(5);
          for (const u of data ?? []) {
            next.push({
              id: `u-${u.id}`,
              grupo: t.layout.paletteUnidades,
              label: u.ns_chasis || u.ns_motor || `#${u.orden_armado}`,
              sub: [u.modelo, u.ns_motor].filter(Boolean).join(" · ") || undefined,
              url: `/produccion?q=${encodeURIComponent(u.ns_chasis || u.ns_motor || String(u.orden_armado))}`,
            });
          }
        })());
      }
      if (perms.puedeVer("proveedores")) {
        tasks.push((async () => {
          const { data } = await fdb
            .from("proveedores")
            .select("id, nombre_comercial, razon_social")
            .or(`nombre_comercial.ilike.${like},razon_social.ilike.${like}`)
            .limit(5);
          for (const p of data ?? []) {
            next.push({
              id: `p-${p.id}`,
              grupo: t.layout.paletteProveedores,
              label: p.nombre_comercial || p.razon_social || p.id,
              url: `/proveedores?q=${encodeURIComponent(p.nombre_comercial || term)}`,
            });
          }
        })());
      }

      await Promise.all(tasks);
      setHits(next);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, perms, setParams, t.layout]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold [word-break:keep-all]">{t.layout.searchPageTitle}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t.layout.searchData}</p>
      </div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t.layout.searchData}
          className="h-12 pl-12 rounded-full text-base"
          autoFocus
        />
      </div>
      {loading && <p className="text-sm text-muted-foreground text-center">{t.layout.paletteSearching}</p>}
      {!loading && q.trim().length >= 2 && hits.length === 0 && (
        <EstadoVacio pose="vacio" titulo={t.layout.paletteEmpty} detalle={t.layout.searchPageEmpty} />
      )}
      {!loading && hits.length > 0 && (
        <Card className="rounded-[1.75rem] overflow-hidden divide-y">
          {hits.map(h => (
            <button
              key={h.id}
              type="button"
              onClick={() => nav(h.url)}
              className="w-full text-left px-5 py-4 hover:bg-surface-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{h.grupo}</div>
              <div className="font-semibold text-primary">{h.label}</div>
              {h.sub && <div className="text-sm text-muted-foreground">{h.sub}</div>}
            </button>
          ))}
        </Card>
      )}
      {!q.trim() && (
        <div className="text-center">
          <Button variant="outline" className="rounded-full" onClick={() => nav("/")}>
            {t.layout.searchPageBack}
          </Button>
        </div>
      )}
    </div>
  );
}
