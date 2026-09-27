-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260904000001_solicitudes_a_fabrica.sql

CREATE OR REPLACE FUNCTION public.trg_avisos_solo_acuse()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.area_destino       := OLD.area_destino;
  NEW.tipo               := OLD.tipo;
  NEW.titulo             := OLD.titulo;
  NEW.cuerpo             := OLD.cuerpo;
  NEW.remision_id        := OLD.remision_id;
  NEW.folio_remision     := OLD.folio_remision;
  NEW.datos              := OLD.datos;
  NEW.creado_por         := OLD.creado_por;
  NEW.nombre_creador     := OLD.nombre_creador;
  NEW.created_at         := OLD.created_at;
  NEW.requiere_respuesta := OLD.requiere_respuesta;
  NEW.usuario_destino    := OLD.usuario_destino;
  NEW.accion             := OLD.accion;
  RETURN NEW;
END;
$$;
