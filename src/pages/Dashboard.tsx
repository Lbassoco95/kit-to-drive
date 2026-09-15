import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, effEstatusArmado, diasDesvio, normColor, lineaDe, CatalogoModelos, nombreComercial, displayFabrica } from "@/lib/dazon";
import { fmtMoneda, totalYMes } from "@/lib/finanzas";
import { fdb } from "@/lib/finanzasDb";
import { useLang } from "@/contexts/LangContext";
import { EstatusBadge } from "@/components/EstatusBadge";
import { InventarioStatus } from "@/components/InventarioStatus";
import { ResumenAvisos } from "@/components/BandejaAvisos";
import { BarChart3, Factory, Truck, Bike, AlertTriangle, CheckCircle, Clock, Users, Boxes, Wrench, TrendingUp, DollarSign, Wallet, type LucideIcon } from "lucide-react";
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
  const { perms, area, nivel, user, profileName } = useAuth();
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
        if (!cancelled) setError(e instanceof Error ? e.message : t.dashboard.errorInesperado);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [user, retry, t.dashboard.errorInesperado]);

  // El tablero general es de Dirección; las demás áreas entran a su módulo.
  useEffect(() => {
    if (!area || !nivel) return;
    if (perms.inicio !== "/") nav(perms.inicio);
  }, [area, nivel, perms.inicio, nav]);

  const greeting = t.dashboard.greeting(profileName || t.dashboard.usuario, area && nivel ? `${t.areas[area]} · ${t.niveles[nivel]}` : "");

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
            {t.dashboard.errorCargar}
          </div>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => setRetry(r => r + 1)}
            className="px-4 py-2 rounded-md bg-[#1F3864] text-white font-medium hover:bg-[#152a4a] transition-colors"
          >
            {t.dashboard.reintentar}
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
      return { iso, label: t.dashboard.diasSemana[i], count, status };
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

  const isVendedor = area === "comercial";

  return (
    <div className="space-y-6">
      <div>
        <h1>{t.dashboard.title}</h1>
        <p className="text-muted-foreground text-base mt-1">{greeting}</p>
      </div>

      {/* Avisos de otra área sin acusar. Sólo se dibuja si hay. */}
      <ResumenAvisos onClick={() => nav("/produccion")} />

      {(area === "direccion" || area === "administracion") && (
        <div className="space-y-8">
          <SeccionDashboard titulo={t.dashboard.seccionOperacion} subtitulo={t.dashboard.seccionOperacionSub}>
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
                  <div key={d.iso} className="flex-1 text-center" title={t.dashboard.armadosDia(d.iso, d.count)}>
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

          <SeccionDashboard titulo={t.dashboard.seccionFinanzas} subtitulo={t.dashboard.seccionFinanzasSub}>
            <ResumenFinanciero />
          </SeccionDashboard>

          <SeccionDashboard titulo={t.dashboard.seccionAvance}>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="mb-0">{t.dashboard.planVsReal}</h3>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-[#2E75B6]/10 text-[#2E75B6]"
                  title={t.dashboard.avanceTooltip}
                >
                  {t.dashboard.avanceSobreConfiguradas(avance)}
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

          <SeccionDashboard titulo={t.dashboard.seccionComercial}>
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

      {area === "administracion" && (
        <ResumenEjecutivo />
      )}

      {area === "fabrica" && (
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

      {area === "almacen_logistica" && (
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

// Tarjetas financieras destacadas: dinero recibido (Control Financiero) y
// monto vendido (CRM), con total histórico y mes en curso.
function ResumenFinanciero() {
  const { t } = useLang();
  const nav = useNavigate();
  const e = t.dashboard.ejecutivo;
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    dineroRecibido: { total: 0, mes: 0 },
    montoVendido: { total: 0, mes: 0 },
  });

  useEffect(() => {
    let mounted = true;
    const cargar = async () => {
      const mesActual = new Date().toISOString().slice(0, 7);
      const [{ data: movs }, { data: opsGanadasData }] = await Promise.all([
        fdb.from("movimientos_financieros").select("monto_mxn, fecha_movimiento").eq("tipo", "INGRESO").eq("estatus", "CONFIRMADO"),
        supabase.from("crm_oportunidades").select("valor_estimado, fecha_cierre_real").eq("etapa", "ganada"),
      ]);

      const dineroRecibido = totalYMes(
        (movs ?? []).map((m: { monto_mxn: number | null; fecha_movimiento: string | null }) => ({ monto: m.monto_mxn, fecha: m.fecha_movimiento })),
        mesActual,
      );
      const montoVendido = totalYMes(
        (opsGanadasData ?? []).map((o: { valor_estimado: number | null; fecha_cierre_real: string | null }) => ({ monto: o.valor_estimado, fecha: o.fecha_cierre_real })),
        mesActual,
      );

      if (mounted) {
        setKpis({ dineroRecibido, montoVendido });
        setLoading(false);
      }
    };
    cargar();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <button onClick={() => nav("/finanzas")} className="text-left">
        <Card className="p-5 bg-emerald-50 border-emerald-100 h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet size={18} className="text-emerald-600" /> {e.dineroRecibido}
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-1">{fmtMoneda(kpis.dineroRecibido.total)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {e.mesEnCurso}: <span className="font-semibold text-emerald-700">{fmtMoneda(kpis.dineroRecibido.mes)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{e.dineroRecibidoNota}</div>
        </Card>
      </button>
      <button onClick={() => nav("/crm/oportunidades")} className="text-left">
        <Card className="p-5 bg-yellow-50 border-yellow-100 h-full hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign size={18} className="text-yellow-600" /> {e.montoVendido}
          </div>
          <div className="text-3xl font-extrabold text-yellow-600 mt-1">{fmtMoneda(kpis.montoVendido.total)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {e.mesEnCurso}: <span className="font-semibold text-yellow-700">{fmtMoneda(kpis.montoVendido.mes)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{e.montoVendidoNota}</div>
        </Card>
      </button>
    </div>
  );
}

// Resumen ejecutivo para Administración / Finanzas: une dinero, motocarros
// y actividad del equipo comercial en una vista estratégica.
function ResumenEjecutivo() {
  const { t } = useLang();
  const e = t.dashboard.ejecutivo;
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    motosTotal: 0,
    motosEntregados: 0,
    motosPorEntregar: 0,
    remisionesTotal: 0,
    remisionesCompletas: 0,
    remisionesParciales: 0,
    oportunidadesTotal: 0,
    oportunidadesGanadas: 0,
    actividadesMes: 0,
    topVendedores: [] as { nombre: string; monto: number }[],
  });

  useEffect(() => {
    let mounted = true;
    const cargar = async () => {
      const ahora = new Date();
      const hace30 = new Date(ahora.setDate(ahora.getDate() - 30)).toISOString();
      const [
        { data: motos },
        { data: rems },
        { count: opsTotal },
        { count: opsGanadas },
        { data: opsGanadasData },
        { count: actividades },
      ] = await Promise.all([
        supabase.from("motocarros").select("estatus_entrega"),
        supabase.from("remisiones").select("estatus"),
        supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }),
        // «ganada» y `valor_estimado` son los nombres reales en la base; con los
        // anteriores el resumen ejecutivo daba 0 oportunidades ganadas y $0.
        supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }).eq("etapa", "ganada"),
        supabase.from("crm_oportunidades").select("vendedor_id, valor_estimado").eq("etapa", "ganada"),
        // La columna es `fecha_actividad`: con `fecha` el conteo salía en 0.
        supabase.from("crm_actividades").select("*", { count: "exact", head: true }).gte("fecha_actividad", hace30),
      ]);

      const motosTotal = (motos ?? []).length;
      const motosEntregados = (motos ?? []).filter((m: any) => m.estatus_entrega === "ENTREGADA").length;
      const motosPorEntregar = motosTotal - motosEntregados;

      const remisionesTotal = (rems ?? []).length;
      const remisionesCompletas = (rems ?? []).filter((r: any) => r.estatus === "COMPLETA").length;
      const remisionesParciales = (rems ?? []).filter((r: any) => r.estatus === "PARCIAL").length;

      const vendedorMontos: Record<string, number> = {};
      (opsGanadasData ?? []).forEach((o: any) => {
        if (o.vendedor_id && o.valor_estimado) {
          vendedorMontos[o.vendedor_id] = (vendedorMontos[o.vendedor_id] || 0) + o.valor_estimado;
        }
      });

      let topVendedores: { nombre: string; monto: number }[] = [];
      const vendedorIds = Object.keys(vendedorMontos);
      if (vendedorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", vendedorIds);
        topVendedores = (profiles ?? [])
          .map((p: any) => ({ nombre: p.nombre_completo || e.sinNombre, monto: vendedorMontos[p.id] || 0 }))
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5);
      }

      if (mounted) {
        setKpis({
          motosTotal,
          motosEntregados,
          motosPorEntregar,
          remisionesTotal,
          remisionesCompletas,
          remisionesParciales,
          oportunidadesTotal: opsTotal || 0,
          oportunidadesGanadas: opsGanadas || 0,
          actividadesMes: actividades || 0,
          topVendedores,
        });
        setLoading(false);
      }
    };
    cargar();
    return () => { mounted = false; };
  }, [e.sinNombre]);

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">{e.cargando}</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-[#1F3864]">{e.title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-[#1F3864]/5 border-[#1F3864]/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bike size={18} className="text-[#1F3864]" /> {e.motocarrosTotales}
          </div>
          <div className="text-3xl font-extrabold text-[#1F3864] mt-1">{kpis.motosTotal}</div>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle size={18} className="text-emerald-600" /> {e.entregados}
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-1">{kpis.motosEntregados}</div>
        </Card>
        <Card className="p-4 bg-amber-50 border-amber-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck size={18} className="text-amber-600" /> {e.porEntregar}
          </div>
          <div className="text-3xl font-extrabold text-amber-600 mt-1">{kpis.motosPorEntregar}</div>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 size={18} className="text-blue-600" /> {e.remisiones}
          </div>
          <div className="text-3xl font-extrabold text-blue-600 mt-1">{kpis.remisionesTotal}</div>
        </Card>
        <Card className="p-4 bg-purple-50 border-purple-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp size={18} className="text-purple-600" /> {e.oportunidades}
          </div>
          <div className="text-3xl font-extrabold text-purple-600 mt-1">{kpis.oportunidadesTotal}</div>
        </Card>
        <Card className="p-4 bg-green-50 border-green-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle size={18} className="text-green-600" /> {e.oportunidadesGanadas}
          </div>
          <div className="text-3xl font-extrabold text-green-600 mt-1">{kpis.oportunidadesGanadas}</div>
        </Card>
        <Card className="p-4 bg-indigo-50 border-indigo-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users size={18} className="text-indigo-600" /> {e.actividades30}
          </div>
          <div className="text-3xl font-extrabold text-indigo-600 mt-1">{kpis.actividadesMes}</div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-[#1F3864] flex items-center gap-2 mb-3">
            <Truck size={20} /> {e.estadoRemisiones}
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>{e.completas}</span><span className="font-bold text-emerald-600">{kpis.remisionesCompletas}</span></div>
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>{e.parciales}</span><span className="font-bold text-[#1F3864]">{kpis.remisionesParciales}</span></div>
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>{e.otras}</span><span className="font-bold text-slate-600">{kpis.remisionesTotal - kpis.remisionesCompletas - kpis.remisionesParciales}</span></div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-[#1F3864] flex items-center gap-2 mb-3">
            <Users size={20} /> {e.topVendedores}
          </h3>
          {kpis.topVendedores.length > 0 ? (
            <div className="space-y-2">
              {kpis.topVendedores.map((v, idx) => (
                <div key={v.nombre} className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="font-medium">{idx + 1}. {v.nombre}</span>
                  <span className="font-bold text-[#1F3864]">{fmtMoneda(v.monto)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">{e.sinVentas}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
