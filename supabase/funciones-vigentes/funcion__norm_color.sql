-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.norm_color(_color text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE upper(trim(COALESCE(_color,'')))
    WHEN 'WHITE'  THEN 'BLANCO'
    WHEN 'BLANC'  THEN 'BLANCO'
    WHEN 'BLUE'   THEN 'AZUL'
    WHEN 'RED'    THEN 'ROJO'
    WHEN 'BLACK'  THEN 'NEGRO'
    WHEN 'GREEN'  THEN 'VERDE'
    WHEN 'ORANGE' THEN 'NARANJA'
    WHEN 'SILVER' THEN 'PLATA'
    WHEN 'GRAY'   THEN 'GRIS'
    WHEN 'GREY'   THEN 'GRIS'
    WHEN 'YELLOW' THEN 'AMARILLO'
    ELSE upper(trim(COALESCE(_color,'')))
  END;
$$;
