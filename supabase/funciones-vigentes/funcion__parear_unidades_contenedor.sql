-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260821000001_unidad_chasis_motor.sql

CREATE OR REPLACE FUNCTION public.parear_unidades_contenedor(_contenedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede parear unidades';
  END IF;
  RETURN public._parear_unidades_contenedor_internal(_contenedor_id);
END; $$;
