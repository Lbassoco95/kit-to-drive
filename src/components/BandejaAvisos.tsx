import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Bell, Check, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";

/**
 * Avisos que otra área le dejó a la tuya.
 *
 * Nació con la edición de remisiones: cuando Comercial baja un pedido, las
 * unidades de más se liberan solas y Fábrica tiene que enterarse — pero no
 * había ningún canal entre áreas, así que un cambio así sólo se descubría de
 * casualidad. Ver `ajustar_unidades_remision()` en la migración
 * 20260903000001.
 *
 * Hay dos clases de aviso:
 *   · el que sólo informa — se acusa con «Visto»;
 *   · la SOLICITUD (`requiere_respuesta`), que espera un sí o un no. La levanta
 *     Comercial cuando quiere soltar una unidad que Fábrica ya empezó a armar:
 *     desde el inicio del armado la unidad no se le quita a Fábrica, se le
 *     pide. Aceptar la libera ahí mismo (`responder_solicitud()`), y la
 *     respuesta le regresa a quien la pidió.
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
  requiere_respuesta: boolean | null;
  estado: string | null;
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
    const columnas = "id,tipo,titulo,cuerpo,folio_remision,nombre_creador,created_at,visto_at";
    const { data, error } = await supabase
      .from("avisos")
      .select(`${columnas},requiere_respuesta,estado`)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) { setAvisos(data ?? []); setListo(true); return; }

    // `estado` y `requiere_respuesta` son de 20260904000001. Si falta esa
    // migración se cae a la forma anterior (pendiente = sin acusar) en vez de
    // dejar a Fábrica sin bandeja.
    const { data: previo, error: error2 } = await supabase
      .from("avisos").select(columnas)
      .is("visto_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    // Y si la tabla tampoco existe (falta 20260903000001), no se estorba a
    // nadie: simplemente no hay avisos.
    setAvisos(error2 ? [] : ((previo ?? []) as Aviso[]));
    setListo(true);
  }, []);

  useEffect(() => { if (user?.id) cargar(); }, [user?.id, cargar]);

  return { avisos, listo, recargar: cargar };
}

const fechaCorta = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function BandejaAvisos({ onChange }: { onChange?: () => void }) {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const { avisos, recargar } = useAvisosPendientes();
  const [abierto, setAbierto]   = useState(true);
  const [ocupado, setOcupado]   = useState<string | null>(null);
  /** Lo que Fábrica quiere contestarle a cada solicitud. */
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});

  const darPorVisto = async (id: string) => {
    setOcupado(id);
    const sello = { visto_por: user?.id, visto_at: new Date().toISOString() };
    // `estado` es de 20260904000001; si falta, el acuse de siempre alcanza.
    let { error } = await supabase.from("avisos").update({ ...sello, estado: "visto" }).eq("id", id);
    if (error) ({ error } = await supabase.from("avisos").update(sello).eq("id", id));
    setOcupado(null);
    if (error) return toast.error(t.componentes.avisos.errorVisto(error.message));
    await recargar();
    onChange?.();
  };

  const contestar = async (id: string, aceptar: boolean) => {
    setOcupado(id);
    const { data, error } = await supabase.rpc("responder_solicitud", {
      _aviso_id: id, _aceptar: aceptar, _respuesta: respuestas[id]?.trim() || null,
    });
    setOcupado(null);
    if (error) return toast.error(error.message);
    const liberadas = Number((data as { liberadas?: number } | null)?.liberadas ?? 0);
    toast.success(aceptar
      ? t.componentes.avisos.aceptada(liberadas)
      : t.componentes.avisos.rechazada);
    setRespuestas(r => ({ ...r, [id]: "" }));
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
            {t.componentes.avisos.titulo(avisos.length)}
            {(() => {
              const piden = avisos.filter(a => a.requiere_respuesta).length;
              return piden ? <> · <strong>{t.componentes.avisos.esperanRespuesta(piden)}</strong></> : null;
            })()}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
          {avisos.map(a => {
            const esSolicitud = !!a.requiere_respuesta;
            return (
              <div key={a.id} className={`rounded-lg bg-white p-3 border ${esSolicitud ? "border-secondary" : "border-amber-200"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-primary break-words">
                      {esSolicitud && (
                        <span className="mr-1.5 px-1.5 py-0.5 rounded bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-bold uppercase tracking-wide align-middle">
                          {t.componentes.avisos.necesitaRespuesta}
                        </span>
                      )}
                      {a.titulo}
                    </div>
                    {a.cuerpo && <div className="text-sm text-slate-700 mt-0.5 break-words">{a.cuerpo}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {a.nombre_creador || "—"} · {fechaCorta(a.created_at, locale)}
                    </div>
                  </div>
                  {!esSolicitud && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => darPorVisto(a.id)}
                      disabled={ocupado === a.id}
                      className="h-9 shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                    >
                      <Check className="h-4 w-4 mr-1" /> {ocupado === a.id ? "…" : t.componentes.avisos.visto}
                    </Button>
                  )}
                </div>

                {esSolicitud && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
                    <Textarea
                      value={respuestas[a.id] ?? ""}
                      onChange={e => setRespuestas(r => ({ ...r, [a.id]: e.target.value }))}
                      placeholder={t.componentes.avisos.respuestaPlaceholder}
                      className="min-h-[60px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm" onClick={() => contestar(a.id, true)} disabled={ocupado === a.id}
                        className="h-9 flex-1 bg-emerald-700 hover:bg-emerald-800"
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" /> {t.componentes.avisos.aceptar}
                      </Button>
                      <Button
                        size="sm" variant="outline" onClick={() => contestar(a.id, false)} disabled={ocupado === a.id}
                        className="h-9 flex-1 border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <ThumbsDown className="h-4 w-4 mr-1" /> {t.componentes.avisos.rechazar}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Contador compacto para el tablero. No se dibuja si no hay nada pendiente. */
export function ResumenAvisos({ onClick }: { onClick?: () => void }) {
  const { avisos } = useAvisosPendientes();
  const { t } = useLang();
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
          {t.componentes.avisos.sinVer(avisos.length)}
        </span>
      </div>
      <div className="text-xs text-amber-900/80 mt-1 break-words">
        {avisos[0].titulo}
        {avisos.length > 1 && <>{t.componentes.avisos.yMas(avisos.length - 1)}</>}
      </div>
    </button>
  );
}
