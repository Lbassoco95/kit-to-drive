// Selector de contraparte: amarra el movimiento al catálogo real
// (cliente / proveedor / empleado) en lugar de dejar texto libre.
// Si de plano no está en ningún catálogo, «Otro» permite el nombre a mano.
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Check, X, Plus, Building2, Users, UserCog, PenLine } from "lucide-react";
import { toast } from "sonner";
import { fdb } from "@/lib/finanzasDb";
import { traerTodo } from "@/lib/paginar";
import { useLang } from "@/contexts/LangContext";
import {
  type ContraparteTipo, type MovTipo, type Proveedor,
} from "@/lib/finanzas";

interface Opcion {
  id: string;
  nombre: string;
  detalle?: string | null;
}

interface Props {
  tipoMovimiento: MovTipo;
  contraparteTipo: ContraparteTipo;
  clienteId: string | null;
  proveedorId: string | null;
  empleadoId: string | null;
  nombre: string;
  onChange: (v: {
    contraparte_tipo: ContraparteTipo;
    cliente_id: string | null;
    proveedor_id: string | null;
    empleado_id: string | null;
    contraparte_nombre: string;
  }) => void;
}

// La etiqueta de cada pestaña sale de `t.finanzas.contraparte`; aquí sólo el icono.
const TABS: { value: ContraparteTipo; etiqueta: "cliente" | "proveedor" | "personal" | "otro"; icon: typeof Users }[] = [
  { value: "CLIENTE",   etiqueta: "cliente",   icon: Users },
  { value: "PROVEEDOR", etiqueta: "proveedor", icon: Building2 },
  { value: "EMPLEADO",  etiqueta: "personal",  icon: UserCog },
  { value: "OTRO",      etiqueta: "otro",      icon: PenLine },
];

