import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Palette, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { colorHex } from "@/lib/dazon";

type Fila = {
  modelo: string;
  color: string;
  listas: number;          // unidades con serial, sin remisión: vendibles hoy
  porConfigurar: number;   // chasis sanos que fábrica todavía puede armar
  comprometidas: number;   // con remisión, sin entregar
  demanda: number;         // unidades pendientes de asignar en remisiones activas
  detenidas: number;       // piezas/unidades paradas por una incidencia
  juegosLibres: number | null;  // juegos de ese color sin montar (null si aún no hay dato)
};

/**
 * Cuánto queda de cada color, para que comercial sepa qué puede prometer y
 * fábrica qué le falta armar. Sale de v_stock_modelo_color, que se calcula de
 * los chasis y las unidades reales.
 */
export function DisponibilidadColores({
  compacto = false,
  refreshKey,
}: { compacto?: boolean; refreshKey?: number }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const nav = useNavigate();

  const cargar = async () => {
    setCargando(true);
    // select("*") a propósito: así la tarjeta sigue funcionando aunque la
    // migración de capacidad de color todavía no esté aplicada.
    const { data, error } = await supabase.from("v_stock_modelo_color").select("*");
    setCargando(false);
    if (error) { setFilas([]); return; }

    const mapeadas: Fila[] = (data ?? []).map((r: any) => ({
      modelo: r.modelo_comercial ?? "—",
      color: r.color ?? "—",
      listas: r.unidades_libres ?? 0,
      porConfigurar: r.piezas_disponibles ?? 0,
      comprometidas: r.unidades_comprometidas ?? 0,
      demanda: r.demanda_pendiente ?? 0,
      detenidas: (r.piezas_en_revision ?? 0) + (r.piezas_garantia ?? 0)
               + (r.piezas_no_util ?? 0) + (r.unidades_detenidas ?? 0),
      juegosLibres: r.capacidad_libre ?? null,
    }))
      // Combinaciones sin nada que decir no ocupan espacio en el tablero.
      .filter(f => f.listas || f.porConfigurar || f.comprometidas || f.demanda || f.detenidas)
      .sort((a, b) => a.modelo.localeCompare(b.modelo) || a.color.localeCompare(b.color));

    setFilas(mapeadas);
  };

  useEffect(() => { cargar(); }, [refreshKey]);

  if (!filas) return null;

  const hayCapacidad = filas.some(f => f.juegosLibres !== null);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-[#1F3864]" />
          <div>
            <h3 className="font-semibold text-lg leading-tight">Disponible por color</h3>
            <p className="text-xs text-muted-foreground">
              Qué se puede prometer hoy y qué falta armar, por modelo y color
            </p>
          </div>
        </div>
        <button
          onClick={cargar}
          className="text-xs text-muted-foreground hover:text-[#1F3864] inline-flex items-center gap-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {!filas.length ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          Todavía no hay piezas ni unidades cargadas
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                <th className="text-left font-medium pb-2">Modelo · color</th>
                <th className="text-right font-medium pb-2" title="Unidades con NS chasis y NS motor, sin remisión: se pueden vender hoy">
                  Listas
                </th>
                <th className="text-right font-medium pb-2" title="Chasis sanos que fábrica todavía puede configurar">
                  Por armar
                </th>
                {!compacto && (
                  <th className="text-right font-medium pb-2" title="Con remisión, aún no entregadas">
                    Comprometidas
                  </th>
                )}
                <th className="text-right font-medium pb-2" title="Unidades pedidas en remisiones activas que aún no tienen unidad asignada">
                  Demanda
                </th>
                {hayCapacidad && !compacto && (
                  <th className="text-right font-medium pb-2" title="Juegos de piezas de ese color sin montar: es el techo de cuántas unidades más de ese color pueden existir">
                    Juegos libres
                  </th>
                )}
                <th className="text-right font-medium pb-2">Alcanza</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const cubre = f.listas >= f.demanda;
                const cubreArmando = !cubre && f.listas + f.porConfigurar >= f.demanda;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                          style={{ background: colorHex(f.color) }}
                        />
                        <span className="font-medium">{f.modelo}</span>
                        <span className="text-muted-foreground">{f.color}</span>
                      </span>
                    </td>
                    <td className={`text-right font-bold ${f.listas > 0 ? "text-[#065F46]" : "text-muted-foreground"}`}>
                      {f.listas}
                    </td>
                    <td className="text-right">
                      {f.porConfigurar > 0
                        ? <span className="inline-flex items-center gap-1 text-[#92400E]"><Wrench size={11} />{f.porConfigurar}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    {!compacto && (
                      <td className="text-right text-[#5B21B6]">{f.comprometidas}</td>
                    )}
                    <td className={`text-right font-bold ${f.demanda > 0 ? "text-[#1F3864]" : "text-muted-foreground"}`}>
                      {f.demanda}
                    </td>
                    {hayCapacidad && !compacto && (
                      <td className={`text-right ${(f.juegosLibres ?? 0) > 0 ? "text-[#065F46] font-semibold" : "text-muted-foreground"}`}>
                        {f.juegosLibres ?? "—"}
                      </td>
                    )}
                    <td className="text-right">
                      {f.demanda === 0 ? (
                        <span className="text-muted-foreground text-xs">sin pedidos</span>
                      ) : cubre ? (
                        <span className="text-xs font-semibold text-[#065F46]">sí</span>
                      ) : cubreArmando ? (
                        <span className="text-xs font-semibold text-[#92400E]">armando {f.demanda - f.listas}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#991B1B]">
                          <TriangleAlert size={11} /> faltan {f.demanda - f.listas - f.porConfigurar}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filas.some(f => f.detenidas > 0) && (
        <button
          onClick={() => nav("/incidencias")}
          className="mt-3 text-xs text-[#991B1B] hover:underline inline-flex items-center gap-1"
        >
          <TriangleAlert size={12} />
          Hay piezas detenidas por incidencia — no cuentan como disponibles
        </button>
      )}
    </Card>
  );
}
