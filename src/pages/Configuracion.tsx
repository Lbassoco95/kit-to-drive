import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { explicarError } from "@/lib/dazon";
import { AlertTriangle } from "lucide-react";

const EFECTOS_KEY = "dazon_efectos";

function leerReducirEfectos(): boolean {
  try {
    return localStorage.getItem(EFECTOS_KEY) === "reducir";
  } catch {
    return false;
  }
}

function aplicarSinCristal(on: boolean) {
  document.documentElement.classList.toggle("sin-cristal", on);
  try {
    localStorage.setItem(EFECTOS_KEY, on ? "reducir" : "normal");
  } catch {
    /* ignore */
  }
}

export default function Configuracion() {
  const [cfg, setCfg] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);
  const [reducirEfectos, setReducirEfectos] = useState(leerReducirEfectos);
  const { t } = useLang();

  useEffect(() => {
    try {
      if (
        localStorage.getItem(EFECTOS_KEY) == null &&
        window.matchMedia("(prefers-reduced-transparency: reduce)").matches
      ) {
        aplicarSinCristal(true);
        setReducirEfectos(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    supabase.from("config_general").select("*").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) setProblema(explicarError(error, t.configuracion.errorLeer));
      setCfg(data);
      setCargando(false);
    });
  }, [t.configuracion.errorLeer]);

  const save = async () => {
    const { error } = await supabase.from("config_general").update(cfg).eq("id", 1);
    if (error) toast.error(explicarError(error, t.configuracion.errorGuardar));
    else toast.success(t.configuracion.guardada);
  };

  const toggleEfectos = (on: boolean) => {
    setReducirEfectos(on);
    aplicarSinCristal(on);
  };

  const InterruptorEfectos = (
    <div className="rounded-3xl border bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-foreground">{t.configuracion.reducirEfectos}</div>
          <p className="text-sm text-muted-foreground mt-0.5">{t.configuracion.reducirEfectosDesc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={reducirEfectos}
          onClick={() => toggleEfectos(!reducirEfectos)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${reducirEfectos ? "bg-primary" : "bg-slate-300"}`}
        >
          <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${reducirEfectos ? "translate-x-6" : ""}`} />
        </button>
      </div>
    </div>
  );

  if (cargando) {
    return <div className="p-8 text-center text-muted-foreground">{t.configuracion.cargando}</div>;
  }

  if (!cfg) {
    return (
      <div className="space-y-4 max-w-xl">
        <h1>{t.configuracion.title}</h1>
        <Card className="p-6 space-y-3 rounded-[1.75rem]">
          <div className="flex items-center gap-2 text-amber-700 font-medium">
            <AlertTriangle className="h-5 w-5" /> {t.configuracion.sinConfig}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.configuracion.sinConfigDesc1}{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">config_general</code>{" "}
            {t.configuracion.sinConfigDesc2}
          </p>
          {problema && (
            <pre className="text-left text-xs bg-slate-50 border rounded-3xl p-3 overflow-x-auto text-slate-600">{problema}</pre>
          )}
          {InterruptorEfectos}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1>{t.configuracion.title}</h1>
      <Card className="p-6 space-y-4 rounded-[1.75rem]">
        <div>
          <Label>{t.configuracion.nombreEmpresa}</Label>
          <Input value={cfg.empresa_nombre} onChange={e => setCfg({ ...cfg, empresa_nombre: e.target.value })} />
        </div>
        <div>
          <Label>{t.configuracion.capacidadDiaria}</Label>
          <Input type="number" value={cfg.capacidad_diaria} onChange={e => setCfg({ ...cfg, capacidad_diaria: Number(e.target.value) })} />
        </div>
        <div>
          <Label>{t.configuracion.plazoMaxCredito}</Label>
          <Input type="number" value={cfg.plazo_max_credito_dias} onChange={e => setCfg({ ...cfg, plazo_max_credito_dias: Number(e.target.value) })} />
        </div>
        <div className="rounded-3xl border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{t.configuracion.formatoNumeros}</div>
          <p className="mt-0.5">{t.configuracion.formatoNumerosDesc}</p>
        </div>
        {InterruptorEfectos}
        {cfg.limite_ya_armados !== undefined && (
          <div>
            <Label>{t.configuracion.limiteYaArmados}</Label>
            <Input type="number" min={0} value={cfg.limite_ya_armados}
              onChange={e => setCfg({ ...cfg, limite_ya_armados: Number(e.target.value) })} />
          </div>
        )}
        <Button onClick={save} className="rounded-full">{t.actions.save}</Button>
      </Card>
    </div>
  );
}
