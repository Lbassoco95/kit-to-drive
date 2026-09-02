import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtDate, effEstatusArmado, COLORES, claveStock, disponiblesEnOrden, normColor, normModelo, StockColor, explicarError } from "@/lib/dazon";
import { cargarCatalogoClientes, SCRIPT_FOLIO_INTERNO } from "@/lib/catalogoClientes";
import {
  agruparRenglones, planEditarRenglones, aplicarCambioMoto, motivoValido, MOTIVO_MIN, MOTIVOS_EDICION,
  type LineaMoto, type RenglonRemision,
} from "@/lib/remisionesEdicion";
import { cargarModelosMotocarro, MODELOS_RESPALDO } from "@/lib/catalogoModelos";
import { useLang } from "@/contexts/LangContext";
import { EstatusBadge } from "@/components/EstatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus, Upload, Wand2, Eye, Download, FileDown, FileText, ChevronDown,
  UserPlus, CalendarClock, CheckCircle2, Factory, Truck, Pencil, History,
  DollarSign, Trash2, Package, CheckCheck, XCircle, AlertTriangle
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileOrCamera } from "@/components/FileOrCamera";
import { DocumentViewerDialog } from "@/components/DocumentViewerDialog";

// ─── Catálogos ─────────────────────────────────────────────────────────────────
// Los modelos se leen del catálogo (ver cargarModelosMotocarro); esta lista
// sólo se usa como valor inicial mientras carga.

// Radix reserva la cadena vacía para «sin selección», y un <SelectItem value="">
// truena al abrir el desplegable: la excepción ocurre al DIBUJAR, así que se
// llevaba la app entera en blanco al dar clic en «Nueva remisión». La opción de
// «a mí mismo» viaja con un valor propio y se traduce a vacío al guardar.
const ASIGNAR_A_MI = "__yo__";

/** Lo que se va a guardar en una columna JSONB, ya serializable. */
const comoJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null));
const colorLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

const tipoBadgeClass: Record<string, string> = {
  motocarro:          "bg-[#1F3864]/10 text-[#1F3864] border-[#1F3864]/20",
  cabina:             "bg-violet-50 text-violet-700 border-violet-200",
  instalacion_cabina: "bg-purple-50 text-purple-700 border-purple-200",
  activacion:         "bg-amber-50 text-amber-700 border-amber-200",
  flete:              "bg-blue-50 text-blue-700 border-blue-200",
};

const tipoIcon: Record<string, string> = {
  motocarro: "🏍️", cabina: "🛖", instalacion_cabina: "🔧", activacion: "⚡", flete: "🚛",
};
const tipoLabel: Record<string, string> = {
  motocarro: "Motocarro", cabina: "Cabina", instalacion_cabina: "Instalación de cabina", activacion: "Activación", flete: "Flete",
};

// ─── Types ─────────────────────────────────────────────────────────────────────
// Una línea del pedido. Al capturar viene en blanco; al editar trae además el
// id del renglón guardado (`_itemId` / `_svcIds`) para poder corregirlo en su
// lugar en vez de borrar y volver a insertar — ver src/lib/remisionesEdicion.ts.
type MotoItem = LineaMoto;

const defaultMoto = (modelo = MODELOS_RESPALDO[0]): MotoItem => ({
  _key: crypto.randomUUID(),
  _svcIds: {},
  modelo,
  color: "BLANCO",
  cantidad: 1,
  con_caja: false,
  con_cabina: false,
  con_instalacion: false,
  con_activacion: false,
});

export interface NuevoCliente { nombre_comercial: string; codigo_erp: string; telefono: string }

// ─── CampoCliente ───────────────────────────────────────────────────────────────
/**
 * Selector de cliente con buscador y alta en línea.
 *
 * El buscador no va DENTRO del desplegable a propósito: Radix se queda con las
 * teclas para su propio salto por letra y un input ahí adentro no recibe lo que
 * se escribe. Filtrando desde fuera se puede teclear el nombre del cliente con
 * cientos de folios en el catálogo.
 */
