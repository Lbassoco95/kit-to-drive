import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, PackageSearch, TrendingDown } from "lucide-react";

type Stats = {
  disponibles: number;        // motocarros sin remisión asignada (con NS o no)
  conSerial: number;          // disponibles que ya tienen NS chasis + NS motor
  sinSerial: number;          // disponibles sin NS (no se pueden asignar a clientes)
  demandaPendiente: number;   // unidades aún por asignar en remisiones NUEVA/PARCIAL
  remisionesPendientes: number;
};

export function InventarioStatus({ refreshKey }: { refreshKey?: number }) {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: motos } = await supabase
        .from("motocarros")
        .select("id, ns_chasis, ns_motor, remision_id, estatus_entrega");
      const { data: rems } = await supabase
        .from("remisiones")
        .select("id, total_unidades_solicitadas, estatus")
        .in("estatus", ["NUEVA", "PARCIAL"]);
      const { data: asign } = await supabase
        .from("motocarros")
        .select("remision_id")
        .not("remision_id", "is", null);

      const asignCount = new Map<string, number>();
      (asign ?? []).forEach((m: any) => asignCount.set(m.remision_id, (asignCount.get(m.remision_id) ?? 0) + 1));

      const disponiblesArr = (motos ?? []).filter((m: any) => !m.remision_id && m.estatus_entrega !== "ENTREGADA");
      const disponibles = disponiblesArr.length;
      const conSerial = disponiblesArr.filter((m: any) => m.ns_chasis && m.ns_motor).length;
      const sinSerial = disponibles - conSerial;

      let demandaPendiente = 0;
      (rems ?? []).forEach((r: any) => {
        const ya = asignCount.get(r.id) ?? 0;
        demandaPendiente += Math.max(0, r.total_unidades_solicitadas - ya);
      });

      setS({ disponibles, conSerial, sinSerial, demandaPendiente, remisionesPendientes: rems?.length ?? 0 });
    })();
  }, [refreshKey]);

  if (!s) return null;

  const deficit = s.demandaPendiente - s.conSerial;
  const critico = s.conSerial === 0 && s.demandaPendiente > 0;
  const alerta = deficit > 0 && !critico;
  const ok = deficit <= 0 && s.conSerial >= 4;

  const tone = critico
    ? { bg: "bg-[#FEE2E2] border-[#C0392B]", text: "text-[#991B1B]", icon: <AlertTriangle className="h-7 w-7" /> }
    : alerta
    ? { bg: "bg-[#FEF3C7] border-[#D97706]", text: "text-[#92400E]", icon: <TrendingDown className="h-7 w-7" /> }
    : ok
    ? { bg: "bg-[#D1FAE5] border-[#065F46]", text: "text-[#065F46]", icon: <CheckCircle2 className="h-7 w-7" /> }
    : { bg: "bg-slate-50 border-slate-300", text: "text-slate-700", icon: <PackageSearch className="h-7 w-7" /> };

  return (
    <Card className={`p-4 border-2 ${tone.bg}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className={tone.text}>{tone.icon}</div>
        <div className="flex-1 min-w-[260px]">
          <div className={`font-bold text-lg ${tone.text}`}>
            {critico && "⚠ Sin motocarros con serial — no se pueden asignar nuevas remisiones"}
            {alerta && `Inventario bajo — faltan ${deficit} motocarros con NS para cubrir la demanda`}
            {ok && "Inventario saludable"}
            {!critico && !alerta && !ok && "Estado de inventario"}
          </div>
          <div className={`text-sm mt-1 ${tone.text}`}>
            {critico
              ? "Recibe un contenedor o captura los NS Chasis y NS Motor del próximo packing list para liberar unidades."
              : alerta
              ? `Tienes ${s.conSerial} disponibles con serial vs ${s.demandaPendiente} unidades pendientes (${s.remisionesPendientes} remisiones).`
              : `Tienes ${s.conSerial} motocarros con serial listos para asignar.`}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <Metric label="Disponibles c/ NS" value={s.conSerial} accent="#065F46" />
          <Metric label="Sin NS (capturar)" value={s.sinSerial} accent={s.sinSerial > 0 ? "#D97706" : "#64748B"} />
          <Metric label="Demanda pendiente" value={s.demandaPendiente} accent="#1F3864" />
          <Metric label="Déficit" value={Math.max(0, deficit)} accent={deficit > 0 ? "#C0392B" : "#065F46"} />
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white/70 rounded-md px-3 py-2 min-w-[110px]">
      <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
      <div className="text-[11px] text-slate-600 leading-tight">{label}</div>
    </div>
  );
}
