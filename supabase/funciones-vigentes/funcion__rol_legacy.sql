-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260922000004_area_compras.sql

CREATE OR REPLACE FUNCTION public.rol_legacy(_area public.user_area, _nivel public.user_nivel)
RETURNS public.app_role LANGUAGE SQL IMMUTABLE AS $$
  SELECT (CASE
    WHEN _area = 'comercial'         AND _nivel = 'admin'      THEN 'director_ventas'
    WHEN _area = 'comercial'         AND _nivel = 'supervisor' THEN 'coordinador_ventas'
    WHEN _area = 'comercial'                                   THEN 'ventas'
    WHEN _area = 'fabrica'                                     THEN 'fabrica'
    WHEN _area = 'almacen_logistica'                           THEN 'logistica'
    WHEN _area = 'administracion'    AND _nivel = 'operador'   THEN 'finanzas'
    WHEN _area = 'administracion'                              THEN 'admin_financiero'
    WHEN _area = 'compras'                                     THEN 'compras'
    WHEN _area = 'direccion'         AND _nivel = 'admin'      THEN 'admin'
    WHEN _area = 'direccion'                                   THEN 'coordinador'
    ELSE 'ventas'
  END)::public.app_role
$$;
