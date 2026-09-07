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

export default function Configuracion() {
  const [cfg, setCfg] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);
  const { t } = useLang();

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

  // Antes esto era `if (!cfg) return null`: sin fila en `config_general` —o con
  // el RLS cortando la lectura— la pantalla salía completamente en blanco, sin
  // decir por qué. Ahora siempre hay algo que leer.
  if (cargando) {
    return <div className="p-8 text-center text-muted-foreground">{t.configuracion.cargando}</div>;
  }

  if (!cfg) {
    return (
      <div className="space-y-4 max-w-xl">
        <h1>{t.configuracion.title}</h1>
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-medium">
            <AlertTriangle className="h-5 w-5" /> {t.configuracion.sinConfig}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.configuracion.sinConfigDesc1}{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">config_general</code>{" "}
            {t.configuracion.sinConfigDesc2}
          </p>
          {problema && (
            <pre className="text-left text-xs bg-slate-50 border rounded p-3 overflow-x-auto text-slate-600">{problema}</pre>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1>{t.configuracion.title}</h1>
      <Card className="p-6 space-y-4">
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
        <Button onClick={save}>{t.actions.save}</Button>
      </Card>
    </div>
  );
}
