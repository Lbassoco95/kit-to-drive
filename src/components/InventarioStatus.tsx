import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, PackageSearch, TrendingDown, Wrench } from "lucide-react";
import { lineaDe, CatalogoModelos } from "@/lib/dazon";

type Stats = {
  disponibles: number;        // motocarros sin remisión asignada (con NS o no)
  conSerial: number;          // disponibles que ya tienen NS chasis + NS motor
  sinSerial: number;          // disponibles sin NS (no se pueden asignar a clientes)
  demandaPendiente: number;   // unidades aún por asignar en remisiones NUEVA/PARCIAL
  remisionesPendientes: number;
  chasisPorConfigurar: number; // línea motocarro, motocarro_id IS NULL
  motoresPorConfigurar: number;
};

export function InventarioStatus({ refreshKey }: { refreshKey?: number }) {
  const [s, setS] = useState<Stats | null>(null);
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      const [{ data: motos }, { data: rems }, { data: asign }, { data: catalogoData }, { data: chasisData }, { data: motorData }] = await Promise.all([
        supabase.from("motocarros").select("id, ns_chasis, ns_motor, remision_id, estatus_entrega"),
        supabase.from("remisiones").select("id, total_unidades_solicitadas, estatus").in("estatus", ["NUEVA", "PARCIAL"]),
        supabase.from("motocarros").select("remision_id").not("remision_id", "is", null),
        supabase.from("modelos_producto").select("modelo, linea"),
        supabase.from("inventario_chasis").select("modelo, motocarro_id"),
        supabase.from("inventario_motor").select("modelo, motocarro_id"),
      ]);

      const catalogo: CatalogoModelos = new Map((catalogoData ?? []).map((c: any) => [c.modelo, { linea: c.linea, nombre_comercial: null }]));

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

      const chasisPorConfigurar = (chasisData ?? []).filter((c: any) => !c.motocarro_id && lineaDe(c.modelo, catalogo) === "motocarro").length;
      const motoresPorConfigurar = (motorData ?? []).filter((m: any) => !m.motocarro_id && lineaDe(m.modelo, catalogo) === "motocarro").length;

      setS({ disponibles, conSerial, sinSerial, demandaPendiente, remisionesPendientes: rems?.length ?? 0, chasisPorConfigurar, motoresPorConfigurar });
    })();
  }, [refreshKey]);

  if (!s) return null;

  const hayPiezasPorConfigurar = s.chasisPorConfigurar > 0 || s.motoresPorConfigurar > 0;
  const deficit = s.demandaPendiente - s.conSerial;
  // Rojo sólo cuando de verdad no hay nada que ofrecer: ni unidades con
  // serial ni piezas por configurar. Si hay piezas, el problema es que
  // fábrica no las ha configurado, no que falte inventario.
  const critico = s.conSerial === 0 && !hayPiezasPorConfigurar && s.demandaPendiente > 0;
  const porConfigurar = s.conSerial === 0 && hayPiezasPorConfigurar;
  const alerta = !critico && !porConfigurar && deficit > 0;
  const ok = !critico && !porConfigurar && deficit <= 0 && s.conSerial >= 4;

  const tone = critico
    ? { bg: "bg-[#FEE2E2] border-[#C0392B]", text: "text-[#991B1B]", icon: <AlertTriangle className="h-7 w-7" /> }
    : porConfigurar
    ? { bg: "bg-[#FEF3C7] border-[#D97706]", text: "text-[#92400E]", icon: <Wrench className="h-7 w-7" /> }
    : alerta
    ? { bg: "bg-[#FEF3C7] border-[#D97706]", text: "text-[#92400E]", icon: <TrendingDown className="h-7 w-7" /> }
    : ok
    ? { bg: "bg-[#D1FAE5] border-[#065F46]", text: "text-[#065F46]", icon: <CheckCircle2 className="h-7 w-7" /> }
    : { bg: "bg-slate-50 border-slate-300", text: "text-slate-700", icon: <PackageSearch className="h-7 w-7" /> };

  const enProduccion = location.pathname === "/produccion";

  return (
    <Card className={`p-4 border-2 ${tone.bg}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className={tone.text}>{tone.icon}</div>
        <div className="flex-1 min-w-[260px]">
          <div className={`font-bold text-lg ${tone.text}`}>
            {critico && "⚠ Sin motocarros con serial — no se pueden asignar nuevas remisiones"}
            {porConfigurar && `Hay ${s.chasisPorConfigurar} chasis y ${s.motoresPorConfigurar} motores en inventario — fábrica debe configurar las unidades`}
            {alerta && `Inventario bajo — faltan ${deficit} unidades configuradas para cubrir la demanda`}
            {ok && "Inventario saludable"}
            {!critico && !porConfigurar && !alerta && !ok && "Estado de inventario"}
          </div>
          <div className={`text-sm mt-1 ${tone.text}`}>
            {critico
              ? "Recibe un contenedor o captura los NS Chasis y NS Motor del próximo packing list para liberar unidades."
              : porConfigurar
              ? "Las piezas ya están en inventario; configura chasis + motor en Producción para que queden disponibles con serial."
              : alerta
              ? `Tienes ${s.conSerial} disponibles con serial vs ${s.demandaPendiente} unidades pendientes (${s.remisionesPendientes} remisiones).`
              : `Tienes ${s.conSerial} motocarros con serial listos para asignar.`}
          </div>
          {porConfigurar && !enProduccion && (
            <Button size="sm" className="mt-2 h-9 bg-[#92400E] hover:bg-[#78350F]" onClick={() => nav("/produccion")}>
              <Wrench className="h-4 w-4 mr-1.5" /> Ir a Producción → Configurar unidad
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <Metric label="Disponibles c/ NS" value={s.conSerial} accent="#065F46" />
          <Metric label="Sin NS (capturar)" value={s.sinSerial} accent={s.sinSerial > 0 ? "#D97706" : "#64748B"} />
          <Metric label="Por configurar" value={s.chasisPorConfigurar} accent={s.chasisPorConfigurar > 0 ? "#92400E" : "#64748B"} />
          <Metric label="Demanda pendiente" value={s.demandaPendiente} accent="#1F3864" />
          <Metric label="Déficit (configuradas)" value={Math.max(0, deficit)} accent={deficit > 0 ? "#C0392B" : "#065F46"} />
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
