import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { citaVencida, type CitaComoFila } from "@/lib/citasCrm";

type CitaAviso = CitaComoFila & {
  id: string;
  fecha_actividad: string;
  objetivo_visita?: string | null;
  cliente_id?: string | null;
};

const COLUMNAS =
  "id, tipo, fecha_actividad, estatus, vendedor_id, agendada, objetivo_visita, resultado, cliente_id";

/**
 * Campana del encabezado: visitas y reuniones del CRM que ya vencieron y
 * siguen programadas. El correo lo dispara la función
 * `notificar-citas-vencidas` cuando el vendedor tiene un correo real; si la
 * función no está desplegada, o el correo es de demostración, el aviso de
 * aquí sigue igual.
 */
export function CampanaCitas() {
  const { user, perms } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const [citas, setCitas] = useState<CitaAviso[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState(false);
  const yaAviso = useRef(false);
  const veCrm = perms.puedeVer("crm");

  const cargar = useCallback(async () => {
    if (!user?.id) return;
    const ahora = new Date();
    const { data, error } = await supabase
      .from("crm_actividades")
      .select(COLUMNAS)
      .eq("vendedor_id", user.id)
      .eq("agendada", true)
      .eq("estatus", "programada")
      .in("tipo", ["visita", "videollamada", "reunion"])
      .lte("fecha_actividad", ahora.toISOString())
      .order("fecha_actividad", { ascending: true })
      .limit(30);

    if (error || !data) {
      setCitas([]);
      return;
    }

    const vencidas = (data as CitaAviso[]).filter((c) => citaVencida(c, ahora, user.id));
    setCitas(vencidas);

    const ids = [...new Set(vencidas.map((c) => c.cliente_id).filter((id): id is string => !!id))];
    if (!ids.length) {
      setNombres({});
      return;
    }
    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, nombre_comercial")
      .in("id", ids)
      .limit(30);
    const mapa: Record<string, string> = {};
    for (const c of clientes ?? []) {
      if (c.nombre_comercial) mapa[c.id] = c.nombre_comercial;
    }
    setNombres(mapa);
  }, [user?.id]);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => void cargar(), 60_000);
    return () => window.clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    if (!veCrm || !user?.id) return;
    const pedirCorreo = () => {
      void supabase.functions.invoke("notificar-citas-vencidas", { body: {} }).catch(() => {
        // Sin la función, o sin Resend, el aviso de la campana no se pierde.
      });
    };
    pedirCorreo();
    const id = window.setInterval(pedirCorreo, 15 * 60_000);
    return () => window.clearInterval(id);
  }, [veCrm, user?.id]);

  useEffect(() => {
    if (citas.length === 0) {
      yaAviso.current = false;
      return;
    }
    if (yaAviso.current) return;
    yaAviso.current = true;
    toast.info(t.layout.campanaCitas.aviso(citas.length));
  }, [citas.length, t]);

  const n = citas.length;
  const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.layout.campanaCitas.aria(n)}>
          <Bell className="h-4 w-4" />
          {n > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4">
              {n > 9 ? "9+" : n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b">
          <div className="text-sm font-semibold text-[#1F3864]">
            {n > 0 ? t.layout.campanaCitas.titulo(n) : t.layout.campanaCitas.vacio}
          </div>
        </div>
        {n > 0 && (
          <ul className="max-h-72 overflow-auto divide-y">
            {citas.map((c) => (
              <li key={c.id} className="px-3 py-2 text-sm">
                <div className="font-medium text-[#1F3864]">
                  {t.crm.tipoActividad(c.tipo ?? "")}
                  {" · "}
                  {(c.cliente_id && nombres[c.cliente_id]) || t.layout.campanaCitas.sinCliente}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{fechaCorta(c.fecha_actividad)}</div>
                {c.objetivo_visita && (
                  <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{c.objetivo_visita}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="px-3 py-2 border-t">
          <Link
            to="/crm/actividades"
            className="text-sm font-medium text-[#1F3864] hover:underline"
            onClick={() => setAbierta(false)}
          >
            {t.layout.campanaCitas.ver}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
