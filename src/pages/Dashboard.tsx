import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS, ESTATUS_ARMADO_COLOR, fmtDate } from "@/lib/dazon";
import { BarChart3, Factory, Truck, Bike, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const KPI = ({ label, value, icon: Icon, tone = "primary" }: any) => (
  <div className="kpi-card">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-3xl font-bold text-primary mt-1">{value}</div>
      </div>
      <div className={`p-2 rounded-md bg-${tone}/10`}>
        <Icon className={`h-5 w-5 text-${tone === "primary" ? "primary" : tone}`} />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { role, user, profileName } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: motos } = await supabase.from("motocarros").select("*");
      const { data: rems } = await supabase.from("remisiones").select("*");
      setData({ motos: motos ?? [], rems: rems ?? [] });
    })();
  }, [user]);

  if (!data) return <div className="text-muted-foreground">Cargando KPIs…</div>;

  const motos: any[] = data.motos;
  const rems: any[] = data.rems;
  const total = motos.length;
  const armados = motos.filter(m => ["ARMADO", "LISTO"].includes(m.estatus_armado)).length;
  const pendientes = motos.filter(m => m.estatus_armado === "PENDIENTE").length;
  const atrasados = motos.filter(m => m.estatus_armado === "ATRASADO").length;
  const entregados = motos.filter(m => m.estatus_entrega === "ENTREGADA").length;
  const listosEntrega = motos.filter(m => ["ARMADO", "LISTO"].includes(m.estatus_armado) && m.chasis_asignado && m.estatus_entrega !== "ENTREGADA").length;
  const avance = total ? Math.round((armados / total) * 100) : 0;

  // Serie diaria plan vs real (por fecha estimada armado)
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
        <p className="text-muted-foreground mt-1">{greeting}</p>
      </div>

      {role === "admin" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <KPI label="Programadas" value={total} icon={BarChart3} />
            <KPI label="Armadas" value={armados} icon={CheckCircle2} tone="success" />
            <KPI label="Pendientes" value={pendientes} icon={Factory} />
            <KPI label="Atrasadas" value={atrasados} icon={AlertTriangle} tone="warning" />
            <KPI label="Entregadas" value={entregados} icon={Truck} tone="success" />
            <KPI label="% Avance" value={`${avance}%`} icon={BarChart3} />
          </div>

          <Card className="p-6">
            <h3 className="mb-4">Plan vs Real (acumulado)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="planAcum" stroke="hsl(var(--secondary))" name="Plan acumulado" strokeWidth={2} />
                  <Line type="monotone" dataKey="realAcum" stroke="hsl(var(--success))" name="Real acumulado" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="mb-3">Top vendedores</h3>
              <TopVendedores rems={rems} />
            </Card>
            <Card className="p-6">
              <h3 className="mb-3">Alertas</h3>
              <ul className="text-sm space-y-2">
                <li>⚠ {atrasados} motocarros atrasados</li>
                <li>📦 {listosEntrega} listos para entregar</li>
                <li>📋 {rems.filter(r => r.estatus === "PARCIAL").length} remisiones parciales</li>
              </ul>
            </Card>
          </div>
        </>
      )}

      {role === "fabrica" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI label="Pendientes" value={pendientes} icon={Factory} />
            <KPI label="Armadas" value={armados} icon={CheckCircle2} tone="success" />
            <KPI label="Atrasadas" value={atrasados} icon={AlertTriangle} tone="warning" />
            <KPI label="Capacidad diaria" value="4" icon={BarChart3} />
          </div>
          <Card className="p-6">
            <h3 className="mb-3">Próximas 10 órdenes a armar</h3>
            <ProximasOrdenes motos={motos} />
          </Card>
        </>
      )}

      {role === "logistica" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="Listos para entrega" value={listosEntrega} icon={Truck} />
          <KPI label="En ruta" value={motos.filter(m => m.estatus_entrega === "EN_RUTA").length} icon={Truck} tone="warning" />
          <KPI label="Programadas" value={motos.filter(m => m.estatus_entrega === "PROGRAMADA").length} icon={BarChart3} />
          <KPI label="Entregadas" value={entregados} icon={CheckCircle2} tone="success" />
        </div>
      )}

      {isVendedor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="Mis remisiones" value={rems.length} icon={BarChart3} />
          <KPI label="Unidades asignadas" value={motos.filter(m => m.remision_id).length} icon={Bike} />
          <KPI label="Listas para entrega" value={listosEntrega} icon={Truck} tone="success" />
          <KPI label="Entregadas" value={entregados} icon={CheckCircle2} tone="success" />
        </div>
      )}
    </div>
  );
}

function TopVendedores({ rems }: { rems: any[] }) {
  const map: Record<string, number> = {};
  rems.forEach(r => {
    const v = (r.notas || "").replace("Vendedor original: ", "") || "Sin asignar";
    map[v] = (map[v] || 0) + 1;
  });
  const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <ul className="space-y-2">
      {top.map(([v, n]) => (
        <li key={v} className="flex justify-between text-sm">
          <span>{v}</span><span className="font-semibold text-primary">{n} remisiones</span>
        </li>
      ))}
    </ul>
  );
}

function ProximasOrdenes({ motos }: { motos: any[] }) {
  const proximas = motos
    .filter(m => m.estatus_armado === "PENDIENTE" || m.estatus_armado === "ATRASADO")
    .sort((a, b) => (a.orden_armado - b.orden_armado))
    .slice(0, 10);
  if (!proximas.length) return <div className="text-sm text-muted-foreground">No hay órdenes pendientes 🎉</div>;
  return (
    <table className="data-table">
      <thead><tr><th>Orden</th><th>Modelo</th><th>Color</th><th>F. estimada</th><th>Estatus</th></tr></thead>
      <tbody>
        {proximas.map(m => (
          <tr key={m.id}>
            <td className="font-semibold">{m.orden_armado}</td>
            <td>{m.modelo}</td>
            <td>{m.color}</td>
            <td>{fmtDate(m.fecha_estimada_armado)}</td>
            <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ARMADO_COLOR[m.estatus_armado]}`}>{m.estatus_armado}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
