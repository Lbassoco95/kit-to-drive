-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260902000001_operador_edita_remisiones.sql

CREATE OR REPLACE FUNCTION public.puede_editar_remision(
  _remision_id uuid,
  _user_id     uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rol text;
BEGIN
  IF _remision_id IS NULL THEN RETURN false; END IF;
  _rol := public.rol_comercial(_user_id);
  IF _rol IN ('global','supervisor') THEN RETURN true; END IF;
  IF _rol <> 'operador' THEN RETURN false; END IF;
  -- El operador, sólo lo que él capturó.
  RETURN EXISTS (
    SELECT 1 FROM public.remisiones r
     WHERE r.id = _remision_id AND r.vendedor_id = _user_id
  );
END;
$$;
