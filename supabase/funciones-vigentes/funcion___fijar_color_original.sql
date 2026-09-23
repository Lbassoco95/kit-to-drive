-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public._fijar_color_original() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.color_original IS NULL OR trim(NEW.color_original) = '' THEN
    NEW.color_original := public.norm_color(NEW.color);
  ELSE
    NEW.color_original := public.norm_color(NEW.color_original);
  END IF;
  RETURN NEW;
END; $$;
