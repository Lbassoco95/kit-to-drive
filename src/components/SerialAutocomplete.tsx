import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useLang } from "@/contexts/LangContext";

type Suggestion = {
  id: string;
  serial: string;
  modelo: string;
  estatus: string | null;
  disponible: boolean; // motocarro_id is null → available
};

interface SerialAutocompleteProps {
  tipo: "chasis" | "motor";
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function SerialAutocomplete({ tipo, value, onChange, placeholder, className }: SerialAutocompleteProps) {
  const { t } = useLang();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buscar = async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);

    const tabla = tipo === "chasis" ? "inventario_chasis" : "inventario_motor";
    const campo = tipo === "chasis" ? "numero_chasis" : "numero_motor";

    const { data } = await supabase
      .from(tabla)
      .select(`id, ${campo}, modelo, estatus, motocarro_id`)
      .ilike(campo, `%${q}%`)
      .limit(8);

    const items: Suggestion[] = (data ?? []).map((r: any) => ({
      id: r.id,
      serial: r[campo],
      modelo: r.modelo,
      estatus: r.estatus,
      disponible: !r.motocarro_id,
    }));
    setSuggestions(items);
    setLoading(false);
    if (items.length > 0) setOpen(true);
  };

  const handleChange = (val: string) => {
    const normalized = val.toUpperCase().replace(/\s/g, "");
    onChange(normalized);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(normalized), 300);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.serial);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>}
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 flex items-center justify-between gap-2 ${!s.disponible ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-sm font-medium">{s.serial}</span>
                <span className="text-xs text-muted-foreground ml-2">{s.modelo}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                s.disponible
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-600"
              }`}>
                {s.disponible ? "Disponible" : "En uso"}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && suggestions.length === 0 && value.length >= 2 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg px-3 py-2">
          <span className="text-xs text-muted-foreground">{t.componentes.serialAutocomplete.sinCoincidencia}</span>
        </div>
      )}
    </div>
  );
}
