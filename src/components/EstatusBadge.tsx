import { Clock, Wrench, CheckCircle, AlertTriangle, Truck, Calendar, Minus, LucideIcon } from "lucide-react";
import { SEMAFORO } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";

const ICONS: Record<string, LucideIcon> = { Clock, Wrench, CheckCircle, AlertTriangle, Truck, Calendar, Minus };

type Size = "sm" | "md" | "lg";

export function EstatusBadge({ estatus, size = "md" }: { estatus?: string | null; size?: Size }) {
  const { t } = useLang();
  if (!estatus) return null;
  const cfg = (SEMAFORO as any)[estatus] || SEMAFORO.PENDIENTE;
  const Icon = ICONS[cfg.icon] || Clock;
  const label = (t.estatus as any)[estatus] ?? cfg.label;
  const dim = size === "lg" ? "text-base px-3 py-1.5 gap-2" : size === "sm" ? "text-xs px-2 py-0.5 gap-1" : "text-sm px-2.5 py-1 gap-1.5";
  const ic = size === "lg" ? 18 : size === "sm" ? 12 : 14;
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${dim}`}
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <Icon size={ic} strokeWidth={2.5} />
      {label}
    </span>
  );
}

// Backwards compatibility export
export { EstatusBadge as EstatusArmadoBadge };
