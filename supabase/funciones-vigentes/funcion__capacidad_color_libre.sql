-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.capacidad_color_libre(_modelo text, _color text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _vin int; _extra int; _usados int; _col text;
BEGIN
  _col := public.norm_color(_color);

  -- Capacidad en vivo: juegos que declaró el VIN + ajustes manuales. No se lee
  -- de inventario_colores para no depender de que el recálculo ya haya corrido.
  SELECT count(*) INTO _vin
    FROM inventario_chasis
   WHERE modelo = _modelo AND upper(COALESCE(color_original, color)) = _col;

  SELECT COALESCE(piezas_extra, 0) INTO _extra
    FROM inventario_colores WHERE modelo = _modelo AND color = _col;

  SELECT count(*) INTO _usados
    FROM inventario_chasis
   WHERE modelo = _modelo AND upper(color) = _col;

  RETURN _vin + COALESCE(_extra, 0) - _usados;
END; $$;
