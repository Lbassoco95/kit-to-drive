import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Wrench, Palette, Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Chasis = {
  id: string;
  numero_chasis: string;
  modelo: string;
  color: string;
  estatus: string;
  contenedor_id: string | null;
  motocarro_id: string | null;
};

type Motor = {
  id: string;
  numero_motor: string;
  modelo: string;
  estatus: string;
  contenedor_id: string | null;
  motocarro_id: string | null;
};

type Parte = {
  id: string;
  descripcion: string;
  modelo: string | null;
  cantidad_esperada: number;
  cantidad_recibida: number;
  contenedor_id: string;
};

type ColorInventario = {
  id: string;
  modelo: string;
  color: string;
  cantidad_disponible: number;
  umbral_alerta: number;
};

export default function Inventario() {
  const [chasis, setChasis] = useState<Chasis[]>([]);
  const [motores, setMotores] = useState<Motor[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [colores, setColores] = useState<ColorInventario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarInventario();
  }, []);

  const cargarInventario = async () => {
    setLoading(true);
    try {
      const [chasisData, motoresData, partesData, coloresData] = await Promise.all([
        supabase.from("inventario_chasis").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("inventario_motor").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("inventario_partes").select("*").order("descripcion"),
        supabase.from("inventario_colores").select("*").order("modelo, color"),
      ]);

      if (chasisData.error) throw chasisData.error;
      if (motoresData.error) throw motoresData.error;
      if (partesData.error) throw partesData.error;
      if (coloresData.error) throw coloresData.error;

      setChasis(chasisData.data || []);
      setMotores(motoresData.data || []);
      setPartes(partesData.data || []);
      setColores(coloresData.data || []);
    } catch (error) {
      console.error("Error loading inventory:", error);
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const getParteDiferencia = (esperada: number, recibida: number) => {
    return recibida - esperada;
  };

  const getColorStatus = (disponible: number, umbral: number) => {
    if (disponible === 0) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-red-600 bg-red-50", text: "Sin stock" };
    if (disponible <= umbral) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-600 bg-amber-50", text: "Bajo stock" };
    return { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-green-600 bg-green-50", text: "OK" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando inventario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventario de Contenedores</h1>
        <p className="text-muted-foreground mt-1">Gestión de chasis, motores, partes y colores</p>
      </div>

      <Tabs defaultValue="chasis" className="w-full">
        <TabsList className="grid grid-cols-4 h-12">
          <TabsTrigger value="chasis" className="text-base"><Truck className="h-4 w-4 mr-2" />Chasis</TabsTrigger>
          <TabsTrigger value="motores" className="text-base"><Wrench className="h-4 w-4 mr-2" />Motores</TabsTrigger>
          <TabsTrigger value="partes" className="text-base"><Package className="h-4 w-4 mr-2" />Partes</TabsTrigger>
          <TabsTrigger value="colores" className="text-base"><Palette className="h-4 w-4 mr-2" />Colores</TabsTrigger>
        </TabsList>

        <TabsContent value="chasis" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Inventario de Chasis</h3>
              <div className="text-sm text-muted-foreground">
                Total: {chasis.length} | Disponibles: {chasis.filter(c => c.estatus === 'disponible').length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Chasis (FRAME NUMBER)</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Contenedor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chasis.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">{c.numero_chasis}</TableCell>
                      <TableCell>{c.modelo}</TableCell>
                      <TableCell>{c.color}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          c.estatus === 'disponible' ? 'bg-green-100 text-green-700' :
                          c.estatus === 'configurado' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {c.estatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                  {chasis.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay chasis en inventario
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="motores" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Inventario de Motores</h3>
              <div className="text-sm text-muted-foreground">
                Total: {motores.length} | Disponibles: {motores.filter(m => m.estatus === 'disponible').length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Motor</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Contenedor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motores.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono">{m.numero_motor}</TableCell>
                      <TableCell>{m.modelo}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          m.estatus === 'disponible' ? 'bg-green-100 text-green-700' :
                          m.estatus === 'configurado' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {m.estatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                  {motores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No hay motores en inventario
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="partes" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Inventario de Partes</h3>
              <div className="text-sm text-muted-foreground">
                Total registros: {partes.length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Parte</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Esperada</TableHead>
                    <TableHead className="text-right">Recibida</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead>Contenedor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partes.map((p) => {
                    const diff = getParteDiferencia(p.cantidad_esperada, p.cantidad_recibida);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.descripcion}</TableCell>
                        <TableCell>{p.modelo || '-'}</TableCell>
                        <TableCell className="text-right">{p.cantidad_esperada}</TableCell>
                        <TableCell className="text-right">{p.cantidad_recibida}</TableCell>
                        <TableCell className={`text-right font-medium ${diff < 0 ? 'text-red-600' : diff === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.contenedor_id.slice(0, 8)}...</TableCell>
                      </TableRow>
                    );
                  })}
                  {partes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay partes en inventario
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="colores" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Inventario de Colores</h3>
              <div className="text-sm text-muted-foreground">
                Alerta cuando disponible ≤ umbral
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Umbral Alerta</TableHead>
                    <TableHead>Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colores.map((c) => {
                    const status = getColorStatus(c.cantidad_disponible, c.umbral_alerta);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.modelo}</TableCell>
                        <TableCell>{c.color}</TableCell>
                        <TableCell className="text-right font-bold">{c.cantidad_disponible}</TableCell>
                        <TableCell className="text-right">{c.umbral_alerta}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${status.color}`}>
                            {status.icon}
                            {status.text}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {colores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay colores en inventario
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
