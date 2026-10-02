import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { GROUPS, useNavItems } from "@/components/AppSidebar";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fdb } from "@/lib/finanzasDb";
import { Building2, FileText, Bike, Users } from "lucide-react";

type Hit = { id: string; label: string; sub?: string; url: string };

type DataHits = {
  clientes: Hit[];
  remisiones: Hit[];
  unidades: Hit[];
  proveedores: Hit[];
};

const VACIO: DataHits = { clientes: [], remisiones: [], unidades: [], proveedores: [] };

/**
 * Paleta global (Ctrl/⌘ K): pantallas + datos (clientes, remisiones,
 * unidades, proveedores) respetando permisos. Límite 5 por grupo, debounce 250 ms.
 */
export function PaletaGlobal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const { t } = useLang();
  const { perms } = useAuth();
  const items = useNavItems();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DataHits>(VACIO);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  const puedeClientes = perms.puedeVer("clientes");
  const puedeRemisiones = perms.puedeVer("remisiones");
  const puedeUnidades = perms.puedeVer("inventario") || perms.puedeVer("produccion") || perms.puedeVer("misMotocarros");
  const puedeProveedores = perms.puedeVer("proveedores");

  const buscarDatos = useCallback(
    async (texto: string) => {
      const term = texto.trim().replace(/[,.()%]/g, " ").replace(/\s+/g, " ").trim();
      if (term.length < 2) {
        setHits(VACIO);
        setBuscando(false);
        return;
      }
      const id = ++reqId.current;
      setBuscando(true);
      const like = `%${term}%`;
      const tasks: Promise<void>[] = [];
      const next: DataHits = { clientes: [], remisiones: [], unidades: [], proveedores: [] };

      if (puedeClientes) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from("clientes")
              .select("id, nombre_comercial, codigo_erp, folio_interno")
              .or(`nombre_comercial.ilike.${like},codigo_erp.ilike.${like},folio_interno.ilike.${like}`)
              .limit(5);
            next.clientes = (data ?? []).map((c: any) => ({
              id: c.id,
              label: c.nombre_comercial || c.folio_interno || c.codigo_erp || c.id,
              sub: [c.folio_interno, c.codigo_erp].filter(Boolean).join(" · ") || undefined,
              url: `/clientes?q=${encodeURIComponent(c.nombre_comercial || c.folio_interno || term)}`,
            }));
          })(),
        );
      }
      if (puedeRemisiones) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from("remisiones")
              .select("id, folio_remision, clientes(nombre_comercial)")
              .ilike("folio_remision", like)
              .limit(5);
            next.remisiones = (data ?? []).map((r: any) => ({
              id: r.id,
              label: r.folio_remision,
              sub: r.clientes?.nombre_comercial || undefined,
              url: `/remisiones?q=${encodeURIComponent(r.folio_remision)}`,
            }));
          })(),
        );
      }
      if (puedeUnidades) {
        tasks.push(
          (async () => {
            const { data } = await supabase
              .from("motocarros")
              .select("id, orden_armado, ns_chasis, ns_motor, modelo")
              .or(`ns_chasis.ilike.${like},ns_motor.ilike.${like},modelo.ilike.${like}`)
              .limit(5);
            next.unidades = (data ?? []).map((u: any) => ({
              id: u.id,
              label: u.ns_chasis || u.ns_motor || `#${u.orden_armado}`,
              sub: [u.modelo, u.ns_motor].filter(Boolean).join(" · ") || undefined,
              url: `/produccion?q=${encodeURIComponent(u.ns_chasis || u.ns_motor || String(u.orden_armado))}`,
            }));
          })(),
        );
      }
      if (puedeProveedores) {
        tasks.push(
          (async () => {
            const { data } = await fdb
              .from("proveedores")
              .select("id, nombre_comercial, razon_social")
              .or(`nombre_comercial.ilike.${like},razon_social.ilike.${like}`)
              .limit(5);
            next.proveedores = (data ?? []).map((p: any) => ({
              id: p.id,
              label: p.nombre_comercial || p.razon_social || p.id,
              sub: p.razon_social && p.nombre_comercial !== p.razon_social ? p.razon_social : undefined,
              url: `/proveedores?q=${encodeURIComponent(p.nombre_comercial || term)}`,
            }));
          })(),
        );
      }

      await Promise.all(tasks);
      if (id !== reqId.current) return;
      setHits(next);
      setBuscando(false);
    },
    [puedeClientes, puedeRemisiones, puedeUnidades, puedeProveedores],
  );

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits(VACIO);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void buscarDatos(q);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, buscarDatos]);

  const hayDatos = useMemo(
    () => hits.clientes.length + hits.remisiones.length + hits.unidades.length + hits.proveedores.length > 0,
    [hits],
  );

  const ir = (url: string) => {
    onOpenChange(false);
    nav(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder={t.layout.searchData}
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>
          {buscando ? t.layout.paletteSearching : t.layout.paletteEmpty}
        </CommandEmpty>

        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          const filtered = q.trim()
            ? list.filter(i => {
                const label = `${t.nav[i.key]} ${t.groups[g]}`.toLowerCase();
                return label.includes(q.trim().toLowerCase());
              })
            : list;
          if (!filtered.length) return null;
          return (
            <CommandGroup key={g} heading={g === "Inicio" ? t.layout.paletteScreens : t.groups[g]}>
              {filtered.map(i => (
                <CommandItem
                  key={i.url}
                  value={`screen-${i.url}`}
                  onSelect={() => ir(i.url)}
                >
                  <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                    <i.icon size={16} />
                  </span>
                  {t.nav[i.key]}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {hits.clientes.length > 0 && (
          <CommandGroup heading={t.layout.paletteClientes}>
            {hits.clientes.map(h => (
              <CommandItem key={h.id} value={`cli-${h.id}`} onSelect={() => ir(h.url)}>
                <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Users size={16} />
                </span>
                <span className="flex flex-col">
                  <span>{h.label}</span>
                  {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hits.remisiones.length > 0 && (
          <CommandGroup heading={t.layout.paletteRemisiones}>
            {hits.remisiones.map(h => (
              <CommandItem key={h.id} value={`rem-${h.id}`} onSelect={() => ir(h.url)}>
                <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <FileText size={16} />
                </span>
                <span className="flex flex-col">
                  <span>{h.label}</span>
                  {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hits.unidades.length > 0 && (
          <CommandGroup heading={t.layout.paletteUnidades}>
            {hits.unidades.map(h => (
              <CommandItem key={h.id} value={`uni-${h.id}`} onSelect={() => ir(h.url)}>
                <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bike size={16} />
                </span>
                <span className="flex flex-col">
                  <span>{h.label}</span>
                  {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hits.proveedores.length > 0 && (
          <CommandGroup heading={t.layout.paletteProveedores}>
            {hits.proveedores.map(h => (
              <CommandItem key={h.id} value={`prov-${h.id}`} onSelect={() => ir(h.url)}>
                <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Building2 size={16} />
                </span>
                <span className="flex flex-col">
                  <span>{h.label}</span>
                  {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {q.trim().length >= 2 && !buscando && !hayDatos && items.length === 0 && null}
      </CommandList>
    </CommandDialog>
  );
}
