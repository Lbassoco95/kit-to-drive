import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { Headphones, Loader2, MessageSquarePlus, RefreshCw, Send } from "lucide-react";
import {
  crearTicketSoporte, detalleTicketSoporte, enviarMensajeSoporte,
  ESTATUS_TICKET_CLS, listarTicketsSoporte, PRIORIDAD_TICKET_CLS,
  PRIORIDADES_SOPORTE, type DetalleTicket, type PrioridadSoporte, type TicketSoporte,
} from "@/lib/matiSupport";

function fmtFecha(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function Soporte() {
  const { t } = useLang();
  const s = t.soporte;

  const [tickets, setTickets] = useState<TicketSoporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridgeDown, setBridgeDown] = useState<string | null>(null);

  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<PrioridadSoporte>("normal");
  const [enviando, setEnviando] = useState(false);

  const [activo, setActivo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleTicket | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [mandandoMsg, setMandandoMsg] = useState(false);

  const load = async () => {
    setLoading(true);
    setBridgeDown(null);
    try {
      setTickets(await listarTicketsSoporte());
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "BRIDGE_NOT_CONFIGURED" || /no configurado/i.test(err.message)) {
        setBridgeDown(s.bridgeNoConfig);
      } else {
        toast.error(err.message || s.errorListar);
      }
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const abrir = async (id: string) => {
    setActivo(id);
    setCargandoDetalle(true);
    setDetalle(null);
    try {
      setDetalle(await detalleTicketSoporte(id));
    } catch (e) {
      toast.error((e as Error).message || s.errorDetalle);
      setActivo(null);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || !descripcion.trim()) {
      toast.error(s.completaCampos);
      return;
    }
    setEnviando(true);
    try {
      const ticket = await crearTicketSoporte({ asunto, descripcion, prioridad });
      toast.success(s.creado);
      setAsunto("");
      setDescripcion("");
      setPrioridad("normal");
      await load();
      if (ticket?.id) await abrir(ticket.id);
    } catch (err) {
      const e2 = err as Error & { code?: string };
      if (e2.code === "BRIDGE_NOT_CONFIGURED") toast.error(s.bridgeNoConfig);
      else toast.error(e2.message || s.errorCrear);
    } finally {
      setEnviando(false);
    }
  };

  const responder = async () => {
    if (!activo || !mensaje.trim()) return;
    setMandandoMsg(true);
    try {
      await enviarMensajeSoporte(activo, mensaje.trim());
      setMensaje("");
      setDetalle(await detalleTicketSoporte(activo));
      toast.success(s.mensajeEnviado);
    } catch (e) {
      toast.error((e as Error).message || s.errorMensaje);
    } finally {
      setMandandoMsg(false);
    }
  };

  const labelEstatus = (st: string) => s.estatus[st as keyof typeof s.estatus] ?? st;
  const labelPrioridad = (p: string) => s.prioridades[p as keyof typeof s.prioridades] ?? p;
  const cerrado = detalle?.ticket.status === "cerrado";

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Headphones className="h-6 w-6 text-[#1F3864]" />
            {s.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{s.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          {s.actualizar}
        </Button>
      </div>

      {bridgeDown && (
        <Card className="p-4 border-amber-200 bg-amber-50 text-amber-900 text-sm">
          {bridgeDown}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquarePlus className="h-4 w-4" />
            {s.nuevo}
          </div>
          <form onSubmit={crear} className="space-y-3">
            <div>
              <Label>{s.asunto}</Label>
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder={s.asuntoPlaceholder}
                maxLength={180}
                required
              />
            </div>
            <div>
              <Label>{s.descripcion}</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={s.descripcionPlaceholder}
                rows={5}
                required
              />
            </div>
            <div>
              <Label>{s.prioridad}</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadSoporte)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES_SOPORTE.map((p) => (
                    <SelectItem key={p} value={p}>{labelPrioridad(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={enviando || !!bridgeDown} className="w-full bg-[#1F3864] hover:bg-[#172b4d]">
              {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {enviando ? s.enviando : s.enviar}
            </Button>
          </form>
        </Card>

        <Card className="p-5 space-y-3 min-h-[280px]">
          <div className="font-semibold">{s.misTickets}</div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">{s.cargando}</div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">{s.sinTickets}</div>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto">
              {tickets.map((tk) => (
                <li key={tk.id}>
                  <button
                    type="button"
                    onClick={() => abrir(tk.id)}
                    className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                      activo === tk.id ? "border-[#1F3864] bg-[#EFF6FF]" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{tk.asunto.replace(/^\[kit-to-drive\]\s*/i, "")}</div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORIDAD_TICKET_CLS[tk.prioridad] || ""}`}>
                        {labelPrioridad(tk.prioridad)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${ESTATUS_TICKET_CLS[tk.status] || ""}`}>
                        {labelEstatus(tk.status)}
                      </span>
                      <span className="text-muted-foreground">{fmtFecha(tk.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {activo && (
        <Card className="p-5 space-y-4">
          {cargandoDetalle || !detalle ? (
            <div className="text-sm text-muted-foreground py-6 text-center">{s.cargando}</div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">
                  {detalle.ticket.asunto.replace(/^\[kit-to-drive\]\s*/i, "")}
                </h2>
                <div className="mt-1 flex gap-2 flex-wrap text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORIDAD_TICKET_CLS[detalle.ticket.prioridad] || ""}`}>
                    {labelPrioridad(detalle.ticket.prioridad)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${ESTATUS_TICKET_CLS[detalle.ticket.status] || ""}`}>
                    {labelEstatus(detalle.ticket.status)}
                  </span>
                </div>
                {detalle.ticket.descripcion && (
                  <pre className="mt-3 text-xs whitespace-pre-wrap bg-slate-50 border rounded p-3 text-slate-700 max-h-40 overflow-y-auto">
                    {detalle.ticket.descripcion}
                  </pre>
                )}
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto border rounded-md p-3 bg-slate-50/50">
                {detalle.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{s.sinMensajes}</p>
                ) : (
                  detalle.messages.map((m) => {
                    const esAdmin = m.author_type === "admin";
                    return (
                      <div
                        key={m.id}
                        className={`rounded-md px-3 py-2 text-sm max-w-[90%] ${
                          esAdmin ? "bg-[#1F3864] text-white ml-auto" : "bg-white border mr-auto"
                        }`}
                      >
                        <div className={`text-[11px] mb-0.5 ${esAdmin ? "text-white/70" : "text-muted-foreground"}`}>
                          {esAdmin ? s.equipoMati : (m.author_nombre || s.tu)} · {fmtFecha(m.created_at)}
                        </div>
                        <p className="whitespace-pre-wrap">{m.mensaje}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {!cerrado ? (
                <div className="flex gap-2">
                  <Textarea
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder={s.mensajePlaceholder}
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    onClick={responder}
                    disabled={mandandoMsg || !mensaje.trim()}
                    className="self-end bg-[#1F3864] hover:bg-[#172b4d]"
                  >
                    {mandandoMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{s.ticketCerrado}</p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
