import { Truck } from "lucide-react";
import { ESTATUS_ARMADO_COLOR } from "@/lib/dazon";

export function EstatusArmadoBadge({ estatus }: { estatus: string }) {
  const showTruck = estatus === "ARMADO" || estatus === "LISTO";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${ESTATUS_ARMADO_COLOR[estatus] ?? ""}`}>
      {showTruck && <Truck className="h-3 w-3" />}
      {estatus}
    </span>
  );
}
