import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload, CheckCircle2 } from "lucide-react";
import { useLang } from "@/contexts/LangContext";

type Result = { motocarros: number; remisiones: number; clientes: number; vendedores: number; errores: string[] };

const parseFecha = (v: any): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || /^entregado$/i.test(s) || /listo/i.test(s)) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : null;
};
const normEstatus = (v: any): "PENDIENTE" | "EN_PROCESO" | "ARMADO" | "LISTO" | "ATRASADO" => {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "PENDIENTE";
  if (s.startsWith("ATRAS")) return "ATRASADO";
  if (s === "LISTO") return "LISTO";
  if (s === "ARMADO" || s === "ENTREGADO" || s === "ENTRGADO") return "ARMADO";
  if (s.startsWith("2026") || s.startsWith("2025")) return "ARMADO";
  return "PENDIENTE";
};
const normEntrega = (v: any) => /^entregado$/i.test(String(v ?? "").trim()) ? "ENTREGADA" : "NO_APLICA";

export default function Importar() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { t } = useLang();

  const fetchCsv = async (path: string) => {
    const r = await fetch(path); return await r.text();
  };

  const importar = async () => {
    setBusy(true); setResult(null);
    const errores: string[] = [];
    try {
      const [prodTxt, remTxt] = await Promise.all([fetchCsv("/seed/produccion.csv"), fetchCsv("/seed/remisiones.csv")]);
      const prod = Papa.parse(prodTxt, { header: true, skipEmptyLines: true }).data as any[];
      const rem  = Papa.parse(remTxt,  { header: true, skipEmptyLines: true }).data as any[];

      // 1) Vendedores únicos → buscar profiles existentes; si no hay match por nombre, crear uno colectivo "VENTAS"
      const vendedorNombres = Array.from(new Set([...prod, ...rem].map(r => String(r.vendedor || "").trim()).filter(Boolean)));
      const { data: profilesAll } = await supabase.from("profiles").select("id, nombre_completo, codigo_vendedor");
      const findVendedor = (nombre: string) => {
        const n = nombre.toUpperCase();
        return profilesAll?.find(p => (p.nombre_completo || "").toUpperCase().includes(n) || (p.codigo_vendedor || "").toUpperCase() === n);
      };
      // Para los que no existen, los dejamos sin asignar a un usuario real (vendedor_id null) — Admin puede asignar después
      const vendedorMap = new Map<string, string | null>();
      for (const v of vendedorNombres) {
        vendedorMap.set(v, findVendedor(v)?.id ?? null);
      }

      // 2) Clientes
      const clientesCodigos = Array.from(new Set([...prod, ...rem].map(r => String(r.cliente || "").trim()).filter(Boolean)));
      const { data: existCli } = await supabase.from("clientes").select("id, codigo_erp").in("codigo_erp", clientesCodigos);
      const cliMap = new Map<string, string>(existCli?.map(c => [c.codigo_erp, c.id]) ?? []);
      const nuevosCli = clientesCodigos.filter(c => !cliMap.has(c)).map(codigo_erp => ({ codigo_erp }));
      let creadosCli = 0;
      if (nuevosCli.length) {
        const { data: ins, error } = await supabase.from("clientes").insert(nuevosCli).select("id, codigo_erp");
        if (error) errores.push(`Clientes: ${error.message}`);
        else { ins?.forEach(c => cliMap.set(c.codigo_erp, c.id)); creadosCli = ins?.length ?? 0; }
      }

      // 3) Remisiones (tomamos del archivo de remisiones)
      const folios = Array.from(new Set([...prod, ...rem].map(r => String(r.remision || "").trim()).filter(Boolean)));
      const { data: existRem } = await supabase.from("remisiones").select("id, folio_remision").in("folio_remision", folios);
      const remMap = new Map<string, string>(existRem?.map(r => [r.folio_remision, r.id]) ?? []);
      const nuevasRem: any[] = [];
      for (const r of rem) {
        const folio = String(r.remision || "").trim();
        if (!folio || remMap.has(folio)) continue;
        const codCli = String(r.cliente || "").trim();
        nuevasRem.push({
          folio_remision: folio,
          cliente_id: cliMap.get(codCli) ?? null,
          vendedor_id: vendedorMap.get(String(r.vendedor || "").trim()) ?? null,
          fecha_remision: parseFecha(r.fecha_remision),
          total_unidades_solicitadas: Number(r.total_unidades) || 1,
          modelo_solicitado: "200cc 2025",
          estatus: "NUEVA",
          notas: `Vendedor original: ${r.vendedor || ""}`,
        });
      }
      let creadasRem = 0;
      if (nuevasRem.length) {
        const { data: insR, error } = await supabase.from("remisiones").insert(nuevasRem).select("id, folio_remision");
        if (error) errores.push(`Remisiones: ${error.message}`);
        else { insR?.forEach(r => remMap.set(r.folio_remision, r.id)); creadasRem = insR?.length ?? 0; }
      }

      // 4) Motocarros — upsert para tolerar duplicados en el CSV
      const seenOrdenes = new Set<number>();
      const todosMot: any[] = [];
      for (const r of prod) {
        const orden = Number(r.orden_armado);
        if (!orden || seenOrdenes.has(orden)) continue; // dedup dentro del CSV
        seenOrdenes.add(orden);
        const folio = String(r.remision || "").trim();
        const remId = folio ? remMap.get(folio) ?? null : null;
        todosMot.push({
          orden_armado: orden,
          modelo: String(r.modelo || "200cc 2025").trim(),
          color: String(r.color || "BLANCO").trim().toUpperCase(),
          chasis_asignado: String(r.asignacion_chasis_cliente || "").trim() || null,
          ns_chasis: String(r.ns_chasis || "").trim() || null,
          ns_motor: String(r.ns_motor || "").trim() || null,
          fecha_estimada_armado: parseFecha(r.fecha_est_armado),
          fecha_real_armado: parseFecha(r.fecha_real_armado),
          estatus_armado: normEstatus(r.estatus),
          observaciones_paro: String(r.observaciones_paro || "").trim() || null,
          remision_id: remId,
          fecha_estimada_entrega: parseFecha(r.fecha_est_entrega),
          fecha_real_entrega: parseFecha(r.fecha_real_entrega),
          estatus_entrega: /entregado/i.test(String(r.fecha_real_entrega || "").trim()) ? "ENTREGADA" : "NO_APLICA",
        });
      }
      let creadosMot = 0;
      // Upsert en lotes de 50 — onConflict orden_armado: actualiza si ya existe
      for (let i = 0; i < todosMot.length; i += 50) {
        const chunk = todosMot.slice(i, i + 50);
        const { error, data } = await supabase
          .from("motocarros")
          .upsert(chunk, { onConflict: "orden_armado", ignoreDuplicates: false })
          .select("id");
        if (error) errores.push(`Motocarros lote ${i/50 + 1}: ${error.message}`);
        else creadosMot += data?.length ?? 0;
      }

      setResult({
        motocarros: creadosMot,
        remisiones: creadasRem,
        clientes: creadosCli,
        vendedores: vendedorNombres.length,
        errores,
      });
      toast.success(t.importar.finalizada);
    } catch (e: any) {
      toast.error(e.message);
      errores.push(String(e));
      setResult({ motocarros: 0, remisiones: 0, clientes: 0, vendedores: 0, errores });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1>{t.importar.title}</h1>
        <p className="text-muted-foreground mt-1">{t.importar.subtitle}</p>
      </div>
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Upload className="h-10 w-10 text-secondary" />
          <div className="flex-1">
            <div className="font-semibold">{t.importar.csvInfo}</div>
            <div className="text-sm text-muted-foreground">{t.importar.csvDesc}</div>
          </div>
          <Button onClick={importar} disabled={busy} size="lg">
            {busy ? t.importar.importando : t.importar.iniciar}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4 text-success font-semibold">
            <CheckCircle2 className="h-5 w-5" /> {t.importar.completada}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={t.importar.motocarros} value={result.motocarros} />
            <Stat label={t.importar.remisiones} value={result.remisiones} />
            <Stat label={t.importar.clientes} value={result.clientes} />
            <Stat label={t.importar.vendedores} value={result.vendedores} />
          </div>
          {result.errores.length > 0 && (
            <div className="mt-4">
              <div className="font-semibold text-destructive mb-2">{t.importar.avisosErrores}</div>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {result.errores.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="kpi-card">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-2xl font-bold text-primary mt-1">{value}</div>
  </div>
);
