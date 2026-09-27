-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.es_finanzas(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin'::app_role)
      OR public.has_role(_uid,'admin_financiero'::app_role)
      OR public.has_role(_uid,'finanzas'::app_role)
$$;
