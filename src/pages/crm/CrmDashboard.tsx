import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";
import { BarChart2, TrendingUp, DollarSign, Calendar, Users, MapPin, BookOpen, CheckCircle } from "lucide-react";

export default function CrmDashboard() {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalOportunidades: 0,
    oportunidadesGanadas: 0,
    montoTotal: 0,
    actividadesMes: 0,
    rutasMes: 0,
    topVendedores: [] as any[]
  });

  useEffect(() => {
    loadKPIs();
  }, []);

  const loadKPIs = async () => {
    setLoading(true);
    
    // Query separadas para KPIs
    const [
      { count: totalOps },
      { count: ganadas },
      { data: opsGanadas },
      { count: actMes },
      { count: rutasMes }
    ] = await Promise.all([
      supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }),
      // La etapa en la base es «ganada», no «ganado»: con el masculino estas dos
      // consultas no encontraban nada y el monto ganado siempre salía en $0.
      supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }).eq("etapa", "ganada"),
      supabase.from("crm_oportunidades").select("vendedor_id, valor_estimado").eq("etapa", "ganada"),
      supabase.from("crm_actividades").select("*", { count: "exact", head: true }).gte("fecha", new Date(new Date().setDate(new Date().getDate() - 30)).toISOString()),
      supabase.from("crm_rutas").select("*", { count: "exact", head: true }).gte("fecha", new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString())
    ]);

    // Calcular monto total
    const montoTotal = opsGanadas?.reduce((sum: number, o: any) => sum + (o.valor_estimado || 0), 0) || 0;

    // Calcular top vendedores por monto ganado
    const vendedorMontos: Record<string, number> = {};
    opsGanadas?.forEach((o: any) => {
      if (o.vendedor_id && o.valor_estimado) {
        vendedorMontos[o.vendedor_id] = (vendedorMontos[o.vendedor_id] || 0) + o.valor_estimado;
      }
    });

    const vendedorIds = Object.keys(vendedorMontos);
    const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", vendedorIds);
    
    const topVendedores = profiles
      ?.map((p: any) => ({
        id: p.id,
        nombre: p.nombre_completo,
        monto: vendedorMontos[p.id] || 0
      }))
      .sort((a: any, b: any) => b.monto - a.monto)
      .slice(0, 5) || [];

    setKpis({
      totalOportunidades: totalOps || 0,
      oportunidadesGanadas: ganadas || 0,
      montoTotal,
      actividadesMes: actMes || 0,
      rutasMes: rutasMes || 0,
      topVendedores
    });
    setLoading(false);
  };

  const kpiCards = [
    {
      title: t.crm.dashboard.totalOportunidades,
      value: kpis.totalOportunidades,
      icon: TrendingUp,
      color: "bg-blue-100 text-blue-700",
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600"
    },
    {
      title: t.crm.dashboard.oportunidadesGanadas,
      value: kpis.oportunidadesGanadas,
      icon: CheckCircle,
      color: "bg-green-100 text-green-700",
      bgColor: "bg-green-50",
      iconColor: "text-green-600"
    },
    {
      title: t.crm.dashboard.montoTotal,
      value: `$${kpis.montoTotal.toLocaleString()}`,
      icon: DollarSign,
      color: "bg-yellow-100 text-yellow-700",
      bgColor: "bg-yellow-50",
      iconColor: "text-yellow-600"
    },
    {
      title: t.crm.dashboard.actividades30,
      value: kpis.actividadesMes,
      icon: BookOpen,
      color: "bg-purple-100 text-purple-700",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600"
    },
    {
      title: t.crm.dashboard.rutas30,
      value: kpis.rutasMes,
      icon: MapPin,
      color: "bg-orange-100 text-orange-700",
      bgColor: "bg-orange-50",
      iconColor: "text-orange-600"
    }
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1>{t.crm.dashboard.title}</h1>
        <p className="text-base text-muted-foreground mt-1">{t.crm.dashboard.subtitle}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t.crm.dashboard.cargando}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {kpiCards.map((kpi, idx) => (
              <Card key={idx} className={`p-5 ${kpi.bgColor}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">{kpi.title}</div>
                    <div className="text-2xl font-bold text-[#1F3864] mt-1">{kpi.value}</div>
                  </div>
                  <div className={`p-3 rounded-full ${kpi.color}`}>
                    <kpi.icon size={24} className={kpi.iconColor} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="text-[#1F3864]" size={20}/>
                <h3 className="font-semibold">{t.crm.dashboard.topVendedores}</h3>
              </div>
              {kpis.topVendedores.length > 0 ? (
                <div className="space-y-3">
                  {kpis.topVendedores.map((v: any, idx: number) => (
                    <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? "bg-yellow-400 text-yellow-900" : idx === 1 ? "bg-gray-300 text-gray-700" : idx === 2 ? "bg-orange-300 text-orange-800" : "bg-gray-200 text-gray-600"}`}>
                          {idx + 1}
                        </div>
                        <div className="font-medium">{v.nombre}</div>
                      </div>
                      <div className="font-bold text-[#1F3864]">${v.monto.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">{t.crm.dashboard.sinDatosVendedores}</div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="text-[#1F3864]" size={20}/>
                <h3 className="font-semibold">{t.crm.dashboard.resumen}</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-muted-foreground">{t.crm.dashboard.tasaConversion}</span>
                  <span className="font-bold text-[#1F3864]">
                    {kpis.totalOportunidades > 0 
                      ? `${((kpis.oportunidadesGanadas / kpis.totalOportunidades) * 100).toFixed(1)}%` 
                      : "0%"}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-muted-foreground">{t.crm.dashboard.promedioGanada}</span>
                  <span className="font-bold text-[#1F3864]">
                    {kpis.oportunidadesGanadas > 0 
                      ? `$${(kpis.montoTotal / kpis.oportunidadesGanadas).toLocaleString()}` 
                      : "$0"}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-muted-foreground">{t.crm.dashboard.actividadesPorDia}</span>
                  <span className="font-bold text-[#1F3864]">
                    {(kpis.actividadesMes / 30).toFixed(1)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
