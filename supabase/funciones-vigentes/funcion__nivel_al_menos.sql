-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260824000003_usuario_activo_se_aplica.sql

CREATE OR REPLACE FUNCTION public.nivel_al_menos(_user_id UUID, _nivel public.user_nivel)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.usuario_activo(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND public.nivel_rank(nivel) >= public.nivel_rank(_nivel)
     )
$$;
