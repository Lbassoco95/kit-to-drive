import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fdb } from "@/lib/finanzasDb";
import { documentarContenedor } from "@/lib/recepcionInventarioApi";
import { lineasDeUnidades } from "@/lib/recepcionInventario";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PackagePlus, Trash2, ClipboardPaste, KeyboardIcon, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Upload, FileSpreadsheet, Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { parseContenedoresExcel, ContainerSheetData, ContenedorFromExcel } from "@/lib/excelParser";
import { COLORES, explicarError, normColor, normSerial } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";
import type { Translations } from "@/i18n/es";

type Unidad = { ns_chasis: string; ns_motor: string; chasis_asignado?: string };

type RecepcionReport = {
  folio: string;
  chasis_insertados: number;
  chasis_actualizados: number;
  chasis_invalidos: number;
  motores_insertados: number;
  motores_actualizados: number;
  motores_invalidos: number;
  documento?: string;
  faltantes?: number;
};

type CompraAbierta = { id: string; folio: string; estatus: string };

type RpcResult = { ok: boolean; error?: string; creados?: number; insertados?: number; actualizados?: number; invalidos?: number };

// El esquema se arma con el diccionario para que el mensaje de validación
// salga en el idioma activo.
const cabeceraSchema = (t: Translations) => z.object({
  folio_contenedor: z.string().trim().min(1, t.componentes.recibirContenedor.folioRequerido).max(50),
  fecha_arribo: z.string().min(1, t.componentes.recibirContenedor.fechaRequerida),
  modelo: z.string().trim().min(1).max(50),
  color: z.enum(COLORES),
  cantidad: z.coerce.number().int().min(1).max(500),
});

const NS_REGEX = /^[A-Z0-9-]{4,30}$/;

