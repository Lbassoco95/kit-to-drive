-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260503015306_f99960c9-701f-452a-aab9-4d1216cb57ae.sql

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY 
    CASE role WHEN 'admin' THEN 1 WHEN 'fabrica' THEN 2 WHEN 'logistica' THEN 3 WHEN 'ventas' THEN 4 END
  LIMIT 1
$$;
