-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260503023936_e271aa15-dd34-4c36-970b-6b30a5eaf2a4.sql

CREATE OR REPLACE FUNCTION public.log_remisiones_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bitacora_eventos (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_despues)
    VALUES (auth.uid(), 'remisiones', 'insert', 'remision', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    INSERT INTO public.bitacora_eventos (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_antes, datos_despues)
    VALUES (auth.uid(), 'remisiones', 'update', 'remision', NEW.id,
      jsonb_build_object('estatus', OLD.estatus),
      jsonb_build_object('estatus', NEW.estatus));
  END IF;
  RETURN NEW;
END;
$$;
