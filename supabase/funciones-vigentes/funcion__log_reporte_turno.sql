-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260629000001_reportes_comentarios.sql

CREATE OR REPLACE FUNCTION public.log_reporte_turno()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bitacora_eventos
      (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_despues)
    VALUES (auth.uid(), 'reportes_turno', 'insert', 'reporte_turno', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bitacora_eventos
      (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_antes, datos_despues)
    VALUES (auth.uid(), 'reportes_turno', 'update', 'reporte_turno', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END; $$;
