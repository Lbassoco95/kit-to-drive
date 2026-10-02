/**
 * Panel de pagos multi-remisión, conciliación (Finanzas) y depósito (Compras).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/contexts/LangContext";
import { explicarError } from "@/lib/dazon";
import { sanitizeStorageBasename } from "@/lib/storagePaths";
import {
  aplicarPagoARemisiones,
  pathComprobantePagoRefaccion,
  saldoRemision,
  sugerirAplicaciones,
  type EstadoPagoCabecera,
} from "@/lib/pagosRefacciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, FileUp, Receipt } from "lucide-react";

type RemSaldo = {
  id: string;
  folio: string;
  cliente_id: string;
  monto_total: number;
  monto_pagado: number;
  estado_pago: string;
  naturaleza: string;
  etapa: string;
  forma_pago: string | null;
  clientes?: { codigo_erp?: string | null; folio_interno?: string | null; nombre_comercial?: string | null } | null;
};

type Pago = {
  id: string;
  folio: string;
  cliente_id: string;
  monto_total: number;
  forma_pago: "efectivo" | "transferencia";
  referencia: string | null;
  comprobante_path: string | null;
  estado: EstadoPagoCabecera;
  nota: string | null;
  nota_conciliacion: string | null;
  deposito_folio: string | null;
  deposito_modalidad: string | null;
  deposito_nota: string | null;
  created_at: string;
  clientes?: { codigo_erp?: string | null; folio_interno?: string | null; nombre_comercial?: string | null } | null;
};

type Aplicacion = {
  id: string;
  pago_id: string;
  remision_id: string;
  monto_aplicado: number;
  remisiones_refacciones?: { folio?: string } | null;
};

const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const clienteLbl = (c?: RemSaldo["clientes"]) => {
  if (!c) return "—";
  const codigo = c.codigo_erp || c.folio_interno || "—";
  return c.nombre_comercial ? `${codigo} — ${c.nombre_comercial}` : codigo;
};

export function PanelPagosFinanzas({ onChanged }: { onChanged?: () => void }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [remisiones, setRemisiones] = useState<RemSaldo[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [monto, setMonto] = useState(0);
  const [forma, setForma] = useState<"efectivo" | "transferencia">("transferencia");
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [montos, setMontos] = useState<Record<string, number>>({});
  const [ocupado, setOcupado] = useState(false);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [apps, setApps] = useState<Aplicacion[]>([]);
  const [notaConc, setNotaConc] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase
        .from("remisiones_refacciones" as any)
        .select("id, folio, cliente_id, monto_total, monto_pagado, estado_pago, naturaleza, etapa, forma_pago, clientes(codigo_erp, folio_interno, nombre_comercial)")
        .neq("etapa", "cancelada")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("pagos_refacciones" as any)
        .select("id, folio, cliente_id, monto_total, forma_pago, referencia, comprobante_path, estado, nota, nota_conciliacion, deposito_folio, deposito_modalidad, deposito_nota, created_at, clientes(codigo_erp, folio_interno, nombre_comercial)")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (r.error) toast.error(explicarError(r.error, tx.errorCargar));
    else setRemisiones(((r.data as unknown) as RemSaldo[]) ?? []);
    if (!p.error) setPagos(((p.data as unknown) as Pago[]) ?? []);
    const ids = (((p.data as unknown) as Pago[]) ?? []).map(x => x.id);
    if (ids.length) {
      const { data } = await supabase
        .from("pago_refaccion_aplicaciones" as any)
        .select("id, pago_id, remision_id, monto_aplicado, remisiones_refacciones(folio)")
        .in("pago_id", ids);
      setApps(((data as unknown) as Aplicacion[]) ?? []);
    } else setApps([]);
  }, [tx.errorCargar]);

  useEffect(() => { void load(); }, [load]);

  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of remisiones) {
      if (!m.has(r.cliente_id)) m.set(r.cliente_id, clienteLbl(r.clientes));
    }
    return [...m.entries()];
  }, [remisiones]);

  const pendientes = useMemo(
    () => remisiones.filter(r => r.cliente_id === clienteId && saldoRemision(r.monto_total, r.monto_pagado) > 0),
    [remisiones, clienteId],
  );

  const sugerir = () => {
    const sug = sugerirAplicaciones(
      monto,
      pendientes.map(r => ({
        remisionId: r.id,
        folio: r.folio,
        montoTotal: Number(r.monto_total),
        montoPagado: Number(r.monto_pagado),
      })),
    );
    const next: Record<string, number> = {};
    for (const s of sug) next[s.remisionId] = s.monto;
    setMontos(next);
  };

  const registrar = async () => {
    if (!clienteId) { toast.error(tx.seleccionaCliente); return; }
    if (monto <= 0) { toast.error(tx.pagoMontoInvalido); return; }
    const propuestas = Object.entries(montos)
      .filter(([, v]) => v > 0)
      .map(([remisionId, m]) => ({ remisionId, monto: m }));
    const check = aplicarPagoARemisiones(
      monto,
      pendientes.map(r => ({
        remisionId: r.id,
        folio: r.folio,
        montoTotal: Number(r.monto_total),
        montoPagado: Number(r.monto_pagado),
      })),
      propuestas,
    );
    if (!check.ok) {
      toast.error(tx.pagoAplicacionInvalida);
      return;
    }
    setOcupado(true);
    try {
      // Folio provisional para path: se sube tras crear, o con uuid temporal
      const tempId = crypto.randomUUID();
      let comprobantePath: string | null = null;
      if (file) {
        comprobantePath = pathComprobantePagoRefaccion(tempId, sanitizeStorageBasename(file.name));
        const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(comprobantePath, file);
        if (upErr) {
          toast.error(upErr.message);
          setOcupado(false);
          return;
        }
      }
      const { data, error } = await supabase.rpc("registrar_pago_refacciones" as any, {
        _cliente_id: clienteId,
        _monto_total: monto,
        _forma_pago: forma,
        _referencia: referencia || null,
        _nota: nota || null,
        _comprobante_path: comprobantePath,
        _aplicaciones: check.aplicaciones.map(a => ({
          remision_id: a.remisionId,
          monto: a.monto,
        })),
      });
      if (error) {
        toast.error(explicarError(error, tx.errorAccion));
        setOcupado(false);
        return;
      }
      const created = data as { id?: string; folio?: string } | null;
      toast.success(tx.okPagoRegistrado(created?.folio || ""));
      setMonto(0);
      setMontos({});
      setFile(null);
      setReferencia("");
      setNota("");
      await load();
      onChanged?.();
    } finally {
      setOcupado(false);
    }
  };

  const conciliar = async (pago: Pago) => {
    const n = (notaConc[pago.id] || "").trim();
    if (n.length < 3) { toast.error(tx.notaObligatoria); return; }
    if (!pago.comprobante_path && !file) {
      toast.error(tx.pagoComprobanteObligatorio);
      return;
    }
    setOcupado(true);
    let path = pago.comprobante_path;
    if (file) {
      path = pathComprobantePagoRefaccion(pago.id, sanitizeStorageBasename(file.name));
      const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, file);
      if (upErr) {
        toast.error(upErr.message);
        setOcupado(false);
        return;
      }
    }
    const { error } = await supabase.rpc("conciliar_pago_refacciones" as any, {
      _pago_id: pago.id,
      _nota: n,
      _comprobante_path: path,
    });
    setOcupado(false);
    if (error) toast.error(explicarError(error, tx.errorAccion));
    else {
      toast.success(tx.okConciliado);
      setFile(null);
      await load();
      onChanged?.();
    }
  };

  const verComprobante = async (path: string) => {
    const { data, error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      toast.error(tx.errorComprobante);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const pendientesConciliar = pagos.filter(p => p.estado === "registrado");

  return (
    <div className="space-y-6">
      <section className="rounded-md border p-4 space-y-3">
        <h2 className="font-semibold text-[#1F3864] flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> {tx.tabPagosNuevo}
        </h2>
        <p className="text-sm text-muted-foreground">{tx.pagosAyuda}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <Label>{tx.cliente}</Label>
            <Select value={clienteId || undefined} onValueChange={v => { setClienteId(v); setMontos({}); }}>
              <SelectTrigger><SelectValue placeholder={tx.seleccionaCliente} /></SelectTrigger>
              <SelectContent>
                {clientes.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tx.pagoMonto}</Label>
            <Input type="number" min={0} step="0.01" value={monto || ""} onChange={e => setMonto(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label>{tx.formaPago}</Label>
            <Select value={forma} onValueChange={v => setForma(v as "efectivo" | "transferencia")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">{tx.transferencia}</SelectItem>
                <SelectItem value="efectivo">{tx.efectivo}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tx.pagoReferencia}</Label>
            <Input value={referencia} onChange={e => setReferencia(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{tx.notaPago}</Label>
          <Textarea value={nota} onChange={e => setNota(e.target.value)} />
        </div>
        <div>
          <Label className="flex items-center gap-2"><FileUp className="h-3 w-3" /> {tx.pagoComprobante}</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {clienteId && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{tx.pagoAplicarA}</h3>
              <Button type="button" size="sm" variant="outline" onClick={sugerir} disabled={monto <= 0}>
                {tx.pagoSugerir}
              </Button>
            </div>
            {pendientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tx.pagoSinSaldo}</p>
            ) : (
              <ul className="space-y-2">
                {pendientes.map(r => {
                  const saldo = saldoRemision(Number(r.monto_total), Number(r.monto_pagado));
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm rounded border px-2 py-1.5">
                      <span className="font-mono">{r.folio}</span>
                      <Badge variant="outline">{r.naturaleza === "cotizacion" ? tx.naturalezaCotizacion : tx.naturalezaFinal}</Badge>
                      <span className="text-muted-foreground">{tx.pagoSaldo}: {money(saldo)}</span>
                      <Input
                        className="w-32 ml-auto"
                        type="number"
                        min={0}
                        step="0.01"
                        max={saldo}
                        value={montos[r.id] ?? ""}
                        onChange={e => setMontos(prev => ({ ...prev, [r.id]: Number(e.target.value) || 0 }))}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <Button disabled={ocupado} className="bg-[#1F3864] hover:bg-[#162a4d]" onClick={() => void registrar()}>
          {tx.pagoRegistrar}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-[#1F3864]">{tx.pagoPendientesConciliar}</h2>
        {pendientesConciliar.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx.pagoNadaPendiente}</p>
        ) : pendientesConciliar.map(p => (
          <div key={p.id} className="rounded-md border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-mono font-semibold">{p.folio}</span>
              <Badge>{money(Number(p.monto_total))}</Badge>
              <Badge variant="outline">{p.forma_pago === "efectivo" ? tx.efectivo : tx.transferencia}</Badge>
              <span className="text-muted-foreground">{clienteLbl(p.clientes)}</span>
            </div>
            <ul className="text-xs text-muted-foreground">
              {apps.filter(a => a.pago_id === p.id).map(a => (
                <li key={a.id}>{a.remisiones_refacciones?.folio || a.remision_id}: {money(Number(a.monto_aplicado))}</li>
              ))}
            </ul>
            {p.comprobante_path && (
              <Button size="sm" variant="outline" onClick={() => void verComprobante(p.comprobante_path!)}>
                {tx.verComprobante}
              </Button>
            )}
            <Input
              placeholder={tx.notaPago}
              value={notaConc[p.id] || ""}
              onChange={e => setNotaConc(prev => ({ ...prev, [p.id]: e.target.value }))}
            />
            {!p.comprobante_path && (
              <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            )}
            <Button size="sm" disabled={ocupado} onClick={() => void conciliar(p)}>{tx.pagoConciliar}</Button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-[#1F3864]">{tx.pagoHistorial}</h2>
        {pagos.filter(p => p.estado !== "registrado").slice(0, 20).map(p => (
          <div key={p.id} className="rounded border px-3 py-2 text-sm flex flex-wrap gap-2 items-center">
            <span className="font-mono">{p.folio}</span>
            <Badge variant="outline">{tx.estadoPagoCabecera[p.estado] ?? p.estado}</Badge>
            <span>{money(Number(p.monto_total))}</span>
            {p.comprobante_path && (
              <Button size="sm" variant="ghost" onClick={() => void verComprobante(p.comprobante_path!)}>{tx.verComprobante}</Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export function PanelDepositosCompras({ onChanged }: { onChanged?: () => void }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [folio, setFolio] = useState<Record<string, string>>({});
  const [modalidad, setModalidad] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("pagos_refacciones" as any)
      .select("id, folio, cliente_id, monto_total, forma_pago, referencia, comprobante_path, estado, nota, nota_conciliacion, deposito_folio, deposito_modalidad, deposito_nota, created_at, clientes(codigo_erp, folio_interno, nombre_comercial)")
      .in("estado", ["conciliado", "con_deposito"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(explicarError(error, tx.errorCargar));
    else setPagos(((data as unknown) as Pago[]) ?? []);
  }, [tx.errorCargar]);

  useEffect(() => { void load(); }, [load]);

  const registrar = async (pago: Pago) => {
    const f = (folio[pago.id] || "").trim();
    const m = (modalidad[pago.id] || "").trim();
    if (f.length < 2 || m.length < 3) {
      toast.error(tx.depositoCampos);
      return;
    }
    setOcupado(true);
    const { error } = await supabase.rpc("registrar_deposito_pago_refacciones" as any, {
      _pago_id: pago.id,
      _folio_recibo: f,
      _modalidad: m,
      _nota: (nota[pago.id] || "").trim() || null,
    });
    setOcupado(false);
    if (error) toast.error(explicarError(error, tx.errorAccion));
    else {
      toast.success(tx.okDeposito);
      await load();
      onChanged?.();
    }
  };

  const pendientes = pagos.filter(p => p.estado === "conciliado");
  const hechos = pagos.filter(p => p.estado === "con_deposito");

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold text-[#1F3864] flex items-center gap-2">
          <Receipt className="h-4 w-4" /> {tx.tabDepositos}
        </h2>
        <p className="text-sm text-muted-foreground">{tx.depositosAyuda}</p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx.depositoNadaPendiente}</p>
        ) : pendientes.map(p => (
          <div key={p.id} className="rounded-md border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-mono font-semibold">{p.folio}</span>
              <Badge>{money(Number(p.monto_total))}</Badge>
              <span className="text-muted-foreground">{clienteLbl(p.clientes)}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder={tx.depositoFolio} value={folio[p.id] || ""} onChange={e => setFolio(prev => ({ ...prev, [p.id]: e.target.value }))} />
              <Input placeholder={tx.depositoModalidad} value={modalidad[p.id] || ""} onChange={e => setModalidad(prev => ({ ...prev, [p.id]: e.target.value }))} />
            </div>
            <Textarea placeholder={tx.depositoNota} value={nota[p.id] || ""} onChange={e => setNota(prev => ({ ...prev, [p.id]: e.target.value }))} />
            <Button size="sm" disabled={ocupado} onClick={() => void registrar(p)}>{tx.depositoRegistrar}</Button>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{tx.depositoHistorial}</h3>
        {hechos.map(p => (
          <div key={p.id} className="rounded border px-3 py-2 text-sm">
            <span className="font-mono">{p.folio}</span> · {p.deposito_folio} · {p.deposito_modalidad}
          </div>
        ))}
      </section>
    </div>
  );
}
