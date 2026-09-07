import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight, Palette, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { CapacidadColor, claveCapacidad, COLORES, normColor } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";

export type ChasisColor = {
  id: string;
  numero_chasis: string;
  modelo: string;
  color: string;
  color_original: string | null;
  motocarro_id: string | null;
};

/**
 * Carga la capacidad de color por (modelo de fábrica, color). Es lo que limita
 * cuántas unidades de un color pueden existir: del embarque sólo vinieron N
 * juegos de piezas de cada color.
 */
export async function cargarCapacidadColor(): Promise<Map<string, CapacidadColor>> {
  const { data } = await supabase
    .from("inventario_colores")
    .select("modelo, color, piezas_recibidas, juegos_usados");
  return new Map((data ?? []).map((r: any) => [
    claveCapacidad(r.modelo, r.color),
    {
      juegos: r.piezas_recibidas ?? 0,
      usados: r.juegos_usados ?? 0,
      libres: (r.piezas_recibidas ?? 0) - (r.juegos_usados ?? 0),
    },
  ]));
}

type Props = {
  chasis: ChasisColor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/**
 * Cambiar el color con el que se arma un chasis. El VIN dice un color, pero
 * fábrica le puede montar otro — con una condición física: sólo hay tantas
 * unidades de un color como juegos de piezas de ese color llegaron. Por eso
 * hay dos caminos: usar un juego libre, o intercambiar con otro chasis.
 */
export function ColorChasis({ chasis, open, onOpenChange, onDone }: Props) {
  const { t } = useLang();
  const [modo, setModo] = useState<"cambiar" | "intercambiar">("cambiar");
  const [colorNuevo, setColorNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [capacidad, setCapacidad] = useState<Map<string, CapacidadColor>>(new Map());
  const [candidatos, setCandidatos] = useState<ChasisColor[]>([]);
  const [q, setQ] = useState("");
  const [pareja, setPareja] = useState<ChasisColor | null>(null);

  useEffect(() => {
    if (!open || !chasis) return;
    setModo("cambiar");
    setColorNuevo("");
    setMotivo("");
    setPareja(null);
    setQ("");
    (async () => {
      setCapacidad(await cargarCapacidadColor());
      // Para intercambiar: chasis del MISMO modelo (los juegos de piezas no son
      // compatibles entre modelos), libres de compromiso y de otro color.
      const { data } = await supabase
        .from("inventario_chasis")
        .select("id, numero_chasis, modelo, color, color_original, motocarro_id")
        .eq("modelo", chasis.modelo)
        .neq("id", chasis.id)
        .order("numero_chasis");
      setCandidatos((data ?? []) as ChasisColor[]);
    })();
  }, [open, chasis]);

  const libresDe = (color: string) =>
    capacidad.get(claveCapacidad(chasis?.modelo ?? "", color))?.libres ?? 0;

  const opciones = useMemo(() => {
    const actual = normColor(chasis?.color);
    const delCatalogo = COLORES.filter(c => c !== actual);
    // Colores que ya existen en este modelo aunque no estén en el catálogo.
    const extra = [...capacidad.keys()]
      .filter(k => k.startsWith(`${chasis?.modelo}__`))
      .map(k => k.split("__")[1])
      .filter(c => c !== actual && !delCatalogo.includes(c as any));
    return [...delCatalogo, ...extra];
  }, [capacidad, chasis]);

  const candidatosFiltrados = useMemo(() => {
    const objetivo = colorNuevo ? normColor(colorNuevo) : null;
    const term = q.trim().toUpperCase();
    return candidatos
      .filter(c => normColor(c.color) !== normColor(chasis?.color))
      .filter(c => !objetivo || normColor(c.color) === objetivo)
      .filter(c => !term || c.numero_chasis.includes(term))
      .slice(0, 100);
  }, [candidatos, colorNuevo, chasis, q]);

  const guardarCambio = async () => {
    if (!chasis) return;
    if (!colorNuevo) { toast.error(t.componentes.colorChasis.eligeColorNuevo); return; }
    if (motivo.trim().length < 5) { toast.error(t.componentes.colorChasis.faltaMotivo); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("cambiar_color_chasis", {
      _chasis_id: chasis.id, _color_nuevo: colorNuevo, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(t.componentes.colorChasis.okCambio(chasis.numero_chasis, r?.color_anterior, r?.color_nuevo, r?.color_vin, r?.capacidad_libre_restante));
    onOpenChange(false);
    onDone?.();
  };

  const guardarIntercambio = async () => {
    if (!chasis || !pareja) { toast.error(t.componentes.colorChasis.eligeChasis); return; }
    if (motivo.trim().length < 5) { toast.error(t.componentes.colorChasis.faltaMotivo); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("intercambiar_color_chasis", {
      _chasis_a: chasis.id, _chasis_b: pareja.id, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(t.componentes.colorChasis.okIntercambio(r?.chasis_a?.ns, r?.chasis_a?.antes, r?.chasis_a?.ahora, r?.chasis_b?.ns, r?.chasis_b?.antes, r?.chasis_b?.ahora));
    onOpenChange(false);
    onDone?.();
  };

  const sinJuegos = !!colorNuevo && libresDe(colorNuevo) <= 0;
  const vin = normColor(chasis?.color_original ?? chasis?.color);
  const recoloreado = chasis && vin !== normColor(chasis.color);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Palette className="h-6 w-6 text-[#1F3864]" /> {t.componentes.colorChasis.titulo}
          </DialogTitle>
          <DialogDescription>{t.componentes.colorChasis.desc}</DialogDescription>
        </DialogHeader>

        {chasis && (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="font-mono font-bold text-base">{chasis.numero_chasis}</div>
            <div className="text-xs text-muted-foreground">
              {chasis.modelo} · {t.componentes.colorChasis.colorActual} <strong>{normColor(chasis.color)}</strong>
              {recoloreado && <> · {t.componentes.colorChasis.vinDecia} <strong>{vin}</strong></>}
              {chasis.motocarro_id && t.componentes.colorChasis.yaArmado}
            </div>
          </div>
        )}

        <div className="inline-flex rounded-lg border p-1 bg-card self-start">
          <button
            onClick={() => setModo("cambiar")}
            className={`px-3 py-2 rounded-md text-sm font-medium ${modo === "cambiar" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}
          >
            {t.componentes.colorChasis.usarJuegoLibre}
          </button>
          <button
            onClick={() => setModo("intercambiar")}
            className={`px-3 py-2 rounded-md text-sm font-medium ${modo === "intercambiar" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}
          >
            <ArrowLeftRight className="h-4 w-4 inline mr-1.5" /> {t.componentes.colorChasis.intercambiar}
          </button>
        </div>

        <div>
          <Label>{t.componentes.colorChasis.colorNuevo}</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {opciones.map(c => {
              const libres = libresDe(c);
              const activo = colorNuevo === c;
              const agotado = libres <= 0;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColorNuevo(c); setPareja(null); }}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                    activo ? "bg-[#1F3864] text-white border-[#1F3864]"
                    : agotado ? "bg-slate-50 text-slate-400 border-slate-200"
                    : "bg-white text-slate-700 hover:border-[#2E75B6]"}`}
                  title={agotado
                    ? t.componentes.colorChasis.agotadoTip(c)
                    : t.componentes.colorChasis.libresTip(libres, c)}
                >
                  {c} <span className={activo ? "opacity-80" : agotado ? "" : "text-[#065F46]"}>
                    {agotado ? "· 0" : `· ${libres}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {modo === "cambiar" && sinJuegos && (
          <div className="rounded-lg p-3 flex items-start gap-2 bg-[#FEF3C7] text-[#92400E] text-sm">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            {t.componentes.colorChasis.sinJuegos1(normColor(colorNuevo))}{" "}
            <strong>{t.componentes.colorChasis.intercambiarBold}</strong>{" "}
            {t.componentes.colorChasis.sinJuegos2}
          </div>
        )}

        {modo === "intercambiar" && (
          <div className="space-y-2">
            <Label>
              {t.componentes.colorChasis.chasisIntercambio}
              {pareja && <span className="text-[#065F46] font-mono"> — {pareja.numero_chasis}</span>}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-10" placeholder={t.componentes.colorChasis.buscarChasis} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
              {candidatosFiltrados.map(c => (
                <button
                  key={c.id}
                  onClick={() => setPareja(c)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${pareja?.id === c.id ? "bg-[#DBEAFE]" : ""}`}
                >
                  <div className="font-mono font-semibold">{c.numero_chasis}</div>
                  <div className="text-xs text-muted-foreground">
                    {normColor(c.color)}
                    {normColor(c.color_original ?? c.color) !== normColor(c.color) && ` (VIN: ${normColor(c.color_original)})`}
                    {c.motocarro_id ? t.componentes.colorChasis.armadoEnUnidad : t.componentes.colorChasis.piezaLibre}
                  </div>
                </button>
              ))}
              {!candidatosFiltrados.length && (
                <div className="p-4 text-sm text-center text-muted-foreground">
                  {colorNuevo
                    ? t.componentes.colorChasis.sinCandidatos(normColor(colorNuevo))
                    : t.componentes.colorChasis.eligeColor}
                </div>
              )}
            </div>
            {pareja && (
              <div className="rounded-lg p-3 bg-[#EFF6FF] text-[#1E40AF] text-sm">
                {chasis?.numero_chasis} {t.componentes.colorChasis.resumenIntercambio1}{" "}
                <strong>{normColor(pareja.color)}</strong> {t.componentes.colorChasis.resumenIntercambio2}{" "}
                {pareja.numero_chasis} {t.componentes.colorChasis.resumenIntercambio3}{" "}
                <strong>{normColor(chasis?.color)}</strong>{t.componentes.colorChasis.resumenIntercambio4}
              </div>
            )}
          </div>
        )}

        <div>
          <Label>{t.componentes.colorChasis.motivo}</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={t.componentes.colorChasis.motivoPlaceholder}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.actions.cancel}</Button>
          {modo === "cambiar" ? (
            <Button onClick={guardarCambio} disabled={busy || !colorNuevo || sinJuegos} className="bg-[#1F3864] hover:bg-[#162a4d]">
              {busy ? t.componentes.colorChasis.guardando : t.componentes.colorChasis.cambiarColor}
            </Button>
          ) : (
            <Button onClick={guardarIntercambio} disabled={busy || !pareja} className="bg-[#1F3864] hover:bg-[#162a4d]">
              <ArrowLeftRight className="h-4 w-4 mr-1.5" /> {busy ? t.componentes.colorChasis.guardando : t.componentes.colorChasis.intercambiar}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Registrar juegos de color que llegaron fuera del packing list del VIN. */
export function AjustarCapacidadColor({
  modelo, color, juegosActuales, open, onOpenChange, onDone,
}: {
  modelo: string; color: string; juegosActuales: number;
  open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void;
}) {
  const { t } = useLang();
  const [juegos, setJuegos] = useState(juegosActuales);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setJuegos(juegosActuales); setMotivo(""); } }, [open, juegosActuales]);

  const guardar = async () => {
    if (motivo.trim().length < 5) { toast.error(t.componentes.colorChasis.faltaMotivo); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("ajustar_capacidad_color", {
      _modelo: modelo, _color: color, _piezas_recibidas: juegos, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(t.componentes.capacidadColor.ok(modelo, color, r?.antes, r?.ahora, r?.capacidad_libre));
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.componentes.capacidadColor.titulo(modelo, color)}</DialogTitle>
          <DialogDescription>{t.componentes.capacidadColor.desc}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>{t.componentes.capacidadColor.juegosTotal(color)}</Label>
          <Input
            type="number" min={0} className="h-11 text-base font-bold"
            value={juegos}
            onChange={e => setJuegos(Math.max(0, parseInt(e.target.value) || 0))}
          />
          <p className="text-xs text-muted-foreground mt-1">{t.componentes.capacidadColor.hoyHay(juegosActuales)}</p>
        </div>
        <div>
          <Label>{t.componentes.colorChasis.motivo}</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={t.componentes.capacidadColor.motivoPlaceholder}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.actions.cancel}</Button>
          <Button onClick={guardar} disabled={busy} className="bg-[#1F3864] hover:bg-[#162a4d]">
            {busy ? t.componentes.colorChasis.guardando : t.actions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
