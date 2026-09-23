-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000005_usuarios_niveles_areas.sql

CREATE OR REPLACE FUNCTION public.mi_nivel()
RETURNS public.user_nivel LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nivel FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
$$;
