import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { LineaProducto } from "@/lib/dazon";

type ChasisDisponible = { id: string; numero_chasis: string; modelo: string; color: string; folio: string | null };
type MotorDisponible = { id: string; numero_motor: string; modelo: string };

export function ConfigurarUnidad({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const [chasis, setChasis] = useState<ChasisDisponible[]>([]);
  const [motores, setMotores] = useState<MotorDisponible[]>([]);
  const [qChasis, setQChasis] = useState("");
  const [qMotor, setQMotor] = useState("");
  const [chasisSel, setChasisSel] = useState<ChasisDisponible | null>(null);
  const [motorSel, setMotorSel] = useState<MotorDisponible | null>(null);
  const [orden, setOrden] = useState<number>(1);

  const load = async () => {
    setLoading(true);
    try {
      const { data: catalogo, error: catErr } = await supabase.from("modelos_producto").select("modelo, linea");
      if (catErr) throw catErr;
      const modelosMotocarro = new Set(
        (catalogo ?? []).filter((c: any) => (c.linea as LineaProducto) === "motocarro").map((c: any) => c.modelo)
      );

      const { data: chasisData, error: chErr } = await supabase
        .from("inventario_chasis")
        .select("id, numero_chasis, modelo, color, contenedor_id, contenedores(folio_contenedor)")
        .is("motocarro_id", null)
        .order("numero_chasis");
      if (chErr) throw chErr;

      const { data: motorData, error: moErr } = await supabase
        .from("inventario_motor")
        .select("id, numero_motor, modelo")
        .is("motocarro_id", null)
        .order("numero_motor");
      if (moErr) throw moErr;

      const { data: ultimoOrden } = await supabase
        .from("motocarros")
        .select("orden_armado")
        .order("orden_armado", { ascending: false })
        .limit(1);

      setChasis(
        (chasisData ?? [])
          .filter((c: any) => modelosMotocarro.has(c.modelo))
          .map((c: any) => ({
            id: c.id, numero_chasis: c.numero_chasis, modelo: c.modelo, color: c.color,
            folio: c.contenedores?.folio_contenedor ?? null,
          }))
      );
      setMotores((motorData ?? []).map((m: any) => ({ id: m.id, numero_motor: m.numero_motor, modelo: m.modelo })));
      setOrden((ultimoOrden?.[0]?.orden_armado ?? 0) + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cargar piezas disponibles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) { load(); setChasisSel(null); setMotorSel(null); setQChasis(""); setQMotor(""); } }, [open]);

  const chasisFiltrados = useMemo(() => {
    const q = qChasis.trim().toUpperCase();
    if (!q) return chasis;
    return chasis.filter(c => c.numero_chasis.includes(q) || c.modelo.toUpperCase().includes(q) || c.color.toUpperCase().includes(q) || (c.folio ?? "").toUpperCase().includes(q));
  }, [chasis, qChasis]);

  const motoresFiltrados = useMemo(() => {
    const q = qMotor.trim().toUpperCase();
    if (!q) return motores;
    return motores.filter(m => m.numero_motor.includes(q) || m.modelo.toUpperCase().includes(q));
  }, [motores, qMotor]);

  const modelosCoinciden = chasisSel && motorSel ? chasisSel.modelo === motorSel.modelo : true;

  const guardar = async () => {
    if (!chasisSel || !motorSel) { toast.error("Selecciona un chasis y un motor"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("configurar_unidad", {
      _chasis_id: chasisSel.id, _motor_id: motorSel.id, _orden: orden,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { ok?: boolean; orden_armado?: number; modelos_coinciden?: boolean } | null;
    if (r?.modelos_coinciden === false) {
      toast.warning(`Unidad #${r.orden_armado} creada, pero el chasis (${chasisSel.modelo}) y el motor (${motorSel.modelo}) son de modelos distintos.`);
    } else {
      toast.success(`✓ Unidad #${r?.orden_armado ?? orden} configurada`);
    }
    // Quita del pool local las piezas usadas y limpia la selección
    setChasis(prev => prev.filter(c => c.id !== chasisSel.id));
    setMotores(prev => prev.filter(m => m.id !== motorSel.id));
    setChasisSel(null); setMotorSel(null); setQChasis(""); setQMotor("");
    setOrden(o => o + 1);
    onDone?.();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-12 bg-[#1F3864] hover:bg-[#162a4d] text-white font-semibold">
        <Wrench className="h-5 w-5 mr-2" /> Configurar unidad
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Wrench className="h-6 w-6 text-[#1F3864]" /> Configurar unidad
            </DialogTitle>
            <DialogDescription>
              {loading ? "Cargando piezas disponibles…" : `Quedan ${chasis.length} chasis y ${motores.length} motores sin configurar`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Chasis disponible {chasisSel && <span className="text-[#065F46] font-mono">— {chasisSel.numero_chasis}</span>}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-10" placeholder="Buscar chasis, modelo, color, contenedor…" value={qChasis} onChange={e => setQChasis(e.target.value)} />
              </div>
              <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                {chasisFiltrados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setChasisSel(c)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${chasisSel?.id === c.id ? "bg-[#DBEAFE]" : ""}`}
                  >
                    <div className="font-mono font-semibold">{c.numero_chasis}</div>
                    <div className="text-xs text-muted-foreground">{c.modelo} · {c.color} · {c.folio ?? "sin contenedor"}</div>
                  </button>
                ))}
                {!loading && chasisFiltrados.length === 0 && <div className="p-4 text-sm text-center text-muted-foreground">Sin chasis disponibles</div>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Motor disponible {motorSel && <span className="text-[#065F46] font-mono">— {motorSel.numero_motor}</span>}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-10" placeholder="Buscar motor, modelo…" value={qMotor} onChange={e => setQMotor(e.target.value)} />
              </div>
              <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                {motoresFiltrados.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMotorSel(m)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${motorSel?.id === m.id ? "bg-[#DBEAFE]" : ""}`}
                  >
                    <div className="font-mono font-semibold">{m.numero_motor}</div>
                    <div className="text-xs text-muted-foreground">{m.modelo}</div>
                  </button>
                ))}
                {!loading && motoresFiltrados.length === 0 && <div className="p-4 text-sm text-center text-muted-foreground">Sin motores disponibles</div>}
              </div>
            </div>
          </div>

          {!modelosCoinciden && (
            <div className="rounded-lg p-3 flex items-center gap-2 bg-[#FEF3C7] text-[#92400E] text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              El chasis es {chasisSel?.modelo} y el motor {motorSel?.modelo} — verifica que sean compatibles.
            </div>
          )}

          <div className="flex items-center gap-3">
            <Label className="shrink-0">Orden de armado</Label>
            <Input type="number" min={1} className="h-10 w-32" value={orden} onChange={e => setOrden(Number(e.target.value))} />
          </div>

          <DialogFooter>
            <Button onClick={guardar} disabled={busy || !chasisSel || !motorSel} className="h-12 bg-[#065F46] hover:bg-[#054c38]">
              <CheckCircle2 className="h-5 w-5 mr-2" /> {busy ? "Guardando…" : "Configurar unidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
