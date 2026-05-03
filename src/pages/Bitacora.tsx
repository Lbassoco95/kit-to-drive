import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export default function Bitacora() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("bitacora_eventos").select("*").order("created_at", { ascending: false }).limit(100).then(({ data }) => setRows(data ?? [])); }, []);
  return (
    <div className="space-y-4">
      <h1>Bitácora</h1>
      <Card className="p-4">
        {rows.length ? <ul>{rows.map(r => <li key={r.id} className="text-sm">{r.created_at} — {r.modulo} / {r.accion}</li>)}</ul>
        : <p className="text-muted-foreground text-sm">Sin eventos registrados aún.</p>}
      </Card>
    </div>
  );
}
