-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000005_usuarios_niveles_areas.sql

CREATE OR REPLACE FUNCTION public.sync_rol_legacy()
RETURNS TRIGGER LANGUAGE PLPGSQL SET search_path = public AS $$
BEGIN
  -- Si solo llega el rol legacy (integraciones viejas), se deduce nivel/área.
  IF NEW.area IS NULL OR NEW.nivel IS NULL THEN
    NEW.area := COALESCE(NEW.area, CASE NEW.role::TEXT
      WHEN 'admin' THEN 'direccion'
      WHEN 'fabrica' THEN 'fabrica'
      WHEN 'logistica' THEN 'almacen_logistica'
      WHEN 'finanzas' THEN 'administracion'
      WHEN 'admin_financiero' THEN 'administracion'
      ELSE 'comercial' END::public.user_area);
    NEW.nivel := COALESCE(NEW.nivel, CASE NEW.role::TEXT
      WHEN 'admin' THEN 'admin'
      WHEN 'director_ventas' THEN 'admin'
      WHEN 'admin_financiero' THEN 'admin'
      WHEN 'coordinador_ventas' THEN 'supervisor'
      WHEN 'coordinador' THEN 'supervisor'
      ELSE 'operador' END::public.user_nivel);
  END IF;
  NEW.role := public.rol_legacy(NEW.area, NEW.nivel);
  RETURN NEW;
END; $$;
