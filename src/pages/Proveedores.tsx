// Catálogo de proveedores: la contraparte de los egresos. Guarda datos
// fiscales y bancarios para no tener que pedirlos cada vez que hay que pagar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Search, Building2, Pencil, ArrowLeft, Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { fdb } from "@/lib/finanzasDb";
import { MONEDAS, fmtMoneda, type Proveedor } from "@/lib/finanzas";

const CATEGORIAS = [
  "Partes y refacciones", "Fletes y transporte", "Aduana y comercio exterior",
  "Servicios profesionales", "Servicios (luz, agua, renta)", "Mantenimiento",
  "Papelería y oficina", "Impuestos y gobierno", "Otro",
];

interface FormProveedor {
  codigo: string;
  nombre_comercial: string;
  razon_social: string;
  rfc: string;
  categoria: string;
  telefono: string;
  email: string;
  nombre_contacto: string;
  direccion: string;
  banco: string;
  clabe: string;
  cuenta_bancaria: string;
  moneda_preferida: string;
  dias_credito: string;
  notas: string;
}

const FORM_VACIO: FormProveedor = {
  codigo: "", nombre_comercial: "", razon_social: "", rfc: "", categoria: "",
  telefono: "", email: "", nombre_contacto: "", direccion: "",
  banco: "", clabe: "", cuenta_bancaria: "", moneda_preferida: "MXN",
  dias_credito: "0", notas: "",
};

