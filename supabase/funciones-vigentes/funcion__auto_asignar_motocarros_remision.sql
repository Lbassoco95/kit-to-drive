-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.auto_asignar_motocarros_remision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _color text; _modelo text; _asignados int;
BEGIN
  _color  := NULLIF(upper(trim(COALESCE(NEW.color_solicitado,''))), '');
  _modelo := NULLIF(upper(trim(COALESCE(NEW.modelo_solicitado,''))), '');

  IF _color IS NULL AND _modelo IS NULL THEN
    RETURN NEW;  -- sin intención explícita no se amarra nada
  END IF;

  _asignados := public.asignar_chasis_remision(
    NEW.id, NEW.total_unidades_solicitadas, _color, _modelo);

  RETURN NEW;
END; $$;
