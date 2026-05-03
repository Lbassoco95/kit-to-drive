import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Configuracion() {
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => { supabase.from("config_general").select("*").eq("id", 1).maybeSingle().then(({ data }) => setCfg(data)); }, []);
  const save = async () => {
    const { error } = await supabase.from("config_general").update(cfg).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Configuración guardada");
  };
  if (!cfg) return null;
  return (
    <div className="space-y-4 max-w-xl">
      <h1>Configuración</h1>
      <Card className="p-6 space-y-4">
        <div><Label>Nombre empresa</Label><Input value={cfg.empresa_nombre} onChange={e => setCfg({ ...cfg, empresa_nombre: e.target.value })} /></div>
        <div><Label>Capacidad diaria (motocarros)</Label><Input type="number" value={cfg.capacidad_diaria} onChange={e => setCfg({ ...cfg, capacidad_diaria: Number(e.target.value) })} /></div>
        <div><Label>Plazo máx. crédito (días)</Label><Input type="number" value={cfg.plazo_max_credito_dias} onChange={e => setCfg({ ...cfg, plazo_max_credito_dias: Number(e.target.value) })} /></div>
        <Button onClick={save}>Guardar</Button>
      </Card>
    </div>
  );
}
