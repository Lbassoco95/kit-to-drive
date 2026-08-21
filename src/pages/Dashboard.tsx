import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, effEstatusArmado, diasDesvio, normColor, lineaDe, CatalogoModelos, nombreComercial, displayFabrica } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";
import { EstatusBadge } from "@/components/EstatusBadge";
import { InventarioStatus } from "@/components/InventarioStatus";
import { BarChart3, Factory, Truck, Bike, AlertTriangle, CheckCircle, Clock, Users, Boxes, Wrench, type LucideIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const CAPACIDAD = 4;

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  onClick,
  tooltip,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  color: string;
  onClick?: () => void;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className="text-left bg-card rounded-xl border border-border min-h-[140px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col"
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>
          <Icon size={40} strokeWidth={2.2} style={{ color }} />
        </div>
      </div>
      <div className="text-4xl font-bold mt-3" style={{ color }}>{value}</div>
      <div className="text-sm text-muted-foreground uppercase tracking-wide mt-1 font-medium">{label}</div>
    </button>
  );
}

function SeccionDashboard({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{titulo}</h2>
        {subtitulo && <p className="text-muted-foreground text-sm mt-0.5">{subtitulo}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { role, user, profileName } = useAuth();
  const nav = useNavigate();
  const { t } = useLang();
  const [data, setData] = useState<{ motos: any[]; rems: any[]; catalogo: CatalogoModelos; chasisPorConfigurar: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: motos, error: errM }, { data: rems, error: errR }, { data: catalogo }, { data: chasisDisp }] = await Promise.all([
          supabase
            .from("motocarros")
            .select(
              "id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado, estatus_entrega, chasis_asignado, remision_id, fecha_estimada_armado, fecha_real_armado, fecha_estimada_entrega, fecha_real_entrega"
            ),
          supabase
            .from("remisiones")
            .select(
              "id, folio_remision, estatus, vendedor_id, total_unidades_solicitadas, notas, profiles:vendedor_id(nombre_completo)"
            ),
          supabase.from("modelos_producto").select("modelo, linea, nombre_comercial"),
          supabase.from("inventario_chasis").select("modelo").is("motocarro_id", null),
        ]);
        if (cancelled) return;
        if (errM || errR) {
          setError([errM?.message, errR?.message].filter(Boolean).join("; ") || "Error al consultar Supabase");
          setData(null);
        } else {
          const catMap: CatalogoModelos = new Map((catalogo ?? []).map((c: any) => [c.modelo, { linea: c.linea, nombre_comercial: c.nombre_comercial }]));
          const chasisPorConfigurar = (chasisDisp ?? []).filter((c: any) => lineaDe(c.modelo, catMap) === "motocarro").length;
          setData({
            motos: (motos ?? []).map((m: any) => ({ ...m, color: normColor(m.color), _eff: effEstatusArmado(m) })),
            rems: rems ?? [],
            catalogo: catMap,
            chasisPorConfigurar,
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [user, retry]);

  // Redirect based on role
  useEffect(() => {
    if (role === "finanzas" || role === "admin_financiero") { nav("/finanzas"); return; }
    if (role === "ventas" || role === "auxiliar_ventas") { nav("/crm/oportunidades"); return; }
    if (role === "director_ventas" || role === "coordinador_ventas") { nav("/crm/oportunidades"); return; }
  }, [role, nav]);

  const greeting = t.dashboard.greeting(profileName || "usuario", role ? t.roles[role] : "");

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1>{t.dashboard.title}</h1>
          <p className="text-muted-foreground text-base mt-1">{greeting}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1>{t.dashboard.title}</h1>
          <p className="text-muted-foreground text-base mt-1">{greeting}</p>
        </div>
        <Card className="p-6 border-[#991B1B]">
          <div className="flex items-center gap-2 mb-2 text-[#991B1B] font-bold">
            <AlertTriangle size={20} />
            Error al cargar el dashboard
          </div>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => setRetry(r => r + 1)}
            className="px-4 py-2 rounded-md bg-[#1F3864] text-white font-medium hover:bg-[#152a4a] transition-colors"
          >
            Reintentar
          </button>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // "Programadas", "Armadas", "Pendientes", "Atrasadas" y "Entregadas" cuentan
  // sólo línea motocarro — los mototaxis y otras líneas no entran al plan de
  // producción (ver KIT-3, Parte 5).
  const motos: any[] = data.motos.filter((m: any) => lineaDe(m.modelo, data.catalogo) === "motocarro");
  const rems: any[] = data.rems;
  const total = motos.length;
  const armados = motos.filter(m => m._eff === "ARMADO" || m._eff === "LISTO").length;
  const pendientes = motos.filter(m => m._eff === "PENDIENTE" || m._eff === "EN_PROCESO").length;
  const atrasados = motos.filter(m => m._eff === "ATRASADO");
  const entregados = motos.filter(m => m.estatus_entrega === "ENTREGADA").length;
  const listosEntrega = motos.filter(m => (m._eff === "ARMADO" || m._eff === "LISTO") && m.chasis_asignado && m.estatus_entrega !== "ENTREGADA").length;
  const avance = total ? Math.round((armados / total) * 100) : 0;

  // Stock terminado (línea motocarro): libre = armado/listo sin remisión.
  const stockLibre = motos.filter(m => (m._eff === "ARMADO" || m._eff === "LISTO") && !m.remision_id);
  const stockLibreViejo = stockLibre.filter(m => {
    if (!m.fecha_real_armado) return false;
    const dias = Math.floor((Date.now() - new Date(m.fecha_real_armado + "T00:00:00").getTime()) / 86400000);
    return dias > 60;
  }).length;
  const chasisPorConfigurar = data.chasisPorConfigurar;

  // Capacidad de hoy
  const today = new Date().toISOString().slice(0, 10);
  const armadosHoy = motos.filter(m => m.fecha_real_armado === today).length;
  const capPct = Math.min(100, Math.round((armadosHoy / CAPACIDAD) * 100));
  const capColor = armadosHoy >= CAPACIDAD ? "#065F46" : armadosHoy >= CAPACIDAD / 2 ? "#92400E" : "#991B1B";

  // Mini-calendario L-V (semana actual)
  const weekDays = (() => {
    const d = new Date(); const day = d.getDay() || 7;
    const monday = new Date(d); monday.setDate(d.getDate() - day + 1);
    return Array.from({ length: 5 }, (_, i) => {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const count = motos.filter(m => m.fecha_real_armado === iso).length;
      const isFuture = iso > today;
      const status = isFuture ? "future" : count >= CAPACIDAD ? "ok" : count > 0 ? "partial" : "miss";
      return { iso, label: ["L","M","M","J","V"][i], count, status };
    });
  })();

  // Series plan vs real
  const byDate: Record<string, { plan: number; real: number }> = {};
  motos.forEach(m => {
    const f = m.fecha_estimada_armado;
    if (f) { byDate[f] = byDate[f] || { plan: 0, real: 0 }; byDate[f].plan++; }
    const fr = m.fecha_real_armado;
    if (fr) { byDate[fr] = byDate[fr] || { plan: 0, real: 0 }; byDate[fr].real++; }
  });
  const series = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    .reduce((acc: any[], [date, v], i) => {
      const prev = acc[i - 1] || { planAcum: 0, realAcum: 0 };
      acc.push({ date: fmtDate(date), planAcum: prev.planAcum + v.plan, realAcum: prev.realAcum + v.real });
      return acc;
    }, []);

  const isVendedor = role === "ventas";

  return (
    <div className="space-y-6">
      <div>
        <h1>{t.dashboard.title}</h1>
        <p className="text-muted-foreground text-base mt-1">{greeting}</p>
      </div>

      {role === "admin" && (
        <div className="space-y-8">
          <SeccionDashboard titulo="Operación" subtitulo="Producción y entregas de las unidades del embarque">
            <InventarioStatus />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard label={t.dashboard.kpi.programadas} value={total} icon={BarChart3} color="#1F3864" tooltip={t.dashboard.tooltips.totalPlan} onClick={() => nav("/produccion")} />
              <KpiCard label={t.dashboard.kpi.porConfigurar} value={chasisPorConfigurar} icon={Wrench} color="#D97706" tooltip={t.dashboard.tooltips.chasisSinUnidad} onClick={() => nav("/produccion")} />
              <KpiCard label={t.dashboard.kpi.armadas} value={armados} icon={CheckCircle} color="#065F46" tooltip={t.dashboard.tooltips.armadosLisots} onClick={() => nav("/produccion")} />
              <KpiCard label={t.dashboard.kpi.pendientes} value={pendientes} icon={Clock} color="#6B7280" tooltip={t.dashboard.tooltips.porArmar} onClick={() => nav("/produccion")} />
              <KpiCard label={t.dashboard.kpi.atrasadas} value={atrasados.length} icon={AlertTriangle} color="#991B1B" tooltip={t.dashboard.tooltips.pasadosFecha} onClick={() => nav("/produccion")} />
              <KpiCard label={t.dashboard.kpi.entregadas} value={entregados} icon={Truck} color="#5B21B6" tooltip={t.dashboard.tooltips.entregadosCliente} onClick={() => nav("/entregas")} />
              <KpiCard label={t.dashboard.kpi.stockLibre} value={stockLibre.length} icon={Boxes} color="#2E75B6" tooltip={t.dashboard.tooltips.stockLibre} onClick={() => nav("/inventario")} />
            </div>

            {stockLibreViejo > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#FEF3C7] text-[#92400E] text-sm font-medium">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                {t.dashboard.avisoStockViejo(stockLibreViejo)}
              </div>
            )}

            {/* Capacidad de hoy */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3>{t.dashboard.capacidad.title}</h3>
                <div className="text-2xl font-bold" style={{ color: capColor }}>{t.dashboard.capacidad.armadosHoy(armadosHoy, CAPACIDAD)}</div>
              </div>
              <div className="h-6 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${capPct}%`, backgroundColor: capColor }} />
              </div>
              <div className="flex gap-2 mt-5">
                {weekDays.map(d => (
                  <div key={d.iso} className="flex-1 text-center" title={`${d.iso}: ${d.count} armados`}>
                    <div className="text-xs text-muted-foreground mb-1 font-medium">{d.label}</div>
                    <div
                      className="h-12 rounded-md flex items-center justify-center text-sm font-bold border-2"
                      style={{
                        backgroundColor: d.status === "ok" ? "#D1FAE5" : d.status === "partial" ? "#FEF3C7" : d.status === "miss" ? "#FEE2E2" : "#F3F4F6",
                        color: d.status === "ok" ? "#065F46" : d.status === "partial" ? "#92400E" : d.status === "miss" ? "#991B1B" : "#9CA3AF",
                        borderColor: "transparent",
                      }}
                    >
                      {d.status === "future" ? "—" : d.count}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Atrasados */}
            {atrasados.length > 0 && (
              <Card className="p-6 border-2 border-[#FEE2E2]" style={{ background: "#FEF2F2" }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="text-[#991B1B]" size={28} />
                  <h3 className="!text-[#991B1B]">{t.dashboard.atrasados(atrasados.length)}</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {atrasados.slice(0, 8).map(m => (
                    <button key={m.id} onClick={() => nav("/produccion")} className="text-left p-3 bg-white rounded-md border border-[#FECACA] hover:border-[#991B1B] flex justify-between items-center">
                      <div>
                        <div className="font-bold text-[#1F3864]">#{m.orden_armado} · {nombreComercial(m.modelo, data.catalogo)} {m.color}</div>
                        <div className="text-xs text-muted-foreground">{t.dashboard.fechaEstimada}: {fmtDate(m.fecha_estimada_armado)}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEE2E2] text-[#991B1B]">{t.dashboard.diasAtraso(diasDesvio(m) ?? 0)}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </SeccionDashboard>

          <SeccionDashboard titulo="Avance">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="mb-0">{t.dashboard.planVsReal}</h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-[#2E75B6]/10 text-[#2E75B6]">
                  {avance}% avance
                </span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="planAcum" stroke="#2E75B6" name="Plan acumulado" strokeWidth={3} />
                    <Line type="monotone" dataKey="realAcum" stroke="#065F46" name="Real acumulado" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </SeccionDashboard>

          <SeccionDashboard titulo="Comercial">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-6">
                <h3 className="mb-4 flex items-center gap-2"><Users size={22}/> {t.dashboard.topVendedores}</h3>
                <TopVendedores rems={rems} />
              </Card>
              <Card className="p-6">
                <h3 className="mb-4">{t.dashboard.resumenRapido}</h3>
                <ul className="text-base space-y-3">
                  <li className="flex items-center gap-2"><Truck className="text-[#5B21B6]" size={20}/> {t.dashboard.listosParaEntregar(listosEntrega)}</li>
                  <li className="flex items-center gap-2"><BarChart3 className="text-[#1F3864]" size={20}/> {t.dashboard.remisionesParciales(rems.filter(r => r.estatus === "PARCIAL").length)}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="text-[#065F46]" size={20}/> {t.dashboard.remisionesCompletas(rems.filter(r => r.estatus === "COMPLETA").length)}</li>
                </ul>
              </Card>
            </div>
          </SeccionDashboard>
        </div>
      )}

      {role === "fabrica" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t.dashboard.kpi.pendientes} value={pendientes} icon={Clock} color="#6B7280" />
            <KpiCard label={t.dashboard.kpi.armadas} value={armados} icon={CheckCircle} color="#065F46" />
            <KpiCard label={t.dashboard.kpi.atrasadas} value={atrasados.length} icon={AlertTriangle} color="#991B1B" />
            <KpiCard label={t.dashboard.kpi.capacidadDiaria} value={CAPACIDAD} icon={Factory} color="#1F3864" />
          </div>
          <Card className="p-6">
            <h3 className="mb-3">{t.dashboard.proximasOrdenes}</h3>
            <ProximasOrdenes motos={motos} catalogo={data.catalogo} t={t} />
          </Card>
        </>
      )}

      {role === "logistica" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label={t.dashboard.kpi.listosEntrega} value={listosEntrega} icon={Truck} color="#1F3864" onClick={() => nav("/entregas")} />
          <KpiCard label={t.dashboard.kpi.enRuta} value={motos.filter(m => m.estatus_entrega === "EN_RUTA").length} icon={Truck} color="#92400E" />
          <KpiCard label={t.dashboard.kpi.programadasHoy} value={motos.filter(m => m.estatus_entrega === "PROGRAMADA").length} icon={BarChart3} color="#2E75B6" />
          <KpiCard label={t.dashboard.kpi.entregadas} value={entregados} icon={CheckCircle} color="#5B21B6" />
        </div>
      )}

      {isVendedor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label={t.dashboard.kpi.misRemisiones} value={rems.length} icon={BarChart3} color="#1F3864" onClick={() => nav("/remisiones")} />
          <KpiCard label={t.dashboard.kpi.unidadesAsignadas} value={motos.filter(m => m.remision_id).length} icon={Bike} color="#2E75B6" onClick={() => nav("/mis-motocarros")} />
          <KpiCard label={t.dashboard.kpi.listasEntrega} value={listosEntrega} icon={Truck} color="#065F46" />
          <KpiCard label={t.dashboard.kpi.entregadas} value={entregados} icon={CheckCircle} color="#5B21B6" />
        </div>
      )}
    </div>
  );
}

function TopVendedores({ rems }: { rems: any[] }) {
  const map: Record<string, number> = {};
  rems.forEach(r => {
    const v = r.profiles?.nombre_completo || (r.notas || "").replace("Vendedor original: ", "") || "Sin asignar";
    map[v] = (map[v] || 0) + 1;
  });
  const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] || 1;
  return (
    <ul className="space-y-3">
      {top.map(([v, n]) => {
        const initials = v.split(" ").map(s => s[0]).slice(0,2).join("").toUpperCase();
        return (
          <li key={v} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2E75B6] text-white flex items-center justify-center font-bold text-sm shrink-0">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between mb-1">
                <span className="font-medium text-sm truncate">{v}</span>
                <span className="font-bold text-[#1F3864] text-sm">{n}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-[#2E75B6]" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ProximasOrdenes({ motos, catalogo, t }: { motos: any[]; catalogo: CatalogoModelos; t: any }) {
  const proximas = motos
    .filter(m => m._eff === "PENDIENTE" || m._eff === "EN_PROCESO" || m._eff === "ATRASADO")
    .sort((a, b) => (a.orden_armado - b.orden_armado))
    .slice(0, 10);
  if (!proximas.length) return <div className="text-sm text-muted-foreground">{t.dashboard.sinOrdenes}</div>;
  return (
    <table className="data-table">
      <thead><tr><th>{t.fields.orden}</th><th>{t.fields.modelo}</th><th>{t.fields.color}</th><th>{t.dashboard.fechaEstimada}</th><th>{t.fields.estatus}</th></tr></thead>
      <tbody>
        {proximas.map(m => (
          <tr key={m.id}>
            <td className="font-semibold">{m.orden_armado}</td>
            <td>{displayFabrica(m.modelo, catalogo)}</td>
            <td>{m.color}</td>
            <td>{fmtDate(m.fecha_estimada_armado)}</td>
            <td><EstatusBadge estatus={m._eff} size="sm" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
