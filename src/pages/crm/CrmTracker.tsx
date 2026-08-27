import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { BarChart2, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Users, DollarSign } from "lucide-react";

type SellerData = {
  vendedor_id: string;
  vendedor: string;
  oportunidades_activas: number;
  valor_pipeline: number;
  ganadas_mes: number;
  perdidas_mes: number;
  vencidas: number;
  con_limitantes: number;
};

type OpportunityData = {
  id: string;
  cliente_id: string;
  vendedor_id: string;
  tipo_venta: string;
  cantidad_estimada: number;
  monto_estimado: number;
  etapa: string;
  fecha_cierre_estimada: string;
  limitante_descuento: boolean;
  limitante_flete: boolean;
  limitante_precio: boolean;
  limitante_notas: string;
  cliente_nombre?: string;
  cliente_codigo_erp?: string;
};

export default function CrmTracker() {
  const { perms } = useAuth();
  const { t } = useLang();
  const [sellers, setSellers] = useState<SellerData[]>([]);
  const [oportunidades, setOportunidades] = useState<OpportunityData[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: sellersData }, { data: opsData }, { data: csData }] = await Promise.all([
      supabase.from("v_reporte_pipeline").select("*"),
      supabase.from("crm_oportunidades").select("*").order("fecha_cierre_estimada", { ascending: true }),
      supabase.from("clientes").select("id, nombre_comercial, codigo_erp")
    ]);
    
    setSellers(sellersData ?? []);
    setOportunidades(opsData ?? []);
    setClientes(csData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Calculate limitantes summary
  const limitantesSummary = {
    descuento: oportunidades.filter(o => o.limitante_descuento).length,
    flete: oportunidades.filter(o => o.limitante_flete).length,
    precio: oportunidades.filter(o => o.limitante_precio).length,
  };

  const sellersWithDescuento = sellers.filter(s => {
    const sellerOps = oportunidades.filter(o => o.vendedor_id === s.vendedor_id && o.limitante_descuento);
    return sellerOps.length > 0;
  }).map(s => s.vendedor);

  const sellersWithFlete = sellers.filter(s => {
    const sellerOps = oportunidades.filter(o => o.vendedor_id === s.vendedor_id && o.limitante_flete);
    return sellerOps.length > 0;
  }).map(s => s.vendedor);

  const sellersWithPrecio = sellers.filter(s => {
    const sellerOps = oportunidades.filter(o => o.vendedor_id === s.vendedor_id && o.limitante_precio);
    return sellerOps.length > 0;
  }).map(s => s.vendedor);

  if (!perms.puedeVer("crmEquipo")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No tienes permiso para ver esta página</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F3864]">Tracker de Vendedores</h1>
        <p className="text-muted-foreground mt-1">Seguimiento de rendimiento y limitantes por vendedor</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando datos...</div>
      ) : (
        <>
          {/* Sellers Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Vendedor</th>
                    <th className="text-right p-4 font-medium">Opors activas</th>
                    <th className="text-right p-4 font-medium">Valor pipeline</th>
                    <th className="text-right p-4 font-medium">Vencidas</th>
                    <th className="text-right p-4 font-medium">Ganadas mes</th>
                    <th className="text-right p-4 font-medium">Perdidas mes</th>
                    <th className="text-right p-4 font-medium">Con limitantes</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller) => {
                    const isExpanded = expandedSeller === seller.vendedor_id;
                    const sellerOps = oportunidades.filter(o => o.vendedor_id === seller.vendedor_id && !["ganado", "perdido"].includes(o.etapa));
                    
                    return (
                      <>
                        <tr key={seller.vendedor_id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedSeller(isExpanded ? null : seller.vendedor_id)}>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{seller.vendedor}</span>
                            </div>
                          </td>
                          <td className="text-right p-4 font-medium">{seller.oportunidades_activas}</td>
                          <td className="text-right p-4">
                            <span className="flex items-center justify-end gap-1">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {seller.valor_pipeline.toLocaleString()}
                            </span>
                          </td>
                          <td className="text-right p-4 text-red-600">{seller.vencidas}</td>
                          <td className="text-right p-4 text-green-600">{seller.ganadas_mes}</td>
                          <td className="text-right p-4">{seller.perdidas_mes}</td>
                          <td className="text-right p-4">
                            {seller.con_limitantes > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                {seller.con_limitantes}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={8} className="p-4">
                              <div className="space-y-3">
                                <h4 className="font-medium text-sm text-muted-foreground">Oportunidades activas ({sellerOps.length})</h4>
                                {sellerOps.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Sin oportunidades activas</p>
                                ) : (
                                  <div className="grid gap-2">
                                    {sellerOps.map((op) => {
                                      const cliente = clientes.find(c => c.id === op.cliente_id);
                                      const isVencida = op.fecha_cierre_estimada && new Date(op.fecha_cierre_estimada) < new Date();
                                      
                                      return (
                                        <Card key={op.id} className="p-3">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-sm truncate">
                                                {cliente?.nombre_comercial || "Sin cliente"} ({cliente?.codigo_erp || "N/A"})
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-1">
                                                {op.tipo_venta} · {op.etapa}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span>${op.monto_estimado?.toLocaleString() || "0"}</span>
                                                <span>{op.cantidad_estimada || 0} unid</span>
                                                <span className={isVencida ? "text-red-600 font-medium" : ""}>
                                                  {op.fecha_cierre_estimada ? new Date(op.fecha_cierre_estimada).toLocaleDateString() : "Sin fecha"}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {op.limitante_descuento && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> Descuento
                                                </span>
                                              )}
                                              {op.limitante_flete && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> Flete
                                                </span>
                                              )}
                                              {op.limitante_precio && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> Precio
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </Card>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Limitantes Summary */}
          <Card className="p-5">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Limitantes activas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">Descuento</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{limitantesSummary.descuento}</div>
                <div className="text-xs text-red-500 mt-1">
                  Vendedores: {sellersWithDescuento.length > 0 ? sellersWithDescuento.join(", ") : "Ninguno"}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-sm text-orange-600 font-medium">Flete</div>
                <div className="text-2xl font-bold text-orange-700 mt-1">{limitantesSummary.flete}</div>
                <div className="text-xs text-orange-500 mt-1">
                  Vendedores: {sellersWithFlete.length > 0 ? sellersWithFlete.join(", ") : "Ninguno"}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">Precio</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{limitantesSummary.precio}</div>
                <div className="text-xs text-red-500 mt-1">
                  Vendedores: {sellersWithPrecio.length > 0 ? sellersWithPrecio.join(", ") : "Ninguno"}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
