-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public._sincronizar_estatus_chasis(_chasis_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _nuevo text; _tiene_unidad boolean;
BEGIN
  SELECT (motocarro_id IS NOT NULL) INTO _tiene_unidad
    FROM inventario_chasis WHERE id = _chasis_id;
  IF _tiene_unidad IS NULL THEN RETURN NULL; END IF;

  SELECT CASE
    WHEN bool_or(i.estatus = 'no_util')  THEN 'no_util'
    WHEN bool_or(i.estatus = 'garantia') THEN 'garantia'
    WHEN bool_or(i.estatus IN ('abierta','en_revision') AND i.retiene_chasis) THEN 'en_revision'
    ELSE NULL END
    INTO _nuevo
    FROM incidencias_chasis i WHERE i.chasis_id = _chasis_id;

  IF _nuevo IS NULL THEN
    _nuevo := CASE WHEN _tiene_unidad THEN 'configurado' ELSE 'disponible' END;
  END IF;

  UPDATE inventario_chasis SET estatus = _nuevo WHERE id = _chasis_id AND estatus <> _nuevo;
  RETURN _nuevo;
END; $$;