function CampoCliente({ clientes, value, onChange, onCrearCliente }:{
  clientes: any[];
  value: string;
  onChange: (id: string) => void;
  onCrearCliente: (datos: NuevoCliente) => Promise<string|null>;
}) {
  const [creando, setCreando]   = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState<NuevoCliente>({ nombre_comercial:"", codigo_erp:"", telefono:"" });

  const etiqueta = (c:any) =>
    `${c.codigo_erp || c.folio_interno || "—"}${c.nombre_comercial ? ` — ${c.nombre_comercial}` : ""}`;

  const q = busqueda.trim().toLowerCase();
  const filtrados = q ? clientes.filter(c => etiqueta(c).toLowerCase().includes(q)) : clientes;
  // El cliente ya elegido tiene que seguir dibujado aunque el filtro lo deje
  // fuera: Radix necesita su <SelectItem> para poder mostrar la selección.
  const elegido = clientes.find(c => c.id === value);
  const visibles = elegido && !filtrados.some(c => c.id === value) ? [elegido, ...filtrados] : filtrados;

  const guardar = async () => {
    setGuardando(true);
    const id = await onCrearCliente(nuevo);
    setGuardando(false);
    if (!id) return;
    onChange(id);
    setNuevo({ nombre_comercial:"", codigo_erp:"", telefono:"" });
    setCreando(false); setBusqueda("");
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-base">Cliente</Label>
        <button type="button" onClick={()=>setCreando(s=>!s)} className="inline-flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
          <UserPlus className="h-3.5 w-3.5" /> {creando?"Cancelar":"Nuevo cliente"}
        </button>
      </div>

      {creando ? (
        <div className="border-2 border-dashed border-[#2E75B6]/40 rounded-md p-3 space-y-2 bg-[#DBEAFE]/30">
          <Input placeholder="Nombre comercial *" value={nuevo.nombre_comercial} onChange={e=>setNuevo({...nuevo,nombre_comercial:e.target.value})} className="h-11"/>
          <Input placeholder="Código ERP (solo si es cliente migrado)" value={nuevo.codigo_erp} onChange={e=>setNuevo({...nuevo,codigo_erp:e.target.value})} className="h-11"/>
          <Input placeholder="Teléfono" value={nuevo.telefono} onChange={e=>setNuevo({...nuevo,telefono:e.target.value})} className="h-11"/>
          <Button type="button" onClick={guardar} disabled={guardando} className="w-full h-11 bg-[#2E75B6] hover:bg-[#246094]">
            {guardando?"Guardando…":"Guardar cliente"}
          </Button>
        </div>
      ) : (
        <>
          {clientes.length > 8 && (
            <Input
              value={busqueda}
              onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar por folio o nombre…"
              className="h-10 text-sm mb-1.5"
            />
          )}
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Selecciona cliente"/></SelectTrigger>
            <SelectContent>
              {visibles.map(c => <SelectItem key={c.id} value={c.id}>{etiqueta(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Un desplegable vacío se ve igual que uno roto: hay que decir por qué. */}
          {!visibles.length && (
            <p className="text-xs text-amber-700 mt-1">
              {clientes.length
                ? "Ningún cliente coincide con la búsqueda."
                : "El catálogo de clientes está vacío. Da de alta el cliente con «Nuevo cliente»."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── LineasMotocarro ────────────────────────────────────────────────────────────
/**
 * Las líneas del pedido: un motocarro por bloque, con sus servicios y el flete
 * de toda la orden. Se comparte entre capturar una remisión nueva y corregir o
 * complementar una ya capturada, para que ambas pantallas pidan exactamente lo
 * mismo y validen igual.
 */
function LineasMotocarro({
  motos, modelos, totalUnidades, disponiblesPara,
  onAdd, onRemove, onUpdate, conFlete, onFlete,
}:{
  motos: MotoItem[];
  modelos: string[];
  totalUnidades: number;
  disponiblesPara: (idx: number, modelo: string, color: string) => number | null;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, campo: keyof MotoItem, valor: unknown) => void;
  conFlete: boolean;
  onFlete: (v: boolean) => void;
}) {
  return (
    <>
      {/* ── MOTOCARROS ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Motocarros</Label>
          <span className="text-sm font-semibold text-[#1F3864]">{totalUnidades} unidades</span>
        </div>

        {motos.map((moto, idx) => (
          <div key={moto._key} className="border rounded-xl overflow-hidden">
            {/* Header motocarro */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#1F3864]/5 border-b">
              <span className="text-xs font-bold text-[#1F3864] uppercase tracking-wide">🏍️ Motocarro {idx+1}</span>
              {motos.length>1&&(
                <button type="button" onClick={()=>onRemove(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
              )}
            </div>

            {/* Modelo / color / cantidad / caja */}
            <div className="p-3 space-y-2 bg-slate-50">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Modelo</Label>
                  <Select value={moto.modelo} onValueChange={v=>onUpdate(idx,"modelo",v)}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue/></SelectTrigger>
                    <SelectContent>{modelos.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <Select value={moto.color} onValueChange={v=>onUpdate(idx,"color",v)}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {COLORES.map(c=>{
                        const quedan = disponiblesPara(idx, moto.modelo, c);
                        return (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center justify-between w-full gap-3">
                              <span>{colorLabel(c)}</span>
                              {quedan === null ? null : quedan <= 0 ? (
                                <span className="text-red-600 text-xs whitespace-nowrap">Sin existencia</span>
                              ) : (
                                <span className={`text-xs whitespace-nowrap ${quedan <= 3 ? "text-amber-600" : "text-muted-foreground"}`}>
                                  {quedan} disponible{quedan === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {/* Qué tan cubierta queda esta línea con el color elegido.
                      No se bloquea la captura: la remisión es una promesa
                      al cliente y el sistema ya trabaja con demanda por
                      encima del inventario (de ahí «déficit» en
                      Producción). Lo que sí hace falta es que quien
                      captura vea contra qué se está comprometiendo. */}
                  {(() => {
                    const quedan = disponiblesPara(idx, moto.modelo, moto.color);
                    if (quedan === null) return null;
                    const piden = Number(moto.cantidad || 0);
                    const faltan = piden - quedan;

                    if (faltan > 0) {
                      return (
                        <div className="mt-1 text-xs text-red-600 font-medium flex items-start gap-1">
                          <XCircle size={12} className="mt-0.5 shrink-0" />
                          <span>
                            {quedan <= 0
                              ? `Sin existencia de ${colorLabel(moto.color)}: se piden ${piden} por armar.`
                              : `Sólo quedan ${quedan} de ${colorLabel(moto.color)}: faltarían ${faltan} por armar.`}
                          </span>
                        </div>
                      );
                    }
                    if (quedan - piden <= 3) {
                      return (
                        <div className="mt-1 text-xs text-amber-600 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} /> Quedan {quedan} de {colorLabel(moto.color)}; con esta orden se van {piden}.
                        </div>
                      );
                    }
                    return (
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-emerald-600" /> {quedan} disponibles de {colorLabel(moto.color)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Cantidad</Label>
                  <Input type="number" min={1} value={moto.cantidad}
                    onChange={e=>onUpdate(idx,"cantidad",Math.max(1,parseInt(e.target.value)||1))}
                    className="h-10 text-sm"/>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pt-5 flex-1">
                  <input type="checkbox" checked={moto.con_caja} onChange={e=>onUpdate(idx,"con_caja",e.target.checked)} className="w-4 h-4 accent-[#1F3864]"/>
                  <span className="text-sm font-medium flex items-center gap-1.5"><Package size={14} className="text-[#1F3864]"/> Con caja montada</span>
                </label>
              </div>
            </div>

            {/* Servicios adicionales por motocarro */}
            <div className="px-3 py-2.5 bg-white border-t space-y-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Servicios adicionales</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={moto.con_cabina} onChange={e=>onUpdate(idx,"con_cabina",e.target.checked)} className="w-3.5 h-3.5 accent-violet-600"/>
                <span className="text-sm">🛖 Cabina</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={moto.con_instalacion} onChange={e=>onUpdate(idx,"con_instalacion",e.target.checked)} className="w-3.5 h-3.5 accent-purple-600"/>
                <span className="text-sm">🔧 Instalación de cabina</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={moto.con_activacion} onChange={e=>onUpdate(idx,"con_activacion",e.target.checked)} className="w-3.5 h-3.5 accent-amber-500"/>
                <span className="text-sm">⚡ Activación</span>
              </label>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={onAdd}
          className="w-full h-10 border-dashed border-[#2E75B6]/50 text-[#2E75B6] hover:bg-[#DBEAFE]/30">
          <Plus className="h-4 w-4 mr-2"/> Agregar motocarro
        </Button>
      </div>

      {/* ── FLETE — toda la orden ──────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={conFlete} onChange={e=>onFlete(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
          <span className="text-sm font-medium flex items-center gap-1.5">
            🚛 Flete <span className="text-xs text-muted-foreground font-normal">(servicio para toda la orden)</span>
          </span>
        </label>
      </div>
    </>
  );
}

// ─── Folio suggester ────────────────────────────────────────────────────────────
// Siempre sugiere el siguiente número consecutivo (max + 1), sin regresar a folios
// cancelados que tengan números menores. El folio cancelado sigue siendo técnicamente
// reutilizable (índice parcial lo permite), pero la sugerencia avanza hacia adelante.
function suggestNextFolio(folios: string[]): string {
  if (!folios.length) return "REM-001";
  const parsed = folios
    .map(f => { const m = (f||"").match(/^(.*?)(\d+)\s*$/); return m ? { prefix: m[1], num: parseInt(m[2],10), pad: m[2].length } : null; })
    .filter(Boolean) as { prefix: string; num: number; pad: number }[];
  if (!parsed.length) return "REM-001";
  const prefix = parsed[0].prefix;
  const pad = parsed[0].pad;
  const max = Math.max(...parsed.map(p => p.num));
  return `${prefix}${String(max + 1).padStart(pad,"0")}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────
export default function Remisiones() {
  const { perms, area, user } = useAuth();
  // Operador de Comercial: captura a su nombre y sólo edita lo suyo.
  const esVendedor = area === "comercial" && perms.soloPropios("remisiones");
  // Ojo con la distinción: LEER la bandeja completa no depende del nivel — eso
  // lo resuelve el RLS, y toda el área comercial ve todas las remisiones para
  // trabajar con la misma información. `editaTodas` es sólo permiso de
  // ESCRITURA sobre remisiones ajenas (supervisor y administrador).
  const editaTodas = perms.puedeEditar("remisiones");
  // La confirmación de fechas la hace cada área operativa.
  const confirmaFabrica   = perms.esAdminGlobal || (area === "fabrica" && perms.puedeCrear("produccion"));
  const confirmaLogistica = perms.esAdminGlobal || (area === "almacen_logistica" && perms.puedeCrear("produccion"));
  const { t } = useLang();
  const [rows, setRows]             = useState<any[]>([]);
  const [clientes, setClientes]     = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [myProfile, setMyProfile]   = useState<{ nombre_completo: string } | null>(null);
  const [open, setOpen]             = useState(false);
  const [expanded, setExpanded]     = useState<Record<string,boolean>>({});
  const [recentFolios, setRecentFolios] = useState<string[]>([]);
  const [activeFolios, setActiveFolios] = useState<string[]>([]);
  // Disponibilidad por (modelo comercial, color). Llave: claveStock().
  const [colorInventory, setColorInventory] = useState<Map<string, StockColor>>(new Map());

  const [form, setForm] = useState<any>({
    folio_remision:"", cliente_id:"", vendedor_asignado_id:"", nombre_vendedor:"",
    fecha_remision: new Date().toISOString().slice(0,10),
    notas:"", tipo_pago:"anticipado", pagado:true,
  });
  const [modelos, setModelos] = useState<string[]>(MODELOS_RESPALDO);
  const [motos, setMotos]     = useState<MotoItem[]>([defaultMoto()]);
  const [conFlete, setConFlete] = useState(false);
  const [formFile, setFormFile] = useState<File|null>(null);

  const [pagoDialog, setPagoDialog]           = useState<any|null>(null);
  const [comprobanteFile, setComprobanteFile] = useState<File|null>(null);
  const [subiendoPago, setSubiendoPago]       = useState(false);
  const [cierreConfirm, setCierreConfirm]     = useState<any|null>(null);
  const [deleteConfirm, setDeleteConfirm]     = useState<any|null>(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState<any|null>(null);
  const [deleteMotivo, setDeleteMotivo]       = useState("");
  const [activeTab, setActiveTab]             = useState<'activas'|'canceladas'>('activas');
  const [notifOpen, setNotifOpen]             = useState(false);
  const [detalleRemision, setDetalleRemision] = useState<any|null>(null);
  const [previewPath, setPreviewPath] = useState<string|null>(null);

  // ── Edición / complemento de una remisión ya capturada ────────────────────
  const [editar, setEditar]               = useState<any|null>(null);
  const [editForm, setEditForm]           = useState<any>(null);
  const [editMotos, setEditMotos]         = useState<MotoItem[]>([]);
  const [editFlete, setEditFlete]         = useState(false);
  const [editItems, setEditItems]         = useState<RenglonRemision[]>([]);
  const [editMotivo, setEditMotivo]       = useState("");
  const [editMotivoSugerido, setEditMotivoSugerido] = useState("");
  const [guardandoEdicion, setGuardandoEdicion]     = useState(false);
  /** Cuántas veces se ha modificado cada remisión, para marcarlo en la tarjeta. */
  const [modificaciones, setModificaciones] = useState<Record<string, number>>({});
  /** Historial de la remisión abierta en «Ver remisión completa». */
  const [historial, setHistorial] = useState<any[]>([]);
  // Alcance de la bandeja: todo el equipo comercial comparte la misma información,
  // pero cada quien puede acotar la vista a lo suyo sin perder el panorama.
  const [scope, setScope]                     = useState<'todas'|'mias'>('todas');

  const canAssignVendedor = editaTodas;
  const totalUnidades = motos.reduce((s,m) => s + Number(m.cantidad||0), 0);

  // ── Loaders ────────────────────────────────────────────────────────────────
  /**
   * Catálogo de clientes para el selector de la remisión.
   *
   * La lectura vive en `@/lib/catalogoClientes` porque esta pantalla y la de
   * Clientes leían el mismo catálogo de dos maneras distintas, y sólo una
   * tenía respaldo: el selector aguantaba una base sin `folio_interno` y la
   * lista de Clientes se quedaba vacía. Ahí está contado el incidente.
   *
   * Sin clientes no hay remisión, así que aquí nunca se falla en silencio.
   */
  const loadClientes = async () => {
    const carga = await cargarCatalogoClientes((conFolioInterno) => {
      const columnas = conFolioInterno
        ? "id,codigo_erp,folio_interno,nombre_comercial"
        : "id,codigo_erp,nombre_comercial";
      const q = supabase.from("clientes").select(columnas);
      // OJO con el `order`: `supabase-js` no acepta varias columnas en una
      // sola llamada. `.order("folio_interno, codigo_erp")` viaja como
      // `order=folio_interno, codigo_erp.asc`, PostgREST no puede leer el
      // segundo término y responde 400. Van encadenados.
      return conFolioInterno
        ? q.order("folio_interno", { nullsFirst: false }).order("codigo_erp", { nullsFirst: false })
        : q.order("codigo_erp", { nullsFirst: false });
    });

    if (carga.error) {
      setClientes([]);
      toast.error(explicarError(carga.error, "No se pudo cargar el catálogo de clientes"));
      return;
    }
    if (carga.degradado) {
      console.warn(`clientes sin folio_interno: falta correr supabase/migrations/${SCRIPT_FOLIO_INTERNO}`);
    }
    setClientes(carga.clientes);
  };
  const loadVendedores = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id,area").eq("area","comercial");
    if (!roles?.length) return;
    const { data } = await supabase.from("profiles").select("id,nombre_completo,codigo_vendedor,activo").in("id", roles.map(r=>r.user_id)).eq("activo",true).order("nombre_completo");
    setVendedores(data ?? []);
  };
  /**
   * Disponibilidad por color, para poder prometerla al cliente.
   *
   * Se lee de `v_stock_modelo_color`, que agrega por **nombre comercial**
   * ("200cc 2026") — que es lo que la remisión captura. La versión anterior
   * cruzaba contra `inventario_colores.modelo`, que guarda el **código de
   * fábrica** (DZ200Q1): la llave nunca casaba y el aviso de existencias no
   * salía casi nunca.
   *
   * Si la vista no está (falta correr KIT-4 en el SQL editor), se cae a
   * `inventario_colores` cruzando por nombre comercial. Ahí no hay demanda
   * comprometida, así que el número sale optimista — pero es mejor que nada,
   * y nunca bloquea la captura.
   */
  const loadStockColor = async () => {
    const mapa = new Map<string, StockColor>();

    const { data: vista, error } = await supabase
      .from("v_stock_modelo_color")
      .select("modelo_comercial, color, unidades_libres, piezas_disponibles, demanda_pendiente");

    if (!error && vista) {
      vista.forEach((r: any) => {
        const libres = Number(r.unidades_libres ?? 0);
        const piezas = Number(r.piezas_disponibles ?? 0);
        const demanda = Number(r.demanda_pendiente ?? 0);
        mapa.set(claveStock(r.modelo_comercial, r.color), {
          disponibles: libres + piezas - demanda,
          unidadesLibres: libres,
          piezasDisponibles: piezas,
          demandaPendiente: demanda,
        });
      });
      setColorInventory(mapa);
      return;
    }

    console.warn("v_stock_modelo_color no disponible:", error?.message);
    // `select("*")` a propósito: pedir `nombre_comercial` por nombre falla si
    // KIT-4 tampoco se aplicó, que es justo cuando hace falta el respaldo.
    const { data: colores } = await supabase
      .from("inventario_colores")
      .select("*");
    (colores ?? []).forEach((r: any) => {
      const disp = Number(r.cantidad_disponible ?? 0);
      // Un mismo color puede venir en varios códigos de fábrica bajo el mismo
      // nombre comercial: se suman, no se pisan.
      const k = claveStock(r.nombre_comercial ?? r.modelo, r.color);
      const previo = mapa.get(k);
      mapa.set(k, {
        disponibles: (previo?.disponibles ?? 0) + disp,
        unidadesLibres: 0,
        piezasDisponibles: (previo?.piezasDisponibles ?? 0) + disp,
        demandaPendiente: 0,
      });
    });
    setColorInventory(mapa);
  };

  const load = async () => {
    // Disponibilidad por color, para el selector de la remisión
    loadStockColor();
    cargarModelosMotocarro().then(setModelos);

    // ── 1. Query mínimo garantizado (solo tablas/columnas originales) ──────────
    const { data: base } = await supabase
      .from("remisiones")
      .select("id,folio_remision,cliente_id,vendedor_id,fecha_remision,notas,estatus,created_at, clientes(codigo_erp,nombre_comercial), profiles:vendedor_id(nombre_completo)")
      .order("created_at", { ascending:false });

    // Arrancar con lo que tenemos — siempre muestra algo
    const baseRows = (base ?? []).map((r:any) => ({
      ...r, remision_items:[], motocarros:[],
      tipo_pago:null, pagado:null, nombre_vendedor:null,
      color_solicitado:null, total_unidades_solicitadas:null,
      documento_url:null, comprobante_pago_url:null,
    }));
    setRows(baseRows);
    // Folios activos (no cancelados) para validar duplicados y sugerir reutilización
    const activos = baseRows.filter((r:any) => r.estatus !== 'CANCELADA');
    setActiveFolios(activos.map((r:any) => r.folio_remision));
    // Folios sugeridos: primero los propios; si el usuario aún no tiene, los del equipo activo
    const propios = activos.filter((r:any) => r.vendedor_id===user?.id);
    const fuenteFolios = propios.length ? propios : activos;
    setRecentFolios(fuenteFolios.slice(0,5).map((r:any)=>r.folio_remision));

    if (!base?.length) return;
    const ids = base.map((r:any) => r.id);

    // ── 2. Columnas extendidas de remisiones (pueden no estar en cache) ────────
    try {
      const { data: ext } = await supabase
        .from("remisiones")
        .select("id,tipo_pago,pagado,nombre_vendedor,color_solicitado,total_unidades_solicitadas,documento_url,comprobante_pago_url")
        .in("id", ids);
      if (ext?.length) {
        const extMap = Object.fromEntries(ext.map((r:any) => [r.id, r]));
        setRows(prev => prev.map(r => ({ ...r, ...extMap[r.id] })));
      }
    } catch (_) { /* cache stale — ignorar */ }

    // ── 3. remision_items (tabla nueva) ───────────────────────────────────────
    try {
      const { data: items } = await supabase
        .from("remision_items")
        .select("id,remision_id,tipo_servicio,modelo,color,cantidad,con_caja")
        .in("remision_id", ids);
      if (items?.length) {
        const itemsMap: Record<string,any[]> = {};
        for (const item of items) {
          if (!itemsMap[item.remision_id]) itemsMap[item.remision_id] = [];
          itemsMap[item.remision_id].push(item);
        }
        setRows(prev => prev.map(r => ({ ...r, remision_items: itemsMap[r.id] ?? [] })));
      }
    } catch (_) { /* cache stale — ignorar */ }

    // ── 4. motocarros (solo columnas seguras) ─────────────────────────────────
    try {
      const { data: motos } = await supabase
        .from("motocarros")
        .select("id,remision_id,orden_armado,modelo,color,ns_chasis,ns_motor,chasis_asignado,estatus_armado,fecha_estimada_armado,fecha_real_armado,estatus_entrega,fecha_estimada_entrega,fecha_real_entrega")
        .in("remision_id", ids);
      if (motos?.length) {
        const motosMap: Record<string,any[]> = {};
        for (const m of motos) {
          if (!motosMap[m.remision_id]) motosMap[m.remision_id] = [];
          motosMap[m.remision_id].push(m);
        }
        setRows(prev => prev.map(r => ({ ...r, motocarros: motosMap[r.id] ?? [] })));
      }
    } catch (_) { /* cache stale — ignorar */ }
  };

  /**
   * Cuántas veces se modificó cada remisión. Es un solo query para toda la
   * bandeja; si la tabla todavía no existe (falta 20260902000001) no pasa nada:
   * simplemente no se marca ninguna tarjeta.
   */
  const loadModificaciones = async () => {
    const { data, error } = await supabase.from("remisiones_bitacora").select("remision_id");
    if (error) { setModificaciones({}); return; }
    const cuenta: Record<string, number> = {};
    (data ?? []).forEach(b => { cuenta[b.remision_id] = (cuenta[b.remision_id] ?? 0) + 1; });
    setModificaciones(cuenta);
  };

  useEffect(() => { load(); loadClientes(); loadVendedores(); loadModificaciones(); }, [user?.id, perms.nivel, perms.area]);

  // Historial de la remisión que se está viendo en detalle.
  useEffect(() => {
    if (!detalleRemision?.id) { setHistorial([]); return; }
    let vigente = true;
    supabase.from("remisiones_bitacora")
      .select("id,created_at,nombre_usuario,tipo_cambio,motivo")
      .eq("remision_id", detalleRemision.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => { if (vigente) setHistorial(error ? [] : (data ?? [])); });
    return () => { vigente = false; };
  }, [detalleRemision?.id]);
  useEffect(() => {
    if (user?.id) supabase.from("profiles").select("nombre_completo").eq("id",user.id).single().then(({data})=>{ if(data) setMyProfile(data); });
  }, [user?.id]);

  const canCreate = perms.puedeCrear("remisiones");

  // ── Computed rows ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  // Qué remisiones llegan lo decide el RLS, no la UI: toda el área comercial lee
  // la bandeja completa sin importar su nivel. `scope` sólo acota la vista aquí.
  const inScope      = (r: { vendedor_id?: string | null }) => scope === 'todas' || r.vendedor_id === user?.id;
  const misRemisiones = rows.filter(r => r.vendedor_id === user?.id).length;
  const activeRows   = rows.filter(r => r.estatus !== 'CANCELADA' && inScope(r));
  const canceledRows = rows.filter(r => r.estatus === 'CANCELADA' && inScope(r));

  // Motocarros atrasados — de las remisiones activas visibles en el alcance actual
  const motocarrosAtrasados = activeRows
    .filter(r => r.estatus!=='COMPLETA')
    .flatMap(r => (r.motocarros??[]).map((m:any)=>({...m, folio:r.folio_remision})))
    .filter((m:any) => {
      const armadoLate   = m.fecha_estimada_armado   && m.fecha_estimada_armado   < today && !['ARMADO','LISTO'].includes(m.estatus_armado??'');
      const entregaLate  = m.fecha_estimada_entrega  && m.fecha_estimada_entrega  < today && m.estatus_entrega!=='ENTREGADA';
      return armadoLate || entregaLate;
    });

  // ── Moto helpers ────────────────────────────────────────────────────────────
  const addMoto   = () => setMotos(m => [...m, defaultMoto(modelos[0])]);
  const removeMoto = (idx:number) => setMotos(m => m.filter((_,i)=>i!==idx));
  const updateMoto = (idx:number, field:keyof MotoItem, val:any) =>
    setMotos(m => m.map((item,i) => (i===idx ? aplicarCambioMoto(item, field, val) : item)));

  // ── Disponibilidad por color dentro de la orden ─────────────────────────────
  /**
   * Cuántas unidades de (modelo, color) quedan para la línea `idx`.
   *
   * Al inventario disponible se le resta lo que YA se apartó en las otras
   * líneas de esta misma remisión: si el motocarro 1 pide 3 blancos, el
   * selector del motocarro 2 tiene que mostrar 3 menos. La propia línea no se
   * descuenta a sí misma — si no, el color que acaba de elegir aparecería
   * agotado por su propia reserva.
   *
   * Devuelve `null` cuando no hay dato de ese color: sin información no se
   * inventa un número ni se estorba la captura.
   */
  const disponiblesPara = (idx: number, modelo: string, color: string): number | null =>
    disponiblesEnOrden(
      colorInventory.get(claveStock(modelo, color)),
      // El color a consultar no es siempre el que la línea trae puesto: al
      // desplegar la lista se pregunta por cada color del catálogo.
      motos.map((m, i) => (i === idx ? { ...m, modelo, color } : m)),
      idx,
    );

  // ── Dialog open/reset ───────────────────────────────────────────────────────
  const abrirNueva = () => {
    const allFolios = rows.map((r:any) => r.folio_remision);
    setForm((f:any)=>({ ...f, folio_remision: suggestNextFolio(allFolios), nombre_vendedor: esVendedor?(myProfile?.nombre_completo||""):"" }));
    setMotos([defaultMoto(modelos[0])]); setConFlete(false); setFormFile(null); setOpen(true);
  };
  const resetForm = () => {
    setForm({ folio_remision:"",cliente_id:"",vendedor_asignado_id:"",nombre_vendedor:"",
      fecha_remision:new Date().toISOString().slice(0,10),notas:"",tipo_pago:"anticipado",pagado:true });
    setMotos([defaultMoto(modelos[0])]); setConFlete(false); setFormFile(null);
  };

  // ── Nuevo cliente ───────────────────────────────────────────────────────────
  /** Da de alta el cliente y devuelve su id (o `null` si no se pudo). */
  const crearCliente = async (datos: NuevoCliente): Promise<string|null> => {
    const nombre = datos.nombre_comercial.trim();
    const erp    = datos.codigo_erp.trim();
    if (!nombre && !erp) { toast.error("El nombre comercial o el código ERP es obligatorio"); return null; }
    if (erp) {
      const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true }).eq("codigo_erp", erp);
      if (count && count > 0) { toast.error(`El código ERP ${erp} ya existe`); return null; }
    }

    const payload: any = {
      nombre_comercial: nombre || null,
      telefono: datos.telefono.trim() || null,
      codigo_erp: erp || null,
    };

    const { data, error } = await supabase.from("clientes").insert(payload).select("id,codigo_erp,folio_interno,nombre_comercial").single();
    if (error) { toast.error(error.message); return null; }

    await supabase.from("clientes_bitacora").insert({
      cliente_id: data.id,
      usuario_id: user?.id,
      tipo_cambio: "alta",
      motivo: "Alta de cliente desde remisión",
      datos_nuevos: data,
    });

    toast.success("✓ Cliente creado");
    // El catálogo se recarga, pero el cliente recién creado se agrega de una
    // vez: si la recarga tarda (o falla), el selector ya lo tiene y la remisión
    // se puede guardar.
    setClientes(prev => prev.some((c:any)=>c.id===data.id) ? prev : [...prev, data]);
    await loadClientes();
    return data.id;
  };

  // ── Create remisión ─────────────────────────────────────────────────────────
  const crearRemision = async () => {
    if (!form.folio_remision||!form.cliente_id) { toast.error("Folio y cliente son obligatorios"); return; }
    if (activeFolios.includes(form.folio_remision.trim())) { toast.error("Ese folio ya está en uso por una remisión activa"); return; }
    if (totalUnidades===0) { toast.error("Agrega al menos un motocarro"); return; }

    const vendedor_id = canAssignVendedor&&form.vendedor_asignado_id ? form.vendedor_asignado_id : user?.id;

    // INSERT mínimo: solo columnas que siempre han existido en la tabla.
    // Las columnas agregadas en migraciones posteriores se guardan en UPDATE separado
    // para no fallar si el schema cache de PostgREST no se ha refrescado aún.
    const corePayload = {
      folio_remision: form.folio_remision.trim(),
      cliente_id: form.cliente_id,
      vendedor_id,
      fecha_remision: form.fecha_remision,
      notas: form.notas||null,
      estatus: "NUEVA",
    };

    const { data: nueva, error } = await supabase.from("remisiones").insert(corePayload).select("id").single();
    if (error) return toast.error(error.message);

    // UPDATE con columnas extendidas — tolerante a cache stale (falla silenciosamente)
    if (nueva?.id) {
      const extended: Record<string,any> = {
        tipo_pago: form.tipo_pago,
        pagado: form.tipo_pago === "anticipado",
        color_solicitado: motos[0]?.color || "BLANCO",
        total_unidades_solicitadas: totalUnidades,
      };
      if (form.nombre_vendedor) extended.nombre_vendedor = form.nombre_vendedor;
      await supabase.from("remisiones").update(extended).eq("id", nueva.id);
      // Si el UPDATE falla por cache, la remisión existe con datos core.
      // Una vez que se corra NOTIFY pgrst en Supabase, todo queda guardado automáticamente.
    }

    // Build remision_items
    if (nueva?.id) {
      const items:any[] = [];
      for (const moto of motos) {
        const cant = Number(moto.cantidad)||1;
        items.push({ remision_id:nueva.id, tipo_servicio:"motocarro", modelo:moto.modelo, color:moto.color, cantidad:cant, con_caja:moto.con_caja });
        if (moto.con_cabina)      items.push({ remision_id:nueva.id, tipo_servicio:"cabina",             modelo:moto.modelo, color:null, cantidad:cant, con_caja:false });
        if (moto.con_instalacion) items.push({ remision_id:nueva.id, tipo_servicio:"instalacion_cabina", modelo:null,        color:null, cantidad:cant, con_caja:false });
        if (moto.con_activacion)  items.push({ remision_id:nueva.id, tipo_servicio:"activacion",         modelo:null,        color:null, cantidad:cant, con_caja:false });
      }
      if (conFlete) items.push({ remision_id:nueva.id, tipo_servicio:"flete", modelo:null, color:null, cantidad:1, con_caja:false });
      const { error: err } = await supabase.from("remision_items").insert(items);
      if (err) console.error("Items:", err.message);
    }

    if (formFile&&nueva?.id) {
      const path=`${nueva.id}/${Date.now()}_${formFile.name}`;
      const { error:upErr } = await supabase.storage.from("remisiones-docs").upload(path, formFile);
      if (!upErr) await supabase.from("remisiones").update({ documento_url:path }).eq("id",nueva.id);
    }

    toast.success(t.remisiones.creada); setOpen(false); resetForm(); load();
  };

  // ── Assign chasis ──────────────────────────────────────────────────────────
  const asignarChasis = async (r:any) => {
    // Una sola RPC resuelve todo el pedido: cruza cada línea de
    // remision_items por modelo comercial + color, exige NS chasis y NS motor,
    // y salta unidades cuyo chasis está detenido por una incidencia.
    const { data, error } = await supabase.rpc("asignar_remision_items",{_remision_id:r.id});
    if (error) return toast.error(error.message);

    const res = data as { asignadas?:number; detalle?:any[] } | null;
    const asignadas = res?.asignadas ?? 0;
    if (asignadas>0) toast.success(`✓ ${asignadas} chasis asignados`);

    const faltantes = (res?.detalle ?? []).filter((d:any)=>(d?.faltan??0)>0);
    faltantes.forEach((d:any)=>{
      const que = [d.modelo,d.color].filter(Boolean).join(" ") || "sin modelo/color";
      const porque = d.piezas_por_configurar>0
        ? `hay ${d.piezas_por_configurar} chasis por configurar`
        : d.unidades_sin_serial>0
        ? `hay ${d.unidades_sin_serial} unidad(es) sin NS chasis/NS motor`
        : d.unidades_detenidas>0
        ? `hay ${d.unidades_detenidas} unidad(es) detenidas por incidencia de chasis`
        : "no hay inventario de ese color";
      toast.warning(`Faltan ${d.faltan} de ${que}: ${porque}`);
    });
    if (!asignadas && !faltantes.length) toast.info("Ya están todos asignados");

    load();
  };

  const subirPdf = async (r:any, file:File) => {
    const path=`${r.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("remisiones-docs").upload(path,file);
    if (error) return toast.error(error.message);
    await supabase.from("remisiones").update({documento_url:path}).eq("id",r.id);
    toast.success("✓ PDF subido"); load();
  };
  const verPdf = (path:string) => setPreviewPath(path);
  const descargarPdf = async (path:string) => {
    const nombre=path.split("/").pop()||"remision.pdf";
    const { data,error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path,60,{download:nombre});
    if (error||!data?.signedUrl) { toast.error("No se pudo descargar el PDF"); return; }
    const link=document.createElement("a");
    link.href=data.signedUrl;
    link.download=nombre;
    link.click();
  };
  const confirmarPago = async () => {
    if (!pagoDialog||!comprobanteFile) { toast.error(t.pago.sinComprobante); return; }
    setSubiendoPago(true);
    const path=`${pagoDialog.id}/comprobante_${Date.now()}_${comprobanteFile.name}`;
    const { error:upErr } = await supabase.storage.from("remisiones-docs").upload(path,comprobanteFile);
    if (upErr) { setSubiendoPago(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("remisiones").update({pagado:true,comprobante_pago_url:path}).eq("id",pagoDialog.id);
    setSubiendoPago(false); if (error) return toast.error(error.message);
    toast.success(t.pago.confirmadoOk); setPagoDialog(null); setComprobanteFile(null); load();
  };
  const verComprobante = (path:string) => setPreviewPath(path);

  const cerrarRemision = async (id: string) => {
    // Get the remision to know which model/color to decrement
    const { data: remisionData, error: fetchError } = await supabase
      .from("remisiones")
      .select("color_solicitado, remision_items")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching remision data:", fetchError);
    }

    // Mark as complete
    const { error } = await supabase.from("remisiones").update({ estatus: "COMPLETA" }).eq("id", id);
    if (error) return toast.error(error.message);

    // Decrement color inventory for each motocarro item
    if (remisionData) {
      const items = remisionData.remision_items || [];
      for (const item of items) {
        if (item.tipo_servicio === "motocarro" && item.modelo && item.color) {
          try {
            await supabase.rpc("decrementar_inventario_color", {
              _modelo: item.modelo,
              _color: item.color,
              _cantidad: item.cantidad || 1,
            });
          } catch (error) {
            console.error("Error decrementing color inventory:", error);
          }
        }
      }
    }

    toast.success("✓ Remisión marcada como entregada");
    setCierreConfirm(null); load();
  };

  const eliminarRemision = async (id: string) => {
    // Desligar motocarros — quedan libres para otras remisiones
    await supabase.from("motocarros").update({ remision_id: null }).eq("remision_id", id);
    // Soft delete: marcar CANCELADA (reversible por admin desde la pestaña Canceladas)
    const { error } = await supabase.from("remisiones").update({ estatus: "CANCELADA" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("✓ Remisión cancelada — visible en pestaña Canceladas");
    setDeleteConfirm(null); load();
  };

  const hardDeleteRemision = async (id: string, motivo: string) => {
    if (!motivo || motivo.trim().length < 10) {
      toast.error("El motivo debe tener al menos 10 caracteres");
      return;
    }

    // Get complete remision data for audit log
    const { data: remisionData, error: fetchError } = await supabase
      .from("remisiones")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching remision data:", fetchError);
      toast.error("Error al obtener datos de la remisión");
      return;
    }

    // Insert audit log
    const { error: auditError } = await supabase
      .from("bitacora_eliminaciones")
      .insert({
        tabla: "remisiones",
        registro_id: id,
        eliminado_por: user?.id,
        nombre_usuario: myProfile?.nombre_completo || user?.email,
        motivo: motivo.trim(),
        datos_eliminados: remisionData,
      });

    if (auditError) {
      console.error("Error logging deletion:", auditError);
      toast.error("Error al registrar la eliminación en bitácora");
      return;
    }

    // Hard delete from database
    const { error: deleteError } = await supabase
      .from("remisiones")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting remision:", deleteError);
      toast.error("Error al eliminar la remisión");
      return;
    }

    toast.success("✓ Remisión eliminada definitivamente y registrada en bitácora");
    setHardDeleteConfirm(null);
    setDeleteMotivo("");
    load();
  };

  const restaurarRemision = async (id: string) => {
    const r = rows.find((row) => row.id === id);
    if (r?.folio_remision && activeFolios.includes(r.folio_remision)) {
      toast.error(`No se puede restaurar: el folio ${r.folio_remision} ya está en uso por una remisión activa`);
      return;
    }
    const { error } = await supabase.from("remisiones").update({ estatus: "NUEVA" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("✓ Remisión restaurada a activa"); load();
  };

  // ── Editar / complementar una remisión ─────────────────────────────────────
  /**
   * Lee los renglones de la remisión y arma el formulario de edición.
   *
   * Se vuelven a pedir a la base en vez de usar los de la tarjeta: la carga de
   * la bandeja es tolerante a fallos (si el cache de PostgREST estaba frío, la
   * tarjeta puede haberse quedado sin renglones) y editar con una lista
   * incompleta borraría lo que no se alcanzó a leer.
   */
  const abrirEdicion = async (r:any) => {
    const columnas = "id,remision_id,tipo_servicio,modelo,color,cantidad,con_caja";
    let items: RenglonRemision[] | null = null;

    const { data, error } = await supabase
      .from("remision_items")
      .select(`${columnas},orden_linea`)
      .eq("remision_id", r.id)
      .order("orden_linea", { nullsFirst: true })
      .order("created_at", { nullsFirst: true });
    if (!error) items = data ?? [];

    if (items === null) {
      // `orden_linea` es de la migración 20260902000001: si no se ha aplicado,
      // se editan igual y se agrupa por posición.
      console.warn("remision_items.orden_linea no disponible:", error?.message);
      const { data: previo, error: error2 } = await supabase
        .from("remision_items").select(columnas)
        .eq("remision_id", r.id).order("created_at", { nullsFirst: true });
      if (error2) return toast.error(`No se pudieron leer los renglones: ${error2.message}`);
      items = previo ?? [];
    }

    const agrupado = agruparRenglones(items!, { modeloPorDefecto: modelos[0] });
    setEditItems(items!);
    setEditMotos(agrupado.lineas.length ? agrupado.lineas : [defaultMoto(modelos[0])]);
    setEditFlete(agrupado.conFlete);
    setEditForm({
      folio_remision: r.folio_remision ?? "",
      cliente_id: r.cliente_id ?? "",
      nombre_vendedor: r.nombre_vendedor ?? r.profiles?.nombre_completo ?? "",
      fecha_remision: r.fecha_remision ?? new Date().toISOString().slice(0,10),
      notas: r.notas ?? "",
      tipo_pago: r.tipo_pago ?? "anticipado",
    });
    setEditMotivo(""); setEditMotivoSugerido("");
    setEditar(r);
  };

  const cerrarEdicion = () => {
    setEditar(null); setEditForm(null); setEditMotos([]); setEditItems([]);
    setEditFlete(false); setEditMotivo(""); setEditMotivoSugerido("");
  };

  const addMotoEdit    = () => setEditMotos(m => [...m, defaultMoto(modelos[0])]);
  const removeMotoEdit = (idx:number) => setEditMotos(m => m.filter((_,i)=>i!==idx));
  const updateMotoEdit = (idx:number, campo:keyof MotoItem, valor:unknown) =>
    setEditMotos(m => m.map((item,i) => (i===idx ? aplicarCambioMoto(item, campo, valor) : item)));

  const totalUnidadesEdit = editMotos.reduce((s,m)=>s+Number(m.cantidad||0),0);

  /**
   * Disponibilidad por color al editar.
   *
   * A lo que reporta el inventario hay que devolverle lo que ESTA remisión ya
   * tenía comprometido: su demanda ya está descontada en la vista, así que sin
   * regresarla su propio pedido se vería como agotado.
   */
  const disponiblesParaEdicion = (idx:number, modelo:string, color:string): number | null => {
    const base = disponiblesEnOrden(
      colorInventory.get(claveStock(modelo, color)),
      editMotos.map((m,i) => (i===idx ? {...m, modelo, color} : m)),
      idx,
    );
    if (base === null) return null;
    const yaComprometido = editItems
      .filter(i => i.tipo_servicio === "motocarro"
        && normModelo(i.modelo) === normModelo(modelo)
        && normColor(i.color) === normColor(color))
      .reduce((suma, i) => suma + Number(i.cantidad || 0), 0);
    return base + yaComprometido;
  };

  const guardarEdicion = async () => {
    if (!editar || !editForm) return;

    const motivo = editMotivo.trim();
    if (!motivoValido(motivo)) return toast.error(`Escribe el motivo de la modificación (mínimo ${MOTIVO_MIN} caracteres)`);

    const folio = (editForm.folio_remision||"").trim();
    if (!folio || !editForm.cliente_id) return toast.error("Folio y cliente son obligatorios");
    // El folio es único entre las remisiones activas — sin contarse a sí misma.
    if (rows.some((r:any) => r.id !== editar.id && r.estatus !== "CANCELADA" && r.folio_remision === folio))
      return toast.error("Ese folio ya está en uso por otra remisión activa");

    const plan = planEditarRenglones(editar.id, editMotos, editFlete, editItems);
    if (!plan.totalUnidades) return toast.error("La remisión necesita al menos un motocarro");

    // No se puede pedir menos de lo que ya se armó: esos chasis se liberan
    // primero desde Producción, si no la remisión queda con unidades huérfanas.
    const asignadas = (editar.motocarros ?? []).length;
    if (plan.totalUnidades < asignadas)
      return toast.error(`Esta remisión ya tiene ${asignadas} chasis asignados: libéralos en Producción antes de bajarla a ${plan.totalUnidades} unidades`);

    setGuardandoEdicion(true);

    const antes = {
      folio_remision: editar.folio_remision, cliente_id: editar.cliente_id,
      fecha_remision: editar.fecha_remision, notas: editar.notas,
      tipo_pago: editar.tipo_pago, nombre_vendedor: editar.nombre_vendedor,
      total_unidades_solicitadas: editar.total_unidades_solicitadas,
      renglones: editItems,
    };
    const despues = {
      folio_remision: folio, cliente_id: editForm.cliente_id,
      fecha_remision: editForm.fecha_remision, notas: editForm.notas || null,
      tipo_pago: editForm.tipo_pago, nombre_vendedor: editForm.nombre_vendedor || null,
      total_unidades_solicitadas: plan.totalUnidades,
      renglones: { agregados: plan.inserts, corregidos: plan.updates, quitados: plan.deleteIds },
    };

    // 1. Primero la constancia. Si el motivo no se puede registrar, la remisión
    //    no se toca: una modificación sin justificación no debe existir. El
    //    costo de este orden es que un intento rechazado por RLS (paso 2) deja
    //    su registro — que de todos modos es información útil.
    const { error: errBitacora } = await supabase.from("remisiones_bitacora").insert({
      remision_id: editar.id,
      usuario_id: user?.id,
      nombre_usuario: myProfile?.nombre_completo || user?.email,
      tipo_cambio: "edicion",
      motivo,
      // `Json` no acepta interfaces de TypeScript sin índice: se serializa,
      // que es justo lo que hace supabase-js al mandarlo.
      datos_antes: comoJson(antes),
      datos_despues: comoJson(despues),
    });
    if (errBitacora) {
      setGuardandoEdicion(false);
      return toast.error(`No se pudo registrar el motivo, la remisión no se modificó: ${errBitacora.message}`);
    }

    // 2. Encabezado — columnas que siempre han existido.
    //    El `.select("id")` no es de adorno: un UPDATE que el RLS filtra NO es
    //    un error para PostgREST, contesta 200 sin filas. Sin revisar que
    //    regresara la remisión, a quien no tiene permiso se le diría
    //    «actualizada» sin haber cambiado nada.
    const { data: actualizada, error: errCore } = await supabase.from("remisiones").update({
      folio_remision: folio,
      cliente_id: editForm.cliente_id,
      fecha_remision: editForm.fecha_remision,
      notas: editForm.notas || null,
    }).eq("id", editar.id).select("id");
    if (errCore) { setGuardandoEdicion(false); return toast.error(errCore.message); }
    if (!actualizada?.length) {
      setGuardandoEdicion(false);
      return toast.error("No se guardó nada: no tienes permiso para modificar esta remisión, o ya no existe. Pídele el cambio a tu supervisor.");
    }

    // 3. Columnas extendidas — tolerante a cache stale, igual que al capturar.
    await supabase.from("remisiones").update({
      tipo_pago: editForm.tipo_pago,
      // Pasar a contra entrega no da por pagado lo que no lo está; el
      // comprobante ya subido sí se respeta.
      pagado: editForm.tipo_pago === "anticipado" ? true : !!editar.comprobante_pago_url,
      nombre_vendedor: editForm.nombre_vendedor || null,
      color_solicitado: editMotos[0]?.color || "BLANCO",
      total_unidades_solicitadas: plan.totalUnidades,
    }).eq("id", editar.id);

    // 4. Renglones.
    const fallo = await aplicarPlanRenglones(plan);
    setGuardandoEdicion(false);
    if (fallo) return toast.error(`La remisión se actualizó, pero un renglón falló: ${fallo}`);

    toast.success("✓ Remisión actualizada — el motivo quedó en la bitácora");
    cerrarEdicion();
    load(); loadModificaciones();
  };

  /**
   * Escribe el plan de renglones. Devuelve el mensaje del primer error, o
   * `null` si todo quedó.
   *
   * `orden_linea` es de la migración 20260902000001: si todavía no se aplicó,
   * se reintenta sin esa columna para no bloquear la corrección.
   */
  const aplicarPlanRenglones = async (plan: ReturnType<typeof planEditarRenglones>): Promise<string|null> => {
    const sinOrden = <T extends { orden_linea?: number }>(o: T) => {
      const { orden_linea, ...resto } = o;
      return resto;
    };

    for (const u of plan.updates) {
      let { error } = await supabase.from("remision_items").update(u.cambios).eq("id", u.id);
      if (error) ({ error } = await supabase.from("remision_items").update(sinOrden(u.cambios)).eq("id", u.id));
      if (error) return error.message;
    }

    if (plan.inserts.length) {
      let { error } = await supabase.from("remision_items").insert(plan.inserts);
      if (error) ({ error } = await supabase.from("remision_items").insert(plan.inserts.map(sinOrden)));
      if (error) return error.message;
    }

    if (plan.deleteIds.length) {
      const { error } = await supabase.from("remision_items").delete().in("id", plan.deleteIds);
      if (error) return error.message;
    }

    return null;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>{t.remisiones.title}</h1>
          <p className="text-muted-foreground text-base mt-1">
            {t.remisiones.subtitle(activeRows.length + canceledRows.length)}
            {scope === 'todas'
              ? <> — todo el equipo{misRemisiones>0 ? <> · {misRemisiones} {misRemisiones===1?"tuya":"tuyas"}</> : null}</>
              : <> — solo las tuyas</>}
          </p>
        </div>

        {canCreate && (
          <Dialog open={open} onOpenChange={o=>{ setOpen(o); if(o) abrirNueva(); if(!o) setActiveTab('activas'); }}>
            <DialogTrigger asChild>
              <Button className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                <Plus className="h-5 w-5 mr-2" /> {t.remisiones.nueva}
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t.remisiones.crearTitulo}</DialogTitle></DialogHeader>

              <div className="space-y-4">
                {/* Folio */}
                <div>
                  <Label className="text-base">{t.remisiones.folioRemision}</Label>
                  <Input value={form.folio_remision} onChange={e=>setForm({...form,folio_remision:e.target.value})} placeholder={t.remisiones.folioPlaceholder} className="h-12 text-base font-mono" />
                  {recentFolios.length>0&&(
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recentFolios.map(f=>(
                        <button key={f} type="button" onClick={()=>setForm((s:any)=>({...s,folio_remision:suggestNextFolio(rows.map((r:any)=>r.folio_remision))}))}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#DBEAFE] text-xs font-mono text-[#1F3864] border">{f}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cliente */}
                <CampoCliente
                  clientes={clientes}
                  value={form.cliente_id}
                  onChange={id=>setForm({...form,cliente_id:id})}
                  onCrearCliente={crearCliente}
                />

                {/* Vendedor selector (admin/coord) */}
                {canAssignVendedor&&(
                  <div>
                    <Label className="text-base">Asignar a vendedor</Label>
                    <Select value={form.vendedor_asignado_id || ASIGNAR_A_MI} onValueChange={v=>{
                      const id = v===ASIGNAR_A_MI ? "" : v;
                      const vend=vendedores.find(x=>x.id===id);
                      setForm({...form,vendedor_asignado_id:id,nombre_vendedor:vend?.nombre_completo||form.nombre_vendedor});
                    }}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Vendedor (opcional)"/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ASIGNAR_A_MI}>— Asignar a mí mismo —</SelectItem>
                        {vendedores.map(v=><SelectItem key={v.id} value={v.id}>{v.nombre_completo}{v.codigo_vendedor?` (${v.codigo_vendedor})`:""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Nombre vendedor — todos */}
                <div>
                  <Label className="text-base">Nombre del vendedor{esVendedor&&<span className="ml-1 text-xs text-muted-foreground font-normal">(tu nombre)</span>}</Label>
                  <Input value={form.nombre_vendedor} onChange={e=>setForm({...form,nombre_vendedor:e.target.value})} placeholder="Nombre completo del vendedor" className="h-12 text-base"/>
                </div>

                {/* ── MOTOCARROS + FLETE ─────────────────────────── */}
                <LineasMotocarro
                  motos={motos}
                  modelos={modelos}
                  totalUnidades={totalUnidades}
                  disponiblesPara={disponiblesPara}
                  onAdd={addMoto}
                  onRemove={removeMoto}
                  onUpdate={updateMoto}
                  conFlete={conFlete}
                  onFlete={setConFlete}
                />
                {/* Fecha */}
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.fecha_remision} onChange={e=>setForm({...form,fecha_remision:e.target.value})} className="h-12 text-base"/>
                </div>

                {/* Tipo de pago */}
                <div>
                  <Label>{t.pago.tipo}</Label>
                  <Select value={form.tipo_pago} onValueChange={v=>setForm({...form,tipo_pago:v,pagado:v==="anticipado"})}>
                    <SelectTrigger className="h-12 text-base"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">{t.remisiones.anticipado}</SelectItem>
                      <SelectItem value="contra_entrega">{t.remisiones.contraEntrega}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.tipo_pago==="contra_entrega"&&<p className="text-xs text-amber-600 mt-1">⚠ Logística no podrá programar hasta confirmar el pago.</p>}
                </div>

                {/* Notas */}
                <div>
                  <Label>Notas</Label>
                  <Input value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} className="h-12 text-base"/>
                </div>

                {/* Doc */}
                <div>
                  <Label>{t.remisiones.subirRemision}</Label>
                  <FileOrCamera value={formFile} onChange={setFormFile} label="Toma foto o sube el PDF" className="mt-1"/>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={crearRemision} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.remisiones.crearBtn}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Notificaciones de atrasos ─────────────────────────────────────── */}
      {motocarrosAtrasados.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setNotifOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span className="font-semibold text-amber-800 text-sm">
                {motocarrosAtrasados.length} motocarro{motocarrosAtrasados.length > 1 ? "s" : ""} con fecha vencida
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${notifOpen ? "rotate-180" : ""}`} />
          </button>
          {notifOpen && (
            <div className="mt-3 space-y-1.5 border-t border-amber-200 pt-3">
              {motocarrosAtrasados.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 text-xs text-amber-900">
                  <span className="font-mono font-bold text-amber-700">{m.folio}</span>
                  <span className="font-medium">#{m.orden_armado}</span>
                  <span className="text-muted-foreground">{m.ns_chasis || m.chasis_asignado || "sin NS"}</span>
                  {m.fecha_estimada_armado && m.fecha_estimada_armado < today && !['ARMADO','LISTO'].includes(m.estatus_armado ?? '') && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Armado: {m.fecha_estimada_armado}</span>
                  )}
                  {m.fecha_estimada_entrega && m.fecha_estimada_entrega < today && m.estatus_entrega !== 'ENTREGADA' && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">Entrega: {m.fecha_estimada_entrega}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Alcance: todo el equipo comercial / solo las mías ─────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Ver</span>
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {([
            { key: 'todas', label: 'Todo el equipo' },
            { key: 'mias',  label: 'Solo las mías' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScope(opt.key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                scope===opt.key ? 'bg-white text-[#1F3864] shadow-sm' : 'text-muted-foreground hover:text-[#1F3864]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs Activas / Canceladas ─────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('activas')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab==='activas' ? 'border-[#1F3864] text-[#1F3864]' : 'border-transparent text-muted-foreground hover:text-[#1F3864]'}`}
        >
          Activas <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-xs font-bold">{activeRows.length}</span>
        </button>
        {/* Quien puede abrir esta página ya lee la bandeja completa (RLS), así que
            la pestaña de canceladas no necesita su propia lista de permisos. */}
        <button
          onClick={() => setActiveTab('canceladas')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab==='canceladas' ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-red-500'}`}
        >
          Canceladas <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-xs font-bold">{canceledRows.length}</span>
        </button>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="responsive-card-grid gap-4">
        {activeTab === 'canceladas' ? (
          canceledRows.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin remisiones canceladas</div>
          ) : canceledRows.map((r:any) => (
            <Card key={r.id} className="p-5 flex flex-col gap-3 border-red-100 bg-red-50/30 opacity-80">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t.fields.folio}</div>
                  <div className="text-2xl font-bold text-slate-500 leading-tight line-through">{r.folio_remision}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(r.fecha_remision)}</div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">CANCELADA</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>👤 {r.clientes?.codigo_erp || r.clientes?.folio_interno || "—"}{r.clientes?.nombre_comercial ? ` — ${r.clientes.nombre_comercial}` : ""}</div>
                <div>Vendedor: {r.nombre_vendedor || r.profiles?.nombre_completo || "—"}{r.vendedor_id===user?.id ? " (tuya)" : ""}</div>
                <div>Fecha: {fmtDate(r.fecha_remision)}</div>
              </div>
              <Button variant="outline" onClick={()=>setDetalleRemision(r)} className="w-full h-10 text-sm">
                <FileText className="h-4 w-4 mr-2"/> Ver remisión completa
              </Button>
              {perms.puedeEliminar('remisiones') && (
                <Button
                  variant="outline"
                  onClick={() => restaurarRemision(r.id)}
                  className="w-full h-10 text-sm border-[#2E75B6] text-[#2E75B6] hover:bg-[#DBEAFE]"
                >
                  ↩ Restaurar remisión
                </Button>
              )}
            </Card>
          ))
        ) : activeRows.map(r => {
          const motos_   = r.motocarros??[];
          const items:any[] = r.remision_items??[];
          const motoItems  = items.filter((i:any)=>i.tipo_servicio==="motocarro");
          const asignadas  = motos_.length;
          const listas     = motos_.filter((m:any)=>["ARMADO","LISTO"].includes(m.estatus_armado)).length;
          const total      = r.total_unidades_solicitadas||asignadas||1;
          const pct        = Math.round((listas/total)*100);
          const pctColor   = pct===100?"#065F46":pct>=50?"#92400E":"#991B1B";
          const isOwner    = r.vendedor_id===user?.id;
          const puedeGestionar = editaTodas||(canCreate&&isOwner);
          const canAssign  = puedeGestionar;
          const canUpload  = puedeGestionar;
          const canPropose = puedeGestionar;
          const vendedorNombre = r.nombre_vendedor||r.profiles?.nombre_completo||"—";
          const initials = vendedorNombre.split(" ").map((s:string)=>s[0]).slice(0,2).join("").toUpperCase();

          return (
            <Card key={r.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t.fields.folio}</div>
                  <div className="text-2xl font-bold text-[#1F3864] leading-tight">{r.folio_remision}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(r.fecha_remision)}</div>
                  {!!modificaciones[r.id] && (
                    <button
                      type="button"
                      onClick={()=>setDetalleRemision(r)}
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:underline"
                      title="Ver el historial de modificaciones"
                    >
                      <History className="h-3 w-3"/>
                      Modificada {modificaciones[r.id]} {modificaciones[r.id]===1?"vez":"veces"}
                    </button>
                  )}
                </div>
                <EstatusBadge estatus={r.estatus} size="md"/>
              </div>

              {/* Vendedor + cliente + pago */}
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] text-xs font-medium">
                  <span className="w-5 h-5 rounded-full bg-[#2E75B6] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{initials||"?"}</span>
                  {vendedorNombre.split(" ")[0]}
                </span>
                {isOwner && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-[#1F3864] text-white text-[10px] font-bold uppercase tracking-wide">Tuya</span>
                )}
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  👤 {r.clientes?.codigo_erp || r.clientes?.folio_interno || "—"}
                </span>
                {r.tipo_pago==="contra_entrega"&&!r.pagado ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">{t.pago.pendiente}</span>
                ):(
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    <DollarSign className="h-3 w-3"/> {r.tipo_pago==="contra_entrega"?t.pago.contra_entrega:t.pago.anticipado}
                  </span>
                )}
              </div>

              {/* Items summary — grouped by motocarro */}
              {motoItems.length>0&&(
                <div className="space-y-1">
                  {motoItems.map((moto:any, idx:number)=>{
                    // Find services that came after this moto in the item list (by position)
                    const motoPos = items.indexOf(moto);
                    const nextMotoPos = items.findIndex((it:any,i:number)=>i>motoPos&&it.tipo_servicio==="motocarro");
                    const services = items.slice(motoPos+1, nextMotoPos===-1?undefined:nextMotoPos).filter((it:any)=>it.tipo_servicio!=="flete");
                    return (
                      <div key={moto.id} className="flex flex-wrap items-center gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${tipoBadgeClass.motocarro}`}>
                          {moto.cantidad>1&&<span>{moto.cantidad}×</span>}
                          🏍️ {moto.modelo} {colorLabel(moto.color)}
                          {moto.con_caja&&<Package size={9}/>}
                        </span>
                        {services.map((s:any)=>(
                          <span key={s.id} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tipoBadgeClass[s.tipo_servicio]??""}`}>
                            {tipoIcon[s.tipo_servicio]}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                  {items.find((i:any)=>i.tipo_servicio==="flete")&&(
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoBadgeClass.flete}`}>🚛 Flete</span>
                  )}
                </div>
              )}

              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>{listas} de {total} listos</span>
                  <span style={{color:pctColor}} className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full transition-all" style={{width:`${Math.min(pct,100)}%`,backgroundColor:pctColor}}/>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{asignadas} chasis asignados de {total}</div>
              </div>

              {/* Moto list */}
              {motos_.length>0&&(
                <Collapsible open={!!expanded[r.id]} onOpenChange={o=>setExpanded(s=>({...s,[r.id]:o}))}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-sm font-medium">
                    Ver chasis y entregas ({motos_.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded[r.id]?"rotate-180":""}`}/>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {motos_.map((m:any)=><MotoRow key={m.id} m={m} canPropose={canPropose} canConfirmFab={confirmaFabrica} canConfirmLog={confirmaLogistica} onChange={load}/>)}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t flex-wrap">
                <Button variant="outline" onClick={()=>setDetalleRemision(r)} className="basis-full h-12 text-base">
                  <FileText className="h-5 w-5 mr-2"/> Ver remisión completa
                </Button>
                {/* Editar / complementar — operador en las suyas, supervisor y
                    administrador en las de todo el área. Cada cambio pide motivo. */}
                {puedeGestionar&&(
                  <Button variant="outline" onClick={()=>abrirEdicion(r)} className="flex-1 h-12 text-base min-w-[100px] border-[#1F3864]/40 text-[#1F3864] hover:bg-[#DBEAFE]">
                    <Pencil className="h-5 w-5 mr-2"/> Editar
                  </Button>
                )}
                {canAssign&&asignadas<total&&r.estatus!=="COMPLETA"&&r.estatus!=="CANCELADA"&&(
                  <Button onClick={()=>asignarChasis(r)} className="flex-1 h-12 bg-[#2E75B6] hover:bg-[#246094] text-base min-w-[100px]">
                    <Wand2 className="h-5 w-5 mr-2"/> Asignar
                  </Button>
                )}
                {r.documento_url?(
                  <>
                    <Button variant="outline" onClick={()=>verPdf(r.documento_url)} className="flex-1 h-12 text-base min-w-[100px]">
                      <Eye className="h-5 w-5 mr-2"/> Ver PDF
                    </Button>
                    <Button variant="outline" onClick={()=>descargarPdf(r.documento_url)} className="flex-1 h-12 text-base min-w-[100px]">
                      <Download className="h-5 w-5 mr-2"/> Descargar
                    </Button>
                  </>
                ):canUpload?(
                  <label className="flex-1 min-w-[100px]">
                    <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)subirPdf(r,f);}}/>
                    <span className="flex items-center justify-center cursor-pointer h-12 rounded-md border-2 border-dashed border-[#2E75B6]/40 text-[#1F3864] font-medium hover:bg-[#DBEAFE] text-base">
                      <Upload className="h-5 w-5 mr-2"/> Subir PDF
                    </span>
                  </label>
                ):(
                  <div className="flex-1 h-12 flex items-center justify-center text-muted-foreground text-sm min-w-[100px]">
                    <FileText className="h-5 w-5 mr-2 opacity-40"/> Sin PDF
                  </div>
                )}
                {r.tipo_pago==="contra_entrega"&&!r.pagado&&puedeGestionar&&(
                  <Button onClick={()=>{setPagoDialog(r);setComprobanteFile(null);}} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700 min-w-[100px]">
                    <DollarSign className="h-5 w-5 mr-2"/> {t.pago.confirmar}
                  </Button>
                )}
                {r.tipo_pago==="contra_entrega"&&r.pagado&&r.comprobante_pago_url&&(
                  <Button variant="outline" onClick={()=>verComprobante(r.comprobante_pago_url)} className="flex-1 h-12 text-base min-w-[100px]">
                    <FileDown className="h-5 w-5 mr-2"/> {t.pago.verComprobante}
                  </Button>
                )}
                {/* Marcar entregada — supervisor/admin del área, solo si está activa */}
                {editaTodas&&(r.estatus==="NUEVA"||r.estatus==="PARCIAL")&&(
                  <Button
                    onClick={()=>setCierreConfirm(r)}
                    className="flex-1 h-12 text-base bg-emerald-700 hover:bg-emerald-800 min-w-[120px]"
                  >
                    <CheckCheck className="h-5 w-5 mr-2"/> Entregar
                  </Button>
                )}
                {/* Cancelar — supervisor/admin del área, u operador en las propias */}
                {(editaTodas||(canCreate&&isOwner))&&(
                  <Button
                    variant="outline"
                    onClick={()=>setDeleteConfirm(r)}
                    className="h-12 w-12 p-0 shrink-0 border-red-200 text-red-500 hover:bg-red-50"
                    title="Cancelar remisión"
                  >
                    <Trash2 className="h-5 w-5"/>
                  </Button>
                )}
                {/* Eliminar definitivamente — solo admin del área */}
                {perms.puedeEliminar("remisiones")&&(
                  <Button
                    variant="outline"
                    onClick={()=>setHardDeleteConfirm(r)}
                    className="h-12 w-12 p-0 shrink-0 border-red-300 text-red-600 hover:bg-red-100"
                    title="Eliminar definitivamente (requiere motivo)"
                  >
                    <XCircle className="h-5 w-5"/>
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {activeTab==='activas'&&!activeRows.length&&<div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin remisiones activas</div>}
      </div>

      <Dialog open={!!detalleRemision} onOpenChange={o=>{if(!o)setDetalleRemision(null);}}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-[#1F3864]">
              Remisión {detalleRemision?.folio_remision}
              {detalleRemision&&<EstatusBadge estatus={detalleRemision.estatus} size="md"/>}
            </DialogTitle>
            <DialogDescription>Información completa, configuración solicitada y unidades asignadas.</DialogDescription>
          </DialogHeader>
          {detalleRemision&&(
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Fecha</div>
                  <div className="font-semibold">{fmtDate(detalleRemision.fecha_remision)}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Cliente</div>
                  <div className="font-semibold break-words">
                    {detalleRemision.clientes?.codigo_erp||detalleRemision.clientes?.folio_interno||"—"}
                    {detalleRemision.clientes?.nombre_comercial?` · ${detalleRemision.clientes.nombre_comercial}`:""}
                  </div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Vendedor</div>
                  <div className="font-semibold break-words">{detalleRemision.nombre_vendedor||detalleRemision.profiles?.nombre_completo||"—"}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Tipo de pago</div>
                  <div className="font-semibold">{detalleRemision.tipo_pago==="contra_entrega"?"Contra entrega":"Anticipado"}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Estado del pago</div>
                  <div className="font-semibold">{detalleRemision.pagado===false?"Pendiente":"Pagado"}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Unidades solicitadas</div>
                  <div className="font-semibold">{detalleRemision.total_unidades_solicitadas||detalleRemision.motocarros?.length||1}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Unidades asignadas</div>
                  <div className="font-semibold">{detalleRemision.motocarros?.length||0}</div>
                </div>
              </div>

              <div>
                <h3 className="text-base mb-2">Configuración del pedido</h3>
                {detalleRemision.remision_items?.length?(
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detalleRemision.remision_items.map((item:any)=>(
                      <div key={item.id} className="rounded-lg border p-3 flex items-start gap-2">
                        <span>{tipoIcon[item.tipo_servicio]||"•"}</span>
                        <div className="min-w-0">
                          <div className="font-semibold">{tipoLabel[item.tipo_servicio]||item.tipo_servicio}</div>
                          <div className="text-sm text-muted-foreground break-words">
                            {[item.modelo,item.color,item.cantidad?`Cantidad: ${item.cantidad}`:null,item.con_caja?"Con caja":null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ):<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin configuración capturada.</div>}
              </div>

              <div>
                <h3 className="text-base mb-2">Unidades asignadas</h3>
                {detalleRemision.motocarros?.length?(
                  <div className="space-y-2">
                    {detalleRemision.motocarros.map((m:any)=>(
                      <div key={m.id} className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Orden:</span> <strong>#{m.orden_armado}</strong></div>
                        <div><span className="text-muted-foreground">Modelo/color:</span> <strong>{m.modelo||"—"} {m.color||""}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">NS chasis:</span> <strong>{m.ns_chasis||m.chasis_asignado||"—"}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">NS motor:</span> <strong>{m.ns_motor||"—"}</strong></div>
                        <div><span className="text-muted-foreground">Estado:</span> <strong>{m.estatus_entrega==="ENTREGADA"?"ENTREGADA":effEstatusArmado(m)}</strong></div>
                        <div><span className="text-muted-foreground">Armado estimado:</span> <strong>{fmtDate(m.fecha_estimada_armado)}</strong></div>
                        <div><span className="text-muted-foreground">Armado real:</span> <strong>{fmtDate(m.fecha_real_armado)}</strong></div>
                        <div><span className="text-muted-foreground">Entrega:</span> <strong>{fmtDate(m.fecha_real_entrega||m.fecha_estimada_entrega)}</strong></div>
                      </div>
                    ))}
                  </div>
                ):<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay unidades asignadas.</div>}
              </div>

              {detalleRemision.notas&&(
                <div>
                  <h3 className="text-base mb-2">Notas</h3>
                  <div className="rounded-lg border bg-blue-50/50 p-3 text-sm whitespace-pre-wrap break-words">{detalleRemision.notas}</div>
                </div>
              )}

              {/* Quién le movió, cuándo y por qué. Es lo que hace que abrir la
                  edición a todo el equipo siga siendo rastreable. */}
              {historial.length>0&&(
                <div>
                  <h3 className="text-base mb-2 flex items-center gap-2"><History className="h-4 w-4"/> Modificaciones</h3>
                  <div className="space-y-2">
                    {historial.map((h:any)=>(
                      <div key={h.id} className="rounded-lg border bg-amber-50/50 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <strong className="text-[#1F3864]">{h.nombre_usuario||"—"}</strong>
                          <span>{new Date(h.created_at).toLocaleString("es-MX")}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold uppercase tracking-wide">{h.tipo_cambio}</span>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words">{h.motivo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {detalleRemision.documento_url?(
                  <>
                    <Button onClick={()=>verPdf(detalleRemision.documento_url)} className="flex-1 min-w-40 bg-[#1F3864] hover:bg-[#162a4d]">
                      <Eye className="h-4 w-4 mr-2"/> Visualizar PDF
                    </Button>
                    <Button variant="outline" onClick={()=>descargarPdf(detalleRemision.documento_url)} className="flex-1 min-w-40">
                      <Download className="h-4 w-4 mr-2"/> Descargar PDF
                    </Button>
                  </>
                ):<div className="flex-1 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Esta remisión no tiene PDF adjunto.</div>}
                <Button variant="outline" onClick={()=>setDetalleRemision(null)}>Cerrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Editar / complementar remisión — con motivo obligatorio ────────── */}
      <Dialog open={!!editar} onOpenChange={o=>{ if(!o) cerrarEdicion(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1F3864]">
              <Pencil className="h-5 w-5"/> Editar remisión {editar?.folio_remision}
            </DialogTitle>
            <DialogDescription>
              Corrige lo que se capturó mal o agrega unidades y servicios a esta remisión.
              Todo cambio queda registrado con tu nombre y el motivo que escribas.
            </DialogDescription>
          </DialogHeader>

          {editForm&&(
            <div className="space-y-4">
              {(editar?.motocarros?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
                  <span>
                    Esta remisión ya tiene <strong>{editar.motocarros.length}</strong> chasis asignados.
                    Puedes agregar unidades, pero para bajar el total hay que liberarlos primero en Producción.
                  </span>
                </div>
              )}

              {/* Folio */}
              <div>
                <Label className="text-base">{t.remisiones.folioRemision}</Label>
                <Input value={editForm.folio_remision} onChange={e=>setEditForm({...editForm,folio_remision:e.target.value})} className="h-12 text-base font-mono"/>
              </div>

              {/* Cliente */}
              <CampoCliente
                clientes={clientes}
                value={editForm.cliente_id}
                onChange={id=>setEditForm({...editForm,cliente_id:id})}
                onCrearCliente={crearCliente}
              />

              {/* Nombre del vendedor */}
              <div>
                <Label className="text-base">Nombre del vendedor</Label>
                <Input value={editForm.nombre_vendedor} onChange={e=>setEditForm({...editForm,nombre_vendedor:e.target.value})} placeholder="Nombre completo del vendedor" className="h-12 text-base"/>
              </div>

              {/* Líneas del pedido — mismas reglas que al capturar */}
              <LineasMotocarro
                motos={editMotos}
                modelos={modelos}
                totalUnidades={totalUnidadesEdit}
                disponiblesPara={disponiblesParaEdicion}
                onAdd={addMotoEdit}
                onRemove={removeMotoEdit}
                onUpdate={updateMotoEdit}
                conFlete={editFlete}
                onFlete={setEditFlete}
              />

              {/* Fecha */}
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={editForm.fecha_remision} onChange={e=>setEditForm({...editForm,fecha_remision:e.target.value})} className="h-12 text-base"/>
              </div>

              {/* Tipo de pago */}
              <div>
                <Label>{t.pago.tipo}</Label>
                <Select value={editForm.tipo_pago} onValueChange={v=>setEditForm({...editForm,tipo_pago:v})}>
                  <SelectTrigger className="h-12 text-base"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anticipado">{t.remisiones.anticipado}</SelectItem>
                    <SelectItem value="contra_entrega">{t.remisiones.contraEntrega}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notas */}
              <div>
                <Label>Notas</Label>
                <Input value={editForm.notas} onChange={e=>setEditForm({...editForm,notas:e.target.value})} className="h-12 text-base"/>
              </div>

              {/* ── Motivo — obligatorio ───────────────────────────────── */}
              <div className="rounded-xl border-2 border-[#2E75B6]/40 bg-[#DBEAFE]/30 p-3 space-y-2">
                <Label className="text-base font-semibold">
                  Motivo de la modificación <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={editMotivoSugerido}
                  onValueChange={v=>{
                    setEditMotivoSugerido(v);
                    // Sirve de arranque: se puede completar o cambiar a mano.
                    setEditMotivo(m => (m.trim() && m !== editMotivoSugerido ? m : v));
                  }}
                >
                  <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Motivo frecuente (opcional)"/></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_EDICION.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  value={editMotivo}
                  onChange={e=>setEditMotivo(e.target.value)}
                  placeholder="¿Por qué se modifica esta remisión? Ej: el cliente agregó 2 unidades azules el 2 de septiembre."
                  className="min-h-[90px]"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo {MOTIVO_MIN} caracteres. Queda en la bitácora de la remisión, junto con tu nombre y la fecha.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cerrarEdicion}>{t.actions.cancel}</Button>
            <Button
              onClick={guardarEdicion}
              disabled={guardandoEdicion||!motivoValido(editMotivo)}
              className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]"
            >
              {guardandoEdicion?"Guardando…":"Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cierre / entregar remisión */}
      <AlertDialog open={!!cierreConfirm} onOpenChange={o=>{ if(!o) setCierreConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como entregada?</AlertDialogTitle>
            <AlertDialogDescription>
              La remisión <strong>{cierreConfirm?.folio_remision}</strong> se marcará como <strong>COMPLETA</strong>.
              Desaparecerá de la bandeja de fábrica. Esta acción se puede deshacer editando el estatus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={()=>cerrarRemision(cierreConfirm?.id)} className="bg-emerald-700 hover:bg-emerald-800">
              Sí, marcar entregada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar remisión */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={o=>{ if(!o) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5"/> Cancelar remisión
            </AlertDialogTitle>
            <AlertDialogDescription>
              La remisión <strong>{deleteConfirm?.folio_remision}</strong> se cancelará y desaparecerá de fábrica.
              Los motocarros asignados quedarán disponibles. La remisión quedará en la pestaña <strong>Canceladas</strong> y un administrador puede restaurarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={()=>eliminarRemision(deleteConfirm?.id)} className="bg-red-600 hover:bg-red-700">
              Sí, cancelar remisión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar definitivamente remisión — solo admin con motivo obligatorio */}
      <Dialog open={!!hardDeleteConfirm} onOpenChange={o=>{ if(!o) { setHardDeleteConfirm(null); setDeleteMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5"/> Eliminar definitivamente remisión
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará permanentemente la remisión <strong>{hardDeleteConfirm?.folio_remision}</strong> del sistema.
              Esta acción queda registrada en la bitácora de eliminaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="motivo" className="text-sm font-medium">
                Motivo de eliminación <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="motivo"
                placeholder="Describa el motivo de esta eliminación (mínimo 10 caracteres)..."
                value={deleteMotivo}
                onChange={e => setDeleteMotivo(e.target.value)}
                className="mt-2 min-h-[100px]"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Mínimo 10 caracteres. Este motivo quedará registrado en la bitácora.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setHardDeleteConfirm(null); setDeleteMotivo(""); }}>
              Cancelar
            </Button>
            <Button 
              onClick={()=>hardDeleteRemision(hardDeleteConfirm?.id, deleteMotivo)}
              disabled={!deleteMotivo || deleteMotivo.trim().length < 10}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pago dialog */}
      <Dialog open={!!pagoDialog} onOpenChange={o=>{if(!o){setPagoDialog(null);setComprobanteFile(null);}}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.pago.confirmar} — {pagoDialog?.folio_remision}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t.pago.confirmarDesc}</p>
            <FileOrCamera value={comprobanteFile} onChange={setComprobanteFile} label={t.pago.subirComprobante}/>
            {comprobanteFile&&<p className="text-xs text-emerald-600 font-medium text-center">{t.pago.archivoListo}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>{setPagoDialog(null);setComprobanteFile(null);}}>{t.actions.cancel}</Button>
            <Button onClick={confirmarPago} disabled={!comprobanteFile||subiendoPago} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="h-4 w-4 mr-2"/>{subiendoPago?t.actions.uploading:t.pago.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentViewerDialog
        path={previewPath}
        open={!!previewPath}
        onOpenChange={o => { if (!o) setPreviewPath(null); }}
      />
    </div>
  );
}

// ─── MotoRow ──────────────────────────────────────────────────────────────────
function MotoRow({ m, canPropose, canConfirmFab, canConfirmLog, onChange }:{m:any;canPropose:boolean;canConfirmFab:boolean;canConfirmLog:boolean;onChange:()=>void}) {
  const [editing, setEditing] = useState(false);
  const [fecha, setFecha]     = useState<string>(m.fecha_propuesta_entrega||"");
  const [notas, setNotas]     = useState<string>(m.propuesta_entrega_notas||"");

  const proponer = async () => {
    if (!fecha) return toast.error("Selecciona una fecha");
    const { error } = await supabase.rpc("proponer_fecha_entrega",{_motocarro_id:m.id,_fecha:fecha,_notas:notas||null});
    if (error) return toast.error(error.message);
    toast.success("✓ Fecha propuesta enviada"); setEditing(false); onChange();
  };
  const confirmar = async (area:"fabrica"|"logistica") => {
    const { error } = await supabase.rpc("confirmar_fecha_entrega",{_motocarro_id:m.id,_area:area});
    if (error) return toast.error(error.message);
    toast.success(`✓ Confirmado por ${area}`); onChange();
  };

  const tieneFab = !!m.confirmada_fabrica_at;
  const tieneLog = !!m.confirmada_logistica_at;

  return (
    <div className="rounded-md border bg-white text-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{m.ns_chasis||m.chasis_asignado||"—"}</span>
        </div>
        <EstatusBadge estatus={m.estatus_entrega==="ENTREGADA"?"ENTREGADA":effEstatusArmado(m)} size="sm"/>
      </div>
      <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Estim. armado:</div><div className="text-right font-medium">{fmtDate(m.fecha_estimada_armado)}</div>
        <div className="text-muted-foreground">Estim. entrega:</div><div className="text-right font-medium">{fmtDate(m.fecha_estimada_entrega||m.fecha_propuesta_entrega)}</div>
      </div>
      {!editing?(
        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
          {m.fecha_propuesta_entrega?(
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-medium text-[#1F3864] flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5"/> Propuesta: {fmtDate(m.fecha_propuesta_entrega)}</div>
              {m.propuesta_entrega_notas&&<div className="text-muted-foreground truncate">{m.propuesta_entrega_notas}</div>}
              <div className="flex gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneFab?"bg-[#D1FAE5] text-[#065F46]":"bg-slate-100 text-slate-500"}`}>
                  <Factory className="h-3 w-3"/> {tieneFab?"Fábrica ✓":"Fábrica pendiente"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneLog?"bg-[#D1FAE5] text-[#065F46]":"bg-slate-100 text-slate-500"}`}>
                  <Truck className="h-3 w-3"/> {tieneLog?"Logística ✓":"Logística pendiente"}
                </span>
              </div>
            </div>
          ):<div className="flex-1 text-xs text-muted-foreground italic">Sin fecha propuesta</div>}
          <div className="flex gap-1.5 ml-auto">
            {canPropose&&m.estatus_entrega!=="ENTREGADA"&&(
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>setEditing(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1"/>{m.fecha_propuesta_entrega?"Cambiar":"Proponer"}
              </Button>
            )}
            {m.fecha_propuesta_entrega&&canConfirmFab&&!tieneFab&&(
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={()=>confirmar("fabrica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirmar fábrica
              </Button>
            )}
            {m.fecha_propuesta_entrega&&canConfirmLog&&!tieneLog&&(
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={()=>confirmar("logistica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirmar logística
              </Button>
            )}
          </div>
        </div>
      ):(
        <div className="px-3 pb-3 space-y-2 bg-[#DBEAFE]/30">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Fecha pactada</Label><Input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="h-9 text-sm"/></div>
            <div><Label className="text-xs">Hora / contacto</Label><Input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Ej: 10am" className="h-9 text-sm"/></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 bg-[#1F3864] hover:bg-[#162a4d]" onClick={proponer}>Enviar propuesta</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={()=>setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