export default function Proveedores() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Proveedor[]>([]);
  const [gastoPorProveedor, setGastoPorProveedor] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [altaAbierta, setAltaAbierta] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [borrarTarget, setBorrarTarget] = useState<Proveedor | null>(null);
  const [form, setForm] = useState<FormProveedor>({ ...FORM_VACIO });

  const puedeEditar = role === "admin" || role === "admin_financiero" || role === "finanzas";
  const puedeBorrar = role === "admin" || role === "admin_financiero";
  const esFinanzas = puedeEditar;

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await fdb.from("proveedores").select("*").order("nombre_comercial");
    if (error) toast.error(error.message);
    else setRows(data ?? []);

    // Cuánto se le ha pagado a cada proveedor (solo si el rol ve finanzas)
    if (esFinanzas) {
      const { data: movs } = await fdb
        .from("movimientos_financieros")
        .select("proveedor_id, monto_mxn")
        .eq("tipo", "EGRESO")
        .eq("estatus", "CONFIRMADO")
        .not("proveedor_id", "is", null);
      const acum: Record<string, number> = {};
      for (const m of (movs ?? []) as { proveedor_id: string; monto_mxn: number }[]) {
        acum[m.proveedor_id] = (acum[m.proveedor_id] ?? 0) + Number(m.monto_mxn ?? 0);
      }
      setGastoPorProveedor(acum);
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(p => {
      if (p.activo === verArchivados) return false;
      if (!term) return true;
      return [p.nombre_comercial, p.razon_social, p.rfc, p.codigo, p.categoria, p.nombre_contacto, p.telefono]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [rows, q, verArchivados]);

  const abrirAlta = () => { setForm({ ...FORM_VACIO }); setAltaAbierta(true); };

  const abrirEdicion = (p: Proveedor) => {
    setEditando(p);
    setForm({
      codigo: p.codigo ?? "",
      nombre_comercial: p.nombre_comercial,
      razon_social: p.razon_social ?? "",
      rfc: p.rfc ?? "",
      categoria: p.categoria ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      nombre_contacto: p.nombre_contacto ?? "",
      direccion: p.direccion ?? "",
      banco: p.banco ?? "",
      clabe: p.clabe ?? "",
      cuenta_bancaria: p.cuenta_bancaria ?? "",
      moneda_preferida: p.moneda_preferida ?? "MXN",
      dias_credito: String(p.dias_credito ?? 0),
      notas: p.notas ?? "",
    });
  };

  const aPayload = () => ({
    codigo: form.codigo.trim() || null,
    nombre_comercial: form.nombre_comercial.trim(),
    razon_social: form.razon_social.trim() || null,
    rfc: form.rfc.trim().toUpperCase() || null,
    categoria: form.categoria || null,
    telefono: form.telefono.trim() || null,
    email: form.email.trim() || null,
    nombre_contacto: form.nombre_contacto.trim() || null,
    direccion: form.direccion.trim() || null,
    banco: form.banco.trim() || null,
    clabe: form.clabe.trim() || null,
    cuenta_bancaria: form.cuenta_bancaria.trim() || null,
    moneda_preferida: form.moneda_preferida,
    dias_credito: parseInt(form.dias_credito, 10) || 0,
    notas: form.notas.trim() || null,
  });

  const validar = () => {
    if (!form.nombre_comercial.trim()) { toast.error("El nombre del proveedor es obligatorio"); return false; }
    const rfc = form.rfc.trim();
    if (rfc && rfc.length !== 12 && rfc.length !== 13) {
      toast.error("El RFC debe tener 12 o 13 caracteres"); return false;
    }
    const clabe = form.clabe.trim();
    if (clabe && !/^\d{18}$/.test(clabe)) {
      toast.error("La CLABE debe tener 18 dígitos"); return false;
    }
    return true;
  };

  const guardarAlta = async () => {
    if (!validar()) return;
    setGuardando(true);
    const { error } = await fdb.from("proveedores").insert({ ...aPayload(), created_by: user?.id });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Proveedor dado de alta");
    setAltaAbierta(false);
    cargar();
  };

  const guardarEdicion = async () => {
    if (!editando || !validar()) return;
    setGuardando(true);
    const { error } = await fdb.from("proveedores").update(aPayload()).eq("id", editando.id);
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Proveedor actualizado");
    setEditando(null);
    cargar();
  };

  const alternarArchivo = async (p: Proveedor) => {
    const { error } = await fdb.from("proveedores").update({ activo: !p.activo }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(p.activo ? "Proveedor archivado" : "Proveedor reactivado");
    cargar();
  };

  const borrar = async () => {
    if (!borrarTarget) return;
    const { error } = await fdb.from("proveedores").delete().eq("id", borrarTarget.id);
    if (error) {
      toast.error("No se pudo eliminar; probablemente tiene pagos ligados. Archívalo en su lugar.");
      return;
    }
    toast.success("Proveedor eliminado");
    setBorrarTarget(null);
    cargar();
  };

  // Los campos van inline (no en un subcomponente) para no perder el foco al teclear.
  const camposForm = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Nombre comercial *</Label>
          <Input
            className="h-11"
            value={form.nombre_comercial}
            onChange={e => setForm({ ...form, nombre_comercial: e.target.value })}
            placeholder="Como le dicen en la operación"
          />
        </div>
        <div>
          <Label>Código interno</Label>
          <Input
            className="h-11"
            value={form.codigo}
            onChange={e => setForm({ ...form, codigo: e.target.value })}
            placeholder="PROV-001"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Razón social</Label>
          <Input
            className="h-11"
            value={form.razon_social}
            onChange={e => setForm({ ...form, razon_social: e.target.value })}
          />
        </div>
        <div>
          <Label>RFC</Label>
          <Input
            className="h-11"
            value={form.rfc}
            onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
            placeholder="12 o 13 caracteres"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Categoría</Label>
          <Select value={form.categoria || undefined} onValueChange={v => setForm({ ...form, categoria: v })}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contacto</Label>
          <Input
            className="h-11"
            value={form.nombre_contacto}
            onChange={e => setForm({ ...form, nombre_contacto: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Teléfono</Label>
          <Input className="h-11" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
        </div>
        <div>
          <Label>Correo</Label>
          <Input className="h-11" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>

      <div>
        <Label>Dirección</Label>
        <Input className="h-11" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <p className="text-sm font-semibold text-[#1F3864]">Datos para pagarle</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Banco</Label>
            <Input className="h-11" value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} />
          </div>
          <div>
            <Label>CLABE</Label>
            <Input
              className="h-11"
              value={form.clabe}
              onChange={e => setForm({ ...form, clabe: e.target.value.replace(/\D/g, "") })}
              placeholder="18 dígitos"
              maxLength={18}
            />
          </div>
          <div>
            <Label>Cuenta / tarjeta</Label>
            <Input className="h-11" value={form.cuenta_bancaria} onChange={e => setForm({ ...form, cuenta_bancaria: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Moneda</Label>
              <Select value={form.moneda_preferida} onValueChange={v => setForm({ ...form, moneda_preferida: v })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Días crédito</Label>
              <Input
                className="h-11"
                type="number"
                min="0"
                value={form.dias_credito}
                onChange={e => setForm({ ...form, dias_credito: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <Label>Notas</Label>
        <Textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2} />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Button variant="ghost" className="-ml-2 h-9" onClick={() => navigate("/finanzas")}>
        <ArrowLeft size={16} className="mr-2" /> Control Financiero
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Building2 size={28} className="text-[#1F3864]" />
            Proveedores
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            {filtrados.length} {verArchivados ? "archivados" : "activos"}
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={abrirAlta} className="h-12 bg-[#1F3864] px-5 text-base hover:bg-[#162a4d]">
            <Plus className="mr-2 h-5 w-5" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <Card className="space-y-3 p-3">
        <div className="flex gap-2">
          <button
            onClick={() => setVerArchivados(false)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              !verArchivados ? "bg-[#1F3864] text-white" : "bg-[#2E75B6]/10 text-[#1F3864]"
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setVerArchivados(true)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              verArchivados ? "bg-[#1F3864] text-white" : "bg-[#2E75B6]/10 text-[#1F3864]"
            }`}
          >
            Archivados
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            className="h-12 pl-10 text-base"
            placeholder="Buscar por nombre, RFC, código, contacto…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </Card>

      {cargando ? (
        <div className="py-16 text-center text-muted-foreground">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          {rows.length === 0 ? "Aún no hay proveedores. Da de alta el primero." : "Sin resultados."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrados.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-[#1F3864]">{p.nombre_comercial}</span>
                    {p.codigo && <Badge variant="outline" className="text-[11px]">{p.codigo}</Badge>}
                    {p.categoria && (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[11px] text-blue-700">
                        {p.categoria}
                      </Badge>
                    )}
                    {!p.activo && (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                        archivado
                      </Badge>
                    )}
                  </div>
                  {(p.razon_social || p.rfc) && (
                    <div className="text-sm text-muted-foreground">
                      {p.razon_social}{p.razon_social && p.rfc ? " · " : ""}{p.rfc}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {p.nombre_contacto && <span>{p.nombre_contacto}</span>}
                    {p.telefono && <span>· {p.telefono}</span>}
                    {p.email && <span>· {p.email}</span>}
                    {p.banco && <span>· {p.banco}</span>}
                    {p.dias_credito > 0 && <span>· {p.dias_credito} días crédito</span>}
                  </div>
                </div>

                {esFinanzas && gastoPorProveedor[p.id] != null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Pagado</p>
                    <p className="font-bold text-[#1F3864]">{fmtMoneda(gastoPorProveedor[p.id])}</p>
                  </div>
                )}

                <div className="flex shrink-0 gap-1 self-start">
                  {puedeEditar && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => abrirEdicion(p)} title="Editar">
                      <Pencil size={15} />
                    </Button>
                  )}
                  {puedeEditar && (
                    <Button
                      size="icon" variant="ghost" className="h-9 w-9"
                      onClick={() => alternarArchivo(p)}
                      title={p.activo ? "Archivar" : "Reactivar"}
                    >
                      {p.activo ? <Archive size={15} /> : <ArchiveRestore size={15} className="text-emerald-600" />}
                    </Button>
                  )}
                  {puedeBorrar && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setBorrarTarget(p)} title="Eliminar">
                      <Trash2 size={15} className="text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Alta */}
      <Dialog open={altaAbierta} onOpenChange={o => { if (!o) setAltaAbierta(false); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus size={18} /> Nuevo proveedor</DialogTitle>
          </DialogHeader>
          {camposForm}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setAltaAbierta(false)}>Cancelar</Button>
            <Button
              className="h-11 bg-[#1F3864] px-6 hover:bg-[#162a4d]"
              onClick={guardarAlta}
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edición */}
      <Dialog open={!!editando} onOpenChange={o => { if (!o) setEditando(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Editar proveedor</DialogTitle></DialogHeader>
          {camposForm}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button
              className="h-11 bg-[#1F3864] px-6 hover:bg-[#162a4d]"
              onClick={guardarEdicion}
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <Dialog open={!!borrarTarget} onOpenChange={o => { if (!o) setBorrarTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar proveedor?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminará <strong>{borrarTarget?.nombre_comercial}</strong>. Si ya tiene pagos
            registrados conviene archivarlo en lugar de borrarlo, para no perder el histórico.
          </p>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setBorrarTarget(null)}>Volver</Button>
            <Button variant="destructive" className="h-11" onClick={borrar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
