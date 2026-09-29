import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Eye } from "lucide-react";

type Connection = {
  id: string;
  usuario_id: string;
  conectado_at: string;
};

type ConnectionProfile = {
  id: string;
  nombre_completo: string;
  email: string | null;
  activo: boolean;
};

export default function Bitacora() {
  const [rows, setRows] = useState<any[]>([]);
  const [eliminaciones, setEliminaciones] = useState<any[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedDeletion, setSelectedDeletion] = useState<any>(null);
  const { t, lang } = useLang();
  const { area, perms } = useAuth();

  useEffect(() => {
    loadEventos();
    if (perms.esAdminGlobal) {
      loadEliminaciones();
    }
    if (area === "direccion") {
      loadConnections();
    }
  }, [area, perms.esAdminGlobal]);

  const loadEventos = async () => {
    const { data } = await supabase.from("bitacora_eventos").select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.usuario_id).filter(Boolean)));
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, nombre_completo").in("id", ids);
      const m: Record<string, string> = {};
      p?.forEach((x: any) => { m[x.id] = x.nombre_completo; });
      setProfiles(m);
    }
  };

  const loadEliminaciones = async () => {
    const { data } = await supabase.from("bitacora_eliminaciones").select("*").order("created_at", { ascending: false }).limit(200);
    setEliminaciones(data ?? []);
  };

  const loadConnections = async () => {
    const [{ data: history }, { data: users }] = await Promise.all([
      supabase.from("historial_conexiones" as any).select("id, usuario_id, conectado_at").order("conectado_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id, nombre_completo, email, activo").order("nombre_completo"),
    ]);
    setConnections((history ?? []) as unknown as Connection[]);
    setConnectionProfiles((users ?? []) as ConnectionProfile[]);
  };

  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const latestConnection = connections.reduce<Record<string, string>>((latest, connection) => {
    if (!latest[connection.usuario_id]) latest[connection.usuario_id] = connection.conectado_at;
    return latest;
  }, {});
  const connectionNames = connectionProfiles.reduce<Record<string, string>>((names, profile) => {
    names[profile.id] = profile.nombre_completo || profile.email || "—";
    return names;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <h1>{t.bitacora.title}</h1>
        <p className="text-sm text-muted-foreground">{t.bitacora.eventos(rows.length)}</p>
      </div>

      <Tabs defaultValue="eventos" className="w-full">
        <TabsList>
          <TabsTrigger value="eventos">{t.bitacora.tabEventos}</TabsTrigger>
          {area === "direccion" && (
            <TabsTrigger value="conexiones">{t.bitacora.tabConexiones}</TabsTrigger>
          )}
          {perms.esAdminGlobal && (
            <TabsTrigger value="eliminaciones">{t.bitacora.tabEliminaciones}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="eventos" className="space-y-4 mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.bitacora.fecha}</th>
                    <th>{t.bitacora.usuario}</th>
                    <th>{t.bitacora.modulo}</th>
                    <th>{t.bitacora.accion}</th>
                    <th>{t.bitacora.cambios}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString(locale)}</td>
                      <td>{r.usuario_id ? (profiles[r.usuario_id] || "—") : t.bitacora.sistema}</td>
                      <td><Badge variant="outline">{r.modulo}</Badge></td>
                      <td>{r.accion}</td>
                      <td className="font-mono text-[10px] max-w-md truncate">{r.datos_despues ? JSON.stringify(r.datos_despues) : ""}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">{t.bitacora.sinEventos}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {area === "direccion" && (
          <TabsContent value="conexiones" className="space-y-4 mt-4">
            <div>
              <h2 className="font-semibold">{t.bitacora.ultimaConexionTitulo}</h2>
              <p className="text-sm text-muted-foreground">{t.bitacora.ultimaConexionDesc}</p>
            </div>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.bitacora.usuario}</th>
                      <th>{t.bitacora.correo}</th>
                      <th>{t.bitacora.estatus}</th>
                      <th>{t.bitacora.ultimaConexion}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectionProfiles.map(profile => (
                      <tr key={profile.id}>
                        <td>{profile.nombre_completo || "—"}</td>
                        <td>{profile.email || "—"}</td>
                        <td><Badge variant={profile.activo ? "default" : "secondary"}>{profile.activo ? t.bitacora.activo : t.bitacora.inactivo}</Badge></td>
                        <td className="whitespace-nowrap">{latestConnection[profile.id] ? new Date(latestConnection[profile.id]).toLocaleString(locale) : t.bitacora.nunca}</td>
                      </tr>
                    ))}
                    {!connectionProfiles.length && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">{t.bitacora.sinUsuarios}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <div>
              <h2 className="font-semibold">{t.bitacora.historialConexionesTitulo}</h2>
              <p className="text-sm text-muted-foreground">{t.bitacora.historialConexionesDesc(connections.length)}</p>
            </div>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.bitacora.fechaConexion}</th>
                      <th>{t.bitacora.usuario}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map(connection => (
                      <tr key={connection.id}>
                        <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(connection.conectado_at).toLocaleString(locale)}</td>
                        <td>{connectionNames[connection.usuario_id] || "—"}</td>
                      </tr>
                    ))}
                    {!connections.length && <tr><td colSpan={2} className="text-center py-6 text-muted-foreground">{t.bitacora.sinConexiones}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        )}

        {perms.esAdminGlobal && (
          <TabsContent value="eliminaciones" className="space-y-4 mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.bitacora.fecha}</th>
                      <th>{t.bitacora.tabla}</th>
                      <th>{t.bitacora.usuario}</th>
                      <th>{t.bitacora.motivo}</th>
                      <th>{t.bitacora.acciones}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eliminaciones.map((r: any) => (
                      <tr key={r.id}>
                        <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString(locale)}</td>
                        <td><Badge variant="outline">{r.tabla}</Badge></td>
                        <td>{r.nombre_usuario || "—"}</td>
                        <td className="max-w-md truncate">{r.motivo}</td>
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDeletion(r)}
                            className="h-8"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t.bitacora.verDatos}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!eliminaciones.length && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">{t.bitacora.sinEliminaciones}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog to view deleted data */}
      <Dialog open={!!selectedDeletion} onOpenChange={() => setSelectedDeletion(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.bitacora.datosEliminados}</DialogTitle>
          </DialogHeader>
          {selectedDeletion && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t.bitacora.tablaLbl}</span> {selectedDeletion.tabla}
                </div>
                <div>
                  <span className="font-medium">{t.bitacora.usuarioLbl}</span> {selectedDeletion.nombre_usuario}
                </div>
                <div>
                  <span className="font-medium">{t.bitacora.fechaLbl}</span> {new Date(selectedDeletion.created_at).toLocaleString(locale)}
                </div>
                <div>
                  <span className="font-medium">{t.bitacora.motivoLbl}</span> {selectedDeletion.motivo}
                </div>
              </div>
              <div>
                <span className="font-medium block mb-2">{t.bitacora.datosEliminadosLbl}</span>
                <pre className="bg-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedDeletion.datos_eliminados, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
