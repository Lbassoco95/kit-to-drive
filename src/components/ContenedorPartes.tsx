import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { parsePackingListExcel, ParteFromExcel } from "@/lib/excelParser";
import { explicarError } from "@/lib/dazon";

type Parte = {
  id: string;
  descripcion: string;
  modelo: string | null;
  cantidad_esperada: number;
  cantidad_recibida: number;
};

export function ContenedorPartes({ 
  contenedorId, 
  folioContenedor, 
  open, 
  onOpenChange 
}: { 
  contenedorId: string; 
  folioContenedor: string;
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [partes, setPartes] = useState<Parte[]>([]);
  const [busy, setBusy] = useState(false);
  const [packingListFile, setPackingListFile] = useState<File | null>(null);

  useEffect(() => {
    if (open && contenedorId) {
      cargarPartes();
    }
  }, [open, contenedorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarPartes = async () => {
    const { data, error } = await supabase
      .from("inventario_partes")
      .select("*")
      .eq("contenedor_id", contenedorId)
      .order("descripcion");

    if (error) {
      toast.error("Error al cargar partes");
      return;
    }

    setPartes(data || []);
  };

  const handlePackingListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const partesExcel = await parsePackingListExcel(file);
      
      if (partesExcel.length === 0) {
        toast.error("No se encontraron partes válidas en el archivo Excel");
        setBusy(false);
        return;
      }

      const { data, error } = await supabase.rpc("importar_packing_list", {
        _contenedor_id: contenedorId,
        _partes: partesExcel as any, // Supabase RPC requires JSON type
      });

      if (error) {
        // Igual que en la bandeja: un «function ... does not exist» crudo no
        // dice qué correr. `importar_packing_list` (20260819000009) es de los
        // scripts que no habían llegado a producción.
        toast.error(explicarError(error, "No se pudo importar el packing list"));
        setBusy(false);
        return;
      }

      toast.success(`✓ ${partesExcel.length} parte(s) importada(s)`);
      setPackingListFile(file);
      await cargarPartes();
    } catch (error) {
      console.error("Error parsing packing list:", error);
      toast.error("Error al procesar el archivo Excel. Verifica el formato.");
    } finally {
      setBusy(false);
    }
  };

  const actualizarCantidadRecibida = async (parteId: string, nuevaCantidad: number) => {
    const { error } = await supabase
      .from("inventario_partes")
      .update({ cantidad_recibida: nuevaCantidad })
      .eq("id", parteId);

    if (error) {
      toast.error("Error al actualizar cantidad recibida");
      return;
    }

    setPartes(prev => prev.map(p => 
      p.id === parteId ? { ...p, cantidad_recibida: nuevaCantidad } : p
    ));
  };

  const diferencia = (esperada: number, recibida: number) => {
    return recibida - esperada;
  };

  const totalEsperado = partes.reduce((sum, p) => sum + p.cantidad_esperada, 0);
  const totalRecibido = partes.reduce((sum, p) => sum + p.cantidad_recibida, 0);
  const totalDiferencia = totalRecibido - totalEsperado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Package className="h-6 w-6 text-[#065F46]" />
            Inventario de partes — {folioContenedor}
          </DialogTitle>
          <DialogDescription>
            Importa el packing list de partes y marca lo recibido en fábrica
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium mb-2">Importar Packing List</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sube el archivo Excel con las partes (DESCRIPTIONS, MODEL, QUANTITY). 
              Se ignorarán las primeras 15 filas con datos del proveedor.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handlePackingListUpload}
              disabled={busy}
              className="max-w-xs mx-auto"
            />
            {busy && <p className="text-xs text-muted-foreground mt-2">Procesando archivo...</p>}
          </div>

          {/* Summary */}
          {partes.length > 0 && (
            <div className={`rounded-lg p-4 flex items-center gap-3 ${totalDiferencia === 0 ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"}`}>
              {totalDiferencia === 0 ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
              <div>
                <div className="font-bold text-lg">
                  {totalDiferencia === 0 ? "Inventario completo" : `Diferencia: ${totalDiferencia > 0 ? '+' : ''}${totalDiferencia}`}
                </div>
                <div className="text-sm">
                  Esperado: {totalEsperado} | Recibido: {totalRecibido}
                </div>
              </div>
            </div>
          )}

          {/* Parts Table */}
          {partes.length > 0 && (
            <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Parte</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Esperada</TableHead>
                    <TableHead className="text-right">Recibida</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partes.map((parte) => (
                    <TableRow key={parte.id}>
                      <TableCell className="font-medium">{parte.descripcion}</TableCell>
                      <TableCell>{parte.modelo || "-"}</TableCell>
                      <TableCell className="text-right">{parte.cantidad_esperada}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={parte.cantidad_recibida}
                          onChange={(e) => actualizarCantidadRecibida(parte.id, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 text-right"
                        />
                      </TableCell>
                      <TableCell className={`text-right font-medium ${diferencia(parte.cantidad_esperada, parte.cantidad_recibida) === 0 ? "text-[#065F46]" : "text-[#C0392B]"}`}>
                        {diferencia(parte.cantidad_esperada, parte.cantidad_recibida) > 0 ? '+' : ''}{diferencia(parte.cantidad_esperada, parte.cantidad_recibida)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {partes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay partes registradas. Importa un packing list para comenzar.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
