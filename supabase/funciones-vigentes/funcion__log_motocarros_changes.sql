-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260503023936_e271aa15-dd34-4c36-970b-6b30a5eaf2a4.sql

CREATE OR REPLACE FUNCTION public.log_motocarros_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.estatus_armado IS DISTINCT FROM OLD.estatus_armado
       OR NEW.estatus_entrega IS DISTINCT FROM OLD.estatus_entrega
       OR NEW.remision_id IS DISTINCT FROM OLD.remision_id
       OR NEW.chasis_asignado IS DISTINCT FROM OLD.chasis_asignado THEN
      INSERT INTO public.bitacora_eventos (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_antes, datos_despues)
      VALUES (auth.uid(), 'motocarros', 'update', 'motocarro', NEW.id,
        jsonb_build_object(
          'estatus_armado', OLD.estatus_armado, 'estatus_entrega', OLD.estatus_entrega,
          'remision_id', OLD.remision_id, 'chasis_asignado', OLD.chasis_asignado
        ),
        jsonb_build_object(
          'estatus_armado', NEW.estatus_armado, 'estatus_entrega', NEW.estatus_entrega,
          'remision_id', NEW.remision_id, 'chasis_asignado', NEW.chasis_asignado
        ));
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.bitacora_eventos (usuario_id, modulo, accion, entidad_tipo, entidad_id, datos_despues)
    VALUES (auth.uid(), 'motocarros', 'insert', 'motocarro', NEW.id, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;
