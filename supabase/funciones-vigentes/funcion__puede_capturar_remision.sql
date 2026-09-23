-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260902000001_operador_edita_remisiones.sql

CREATE OR REPLACE FUNCTION public.puede_capturar_remision(
  _vendedor_id uuid,
  _user_id     uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.rol_comercial(_user_id)
           WHEN 'global'     THEN true
           WHEN 'supervisor' THEN true          -- cubre a quien sea de su área
           WHEN 'operador'   THEN _vendedor_id = _user_id
           ELSE false
         END;
$$;
