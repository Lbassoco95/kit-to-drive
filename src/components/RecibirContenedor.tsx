import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

type Unidad = { ns_chasis: string; ns_motor: string; chasis_asignado?: string };

type PareoReport = {
  folio: string;
  ok: boolean;
  unidades: number;
  unidades_nuevas: number;
  chasis_recibidos: number;
  motores_recibidos: number;
  chasis_sin_motor: string[];
  motores_sin_chasis: string[];
  completa: boolean;
};

const cabeceraSchema = z.object({
  folio_contenedor: z.string().trim().min(1, "Folio requerido").max(50),
  fecha_arribo: z.string().min(1, "Fecha requerida"),
  modelo: z.string().trim().min(1).max(50),
  color: z.enum(["BLANCO", "AZUL", "ROJO", "NEGRO", "VERDE"]),
  cantidad: z.coerce.number().int().min(1).max(500),
});

const NS_REGEX = /^[A-Z0-9-]{4,30}$/;

export function RecibirContenedor({ onDone }: { onDone?: () => void }) {
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
  const [reportes, setReportes] = useState<PareoReport[]>([]);

  const reset = () => { setStep(1); setCab({ folio_contenedor: "", fecha_arribo: new Date().toISOString().slice(0,10), modelo: "200cc 2025", color: "BLANCO", cantidad: 4 }); setUnidades([]); setPasteText(""); setTab("manual"); setExcelFile(null); setParsedContenedores([]); setParsedContainerSheets([]); setImportMode("single"); setReportes([]); };

  const irPaso2 = () => {
    if (importMode === "multiple") {
      // For multiple containers, skip to import
      importarContenedoresExcel();
      return;
    }

    const r = cabeceraSchema.safeParse(cab); // eslint-disable-line @typescript-eslint/no-explicit-any
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
    if (!out.length) { toast.error("No se detectaron filas. Pega NS_chasis [tab/coma] NS_motor por línea."); return; }
    setUnidades(out);
    setCab(c => ({ ...c, cantidad: out.length }));
    toast.success(`✓ ${out.length} fila(s) cargada(s)`);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const containerSheets = await parseContenedoresExcel(file);

      if (containerSheets.length === 0) {
        toast.error("No se encontraron hojas válidas en el archivo Excel");
        setBusy(false);
        return;
      }

      setParsedContainerSheets(containerSheets);
      setExcelFile(file);

      const totalChasis = containerSheets.reduce((sum, sheet) => sum + sheet.chasis.length, 0);
      const totalMotores = containerSheets.reduce((sum, sheet) => sum + sheet.motores.length, 0);
      const totalUnidadesEsperadas = Math.min(totalChasis, totalMotores);
      const desbalanceados = containerSheets.filter(s => s.chasis.length !== s.motores.length);

      if (desbalanceados.length > 0) {
        toast.warning(`⚠ ${desbalanceados.length} contenedor(es) con chasis ≠ motores`);
      }

      toast.success(`✓ ${containerSheets.length} contenedor(es) detectado(s): ${totalUnidadesEsperadas} unidades esperadas (${totalChasis} chasis / ${totalMotores} motores)`);
    } catch (error) {
      console.error("Error parsing containers Excel:", error);
      toast.error("Error al procesar el archivo Excel. Verifica el formato.");
    } finally {
      setBusy(false);
    }
  };

  const importarContenedoresExcel = async () => {
    if (parsedContainerSheets.length === 0) {
      toast.error("No hay contenedores para importar");
      return;
    }

    setBusy(true);
    try {
      let totalUnidades = 0;
      let totalNuevas = 0;
      const reportesPareo: PareoReport[] = [];

      for (const sheet of parsedContainerSheets) {
        // Validate counts match
        if (sheet.chasis.length !== sheet.motores.length) {
          toast.warning(`${sheet.folio_contenedor}: ${sheet.chasis.length} chasis y ${sheet.motores.length} motores. El pareo quedará incompleto.`);
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

        if (containerError) {
          console.error("Error creating container:", containerError);
          continue;
        }

        const containerId = containerData.id;

        // Import chassis if present
        if (sheet.chasis.length > 0) {
          const { data: chassisData, error: chassisError } = await supabase.rpc("importar_vins_inventario", {
            _contenedor_id: containerId,
            _folio_contenedor: sheet.folio_contenedor.trim(),
            _modelo: sheet.modelo,
            _vins: sheet.chasis.map(c => ({ numero_chasis: c.numero_chasis, color: c.color, modelo: c.modelo })) as any,
          });

          if (chassisError) {
            toast.error(`Chasis ${sheet.folio_contenedor}: ${chassisError.message}`);
            continue;
          }
          if (!(chassisData as any)?.ok) {
            toast.error(`Chasis ${sheet.folio_contenedor}: ${(chassisData as any)?.error ?? 'no se importó'}`);
            continue;
          }
        }

        // Import motors if present
        if (sheet.motores.length > 0) {
          const { data: motorsData, error: motorsError } = await supabase.rpc("importar_motores_inventario", {
            _contenedor_id: containerId,
            _modelo: sheet.modelo,
            _motores: sheet.motores.map(m => ({ numero_motor: m.numero_motor, modelo: m.modelo || sheet.modelo })) as any,
          });

          if (motorsError) {
            toast.error(`Motores ${sheet.folio_contenedor}: ${motorsError.message}`);
            continue;
          }
          if (!(motorsData as any)?.ok) {
            toast.error(`Motores ${sheet.folio_contenedor}: ${(motorsData as any)?.error ?? 'no se importó'}`);
            continue;
          }
        }

        // Parear unidades
        const { data: pareo, error: pareoErr } = await supabase.rpc("parear_unidades_contenedor", {
          _contenedor_id: containerId,
        });
        if (pareoErr) {
          toast.error(`Pareo ${sheet.folio_contenedor}: ${pareoErr.message}`);
          continue;
        }
        const pareoData = pareo as any;
        const reporte: PareoReport = {
          folio: sheet.folio_contenedor,
          ok: pareoData?.ok ?? true,
          unidades: pareoData?.unidades ?? 0,
          unidades_nuevas: pareoData?.unidades_nuevas ?? 0,
          chasis_recibidos: pareoData?.chasis_recibidos ?? 0,
          motores_recibidos: pareoData?.motores_recibidos ?? 0,
          chasis_sin_motor: pareoData?.chasis_sin_motor ?? [],
          motores_sin_chasis: pareoData?.motores_sin_chasis ?? [],
          completa: pareoData?.completa ?? false,
        };
        reportesPareo.push(reporte);
        totalUnidades += reporte.unidades;
        totalNuevas += reporte.unidades_nuevas;
      }

      setReportes(reportesPareo);

      const completos = reportesPareo.filter(r => r.completa).length;
      const incompletos = reportesPareo.length - completos;

      if (incompletos > 0) {
        toast.warning(`⚠ ${completos} contenedor(es) completo(s), ${incompletos} incompleto(s) — revisa el reporte`);
      } else {
        toast.success(`✓ ${reportesPareo.length} contenedor(es) — ${totalNuevas} unidades creadas (total: ${totalUnidades})`);
      }

      if (incompletos > 0) {
        setStep(4);
      } else {
        setStep(4);
      }
    } catch (error) {
      console.error("Error importing containers:", error);
      toast.error("Error al importar contenedores");
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
      if (!ch) errs.push({ idx: i, campo: "ns_chasis", msg: "Vacío" });
      else if (!NS_REGEX.test(ch)) errs.push({ idx: i, campo: "ns_chasis", msg: "Formato inválido" });
      if (!mo) errs.push({ idx: i, campo: "ns_motor", msg: "Vacío" });
      else if (!NS_REGEX.test(mo)) errs.push({ idx: i, campo: "ns_motor", msg: "Formato inválido" });
      if (ch) chasisCount.set(ch, (chasisCount.get(ch) ?? 0) + 1);
      if (mo) motorCount.set(mo, (motorCount.get(mo) ?? 0) + 1);
    });
    unidades.forEach((u, i) => {
      const ch = u.ns_chasis.trim().toUpperCase();
      const mo = u.ns_motor.trim().toUpperCase();
      if (ch && (chasisCount.get(ch) ?? 0) > 1) errs.push({ idx: i, campo: "ns_chasis", msg: "Duplicado" });
      if (mo && (motorCount.get(mo) ?? 0) > 1) errs.push({ idx: i, campo: "ns_motor", msg: "Duplicado" });
    });
    return errs;
  }, [unidades]);

  const errIdx = (i: number, campo: string) => validacion.find(e => e.idx === i && e.campo === campo);

  const updateUnidad = (i: number, patch: Partial<Unidad>) => {
    setUnidades(prev => prev.map((u, idx) => idx === i ? { ...u, ...patch } : u));
  };

  const guardar = async () => {
    if (validacion.length) { toast.error(`Hay ${validacion.length} error(es) que corregir`); return; }
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
      _unidades: payload as any, // Supabase RPC requires JSON type
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✓ Contenedor recibido — ${(data as any)?.creados ?? unidades.length} motocarros creados`);
    setOpen(false); reset(); onDone?.();
  };

  const copyReport = () => {
    const text = reportes.map(r =>
      `${r.folio}: ${r.unidades} unidades | chasis: ${r.chasis_recibidos} | motores: ${r.motores_recibidos} | ${r.completa ? 'completa' : 'incompleta'}\n` +
      (r.chasis_sin_motor?.length ? `  Chasis sin motor: ${r.chasis_sin_motor.join(', ')}\n` : '') +
      (r.motores_sin_chasis?.length ? `  Motores sin chasis: ${r.motores_sin_chasis.join(', ')}\n` : '')
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success("Reporte copiado"));
  };

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }} className="h-12 bg-[#065F46] hover:bg-[#054c38] text-white font-semibold">
        <PackagePlus className="h-5 w-5 mr-2" /> Recibir contenedor
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <PackagePlus className="h-6 w-6 text-[#065F46]" />
              Recibir contenedor — Paso {step} de 4
            </DialogTitle>
            <DialogDescription>
              {step === 1 && "Datos generales del packing list"}
              {step === 2 && "Captura los números de motor y chasis (manual o pegando desde Excel)"}
              {step === 3 && "Confirma y crea los motocarros en producción"}
              {step === 4 && "Reporte de importación"}
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
              <Tabs value={importMode} onValueChange={v => setImportMode(v as any)} className="w-full">
                <TabsList className="grid grid-cols-2 h-12">
                  <TabsTrigger value="single" className="text-base"><KeyboardIcon className="h-4 w-4 mr-2" />Capturar manual</TabsTrigger>
                  <TabsTrigger value="multiple" className="text-base"><FileSpreadsheet className="h-4 w-4 mr-2" />Importar contenedores</TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Folio de contenedor *</Label>
                      <Input value={cab.folio_contenedor} onChange={e => setCab({ ...cab, folio_contenedor: e.target.value })} placeholder="CONT-2026-001" maxLength={50} className="h-12" />
                    </div>
                    <div>
                      <Label>Fecha de arribo *</Label>
                      <Input type="date" value={cab.fecha_arribo} onChange={e => setCab({ ...cab, fecha_arribo: e.target.value })} className="h-12" />
                    </div>
                    <div>
                      <Label>Modelo *</Label>
                      <Input value={cab.modelo} onChange={e => setCab({ ...cab, modelo: e.target.value })} maxLength={50} className="h-12" />
                    </div>
                    <div>
                      <Label>Color *</Label>
                      <select value={cab.color} onChange={e => setCab({ ...cab, color: e.target.value as any })} className="h-12 w-full rounded-md border border-input bg-background px-3 text-base">
                        {["BLANCO","AZUL","ROJO","NEGRO","VERDE"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Cantidad de unidades *</Label>
                      <Input type="number" min={1} max={500} value={cab.cantidad} onChange={e => setCab({ ...cab, cantidad: Number(e.target.value) })} className="h-12" />
                      <p className="text-xs text-muted-foreground mt-1">Si vas a pegar desde Excel, se ajusta automáticamente.</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="multiple" className="space-y-4 mt-4">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-sm font-medium mb-2">Importar desde Excel (VIN list)</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Sube un archivo Excel con múltiples hojas (una por contenedor). El sistema leerá automáticamente:
                      número de contenedor, modelo, cantidad y VINs (FRAME NUMBER, COLOR, MODEL).
                    </p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      disabled={busy}
                      className="max-w-xs mx-auto"
                    />
                    {busy && <p className="text-xs text-muted-foreground mt-2">Procesando archivo...</p>}
                  </div>

                  {parsedContainerSheets.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                      <p className="font-medium">Contenedores detectados:</p>
                      {parsedContainerSheets.map((sheet, i) => (
                        <div key={i} className="border rounded-lg p-3 bg-white">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-[#1F3864]">{sheet.folio_contenedor}</span>
                            <span className={`px-2 py-1 rounded-full text-xs ${sheet.tipo === 'chasis' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {sheet.tipo === 'chasis' ? 'Chasis' : 'Motores'}
                            </span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div>Modelo: {sheet.modelo}</div>
                            <div>Cantidad: {sheet.tipo === 'chasis' ? sheet.chasis.length : sheet.motores.length}</div>
                          </div>
                          {sheet.chasis.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-medium mb-1">Primeros chasis:</p>
                              <ul className="text-xs space-y-0.5">
                                {sheet.chasis.slice(0, 5).map((vin, j) => (
                                  <li key={j} className="font-mono">{vin.numero_chasis} ({vin.color})</li>
                                ))}
                                {sheet.chasis.length > 5 && <li className="text-muted-foreground">... y {sheet.chasis.length - 5} más</li>}
                              </ul>
                            </div>
                          )}
                          {sheet.motores.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-medium mb-1">Primeros motores:</p>
                              <ul className="text-xs space-y-0.5">
                                {sheet.motores.slice(0, 5).map((motor, j) => (
                                  <li key={j} className="font-mono">{motor.numero_motor} ({motor.modelo || 'N/A'})</li>
                                ))}
                                {sheet.motores.length > 5 && <li className="text-muted-foreground">... y {sheet.motores.length - 5} más</li>}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 2 && (
            <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mt-2">
              <TabsList className="grid grid-cols-2 h-12">
                <TabsTrigger value="manual" className="text-base"><KeyboardIcon className="h-4 w-4 mr-2" />Capturar uno por uno</TabsTrigger>
                <TabsTrigger value="pegar" className="text-base"><ClipboardPaste className="h-4 w-4 mr-2" />Pegar desde Excel</TabsTrigger>
              </TabsList>

              <TabsContent value="pegar" className="space-y-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  Pega 2 columnas: <strong>NS Chasis</strong> y <strong>NS Motor</strong> (opcional 3ra columna: Chasis comercial). Separadores: tab, coma o punto y coma.
                </p>
                <Textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={10} className="font-mono text-sm" placeholder={"LXYJCML50P0000001\tHJ200FMI000001\nLXYJCML50P0000002\tHJ200FMI000002"} />
                <Button onClick={parsePegado} variant="outline" className="h-11"><ClipboardPaste className="h-4 w-4 mr-2" />Procesar pegado</Button>
              </TabsContent>

              <TabsContent value="manual" className="mt-4" />

              {/* Tabla de captura — visible siempre que haya unidades */}
              {unidades.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-medium">{unidades.length} unidad(es) — {validacion.length === 0 ? <span className="text-[#065F46]">✓ Sin errores</span> : <span className="text-[#C0392B]">{validacion.length} error(es)</span>}</p>
                    <Button size="sm" variant="outline" onClick={() => setUnidades(prev => [...prev, { ns_chasis: "", ns_motor: "", chasis_asignado: "" }])}>+ Agregar fila</Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left w-12">#</th>
                          <th className="px-2 py-2 text-left">NS Chasis *</th>
                          <th className="px-2 py-2 text-left">NS Motor *</th>
                          <th className="px-2 py-2 text-left">Chasis comercial</th>
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
                <div><div className="text-muted-foreground">Folio</div><div className="font-bold">{cab.folio_contenedor}</div></div>
                <div><div className="text-muted-foreground">Arribo</div><div className="font-bold">{cab.fecha_arribo}</div></div>
                <div><div className="text-muted-foreground">Modelo</div><div className="font-bold">{cab.modelo}</div></div>
                <div><div className="text-muted-foreground">Color</div><div className="font-bold">{cab.color}</div></div>
              </div>
              <div className={`rounded-lg p-4 flex items-center gap-3 ${validacion.length === 0 ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"}`}>
                {validacion.length === 0 ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                <div>
                  <div className="font-bold text-lg">{unidades.length} motocarros se crearán en estatus PENDIENTE</div>
                  <div className="text-sm">{validacion.length === 0 ? "Listo para confirmar. El sistema asignará orden de armado consecutivo." : `Regresa al paso 2 y corrige ${validacion.length} error(es).`}</div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Reporte de importación</h3>
                <Button size="sm" variant="outline" onClick={copyReport}><Copy className="h-4 w-4 mr-2" />Copiar reporte</Button>
              </div>
              <div className="space-y-3">
                {reportes.map((r, i) => (
                  <div key={i} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-[#1F3864]">{r.folio}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.completa ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.completa ? 'completa' : 'incompleta'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <strong>{r.unidades} unidades</strong> · {r.chasis_recibidos} chasis recibidos · {r.motores_recibidos} motores recibidos
                    </div>
                    {!r.completa && (
                      <div className="mt-2 space-y-1 text-sm">
                        {r.chasis_sin_motor?.length > 0 && (
                          <div className="text-amber-700">
                            <strong>Chasis sin motor:</strong>
                            <ul className="font-mono text-xs mt-1">
                              {r.chasis_sin_motor.map((ns, j) => <li key={j}>{ns}</li>)}
                            </ul>
                          </div>
                        )}
                        {r.motores_sin_chasis?.length > 0 && (
                          <div className="text-amber-700">
                            <strong>Motores sin chasis:</strong>
                            <ul className="font-mono text-xs mt-1">
                              {r.motores_sin_chasis.map((ns, j) => <li key={j}>{ns}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {reportes.length === 0 && (
                  <div className="text-center text-muted-foreground">No hay reportes para mostrar</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step > 1 && step < 4 && <Button variant="outline" onClick={() => setStep((step - 1) as any)} className="h-12"><ArrowLeft className="h-4 w-4 mr-2" />Atrás</Button>}
            {step === 1 && importMode === "single" && <Button onClick={irPaso2} className="h-12 bg-[#1F3864]">Siguiente<ArrowRight className="h-4 w-4 ml-2" /></Button>}
            {step === 1 && importMode === "multiple" && <Button onClick={irPaso2} disabled={busy || parsedContainerSheets.length === 0} className="h-12 bg-[#065F46]"><FileSpreadsheet className="h-5 w-5 mr-2" />{busy ? "Procesando…" : `Importar ${parsedContainerSheets.length} contenedor(es) — ${parsedContainerSheets.reduce((a,s)=>a+s.chasis.length,0)} unidades esperadas`}</Button>}
            {step === 2 && <Button onClick={() => setStep(3)} disabled={!unidades.length} className="h-12 bg-[#1F3864]">Revisar<ArrowRight className="h-4 w-4 ml-2" /></Button>}
            {step === 3 && <Button onClick={guardar} disabled={busy || validacion.length > 0} className="h-12 bg-[#065F46]"><CheckCircle2 className="h-5 w-5 mr-2" />{busy ? "Guardando…" : `Crear ${unidades.length} motocarros`}</Button>}
            {step === 4 && <Button onClick={() => { setOpen(false); reset(); onDone?.(); }} className="h-12 bg-[#065F46]"><CheckCircle2 className="h-5 w-5 mr-2" />Cerrar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
