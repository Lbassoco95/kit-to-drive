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
  valor_estimado: number;
  etapa: string;
  fecha_cierre_estimada: string;
  fecha_cierre_real: string | null;
  limitante_descuento: boolean;
  limitante_flete: boolean;
  limitante_precio: boolean;
  limitante_notas: string;
  cliente_nombre?: string;
  cliente_codigo_erp?: string;
};

/** Las dos etapas que cierran una oportunidad, según el CHECK de la tabla. */
const CERRADAS = ["ganada", "perdida"];

const esActiva = (o: OpportunityData) => !CERRADAS.includes(o.etapa);

const cerroEsteMes = (o: OpportunityData) => {
  if (!o.fecha_cierre_real) return false;
  const [anio, mes] = o.fecha_cierre_real.split("-").map(Number);
  const hoy = new Date();
  return anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;
};

/**
 * El tablero es por vendedor, pero `v_reporte_pipeline` devuelve una fila por
 * oportunidad y no trae `vendedor_id`, así que no se puede agrupar con ella.
 * Los totales se arman aquí, con los mismos cortes que la vista usa para su
 * `estado_pipeline`: cerrada si la etapa lo dice, vencida si se le pasó la
 * fecha estimada, y activa en cualquier otro caso.
 *
 * `vendedor` queda vacío si la oportunidad no tiene quién la lleve; la etiqueta
 * la pone el render, para que siga el idioma activo.
 */
function agruparPorVendedor(
  ops: OpportunityData[],
  nombres: Map<string, string>,
): SellerData[] {
  const hoy = new Date().toISOString().slice(0, 10);
  const porVendedor = new Map<string, SellerData>();

  for (const o of ops) {
    const id = o.vendedor_id ?? "";
    let fila = porVendedor.get(id);
    if (!fila) {
      fila = {
        vendedor_id: id,
        vendedor: nombres.get(id) ?? "",
        oportunidades_activas: 0,
        valor_pipeline: 0,
        ganadas_mes: 0,
        perdidas_mes: 0,
        vencidas: 0,
        con_limitantes: 0,
      };
      porVendedor.set(id, fila);
    }

    if (esActiva(o)) {
      fila.oportunidades_activas += 1;
      fila.valor_pipeline += Number(o.valor_estimado) || 0;
      if (o.fecha_cierre_estimada && o.fecha_cierre_estimada < hoy) fila.vencidas += 1;
      if (o.limitante_descuento || o.limitante_flete || o.limitante_precio) fila.con_limitantes += 1;
    } else if (cerroEsteMes(o)) {
      if (o.etapa === "ganada") fila.ganadas_mes += 1;
      else fila.perdidas_mes += 1;
    }
  }

  return [...porVendedor.values()].sort((a, b) => b.valor_pipeline - a.valor_pipeline);
}

export default function CrmTracker() {
  const { perms } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const [sellers, setSellers] = useState<SellerData[]>([]);
  const [oportunidades, setOportunidades] = useState<OpportunityData[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: opsData }, { data: csData }, { data: vsData }] = await Promise.all([
      supabase.from("crm_oportunidades").select("*").order("fecha_cierre_estimada", { ascending: true }),
      supabase.from("clientes").select("id, nombre_comercial, codigo_erp"),
      supabase.from("profiles").select("id, nombre_completo")
    ]);

    const ops = (opsData ?? []) as OpportunityData[];
    const nombres = new Map((vsData ?? []).map(v => [v.id, v.nombre_completo ?? ""]));

    setOportunidades(ops);
    setSellers(agruparPorVendedor(ops, nombres));
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

  // Los tres eran el mismo filtro escrito tres veces; sólo cambia la limitante.
  const vendedoresCon = (limitante: "limitante_descuento" | "limitante_flete" | "limitante_precio") =>
    sellers
      .filter(s => oportunidades.some(o => o.vendedor_id === s.vendedor_id && o[limitante]))
      .map(s => s.vendedor || t.crm.sinVendedor);

  const sellersWithDescuento = vendedoresCon("limitante_descuento");
  const sellersWithFlete = vendedoresCon("limitante_flete");
  const sellersWithPrecio = vendedoresCon("limitante_precio");

  if (!perms.puedeVer("crmEquipo")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t.crm.tracker.sinPermiso}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F3864]">{t.crm.tracker.title}</h1>
        <p className="text-muted-foreground mt-1">{t.crm.tracker.subtitle}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t.crm.tracker.cargando}</div>
      ) : (
        <>
          {/* Sellers Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">{t.crm.tracker.vendedor}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.oporsActivas}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.valorPipeline}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.vencidas}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.ganadasMes}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.perdidasMes}</th>
                    <th className="text-right p-4 font-medium">{t.crm.tracker.conLimitantes}</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller) => {
                    const isExpanded = expandedSeller === seller.vendedor_id;
                    const sellerOps = oportunidades.filter(o => o.vendedor_id === seller.vendedor_id && esActiva(o));
                    
                    return (
                      <>
                        <tr key={seller.vendedor_id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedSeller(isExpanded ? null : seller.vendedor_id)}>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{seller.vendedor || t.crm.sinVendedor}</span>
                            </div>
                          </td>
                          <td className="text-right p-4 font-medium">{seller.oportunidades_activas}</td>
                          <td className="text-right p-4">
                            <span className="flex items-center justify-end gap-1">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {seller.valor_pipeline.toLocaleString(locale)}
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
                                <h4 className="font-medium text-sm text-muted-foreground">{t.crm.tracker.oportunidadesActivas(sellerOps.length)}</h4>
                                {sellerOps.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">{t.crm.tracker.sinOportunidadesActivas}</p>
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
                                                {cliente?.nombre_comercial || t.crm.sinCliente} ({cliente?.codigo_erp || "N/A"})
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-1">
                                                {t.crm.tipoVenta(op.tipo_venta)} · {t.crm.etapa(op.etapa)}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span>${op.valor_estimado?.toLocaleString(locale) || "0"}</span>
                                                <span>{op.cantidad_estimada || 0} {t.crm.tracker.unid}</span>
                                                <span className={isVencida ? "text-red-600 font-medium" : ""}>
                                                  {op.fecha_cierre_estimada ? new Date(op.fecha_cierre_estimada).toLocaleDateString(locale) : t.crm.sinFecha}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {op.limitante_descuento && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.descuento}
                                                </span>
                                              )}
                                              {op.limitante_flete && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.flete}
                                                </span>
                                              )}
                                              {op.limitante_precio && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                                                  <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.precio}
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
              {t.crm.limitantes.title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">{t.crm.limitantes.descuento}</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{limitantesSummary.descuento}</div>
                <div className="text-xs text-red-500 mt-1">
                  {t.crm.limitantes.vendedores}: {sellersWithDescuento.length > 0 ? sellersWithDescuento.join(", ") : t.crm.limitantes.ninguno}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-sm text-orange-600 font-medium">{t.crm.limitantes.flete}</div>
                <div className="text-2xl font-bold text-orange-700 mt-1">{limitantesSummary.flete}</div>
                <div className="text-xs text-orange-500 mt-1">
                  {t.crm.limitantes.vendedores}: {sellersWithFlete.length > 0 ? sellersWithFlete.join(", ") : t.crm.limitantes.ninguno}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">{t.crm.limitantes.precio}</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{limitantesSummary.precio}</div>
                <div className="text-xs text-red-500 mt-1">
                  {t.crm.limitantes.vendedores}: {sellersWithPrecio.length > 0 ? sellersWithPrecio.join(", ") : t.crm.limitantes.ninguno}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
