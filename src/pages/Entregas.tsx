import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { fmtDate, normColor, explicarError } from "@/lib/dazon";
import { esPagoCredito, faltaRegistrarPaqueteria, validarRegistroPaqueteria } from "@/lib/entregaCredito";
import { EstatusBadge } from "@/components/EstatusBadge";
import { Bike, Truck, Calendar, CheckCircle, Package } from "lucide-react";
import { toast } from "sonner";

type Filter = "PENDIENTES" | "PROGRAMADAS_HOY" | "ENTREGADAS_HOY";

const pendienteDeEntrega = (estatus: string) =>
  estatus === "NO_APLICA" || estatus === "PROGRAMADA" || estatus === "EN_RUTA";

export default function Entregas() {
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("PENDIENTES");
  const [scheduling, setScheduling] = useState<any | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [paqueteria, setPaqueteria] = useState("");
  const [guia, setGuia] = useState("");
  const [guardando, setGuardando] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("motocarros")
      .select("*, remisiones(folio_remision, tipo_pago, pagado, clientes(codigo_erp,folio_interno,nombre_comercial), profiles:vendedor_id(nombre_completo))")
      .in("estatus_armado", ["ARMADO", "LISTO"])
      .not("chasis_asignado", "is", null)
      .order("orden_armado");
    setRows((data ?? []).map((r: any) => ({ ...r, color: normColor(r.color) })));
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from("motocarros").update(patch).eq("id", id);
    if (error) toast.error(explicarError(error, error.message)); else { toast.success(t.produccion.toastOk); load(); }
  };

  const today = new Date().toISOString().slice(0,10);
  const counts = useMemo(() => ({
    PENDIENTES: rows.filter(r => pendienteDeEntrega(r.estatus_entrega)).length,
    PROGRAMADAS_HOY: rows.filter(r => pendienteDeEntrega(r.estatus_entrega) && r.estatus_entrega !== "NO_APLICA" && r.fecha_estimada_entrega === today).length,
    ENTREGADAS_HOY: rows.filter(r => r.estatus_entrega === "ENTREGADA" && r.fecha_real_entrega === today).length,
  }), [rows, today]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filter === "PENDIENTES") return pendienteDeEntrega(r.estatus_entrega);
    if (filter === "PROGRAMADAS_HOY") return pendienteDeEntrega(r.estatus_entrega) && r.estatus_entrega !== "NO_APLICA" && r.fecha_estimada_entrega === today;
    return r.estatus_entrega === "ENTREGADA" && r.fecha_real_entrega === today;
  }), [rows, filter, today]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "PENDIENTES", label: t.entregas.filtros.pendientes },
    { key: "PROGRAMADAS_HOY", label: t.entregas.filtros.programadasHoy },
    { key: "ENTREGADAS_HOY", label: t.entregas.filtros.entregadasHoy },
  ];

  const abrirPaqueteria = (r: any) => {
    setScheduling({ ...r, modo: "paqueteria" });
    setDate(r.fecha_estimada_entrega || today);
    setPaqueteria(r.paqueteria || "");
    setGuia(r.numero_guia || "");
  };

  const guardarPaqueteria = async () => {
    if (!scheduling) return;
    const error = validarRegistroPaqueteria({ paqueteria, fechaEstimada: date });
    if (error === "paqueteria") return toast.error(t.entregas.faltaPaqueteria);
    if (error === "fecha") return toast.error(t.entregas.faltaFecha);
    setGuardando(true);
    const { error: rpcError } = await supabase.rpc("registrar_paqueteria", {
      _motocarro_id: scheduling.id,
      _paqueteria: paqueteria.trim(),
      _numero_guia: guia.trim(),
      _fecha_estimada: date,
    });
    setGuardando(false);
    if (rpcError) return toast.error(explicarError(rpcError, rpcError.message));
    toast.success(t.entregas.paqueteriaOk);
    setScheduling(null);
    load();
  };

  const confirmarCredito = async (id: string) => {
    const { error } = await supabase.rpc("confirmar_entrega_credito", { _motocarro_id: id });
    if (error) toast.error(explicarError(error, error.message));
    else { toast.success(t.entregas.entregaAvisada); load(); }
  };

  return (
    <div className="space-y-5">
      <div><h1>{t.entregas.title}</h1><p className="text-muted-foreground text-base mt-1">{t.entregas.subtitle}</p></div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`min-h-[48px] px-5 rounded-full font-semibold text-base border-2 transition-all ${active ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#1F3864] border-[#2E75B6]/30 hover:border-[#2E75B6]"}`}>
              {f.label} <span className={`ml-2 px-2 py-0.5 rounded-full text-sm ${active ? "bg-white/20" : "bg-[#2E75B6]/10"}`}>{(counts as any)[f.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="responsive-card-grid gap-4">
        {filtered.map(r => {
          const colorBike = r.color === "AZUL" ? "#2E75B6" : "#94A3B8";
          const colorBg = r.color === "AZUL" ? "#DBEAFE" : "#F1F5F9";
          const credito = esPagoCredito(r.remisiones?.tipo_pago);
          const pagoPendiente = r.remisiones?.tipo_pago === "contra_entrega" && !r.remisiones?.pagado;
          const sinPaqueteria = credito && faltaRegistrarPaqueteria(r);
          const enCamino = credito && !sinPaqueteria && r.estatus_entrega !== "ENTREGADA";
          return (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              <div className="p-4 flex items-center gap-3" style={{ background: colorBg }}>
                <div className="p-2.5 rounded-lg bg-white/70"><Bike size={36} color={colorBike} strokeWidth={2}/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">{t.fields.chasis}</div>
                  <div className="text-xl font-bold text-[#1F3864] truncate">{r.chasis_asignado || `#${r.orden_armado}`}</div>
                </div>
                <EstatusBadge estatus={r.estatus_entrega} size="sm" />
              </div>
              <div className="p-4 space-y-2 flex-1">
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">{t.entregas.ns_chasis}</div>
                  <div className="font-mono text-sm">{r.ns_chasis || "—"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">{t.entregas.ns_motor}</div>
                  <div className="font-mono text-sm">{r.ns_motor || "—"}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">👤 {r.remisiones?.clientes?.codigo_erp || r.remisiones?.clientes?.folio_interno || "—"}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">📄 {r.remisiones?.folio_remision || "—"}</span>
                  {credito && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-100 text-indigo-800 text-xs font-semibold">
                      {t.pago.credito}
                    </span>
                  )}
                  {pagoPendiente && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">
                      {t.pago.pendiente}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-1">Vendedor: <strong className="text-foreground">{r.remisiones?.profiles?.nombre_completo || "—"}</strong></div>
                {credito && <div className="text-xs text-indigo-800">{t.entregas.creditoNota}</div>}
                {r.paqueteria && (
                  <div className="text-xs">
                    {t.entregas.paqueteria}: <strong>{r.paqueteria}</strong>
                    {r.numero_guia ? <> · {t.entregas.guia} <strong>{r.numero_guia}</strong></> : null}
                  </div>
                )}
                {r.fecha_estimada_entrega && <div className="text-xs">{t.entregas.fechaEstimada} <strong>{fmtDate(r.fecha_estimada_entrega)}</strong></div>}
                {r.fecha_real_entrega && <div className="text-xs">{t.entregas.fechaReal} <strong>{fmtDate(r.fecha_real_entrega)}</strong></div>}
                {credito && r.cliente_avisado_at && (
                  <div className="text-xs text-emerald-700">{t.entregas.clienteAvisado}</div>
                )}
              </div>
              <div className="border-t p-3 space-y-2">
                {pagoPendiente && (
                  <div className="w-full px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium text-center">
                    {t.pago.vendedorDebeConfirmar}
                  </div>
                )}
                {sinPaqueteria && (
                  <Button
                    onClick={() => abrirPaqueteria(r)}
                    className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]"
                  >
                    <Package className="h-5 w-5 mr-2"/> {t.entregas.registrarPaqueteria}
                  </Button>
                )}
                {enCamino && (
                  <Button onClick={() => confirmarCredito(r.id)} className="w-full h-12 text-base bg-[#5B21B6] hover:bg-[#4c1d95]">
                    <Truck className="h-5 w-5 mr-2"/> {t.entregas.confirmarLlegada}
                  </Button>
                )}
                {!credito && r.estatus_entrega === "NO_APLICA" && (
                  <Button
                    disabled={pagoPendiente}
                    onClick={() => { setScheduling({ ...r, modo: "fecha" }); setDate(new Date().toISOString().slice(0,10)); }}
                    className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Calendar className="h-5 w-5 mr-2"/> {t.entregas.programar}
                  </Button>
                )}
                {!credito && (r.estatus_entrega === "PROGRAMADA" || r.estatus_entrega === "EN_RUTA") && (
                  <Button onClick={() => update(r.id, { estatus_entrega: "ENTREGADA", fecha_real_entrega: today })} className="w-full h-12 text-base bg-[#5B21B6] hover:bg-[#4c1d95]">
                    <Truck className="h-5 w-5 mr-2"/> {t.entregas.confirmar}
                  </Button>
                )}
                {r.estatus_entrega === "ENTREGADA" && (
                  <div className="w-full h-12 flex items-center justify-center text-[#5B21B6] font-semibold bg-[#EDE9FE] rounded-md">
                    <CheckCircle className="h-5 w-5 mr-2"/> {t.entregas.entregado}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">{t.entregas.sinResultados}</div>}
      </div>

      <Dialog open={!!scheduling} onOpenChange={o => { if (!o) setScheduling(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {scheduling?.modo === "paqueteria"
                ? t.entregas.dialogPaqueteria(scheduling?.chasis_asignado)
                : t.entregas.dialogTitulo(scheduling?.chasis_asignado)}
            </DialogTitle>
            <DialogDescription>
              {scheduling?.modo === "paqueteria" ? t.entregas.creditoNota : t.entregas.fechaEntrega}
            </DialogDescription>
          </DialogHeader>
          {scheduling?.modo === "paqueteria" ? (
            <div className="space-y-3 py-2">
              <div>
                <Label>{t.entregas.paqueteria}</Label>
                <Input value={paqueteria} onChange={e => setPaqueteria(e.target.value)} placeholder={t.entregas.paqueteriaPlaceholder} className="h-12 text-base" />
              </div>
              <div>
                <Label>{t.entregas.numeroGuia}</Label>
                <Input value={guia} onChange={e => setGuia(e.target.value)} className="h-12 text-base" />
                <p className="text-xs text-muted-foreground mt-1">{t.entregas.guiaOpcional}</p>
              </div>
              <div>
                <Label>{t.entregas.fechaEntrega}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 text-base" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <Label>{t.entregas.fechaEntrega}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 text-base" />
            </div>
          )}
          <DialogFooter>
            {scheduling?.modo === "paqueteria" ? (
              <Button onClick={guardarPaqueteria} disabled={guardando} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                {guardando ? t.actions.loading : t.entregas.registrarPaqueteria}
              </Button>
            ) : (
              <Button onClick={async () => { await update(scheduling.id, { estatus_entrega: "PROGRAMADA", fecha_estimada_entrega: date }); setScheduling(null); }} className="h-12 px-5 text-base">Programar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