export function RecibirContenedor({ onDone }: { onDone?: () => void }) {
  const { t } = useLang();
  const c = t.componentes.recibirContenedor;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [tab, setTab] = useState<"manual" | "pegar" | "excel">("manual");
  const [busy, setBusy] = useState(false);

  const [cab, setCab] = useState({ folio_contenedor: "", fecha_arribo: new Date().toISOString().slice(0,10), modelo: "200cc 2025", color: "BLANCO" as const, cantidad: 4 });
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedContenedores, setParsedContenedores] = useState<ContenedorFromExcel[]>([]);
  const [parsedContainerSheets, setParsedContainerSheets] = useState<ContainerSheetData[]>([]);
  const [importMode, setImportMode] = useState<"single" | "multiple">("single");
  const [reportes, setReportes] = useState<RecepcionReport[]>([]);
  const [compraId, setCompraId] = useState("");
  const [comprasAbiertas, setComprasAbiertas] = useState<CompraAbierta[]>([]);

  const reset = () => { setStep(1); setCab({ folio_contenedor: "", fecha_arribo: new Date().toISOString().slice(0,10), modelo: "200cc 2025", color: "BLANCO", cantidad: 4 }); setUnidades([]); setPasteText(""); setTab("manual"); setExcelFile(null); setParsedContenedores([]); setParsedContainerSheets([]); setImportMode("single"); setReportes([]); setCompraId(""); };

  useEffect(() => {
    if (!open) return;
    fdb.from("compras").select("id, folio, estatus").order("created_at", { ascending: false }).limit(100)
      .then(({ data }: { data: CompraAbierta[] | null }) => setComprasAbiertas(data ?? []));
  }, [open]);

  const irPaso2 = () => {
    if (importMode === "multiple") {
      // For multiple containers, skip to import
      importarContenedoresExcel();
      return;
    }

    const r = cabeceraSchema(t).safeParse(cab);
    if (!r.success) { toast.error(r.error.issues[0].message); return; }
    setUnidades(Array.from({ length: r.data.cantidad }, () => ({ ns_chasis: "", ns_motor: "", chasis_asignado: "" })));
    setStep(2);
  };

  const parsePegado = () => {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out: Unidad[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,;|]+/).map(s => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      out.push({ ns_chasis: (parts[0] || "").toUpperCase(), ns_motor: (parts[1] || "").toUpperCase(), chasis_asignado: (parts[2] || "").toUpperCase() });
    }
    if (!out.length) { toast.error(c.sinFilas); return; }
    setUnidades(out);
    setCab(c => ({ ...c, cantidad: out.length }));
    toast.success(c.filasCargadas(out.length));
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const containerSheets = await parseContenedoresExcel(file);

      if (containerSheets.length === 0) {
        toast.error(c.sinHojas);
        setBusy(false);
        return;
      }

      setParsedContainerSheets(containerSheets);
      setExcelFile(file);

      const totalChasis = containerSheets.reduce((sum, sheet) => sum + sheet.chasis.length, 0);
      const totalMotores = containerSheets.reduce((sum, sheet) => sum + sheet.motores.length, 0);

      toast.success(c.okDetectados(containerSheets.length, totalChasis, totalMotores));
    } catch (error) {
      console.error("Error parsing containers Excel:", error);
      toast.error(c.errorExcel);
    } finally {
      setBusy(false);
    }
  };

  const importarContenedoresExcel = async () => {
    if (parsedContainerSheets.length === 0) {
      toast.error(c.sinContenedores);
      return;
    }

    setBusy(true);
    try {
      const reportesRecepcion: RecepcionReport[] = [];

      for (const sheet of parsedContainerSheets) {
        if (sheet.chasis.length !== sheet.motores.length) {
          toast.info(c.desbalance(sheet.folio_contenedor, sheet.chasis.length, sheet.motores.length));
        }

        // Create container record
        const { data: containerData, error: containerError } = await supabase
          .from("contenedores")
          .insert({
            folio_contenedor: sheet.folio_contenedor.trim(),
            fecha_arribo: new Date().toISOString().slice(0, 10),
            modelo_default: sheet.modelo,
            total_unidades: 0,
            total_chasis: sheet.chasis.length,
            total_motores: sheet.motores.length,
          })
          .select()
          .single();

        let containerId = containerData?.id ?? null;
        if (containerError) {
          const { data: existente } = await supabase
            .from("contenedores")
            .select("id")
            .eq("folio_contenedor", sheet.folio_contenedor.trim())
            .maybeSingle();
          if (!existente) {
            toast.error(c.errorContenedor(sheet.folio_contenedor || c.sinFolio, containerError.message));
            continue;
          }
          containerId = existente.id;
        }

        const reporte: RecepcionReport = {
          folio: sheet.folio_contenedor,
          chasis_insertados: 0, chasis_actualizados: 0, chasis_invalidos: 0,
          motores_insertados: 0, motores_actualizados: 0, motores_invalidos: 0,
        };
        let huboError = false;

        // Import chassis if present
        if (sheet.chasis.length > 0) {
          const { data: chassisData, error: chassisError } = await supabase.rpc("importar_vins_inventario", {
            _contenedor_id: containerId,
            _folio_contenedor: sheet.folio_contenedor.trim(),
            _modelo: sheet.modelo,
            _vins: sheet.chasis.map(c => ({ numero_chasis: normSerial(c.numero_chasis), color: normColor(c.color), modelo: c.modelo })),
          });

          if (chassisError) {
            toast.error(c.errorChasis(sheet.folio_contenedor, chassisError.message));
            huboError = true;
          } else if (!(chassisData as RpcResult | null)?.ok) {
            toast.error(c.errorChasis(sheet.folio_contenedor, (chassisData as RpcResult | null)?.error ?? c.noImporto));
            huboError = true;
          } else {
            const r = chassisData as RpcResult;
            reporte.chasis_insertados = r.insertados ?? 0;
            reporte.chasis_actualizados = r.actualizados ?? 0;
            reporte.chasis_invalidos = r.invalidos ?? 0;
          }
        }

        // Import motors if present
        if (sheet.motores.length > 0) {
          const { data: motorsData, error: motorsError } = await supabase.rpc("importar_motores_inventario", {
            _contenedor_id: containerId,
            _modelo: sheet.modelo,
            _motores: sheet.motores.map(m => ({ numero_motor: normSerial(m.numero_motor), modelo: m.modelo || sheet.modelo })),
          });

          if (motorsError) {
            toast.error(c.errorMotores(sheet.folio_contenedor, motorsError.message));
            huboError = true;
          } else if (!(motorsData as RpcResult | null)?.ok) {
            toast.error(c.errorMotores(sheet.folio_contenedor, (motorsData as RpcResult | null)?.error ?? c.noImporto));
            huboError = true;
          } else {
            const r = motorsData as RpcResult;
            reporte.motores_insertados = r.insertados ?? 0;
            reporte.motores_actualizados = r.actualizados ?? 0;
            reporte.motores_invalidos = r.invalidos ?? 0;
          }
        }

        if (huboError) continue;

        if (containerId) {
          const doc = await documentarContenedor({
            contenedorId: containerId,
            compraId: compraId || null,
            origen: "excel",
          });
          if (doc.ok === false) toast.error(explicarError(doc.error, c.errorDocumento));
          else {
            reporte.documento = doc.folio;
            reporte.faltantes = doc.faltantes;
          }
        }
        reportesRecepcion.push(reporte);
      }

      setReportes(reportesRecepcion);

      const totalChasisRecibidos = reportesRecepcion.reduce((a, r) => a + r.chasis_insertados + r.chasis_actualizados, 0);
      const totalMotoresRecibidos = reportesRecepcion.reduce((a, r) => a + r.motores_insertados + r.motores_actualizados, 0);

      toast.success(c.okRecibidos(reportesRecepcion.length, totalChasisRecibidos, totalMotoresRecibidos));

      setStep(4);
    } catch (error) {
      console.error("Error importing containers:", error);
      toast.error(c.errorImportar);
    } finally {
      setBusy(false);
    }
  };

  const validacion = useMemo(() => {
    const errs: { idx: number; campo: string; msg: string }[] = [];
    const chasisCount = new Map<string, number>();
    const motorCount = new Map<string, number>();
    unidades.forEach((u, i) => {
      const ch = u.ns_chasis.trim().toUpperCase();
      const mo = u.ns_motor.trim().toUpperCase();
      if (!ch) errs.push({ idx: i, campo: "ns_chasis", msg: c.errVacio });
      else if (!NS_REGEX.test(ch)) errs.push({ idx: i, campo: "ns_chasis", msg: c.errFormato });
      if (!mo) errs.push({ idx: i, campo: "ns_motor", msg: c.errVacio });
      else if (!NS_REGEX.test(mo)) errs.push({ idx: i, campo: "ns_motor", msg: c.errFormato });
      if (ch) chasisCount.set(ch, (chasisCount.get(ch) ?? 0) + 1);
      if (mo) motorCount.set(mo, (motorCount.get(mo) ?? 0) + 1);
    });
    unidades.forEach((u, i) => {
      const ch = u.ns_chasis.trim().toUpperCase();
      const mo = u.ns_motor.trim().toUpperCase();
      if (ch && (chasisCount.get(ch) ?? 0) > 1) errs.push({ idx: i, campo: "ns_chasis", msg: c.errDuplicado });
      if (mo && (motorCount.get(mo) ?? 0) > 1) errs.push({ idx: i, campo: "ns_motor", msg: c.errDuplicado });
    });
    return errs;
  }, [unidades, c]);

  const errIdx = (i: number, campo: string) => validacion.find(e => e.idx === i && e.campo === campo);

  const updateUnidad = (i: number, patch: Partial<Unidad>) => {
    setUnidades(prev => prev.map((u, idx) => idx === i ? { ...u, ...patch } : u));
  };

  const guardar = async () => {
    if (validacion.length) { toast.error(c.hayErrores(validacion.length)); return; }
    setBusy(true);
    const payload = unidades.map(u => ({
      ns_chasis: u.ns_chasis.trim().toUpperCase(),
      ns_motor: u.ns_motor.trim().toUpperCase(),
      chasis_asignado: (u.chasis_asignado ?? "").trim().toUpperCase() || null,
    }));
    const { data, error } = await supabase.rpc("recibir_contenedor", {
      _folio_contenedor: cab.folio_contenedor.trim(),
      _fecha_arribo: cab.fecha_arribo,
      _modelo: cab.modelo,
      _color: cab.color,
      _unidades: payload,
    });
    if (error) { setBusy(false); toast.error(error.message); return; }
    const resultado = data as { creados?: number; contenedor_id?: string } | null;
    let contId = resultado?.contenedor_id ?? null;
    if (!contId) {
      const { data: cont } = await fdb.from("contenedores").select("id").eq("folio_contenedor", cab.folio_contenedor.trim()).maybeSingle();
      contId = (cont as { id?: string } | null)?.id ?? null;
    }
    if (contId) {
      const doc = await documentarContenedor({
        contenedorId: contId,
        compraId: compraId || null,
        origen: "manual",
        lineas: lineasDeUnidades(payload, cab.modelo, cab.color),
      });
      if (doc.ok === false) toast.error(explicarError(doc.error, c.errorDocumento));
      else if (doc.faltantes > 0) toast.success(c.documentoFaltante(doc.folio, doc.faltantes));
      else toast.success(c.documentoOk(doc.folio));
    }
    setBusy(false);
    toast.success(c.okRecibido(resultado?.creados ?? unidades.length));
    setOpen(false); reset(); onDone?.();
  };

  const copyReport = () => {
    const text = reportes.map(r =>
      `${r.folio}\n` +
      `  Chasis: ${r.chasis_insertados} insertados, ${r.chasis_actualizados} actualizados, ${r.chasis_invalidos} inválidos\n` +
      `  Motores: ${r.motores_insertados} insertados, ${r.motores_actualizados} actualizados, ${r.motores_invalidos} inválidos\n`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success(c.reporteCopiado));
  };

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }} className="h-12 bg-[#065F46] hover:bg-[#054c38] text-white font-semibold">
        <PackagePlus className="h-5 w-5 mr-2" /> {c.boton}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <PackagePlus className="h-6 w-6 text-[#065F46]" />
              {c.titulo(step)}
            </DialogTitle>
            <DialogDescription>
              {step === 1 && c.paso1}
              {step === 2 && c.paso2}
              {step === 3 && c.paso3}
              {step === 4 && c.paso4}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center justify-between px-2">
            {[1,2,3,4].map(s => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? "bg-[#065F46] text-white" : "bg-slate-200 text-slate-500"}`}>{s}</div>
                {s < 4 && <div className={`flex-1 h-1 mx-2 rounded ${step > s ? "bg-[#065F46]" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4 mt-4">
              <Tabs value={importMode} onValueChange={v => setImportMode(v as "single" | "multiple")} className="w-full">
                <TabsList className="grid grid-cols-2 h-12">
                  <TabsTrigger value="single" className="text-base"><KeyboardIcon className="h-4 w-4 mr-2" />{c.capturarManual}</TabsTrigger>
                  <TabsTrigger value="multiple" className="text-base"><FileSpreadsheet className="h-4 w-4 mr-2" />{c.importarContenedores}</TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>{c.folio}</Label>
                      <Input value={cab.folio_contenedor} onChange={e => setCab({ ...cab, folio_contenedor: e.target.value })} placeholder="CONT-2026-001" maxLength={50} className="h-12" />
                    </div>
                    <div>
                      <Label>{c.fechaArribo}</Label>
                      <Input type="date" value={cab.fecha_arribo} onChange={e => setCab({ ...cab, fecha_arribo: e.target.value })} className="h-12" />
                    </div>
                    <div>
                      <Label>{c.modelo}</Label>
                      <Input value={cab.modelo} onChange={e => setCab({ ...cab, modelo: e.target.value })} maxLength={50} className="h-12" />
                    </div>
                    <div>
                      <Label>{c.color}</Label>
                      <select value={cab.color} onChange={e => setCab({ ...cab, color: e.target.value as typeof cab.color })} className="h-12 w-full rounded-md border border-input bg-background px-3 text-base">
                        {COLORES.map(col => <option key={col} value={col}>{t.colors[col]}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>{c.cantidad}</Label>
                      <Input type="number" min={1} max={500} value={cab.cantidad} onChange={e => setCab({ ...cab, cantidad: Number(e.target.value) })} className="h-12" />
                      <p className="text-xs text-muted-foreground mt-1">{c.cantidadAyuda}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="multiple" className="space-y-4 mt-4">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-sm font-medium mb-2">{c.importarExcel}</p>
                    <p className="text-xs text-muted-foreground mb-4">{c.importarExcelAyuda}</p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      disabled={busy}
                      className="max-w-xs mx-auto"
                    />
                    {busy && <p className="text-xs text-muted-foreground mt-2">{c.procesando}</p>}
                  </div>

                  {parsedContainerSheets.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                      <p className="font-medium">{c.detectados}</p>
                      {parsedContainerSheets.map((sheet, i) => (
                        <div key={i} className="border rounded-lg p-3 bg-white">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-[#1F3864]">{sheet.folio_contenedor}</span>
                            <span className={`px-2 py-1 rounded-full text-xs ${sheet.tipo === 'chasis' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {sheet.tipo === 'chasis' ? c.chasis : c.motores}
                            </span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div>{c.modeloLbl(sheet.modelo)}</div>
                            <div>{c.cantidadLbl(sheet.tipo === 'chasis' ? sheet.chasis.length : sheet.motores.length)}</div>
                          </div>
                          {sheet.chasis.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-medium mb-1">{c.primerosChasis}</p>
                              <ul className="text-xs space-y-0.5">
                                {sheet.chasis.slice(0, 5).map((vin, j) => (
                                  <li key={j} className="font-mono">{vin.numero_chasis} ({vin.color})</li>
                                ))}
                                {sheet.chasis.length > 5 && <li className="text-muted-foreground">{c.yMas(sheet.chasis.length - 5)}</li>}
                              </ul>
                            </div>
                          )}
                          {sheet.motores.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-medium mb-1">{c.primerosMotores}</p>
                              <ul className="text-xs space-y-0.5">
                                {sheet.motores.slice(0, 5).map((motor, j) => (
                                  <li key={j} className="font-mono">{motor.numero_motor} ({motor.modelo || 'N/A'})</li>
                                ))}
                                {sheet.motores.length > 5 && <li className="text-muted-foreground">{c.yMas(sheet.motores.length - 5)}</li>}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              <div>
                <Label>{c.compra}</Label>
                <select value={compraId} onChange={e => setCompraId(e.target.value)} className="h-12 w-full rounded-md border border-input bg-background px-3 text-base">
                  <option value="">{c.sinCompra}</option>
                  {comprasAbiertas.map(co => (
                    <option key={co.id} value={co.id}>{co.folio} · {co.estatus}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">{c.compraAyuda}</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <Tabs value={tab} onValueChange={v => setTab(v as "manual" | "pegar")} className="mt-2">
              <TabsList className="grid grid-cols-2 h-12">
                <TabsTrigger value="manual" className="text-base"><KeyboardIcon className="h-4 w-4 mr-2" />{c.capturarUnoAUno}</TabsTrigger>
                <TabsTrigger value="pegar" className="text-base"><ClipboardPaste className="h-4 w-4 mr-2" />{c.pegarExcel}</TabsTrigger>
              </TabsList>

              <TabsContent value="pegar" className="space-y-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  {c.pegarAyuda1} <strong>{c.pegarNsChasis}</strong> {c.pegarY} <strong>{c.pegarNsMotor}</strong> {c.pegarAyuda2}
                </p>
                <Textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={10} className="font-mono text-sm" placeholder={"LXYJCML50P0000001\tHJ200FMI000001\nLXYJCML50P0000002\tHJ200FMI000002"} />
                <Button onClick={parsePegado} variant="outline" className="h-11"><ClipboardPaste className="h-4 w-4 mr-2" />{c.procesarPegado}</Button>
              </TabsContent>

              <TabsContent value="manual" className="mt-4" />

              {/* Tabla de captura — visible siempre que haya unidades */}
              {unidades.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-medium">{c.resumenUnidades(unidades.length)} {validacion.length === 0 ? <span className="text-[#065F46]">{c.sinErrores}</span> : <span className="text-[#C0392B]">{c.conErrores(validacion.length)}</span>}</p>
                    <Button size="sm" variant="outline" onClick={() => setUnidades(prev => [...prev, { ns_chasis: "", ns_motor: "", chasis_asignado: "" }])}>{c.agregarFila}</Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left w-12">#</th>
                          <th className="px-2 py-2 text-left">{c.colNsChasis}</th>
                          <th className="px-2 py-2 text-left">{c.colNsMotor}</th>
                          <th className="px-2 py-2 text-left">{c.colChasisComercial}</th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {unidades.map((u, i) => {
                          const eCh = errIdx(i, "ns_chasis"); const eMo = errIdx(i, "ns_motor");
                          return (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1 text-muted-foreground">{i+1}</td>
                              <td className="px-2 py-1">
                                <Input value={u.ns_chasis} onChange={e => updateUnidad(i, { ns_chasis: e.target.value.toUpperCase() })}
                                  className={`h-10 font-mono text-xs ${eCh ? "border-[#C0392B] bg-[#FEE2E2]" : ""}`} maxLength={30} />
                                {eCh && <span className="text-[10px] text-[#C0392B]">{eCh.msg}</span>}
                              </td>
                              <td className="px-2 py-1">
                                <Input value={u.ns_motor} onChange={e => updateUnidad(i, { ns_motor: e.target.value.toUpperCase() })}
                                  className={`h-10 font-mono text-xs ${eMo ? "border-[#C0392B] bg-[#FEE2E2]" : ""}`} maxLength={30} />
                                {eMo && <span className="text-[10px] text-[#C0392B]">{eMo.msg}</span>}
                              </td>
                              <td className="px-2 py-1">
                                <Input value={u.chasis_asignado ?? ""} onChange={e => updateUnidad(i, { chasis_asignado: e.target.value.toUpperCase() })}
                                  className="h-10 font-mono text-xs" maxLength={30} />
                              </td>
                              <td className="px-1">
                                <Button size="icon" variant="ghost" onClick={() => setUnidades(prev => prev.filter((_, idx) => idx !== i))}>
                                  <Trash2 className="h-4 w-4 text-[#C0392B]" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Tabs>
          )}

          {step === 3 && (
            <div className="space-y-3 mt-4">
              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">{c.resumenFolio}</div><div className="font-bold">{cab.folio_contenedor}</div></div>
                <div><div className="text-muted-foreground">{c.resumenArribo}</div><div className="font-bold">{cab.fecha_arribo}</div></div>
                <div><div className="text-muted-foreground">{c.resumenModelo}</div><div className="font-bold">{cab.modelo}</div></div>
                <div><div className="text-muted-foreground">{c.resumenColor}</div><div className="font-bold">{t.colors[cab.color]}</div></div>
              </div>
              <div className={`rounded-lg p-4 flex items-center gap-3 ${validacion.length === 0 ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"}`}>
                {validacion.length === 0 ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                <div>
                  <div className="font-bold text-lg">{c.seCrearan(unidades.length)}</div>
                  <div className="text-sm">{validacion.length === 0 ? c.listoConfirmar : c.corrigeErrores(validacion.length)}</div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{c.reporteRecepcion}</h3>
                <Button size="sm" variant="outline" onClick={copyReport}><Copy className="h-4 w-4 mr-2" />{c.copiarReporte}</Button>
              </div>
              <div className="space-y-3">
                {reportes.map((r, i) => (
                  <div key={i} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-[#1F3864]">{r.folio}</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div><strong>{c.chasisLinea}</strong> {r.chasis_insertados} {c.insertados} · {r.chasis_actualizados} {c.actualizados}{r.chasis_invalidos > 0 && <span className="text-amber-700"> · {r.chasis_invalidos} {c.invalidos}</span>}</div>
                      <div><strong>{c.motoresLinea}</strong> {r.motores_insertados} {c.insertados} · {r.motores_actualizados} {c.actualizados}{r.motores_invalidos > 0 && <span className="text-amber-700"> · {r.motores_invalidos} {c.invalidos}</span>}</div>
                      {r.documento && <div><strong>{r.documento}</strong>{(r.faltantes ?? 0) > 0 && <span className="text-amber-700"> · {c.documentoFaltante(r.documento, r.faltantes ?? 0)}</span>}</div>}
                    </div>
                  </div>
                ))}
                {reportes.length === 0 && (
                  <div className="text-center text-muted-foreground">{c.sinReportes}</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step > 1 && step < 4 && <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3)} className="h-12"><ArrowLeft className="h-4 w-4 mr-2" />{c.atras}</Button>}
            {step === 1 && importMode === "single" && <Button onClick={irPaso2} className="h-12 bg-[#1F3864]">{c.siguiente}<ArrowRight className="h-4 w-4 ml-2" /></Button>}
            {step === 1 && importMode === "multiple" && <Button onClick={irPaso2} disabled={busy || parsedContainerSheets.length === 0} className="h-12 bg-[#065F46]"><FileSpreadsheet className="h-5 w-5 mr-2" />{busy ? c.procesando : c.importarN(parsedContainerSheets.length, parsedContainerSheets.reduce((a,s)=>a+s.chasis.length,0), parsedContainerSheets.reduce((a,s)=>a+s.motores.length,0))}</Button>}
            {step === 2 && <Button onClick={() => setStep(3)} disabled={!unidades.length} className="h-12 bg-[#1F3864]">{c.revisar}<ArrowRight className="h-4 w-4 ml-2" /></Button>}
            {step === 3 && <Button onClick={guardar} disabled={busy || validacion.length > 0} className="h-12 bg-[#065F46]"><CheckCircle2 className="h-5 w-5 mr-2" />{busy ? c.guardando : c.crearN(unidades.length)}</Button>}
            {step === 4 && <Button onClick={() => { setOpen(false); reset(); onDone?.(); }} className="h-12 bg-[#065F46]"><CheckCircle2 className="h-5 w-5 mr-2" />{t.actions.close}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