export default function ContraparteSelector({
  tipoMovimiento, contraparteTipo, clienteId, proveedorId, empleadoId, nombre, onChange,
}: Props) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<Opcion[]>([]);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [empleados, setEmpleados] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(true);

  // Alta rápida de proveedor sin salir del formulario
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    const [cl, pr, pe] = await Promise.all([
      // Más de mil clientes activos: sin paginar, PostgREST devuelve los
      // primeros 1000 y el resto no se puede elegir como contraparte.
      traerTodo((desde, hasta) =>
        fdb.from("clientes").select("id, codigo_erp, nombre_comercial, razon_social")
           .eq("activo", true).order("nombre_comercial").order("id")
           .range(desde, hasta)),
      fdb.from("proveedores").select("id, codigo, nombre_comercial, rfc")
         .eq("activo", true).order("nombre_comercial"),
      fdb.from("profiles").select("id, nombre_completo, email").order("nombre_completo"),
    ]);
    setClientes((cl.data ?? []).map((c: Record<string, string>) => ({
      id: c.id,
      nombre: c.nombre_comercial || c.razon_social || c.codigo_erp,
      detalle: c.codigo_erp,
    })));
    setProveedores((pr.data ?? []).map((p: Record<string, string>) => ({
      id: p.id, nombre: p.nombre_comercial, detalle: p.rfc || p.codigo,
    })));
    setEmpleados((pe.data ?? []).map((p: Record<string, string>) => ({
      id: p.id, nombre: p.nombre_completo || p.email, detalle: p.email,
    })));
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const opciones = useMemo(() => {
    const base =
      contraparteTipo === "CLIENTE"   ? clientes :
      contraparteTipo === "PROVEEDOR" ? proveedores :
      contraparteTipo === "EMPLEADO"  ? empleados : [];
    const term = q.trim().toLowerCase();
    if (!term) return base.slice(0, 50);
    return base
      .filter(o => `${o.nombre} ${o.detalle ?? ""}`.toLowerCase().includes(term))
      .slice(0, 50);
  }, [contraparteTipo, clientes, proveedores, empleados, q]);

  const seleccionadoId =
    contraparteTipo === "CLIENTE"   ? clienteId :
    contraparteTipo === "PROVEEDOR" ? proveedorId :
    contraparteTipo === "EMPLEADO"  ? empleadoId : null;

  const cambiarTab = (t: ContraparteTipo) => {
    setQ("");
    onChange({
      contraparte_tipo: t,
      cliente_id: null, proveedor_id: null, empleado_id: null,
      contraparte_nombre: t === "OTRO" ? nombre : "",
    });
  };

  const elegir = (o: Opcion) => {
    onChange({
      contraparte_tipo: contraparteTipo,
      cliente_id:   contraparteTipo === "CLIENTE"   ? o.id : null,
      proveedor_id: contraparteTipo === "PROVEEDOR" ? o.id : null,
      empleado_id:  contraparteTipo === "EMPLEADO"  ? o.id : null,
      contraparte_nombre: o.nombre,
    });
  };

  const limpiar = () => {
    onChange({
      contraparte_tipo: contraparteTipo,
      cliente_id: null, proveedor_id: null, empleado_id: null,
      contraparte_nombre: "",
    });
  };

  const crearProveedor = async () => {
    const nom = nuevoProveedor.trim();
    if (!nom) return;
    setCreando(true);
    const { data: sesion } = await fdb.auth.getUser();
    const { data, error } = await fdb.from("proveedores")
      .insert({ nombre_comercial: nom, created_by: sesion?.user?.id ?? null })
      .select("id, nombre_comercial, rfc, codigo")
      .single();
    setCreando(false);
    if (error) { toast.error(t.finanzas.contraparte.errorCrearProveedor + error.message); return; }
    const nuevo: Proveedor = data;
    setProveedores(prev =>
      [...prev, { id: nuevo.id, nombre: nuevo.nombre_comercial, detalle: nuevo.rfc }]
        .sort((a, b) => a.nombre.localeCompare(b.nombre)));
    elegir({ id: nuevo.id, nombre: nuevo.nombre_comercial });
    setNuevoProveedor("");
    toast.success(t.finanzas.contraparte.proveedorCreado(nom));
  };

  return (
    <div className="space-y-2">
      <Label>
        {tipoMovimiento === "INGRESO" ? t.finanzas.contraparte.quienPago : t.finanzas.contraparte.aQuienPagamos} *
      </Label>

      {/* Tipo de contraparte */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(tab => {
          const activo = contraparteTipo === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => cambiarTab(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                activo
                  ? "bg-[#1F3864] text-white border-[#1F3864]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#1F3864]/40"
              }`}
            >
              <tab.icon size={14} /> {t.finanzas.contraparte[tab.etiqueta]}
            </button>
          );
        })}
      </div>

      {/* Ya hay contraparte elegida */}
      {(seleccionadoId || (contraparteTipo === "OTRO" && nombre)) && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <Check size={16} className="text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold text-emerald-900 truncate flex-1">{nombre}</span>
          <button type="button" onClick={limpiar} className="text-red-400 hover:text-red-600 shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Texto libre */}
      {contraparteTipo === "OTRO" ? (
        <Input
          value={nombre}
          onChange={e => onChange({
            contraparte_tipo: "OTRO",
            cliente_id: null, proveedor_id: null, empleado_id: null,
            contraparte_nombre: e.target.value,
          })}
          className="h-11"
          placeholder={t.finanzas.contraparte.nombreLibre}
        />
      ) : !seleccionadoId && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-11"
              placeholder={
                contraparteTipo === "CLIENTE"   ? t.finanzas.contraparte.buscarCliente :
                contraparteTipo === "PROVEEDOR" ? t.finanzas.contraparte.buscarProveedor :
                                                  t.finanzas.contraparte.buscarPersona
              }
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
            {cargando ? (
              <div className="p-3 text-sm text-muted-foreground">{t.finanzas.contraparte.cargandoCatalogo}</div>
            ) : opciones.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                {t.finanzas.contraparte.sinResultados}{q ? t.finanzas.contraparte.sinResultadosPara(q) : ""}.
              </div>
            ) : (
              opciones.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => elegir(o)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium truncate">{o.nombre}</span>
                  {o.detalle && (
                    <Badge variant="outline" className="text-[11px] shrink-0">{o.detalle}</Badge>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Alta rápida cuando el proveedor todavía no existe */}
          {contraparteTipo === "PROVEEDOR" && (
            <div className="flex gap-2 pt-1">
              <Input
                value={nuevoProveedor}
                onChange={e => setNuevoProveedor(e.target.value)}
                className="h-10"
                placeholder={t.finanzas.contraparte.nuevoProveedor}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0"
                disabled={!nuevoProveedor.trim() || creando}
                onClick={crearProveedor}
              >
                <Plus size={15} className="mr-1" /> {creando ? t.finanzas.contraparte.creando : t.finanzas.contraparte.darDeAlta}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
