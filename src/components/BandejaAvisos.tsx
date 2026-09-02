import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Bell, Check, ChevronDown } from "lucide-react";

/**
 * Avisos que otra área le dejó a la tuya.
 *
 * Nació con la edición de remisiones: cuando Comercial baja un pedido, las
 * unidades de más se liberan solas y Fábrica tiene que enterarse — pero no
 * había ningún canal entre áreas, así que un cambio así sólo se descubría de
 * casualidad. Ver `ajustar_unidades_remision()` en la migración
 * 20260903000001.
 *
 * Quién ve qué lo decide el RLS de `avisos` (`recibe_avisos_de`), no esta
 * pantalla: aquí se piden todos los que el usuario alcanza a leer.
 */
export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  folio_remision: string | null;
  nombre_creador: string | null;
  created_at: string;
  visto_at: string | null;
}

/**
 * Lee los avisos pendientes del usuario. Sin `export`: los dos componentes de
 * este archivo son los únicos que lo usan, y exportarlo rompe el fast refresh.
 */
function useAvisosPendientes() {
  const { user } = useAuth();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [listo, setListo]   = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("avisos")
      .select("id,tipo,titulo,cuerpo,folio_remision,nombre_creador,created_at,visto_at")
      .is("visto_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    // Si la tabla todavía no existe (falta 20260903000001), no se estorba a
    // nadie: simplemente no hay avisos.
    setAvisos(error ? [] : (data ?? []));
    setListo(true);
  }, []);

  useEffect(() => { if (user?.id) cargar(); }, [user?.id, cargar]);

  return { avisos, listo, recargar: cargar };
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function BandejaAvisos({ onChange }: { onChange?: () => void }) {
  const { user } = useAuth();
  const { avisos, recargar } = useAvisosPendientes();
  const [abierto, setAbierto]   = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);

  const darPorVisto = async (id: string) => {
    setMarcando(id);
    const { error } = await supabase
      .from("avisos")
      .update({ visto_por: user?.id, visto_at: new Date().toISOString() })
      .eq("id", id);
    setMarcando(null);
    if (error) return toast.error(`No se pudo marcar como visto: ${error.message}`);
    await recargar();
    onChange?.();
  };

  if (!avisos.length) return null;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setAbierto(o => !o)}>
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-700" />
          <span className="font-semibold text-amber-800 text-sm">
            {avisos.length} aviso{avisos.length > 1 ? "s" : ""} de otra área
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
          {avisos.map(a => (
            <div key={a.id} className="rounded-lg bg-white border border-amber-200 p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-[#1F3864] break-words">{a.titulo}</div>
                {a.cuerpo && <div className="text-sm text-slate-700 mt-0.5 break-words">{a.cuerpo}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {a.nombre_creador || "—"} · {fechaCorta(a.created_at)}
                </div>
              </div>
              <Button
                size="sm" variant="outline"
                onClick={() => darPorVisto(a.id)}
                disabled={marcando === a.id}
                className="h-9 shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                <Check className="h-4 w-4 mr-1" /> {marcando === a.id ? "…" : "Visto"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Contador compacto para el tablero. No se dibuja si no hay nada pendiente. */
export function ResumenAvisos({ onClick }: { onClick?: () => void }) {
  const { avisos } = useAvisosPendientes();
  if (!avisos.length) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-amber-700" />
        <span className="font-semibold text-amber-800 text-sm">
          {avisos.length} aviso{avisos.length > 1 ? "s" : ""} sin ver
        </span>
      </div>
      <div className="text-xs text-amber-900/80 mt-1 break-words">
        {avisos[0].titulo}
        {avisos.length > 1 && <> · y {avisos.length - 1} más</>}
      </div>
    </button>
  );
}
