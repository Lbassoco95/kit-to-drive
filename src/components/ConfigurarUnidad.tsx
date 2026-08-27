import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, AlertTriangle, CheckCircle2, Search, TriangleAlert, Palette } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CatalogoModelos, displayFabrica, lineaDe, COLORES, normColor, CapacidadColor, claveCapacidad, explicarError } from "@/lib/dazon";
import { ReportarIncidencia } from "@/components/ReportarIncidencia";
import { cargarCapacidadColor } from "@/components/ColorChasis";

type IncidenciaAbierta = { folio: string | null; parte_afectada: string | null };
type ChasisDisponible = {
  id: string; numero_chasis: string; modelo: string; color: string;
  color_original: string | null;
  folio: string | null; estatus: string; incidencia?: IncidenciaAbierta;
};
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
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(new Map());
  const [detenidos, setDetenidos] = useState(0);
  const [reportar, setReportar] = useState<ChasisDisponible | null>(null);
  // Color con el que se va a armar. Arranca en el del chasis; fábrica lo puede
  // cambiar si hay juegos de piezas libres de ese color.
  const [colorSel, setColorSel] = useState<string>("");
  const [capacidad, setCapacidad] = useState<Map<string, CapacidadColor>>(new Map());
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data: catalogoData, error: catErr } = await supabase.from("modelos_producto").select("modelo, linea, nombre_comercial");
      if (catErr) throw catErr;
      const catMap: CatalogoModelos = new Map((catalogoData ?? []).map((c: any) => [c.modelo, { linea: c.linea, nombre_comercial: c.nombre_comercial }]));
      setCatalogo(catMap);
      const modelosMotocarro = new Set(
        (catalogoData ?? []).filter((c: any) => lineaDe(c.modelo, catMap) === "motocarro").map((c: any) => c.modelo)
      );

      const { data: chasisData, error: chErr } = await supabase
        .from("inventario_chasis")
        .select("id, numero_chasis, modelo, color, color_original, estatus, contenedor_id, contenedores(folio_contenedor)")
        .is("motocarro_id", null)
        .order("numero_chasis");
      if (chErr) throw chErr;

      // Reportes abiertos: se muestran como aviso. Los que retienen la pieza
      // ya vienen con estatus distinto de 'disponible' y quedan fuera del pool.
      const { data: incData } = await supabase
        .from("incidencias_chasis")
        .select("chasis_id, folio, parte_afectada, estatus")
        .in("estatus", ["abierta", "en_revision"]);
      const incMap = new Map<string, IncidenciaAbierta>(
        (incData ?? []).map((i: any) => [i.chasis_id, { folio: i.folio, parte_afectada: i.parte_afectada }])
      );

      const { data: motorData, error: moErr } = await supabase
        .from("inventario_motor")
        .select("id, numero_motor, modelo")
        .is("motocarro_id", null)
        .order("numero_motor");
      if (moErr) throw moErr;

      setCapacidad(await cargarCapacidadColor());

      const { data: ultimoOrden } = await supabase
        .from("motocarros")
        .select("orden_armado")
        .order("orden_armado", { ascending: false })
        .limit(1);

      const chasisMotocarro = (chasisData ?? []).filter((c: any) => modelosMotocarro.has(c.modelo));
      // Un chasis retenido / en garantía / no útil sigue en inventario pero no
      // entra al armado: se cuenta aparte para que fábrica sepa por qué falta.
      setDetenidos(chasisMotocarro.filter((c: any) => c.estatus !== "disponible").length);
      setChasis(
        chasisMotocarro
          .filter((c: any) => c.estatus === "disponible")
          .map((c: any) => ({
            id: c.id, numero_chasis: c.numero_chasis, modelo: c.modelo, color: c.color,
            color_original: c.color_original ?? null,
            estatus: c.estatus,
            folio: c.contenedores?.folio_contenedor ?? null,
            incidencia: incMap.get(c.id),
          }))
      );
      setMotores((motorData ?? []).map((m: any) => ({ id: m.id, numero_motor: m.numero_motor, modelo: m.modelo })));
      setOrden((ultimoOrden?.[0]?.orden_armado ?? 0) + 1);
    } catch (e: any) {
      toast.error(explicarError(e, "Error al cargar piezas disponibles"));
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

  useEffect(() => { setColorSel(chasisSel ? normColor(chasisSel.color) : ""); }, [chasisSel]);

  const modelosCoinciden = chasisSel && motorSel ? chasisSel.modelo === motorSel.modelo : true;

  const libresDe = (color: string) =>
    capacidad.get(claveCapacidad(chasisSel?.modelo ?? "", color))?.libres ?? 0;

  const colorPropio = chasisSel ? normColor(chasisSel.color) : "";
  const colorCambia = !!chasisSel && !!colorSel && colorSel !== colorPropio;
  const colorSinJuegos = colorCambia && libresDe(colorSel) <= 0;
  const colorVin = chasisSel ? normColor(chasisSel.color_original ?? chasisSel.color) : "";

  const guardar = async () => {
    if (!chasisSel || !motorSel) { toast.error("Selecciona un chasis y un motor"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("configurar_unidad", {
      _chasis_id: chasisSel.id, _motor_id: motorSel.id, _orden: orden,
      _color: colorCambia ? colorSel : undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { ok?: boolean; orden_armado?: number; modelos_coinciden?: boolean; color_cambiado?: boolean; color?: string; color_vin?: string } | null;
    if (r?.color_cambiado) {
      toast.info(`Unidad #${r?.orden_armado} armada en ${r?.color} — el VIN decía ${r?.color_vin}. Queda registrado.`);
    }
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
    setCapacidad(await cargarCapacidadColor());
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
                    <div className="font-mono font-semibold flex items-center gap-2">
                      {c.numero_chasis}
                      {c.incidencia && (
                        <span className="text-[10px] font-sans px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#D97706]/30">
                          {c.incidencia.folio}{c.incidencia.parte_afectada ? ` · ${c.incidencia.parte_afectada}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{displayFabrica(c.modelo, catalogo)} · {c.color} · {c.folio ?? "sin contenedor"}</div>
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
                    <div className="text-xs text-muted-foreground">{displayFabrica(m.modelo, catalogo)}</div>
                  </button>
                ))}
                {!loading && motoresFiltrados.length === 0 && <div className="p-4 text-sm text-center text-muted-foreground">Sin motores disponibles</div>}
              </div>
            </div>
          </div>

          {detenidos > 0 && (
            <div className="rounded-lg p-3 flex items-start gap-2 bg-[#FEE2E2] text-[#991B1B] text-sm">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                {detenidos} chasis están detenidos por una incidencia (retenidos, en garantía o no útiles).
                Siguen en inventario, pero no entran al armado hasta resolverse.
              </span>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => { setOpen(false); nav("/incidencias"); }}>
                Ver incidencias
              </Button>
            </div>
          )}

          {chasisSel && !chasisSel.incidencia && (
            <button
              type="button"
              onClick={() => setReportar(chasisSel)}
              className="self-start text-sm text-[#C0392B] hover:underline inline-flex items-center gap-1.5"
            >
              <TriangleAlert className="h-4 w-4" />
              El chasis {chasisSel.numero_chasis} llegó con una falla — levantar reporte
            </button>
          )}

          {chasisSel?.incidencia && (
            <div className="rounded-lg p-3 flex items-start gap-2 bg-[#FEF3C7] text-[#92400E] text-sm">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              Este chasis trae el reporte {chasisSel.incidencia.folio} abierto
              {chasisSel.incidencia.parte_afectada ? ` (${chasisSel.incidencia.parte_afectada})` : ""}.
              Se puede configurar: el reporte viaja con la unidad para darle seguimiento.
            </div>
          )}

          {!modelosCoinciden && (
            <div className="rounded-lg p-3 flex items-center gap-2 bg-[#FEF3C7] text-[#92400E] text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              El chasis es {chasisSel?.modelo} y el motor {motorSel?.modelo} — verifica que sean compatibles.
            </div>
          )}

          {chasisSel && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Palette className="h-4 w-4" /> Color con el que se arma
                {colorVin !== colorPropio && (
                  <span className="text-xs font-normal text-muted-foreground">(el VIN decía {colorVin})</span>
                )}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[colorPropio, ...COLORES.filter(c => c !== colorPropio)].map(c => {
                  const libres = libresDe(c);
                  const propio = c === colorPropio;
                  const activo = colorSel === c;
                  const agotado = !propio && libres <= 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={agotado}
                      onClick={() => setColorSel(c)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border ${
                        activo ? "bg-[#1F3864] text-white border-[#1F3864]"
                        : agotado ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-700 hover:border-[#2E75B6]"}`}
                      title={propio ? "El color que trae el chasis"
                        : agotado ? `No quedan juegos ${c} libres de este modelo`
                        : `${libres} juego(s) ${c} libres`}
                    >
                      {c}{propio ? " · del chasis" : ` · ${libres}`}
                    </button>
                  );
                })}
              </div>
              {colorCambia && !colorSinJuegos && (
                <p className="text-xs text-[#92400E]">
                  Se va a usar un juego de piezas {colorSel}; queda registrado que el VIN decía {colorVin}.
                </p>
              )}
              {colorSinJuegos && (
                <p className="text-xs text-[#991B1B]">
                  No quedan juegos {colorSel} libres. Intercambia el color con otro chasis desde
                  Inventario → Chasis, o registra las piezas extra que llegaron.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Label className="shrink-0">Orden de armado</Label>
            <Input type="number" min={1} className="h-10 w-32" value={orden} onChange={e => setOrden(Number(e.target.value))} />
          </div>

          <DialogFooter>
            <Button onClick={guardar} disabled={busy || !chasisSel || !motorSel || colorSinJuegos} className="h-12 bg-[#065F46] hover:bg-[#054c38]">
              <CheckCircle2 className="h-5 w-5 mr-2" /> {busy ? "Guardando…" : "Configurar unidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportarIncidencia
        chasis={reportar ? { ...reportar, motocarro_id: null } : null}
        open={!!reportar}
        onOpenChange={o => { if (!o) setReportar(null); }}
        onDone={() => { setReportar(null); setChasisSel(null); load(); }}
      />
    </>
  );
}
