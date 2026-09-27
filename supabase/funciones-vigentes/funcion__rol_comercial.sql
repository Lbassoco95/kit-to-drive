-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260902000001_operador_edita_remisiones.sql

CREATE OR REPLACE FUNCTION public.rol_comercial(_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _area   text;
  _nivel  text;
  _role   text;
  _activo boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN 'ninguno'; END IF;

  SELECT ur.area::text, ur.nivel::text, ur.role::text, COALESCE(p.activo, true)
    INTO _area, _nivel, _role, _activo
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.user_id = _user_id
   LIMIT 1;

  -- Sin fila de rol, o dado de baja: no entra.
  IF _area IS NULL AND _nivel IS NULL AND _role IS NULL THEN RETURN 'ninguno'; END IF;
  IF NOT COALESCE(_activo, true) THEN RETURN 'ninguno'; END IF;

  -- Usuario sin migrar a ÁREA × NIVEL: se deduce del rol legado, con la misma
  -- tabla de equivalencias que usa la aplicación (desdeRolLegacy).
  IF _area IS NULL OR _nivel IS NULL THEN
    CASE _role
      WHEN 'admin'              THEN _area := 'direccion'; _nivel := 'admin';
      WHEN 'director_ventas'    THEN _area := 'comercial'; _nivel := 'admin';
      WHEN 'coordinador_ventas' THEN _area := 'comercial'; _nivel := 'supervisor';
      WHEN 'coordinador'        THEN _area := 'comercial'; _nivel := 'supervisor';
      WHEN 'ventas'             THEN _area := 'comercial'; _nivel := 'operador';
      WHEN 'auxiliar_ventas'    THEN _area := 'comercial'; _nivel := 'operador';
      ELSE RETURN 'ninguno';
    END CASE;
  END IF;

  -- Administrador global: el admin de Dirección, y el rol legado 'admin', que
  -- es su equivalente en las bases que aún no migran.
  IF (_area = 'direccion' AND _nivel = 'admin') OR _role = 'admin' THEN RETURN 'global'; END IF;

  -- Fuera de Comercial nadie trabaja el pedido (Fábrica y Logística trabajan
  -- las unidades).
  IF _area <> 'comercial' THEN RETURN 'ninguno'; END IF;

  IF _nivel IN ('supervisor','admin') THEN RETURN 'supervisor'; END IF;
  RETURN 'operador';
END;
$$;
