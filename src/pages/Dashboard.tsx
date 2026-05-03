import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS, fmtDate, effEstatusArmado, diasDesvio, normColor } from "@/lib/dazon";
import { EstatusBadge } from "@/components/EstatusBadge";
import { BarChart3, Factory, Truck, Bike, AlertTriangle, CheckCircle, Clock, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const CAPACIDAD = 4;

const KpiCard = ({ label, value, icon: Icon, color, onClick, tooltip }: any) => (
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

export default function Dashboard() {
  const { role, user, profileName } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: motos } = await supabase.from("motocarros").select("*");
      const { data: rems } = await supabase.from("remisiones").select("*, profiles:vendedor_id(nombre_completo)");
      setData({
        motos: (motos ?? []).map((m: any) => ({ ...m, color: normColor(m.color), _eff: effEstatusArmado(m) })),
        rems: rems ?? [],
      });
    })();
  }, [user]);

  if (!data) return <div className="text-muted-foreground p-8">Cargando KPIs…</div>;

  const motos: any[] = data.motos;
  const rems: any[] = data.rems;
  const total = motos.length;
  const armados = motos.filter(m => m._eff === "ARMADO" || m._eff === "LISTO").length;
  const pendientes = motos.filter(m => m._eff === "PENDIENTE" || m._eff === "EN_PROCESO").length;
  const atrasados = motos.filter(m => m._eff === "ATRASADO");
  const entregados = motos.filter(m => m.estatus_entrega === "ENTREGADA").length;
  const listosEntrega = motos.filter(m => (m._eff === "ARMADO" || m._eff === "LISTO") && m.chasis_asignado && m.estatus_entrega !== "ENTREGADA").length;
  const avance = total ? Math.round((armados / total) * 100) : 0;

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
  const greeting = `Hola, ${profileName || "usuario"} — ${role ? ROLE_LABELS[role] : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground text-base mt-1">{greeting}</p>
      </div>

      {role === "admin" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label="Programadas" value={total} icon={BarChart3} color="#1F3864" tooltip="Total de motocarros en plan" onClick={() => nav("/produccion")} />
            <KpiCard label="Armadas" value={armados} icon={CheckCircle} color="#065F46" tooltip="Armados o listos" onClick={() => nav("/produccion")} />
            <KpiCard label="Pendientes" value={pendientes} icon={Clock} color="#6B7280" tooltip="Aún por armar" onClick={() => nav("/produccion")} />
            <KpiCard label="Atrasadas" value={atrasados.length} icon={AlertTriangle} color="#991B1B" tooltip="Pasadas de fecha estimada" onClick={() => nav("/produccion")} />
            <KpiCard label="Entregadas" value={entregados} icon={Truck} color="#5B21B6" tooltip="Entregadas a cliente" onClick={() => nav("/entregas")} />
            <KpiCard label="% Avance" value={`${avance}%`} icon={BarChart3} color="#2E75B6" tooltip="Armados / total" />
          </div>

          {/* Capacidad de hoy */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3>Capacidad de hoy</h3>
              <div className="text-2xl font-bold" style={{ color: capColor }}>{armadosHoy} de {CAPACIDAD} motocarros armados hoy</div>
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
                <h3 className="!text-[#991B1B]">Motocarros atrasados ({atrasados.length})</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {atrasados.slice(0, 8).map(m => (
                  <button key={m.id} onClick={() => nav("/produccion")} className="text-left p-3 bg-white rounded-md border border-[#FECACA] hover:border-[#991B1B] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#1F3864]">#{m.orden_armado} · {m.modelo} {m.color}</div>
                      <div className="text-xs text-muted-foreground">Estimada: {fmtDate(m.fecha_estimada_armado)}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEE2E2] text-[#991B1B]">+{diasDesvio(m)}d</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="mb-4">Plan vs Real (acumulado)</h3>
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

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="mb-4 flex items-center gap-2"><Users size={22}/> Top vendedores</h3>
              <TopVendedores rems={rems} />
            </Card>
            <Card className="p-6">
              <h3 className="mb-4">Resumen rápido</h3>
              <ul className="text-base space-y-3">
                <li className="flex items-center gap-2"><Truck className="text-[#5B21B6]" size={20}/> {listosEntrega} listos para entregar</li>
                <li className="flex items-center gap-2"><BarChart3 className="text-[#1F3864]" size={20}/> {rems.filter(r => r.estatus === "PARCIAL").length} remisiones parciales</li>
                <li className="flex items-center gap-2"><CheckCircle className="text-[#065F46]" size={20}/> {rems.filter(r => r.estatus === "COMPLETA").length} remisiones completas</li>
              </ul>
            </Card>
          </div>
        </>
      )}

      {role === "fabrica" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Pendientes" value={pendientes} icon={Clock} color="#6B7280" />
            <KpiCard label="Armadas" value={armados} icon={CheckCircle} color="#065F46" />
            <KpiCard label="Atrasadas" value={atrasados.length} icon={AlertTriangle} color="#991B1B" />
            <KpiCard label="Capacidad diaria" value={CAPACIDAD} icon={Factory} color="#1F3864" />
          </div>
          <Card className="p-6">
            <h3 className="mb-3">Próximas 10 órdenes a armar</h3>
            <ProximasOrdenes motos={motos} />
          </Card>
        </>
      )}

      {role === "logistica" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Listos para entrega" value={listosEntrega} icon={Truck} color="#1F3864" onClick={() => nav("/entregas")} />
          <KpiCard label="En ruta" value={motos.filter(m => m.estatus_entrega === "EN_RUTA").length} icon={Truck} color="#92400E" />
          <KpiCard label="Programadas" value={motos.filter(m => m.estatus_entrega === "PROGRAMADA").length} icon={BarChart3} color="#2E75B6" />
          <KpiCard label="Entregadas" value={entregados} icon={CheckCircle} color="#5B21B6" />
        </div>
      )}

      {isVendedor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Mis remisiones" value={rems.length} icon={BarChart3} color="#1F3864" onClick={() => nav("/remisiones")} />
          <KpiCard label="Unidades asignadas" value={motos.filter(m => m.remision_id).length} icon={Bike} color="#2E75B6" onClick={() => nav("/mis-motocarros")} />
          <KpiCard label="Listas para entrega" value={listosEntrega} icon={Truck} color="#065F46" />
          <KpiCard label="Entregadas" value={entregados} icon={CheckCircle} color="#5B21B6" />
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

function ProximasOrdenes({ motos }: { motos: any[] }) {
  const proximas = motos
    .filter(m => m._eff === "PENDIENTE" || m._eff === "EN_PROCESO" || m._eff === "ATRASADO")
    .sort((a, b) => (a.orden_armado - b.orden_armado))
    .slice(0, 10);
  if (!proximas.length) return <div className="text-sm text-muted-foreground">No hay órdenes pendientes 🎉</div>;
  return (
    <table className="data-table">
      <thead><tr><th>Orden</th><th>Modelo</th><th>Color</th><th>Fecha estimada</th><th>Estatus</th></tr></thead>
      <tbody>
        {proximas.map(m => (
          <tr key={m.id}>
            <td className="font-semibold">{m.orden_armado}</td>
            <td>{m.modelo}</td>
            <td>{m.color}</td>
            <td>{fmtDate(m.fecha_estimada_armado)}</td>
            <td><EstatusBadge estatus={m._eff} size="sm" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
