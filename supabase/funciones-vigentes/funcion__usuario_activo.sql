-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260824000003_usuario_activo_se_aplica.sql

CREATE OR REPLACE FUNCTION public.usuario_activo(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _user_id AND p.activo IS FALSE
  )
$$;
