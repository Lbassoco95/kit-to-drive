import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ESTATUS_ARMADO_COLOR, ESTATUS_ENTREGA_COLOR, fmtDate } from "@/lib/dazon";
import { Download, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Produccion() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState("__all");
  const [color, setColor] = useState("__all");
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = async () => {
    const { data } = await supabase
      .from("motocarros")
      .select("*, remisiones(folio_remision, vendedor_id, profiles:vendedor_id(nombre_completo, codigo_vendedor), clientes(codigo_erp))")
      .order("orden_armado", { ascending: true });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (estatus !== "__all" && r.estatus_armado !== estatus) return false;
      if (color !== "__all" && r.color !== color) return false;
      if (q) {
        const t = q.toLowerCase();
        const blob = [r.orden_armado, r.chasis_asignado, r.ns_chasis, r.ns_motor,
          r.remisiones?.folio_remision, r.remisiones?.clientes?.codigo_erp,
          r.remisiones?.profiles?.nombre_completo, r.remisiones?.profiles?.codigo_vendedor]
          .filter(Boolean).join(" ").toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });
  }, [rows, q, estatus, color]);

  const exportCsv = () => {
    const header = ["Orden","Modelo","Color","F.Est.Armado","Estatus","F.Real.Armado","NS Chasis","NS Motor","Chasis","Vendedor","Cliente","Remisión","F.Est.Entrega","Estatus Entrega"];
    const rows2 = filtered.map(r => [r.orden_armado, r.modelo, r.color, r.fecha_estimada_armado, r.estatus_armado, r.fecha_real_armado || "", r.ns_chasis||"", r.ns_motor||"", r.chasis_asignado||"", r.remisiones?.profiles?.nombre_completo||"", r.remisiones?.clientes?.codigo_erp||"", r.remisiones?.folio_remision||"", r.fecha_estimada_entrega||"", r.estatus_entrega]);
    const csv = [header, ...rows2].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "produccion.csv"; a.click();
  };

  const updateMoto = async (id: string, patch: any) => {
    const { error } = await supabase.from("motocarros").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Actualizado"); load(); }
  };

  const canEditFabrica = role === "admin" || role === "fabrica";
  const canEditEntrega = role === "admin" || role === "logistica";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Producción</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} de {rows.length} motocarros</p>
        </div>
        <Button onClick={exportCsv} variant="outline"><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Input className="max-w-xs" placeholder="Buscar orden/chasis/NS/remisión…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={estatus} onValueChange={setEstatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estatus armado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los estatus</SelectItem>
            {["PENDIENTE","EN_PROCESO","ARMADO","LISTO","ATRASADO"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={color} onValueChange={setColor}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Color" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los colores</SelectItem>
            <SelectItem value="BLANCO">Blanco</SelectItem>
            <SelectItem value="AZUL">Azul</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="data-table">
            <thead>
              <tr>
                <th>Orden</th><th>Modelo</th><th>Color</th><th>F.Est.Arm</th><th>Estatus</th>
                <th>F.Real.Arm</th><th>NS Chasis</th><th>NS Motor</th><th>Chasis</th>
                <th>Vendedor</th><th>Cliente</th><th>Remisión</th><th>F.Est.Ent</th><th>Entrega</th>
                {(canEditFabrica || canEditEntrega) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-semibold text-primary">{r.orden_armado}</td>
                  <td>{r.modelo}</td>
                  <td>{r.color}</td>
                  <td>{fmtDate(r.fecha_estimada_armado)}</td>
                  <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ARMADO_COLOR[r.estatus_armado]}`}>{r.estatus_armado}</span></td>
                  <td>{fmtDate(r.fecha_real_armado)}</td>
                  <td className="font-mono text-[11px]">{r.ns_chasis || "—"}</td>
                  <td className="font-mono text-[11px]">{r.ns_motor || "—"}</td>
                  <td>{r.chasis_asignado || "—"}</td>
                  <td>{r.remisiones?.profiles?.nombre_completo || (r.remisiones?.notas?.replace("Vendedor original: ", "")) || "—"}</td>
                  <td>{r.remisiones?.clientes?.codigo_erp || "—"}</td>
                  <td>{r.remisiones?.folio_remision || "—"}</td>
                  <td>{fmtDate(r.fecha_estimada_entrega)}</td>
                  <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ENTREGA_COLOR[r.estatus_entrega]}`}>{r.estatus_entrega}</span></td>
                  {(canEditFabrica || canEditEntrega) && (
                    <td>
                      <div className="flex gap-1">
                        {canEditFabrica && r.estatus_armado !== "ARMADO" && r.estatus_armado !== "LISTO" && (
                          <Button size="sm" variant="outline" onClick={() => updateMoto(r.id, { estatus_armado: "ARMADO", fecha_real_armado: new Date().toISOString().slice(0,10) })}>
                            ✓ Armado
                          </Button>
                        )}
                        {canEditEntrega && r.estatus_entrega === "PROGRAMADA" && (
                          <Button size="sm" variant="outline" onClick={() => updateMoto(r.id, { estatus_entrega: "ENTREGADA", fecha_real_entrega: new Date().toISOString().slice(0,10) })}>
                            🚚 Entregada
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={15} className="text-center text-muted-foreground py-6">Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
