import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export type PosePanda =
  | "saluda"
  | "listo"
  | "pendiente"
  | "incidencia"
  | "entregas"
  | "vacio"
  | "meta"
  | "proceso"
  | "remision";

const POSES: Record<PosePanda, string> = {
  saluda: "/brand/mascota/panda-saluda.png",
  listo: "/brand/mascota/panda-listo-palomeado.png",
  pendiente: "/brand/mascota/panda-pendiente-reloj.png",
  incidencia: "/brand/mascota/panda-incidencia-lupa.png",
  entregas: "/brand/mascota/panda-camion-de-entrega.png",
  vacio: "/brand/mascota/panda-letrero-vacio.png",
  meta: "/brand/mascota/panda-banderas-meta.png",
  proceso: "/brand/mascota/panda-en-proceso-llave.png",
  remision: "/brand/mascota/panda-muestra-remision.png",
};

/**
 * Estado vacío con el panda entero y centrado en su orbe.
 * Una pose por pantalla; nunca en tablas ni formularios.
 */
export function EstadoVacio({
  pose = "vacio",
  titulo,
  detalle,
  accionLabel,
  onAccion,
  size = 140,
}: {
  pose?: PosePanda;
  titulo: string;
  detalle?: string;
  accionLabel?: string;
  onAccion?: () => void;
  size?: number;
}) {
  const nav = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-12 px-6">
      <div
        className="relative overflow-hidden rounded-full border border-white bg-card shadow-[0_18px_40px_-20px_hsl(214_94%_20%/0.45),inset_0_1px_0_hsl(0_0%_100%/0.9)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img
          src={POSES[pose]}
          alt=""
          className="absolute inset-0 m-auto h-[88%] w-auto max-w-[86%] object-contain drop-shadow-[0_8px_12px_hsl(214_94%_6%/0.35)]"
        />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-lg font-bold text-foreground [word-break:keep-all]">{titulo}</h3>
        {detalle && <p className="text-sm text-muted-foreground leading-relaxed">{detalle}</p>}
      </div>
      {accionLabel && (
        <Button
          className="h-11 px-6 rounded-full"
          onClick={onAccion ?? (() => nav("/"))}
        >
          {accionLabel}
        </Button>
      )}
    </div>
  );
}

/** Orbe de indicador del inicio (especificación §7.3). */
export function OrbeIndicador({
  valor,
  pct,
  etiqueta,
  icon: Icon,
  color,
  onClick,
}: {
  valor: React.ReactNode;
  pct: number;
  etiqueta: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties; "aria-hidden"?: boolean }>;
  color: string;
  onClick?: () => void;
}) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamped / 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-3 focus-visible:outline-none"
    >
      <span className="relative grid h-[9.5rem] w-[9.5rem] place-items-center rounded-full bg-card shadow-[0_18px_40px_-20px_hsl(214_94%_20%/0.5),inset_0_1px_0_hsl(0_0%_100%/0.9)] border border-white transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke={`${color}22`} strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
          />
        </svg>
        <span className="flex flex-col items-center">
          <Icon size={20} strokeWidth={2.4} style={{ color }} aria-hidden />
          <span className="text-4xl font-bold leading-none mt-1" style={{ color }}>
            {valor}
          </span>
        </span>
      </span>
      <span className="text-sm font-medium text-muted-foreground text-center max-w-[10rem]">{etiqueta}</span>
    </button>
  );
}

/** Limita porcentaje de anillo a 0–100 (exportado para pruebas). */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}
