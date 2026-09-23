-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public._verificar_capacidad_color() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mal record;
BEGIN
  WITH usados AS (
    SELECT modelo, upper(color) AS color, count(*) AS n
      FROM inventario_chasis GROUP BY 1, 2
  ), vin AS (
    SELECT modelo, upper(COALESCE(color_original, color)) AS color, count(*) AS n
      FROM inventario_chasis GROUP BY 1, 2
  )
  SELECT u.modelo, u.color, u.n AS usados,
         COALESCE(v.n,0) + COALESCE(icol.piezas_extra,0) AS capacidad
    INTO _mal
    FROM usados u
    LEFT JOIN vin v ON v.modelo = u.modelo AND v.color = u.color
    LEFT JOIN inventario_colores icol ON icol.modelo = u.modelo AND icol.color = u.color
   WHERE u.n > COALESCE(v.n,0) + COALESCE(icol.piezas_extra,0)
   ORDER BY u.modelo, u.color
   LIMIT 1;

  IF _mal.modelo IS NOT NULL THEN
    RAISE EXCEPTION 'Quedarían % chasis % en % y sólo hay % juegos de ese color. Usa intercambiar_color_chasis o registra las piezas extra con ajustar_capacidad_color',
      _mal.usados, _mal.color, _mal.modelo, _mal.capacidad;
  END IF;

  RETURN NULL;
END; $$;
