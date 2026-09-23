-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public._folio_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.folio IS NULL THEN
    NEW.folio := 'INC-' || lpad(nextval('public.incidencias_chasis_folio_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
