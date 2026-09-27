-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260922000004_area_compras.sql

CREATE OR REPLACE FUNCTION public.es_compras(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_area(_uid, 'compras'::public.user_area)
      OR public.es_admin_global(_uid)
$$;
