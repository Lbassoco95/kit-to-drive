-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.reintentar_asignar_remision(_remision_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r jsonb;
BEGIN
  _r := public.asignar_remision_items(_remision_id);
  RETURN COALESCE((_r->>'asignadas')::int, 0);
END; $$;
