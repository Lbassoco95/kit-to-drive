-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.exigir_serial_para_cerrar() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _faltan text[] := '{}';
BEGIN
  IF NULLIF(trim(COALESCE(NEW.ns_chasis,'')),'') IS NULL THEN
    _faltan := array_append(_faltan, 'NS chasis');
  END IF;
  IF NULLIF(trim(COALESCE(NEW.ns_motor,'')),'') IS NULL THEN
    _faltan := array_append(_faltan, 'NS motor');
  END IF;

  IF array_length(_faltan,1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estatus_armado IN ('ARMADO','LISTO')
     AND (TG_OP = 'INSERT' OR OLD.estatus_armado IS DISTINCT FROM NEW.estatus_armado) THEN
    RAISE EXCEPTION 'La unidad #% no puede pasar a % sin registrar %: fábrica tiene que capturarlo primero.',
      NEW.orden_armado, NEW.estatus_armado, array_to_string(_faltan, ' y ');
  END IF;

  IF NEW.estatus_entrega = 'ENTREGADA'
     AND (TG_OP = 'INSERT' OR OLD.estatus_entrega IS DISTINCT FROM NEW.estatus_entrega) THEN
    RAISE EXCEPTION 'La unidad #% no puede marcarse ENTREGADA sin registrar %.',
      NEW.orden_armado, array_to_string(_faltan, ' y ');
  END IF;

  IF NEW.remision_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.remision_id IS DISTINCT FROM NEW.remision_id) THEN
    RAISE EXCEPTION 'La unidad #% no se puede asignar a una remisión sin registrar %.',
      NEW.orden_armado, array_to_string(_faltan, ' y ');
  END IF;

  RETURN NEW;
END; $$;
