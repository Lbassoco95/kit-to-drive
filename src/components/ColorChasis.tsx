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
    const t = q.trim().toUpperCase();
    return candidatos
      .filter(c => normColor(c.color) !== normColor(chasis?.color))
      .filter(c => !objetivo || normColor(c.color) === objetivo)
      .filter(c => !t || c.numero_chasis.includes(t))
      .slice(0, 100);
  }, [candidatos, colorNuevo, chasis, q]);

  const guardarCambio = async () => {
    if (!chasis) return;
    if (!colorNuevo) { toast.error("Elige el color nuevo"); return; }
    if (motivo.trim().length < 5) { toast.error("Escribe el motivo (mínimo 5 caracteres)"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("cambiar_color_chasis", {
      _chasis_id: chasis.id, _color_nuevo: colorNuevo, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`✓ ${chasis.numero_chasis}: ${r?.color_anterior} → ${r?.color_nuevo} (VIN: ${r?.color_vin}). Quedan ${r?.capacidad_libre_restante} juego(s) ${r?.color_nuevo} libres.`);
    onOpenChange(false);
    onDone?.();
  };

  const guardarIntercambio = async () => {
    if (!chasis || !pareja) { toast.error("Elige el chasis con el que se intercambia"); return; }
    if (motivo.trim().length < 5) { toast.error("Escribe el motivo (mínimo 5 caracteres)"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("intercambiar_color_chasis", {
      _chasis_a: chasis.id, _chasis_b: pareja.id, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`✓ ${r?.chasis_a?.ns}: ${r?.chasis_a?.antes} → ${r?.chasis_a?.ahora} · ${r?.chasis_b?.ns}: ${r?.chasis_b?.antes} → ${r?.chasis_b?.ahora}`);
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
            <Palette className="h-6 w-6 text-[#1F3864]" /> Color del chasis
          </DialogTitle>
          <DialogDescription>
            Sólo pueden existir tantas unidades de un color como juegos de piezas de ese
            color llegaron. Si el color que quieres ya está agotado, intercámbialo con otro chasis.
          </DialogDescription>
        </DialogHeader>

        {chasis && (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="font-mono font-bold text-base">{chasis.numero_chasis}</div>
            <div className="text-xs text-muted-foreground">
              {chasis.modelo} · color actual <strong>{normColor(chasis.color)}</strong>
              {recoloreado && <> · el VIN decía <strong>{vin}</strong></>}
              {chasis.motocarro_id && " · ya armado en una unidad"}
            </div>
          </div>
        )}

        <div className="inline-flex rounded-lg border p-1 bg-card self-start">
          <button
            onClick={() => setModo("cambiar")}
            className={`px-3 py-2 rounded-md text-sm font-medium ${modo === "cambiar" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}
          >
            Usar un juego libre
          </button>
          <button
            onClick={() => setModo("intercambiar")}
            className={`px-3 py-2 rounded-md text-sm font-medium ${modo === "intercambiar" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}
          >
            <ArrowLeftRight className="h-4 w-4 inline mr-1.5" /> Intercambiar
          </button>
        </div>

        <div>
          <Label>Color nuevo</Label>
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
                    ? `No quedan juegos ${c} libres — sólo por intercambio o registrando piezas extra`
                    : `${libres} juego(s) ${c} libres`}
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
            No quedan juegos {normColor(colorNuevo)} libres de este modelo: todos están montados en otros
            chasis. Cámbiate a <strong>Intercambiar</strong> para tomarlo de otro chasis, o registra las
            piezas extra que llegaron desde Inventario → Colores.
          </div>
        )}

        {modo === "intercambiar" && (
          <div className="space-y-2">
            <Label>
              Chasis con el que se intercambia
              {pareja && <span className="text-[#065F46] font-mono"> — {pareja.numero_chasis}</span>}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-10" placeholder="Buscar chasis…" value={q} onChange={e => setQ(e.target.value)} />
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
                    {c.motocarro_id ? " · armado en una unidad" : " · pieza libre"}
                  </div>
                </button>
              ))}
              {!candidatosFiltrados.length && (
                <div className="p-4 text-sm text-center text-muted-foreground">
                  {colorNuevo
                    ? `No hay chasis ${normColor(colorNuevo)} de este modelo para intercambiar`
                    : "Elige primero el color que quieres"}
                </div>
              )}
            </div>
            {pareja && (
              <div className="rounded-lg p-3 bg-[#EFF6FF] text-[#1E40AF] text-sm">
                {chasis?.numero_chasis} queda <strong>{normColor(pareja.color)}</strong> y{" "}
                {pareja.numero_chasis} queda <strong>{normColor(chasis?.color)}</strong>. La capacidad de
                cada color no cambia.
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Motivo *</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. El cliente de REM-005 lo pidió azul y se monta el juego azul en este chasis"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {modo === "cambiar" ? (
            <Button onClick={guardarCambio} disabled={busy || !colorNuevo || sinJuegos} className="bg-[#1F3864] hover:bg-[#162a4d]">
              {busy ? "Guardando…" : "Cambiar color"}
            </Button>
          ) : (
            <Button onClick={guardarIntercambio} disabled={busy || !pareja} className="bg-[#1F3864] hover:bg-[#162a4d]">
              <ArrowLeftRight className="h-4 w-4 mr-1.5" /> {busy ? "Guardando…" : "Intercambiar"}
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
  const [juegos, setJuegos] = useState(juegosActuales);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setJuegos(juegosActuales); setMotivo(""); } }, [open, juegosActuales]);

  const guardar = async () => {
    if (motivo.trim().length < 5) { toast.error("Escribe el motivo (mínimo 5 caracteres)"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("ajustar_capacidad_color", {
      _modelo: modelo, _color: color, _piezas_recibidas: juegos, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`✓ ${modelo} ${color}: ${r?.antes} → ${r?.ahora} juegos (${r?.capacidad_libre} libres)`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Juegos de piezas — {modelo} {color}</DialogTitle>
          <DialogDescription>
            El packing list de partes no trae color, así que los juegos que lleguen fuera del VIN
            se registran aquí. Esto define cuántas unidades de este color pueden existir.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Juegos {color} disponibles en total</Label>
          <Input
            type="number" min={0} className="h-11 text-base font-bold"
            value={juegos}
            onChange={e => setJuegos(Math.max(0, parseInt(e.target.value) || 0))}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Hoy hay {juegosActuales} (lo que declaró el VIN más ajustes previos).
          </p>
        </div>
        <div>
          <Label>Motivo *</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. Llegaron 4 juegos azules extra en el contenedor de partes"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy} className="bg-[#1F3864] hover:bg-[#162a4d]">
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
