-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.recalcular_inventario_colores()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _filas int;
BEGIN
  WITH ch AS (
    SELECT ic.modelo, upper(ic.color) AS color,
           count(*)                                                                     AS piezas_total,
           count(*) FILTER (WHERE ic.motocarro_id IS NULL AND ic.estatus = 'disponible') AS disponibles,
           count(*) FILTER (WHERE ic.estatus = 'en_revision')                            AS en_revision,
           count(*) FILTER (WHERE ic.estatus = 'garantia')                               AS garantia,
           count(*) FILTER (WHERE ic.estatus = 'no_util')                                AS no_util,
           count(*) FILTER (WHERE ic.motocarro_id IS NOT NULL)                           AS configuradas
      FROM inventario_chasis ic
     GROUP BY ic.modelo, upper(ic.color)
  ), un AS (
    -- "Libre" = vendible hoy: con los dos seriales y sin una incidencia que
    -- detenga su chasis.
    SELECT m.modelo, upper(m.color) AS color,
           count(*) FILTER (WHERE m.remision_id IS NULL
                              AND m.estatus_entrega <> 'ENTREGADA'
                              AND m.ns_chasis IS NOT NULL AND m.ns_motor IS NOT NULL
                              AND COALESCE(ic.estatus, 'disponible')
                                  NOT IN ('en_revision','garantia','no_util'))        AS libres,
           count(*) FILTER (WHERE m.remision_id IS NOT NULL
                              AND m.estatus_entrega <> 'ENTREGADA')                   AS comprometidas,
           count(*) FILTER (WHERE m.estatus_entrega = 'ENTREGADA')                    AS entregadas
      FROM motocarros m
      LEFT JOIN inventario_chasis ic ON ic.numero_chasis = m.ns_chasis
     GROUP BY m.modelo, upper(m.color)
  ), vin AS (
    -- Cuántos juegos de cada color llegaron según el VIN: es la capacidad base.
    SELECT ic.modelo, upper(COALESCE(ic.color_original, ic.color)) AS color, count(*) AS juegos
      FROM inventario_chasis ic
     GROUP BY 1, 2
  ), llaves AS (
    SELECT modelo, color FROM ch
    UNION
    SELECT modelo, color FROM un
    UNION
    SELECT modelo, color FROM vin
  ), calc AS (
    SELECT k.modelo, k.color,
           COALESCE(ch.piezas_total,0)   AS piezas_total,
           COALESCE(ch.disponibles,0)    AS disponibles,
           COALESCE(ch.en_revision,0)    AS en_revision,
           COALESCE(ch.garantia,0)       AS garantia,
           COALESCE(ch.no_util,0)        AS no_util,
           COALESCE(ch.configuradas,0)   AS configuradas,
           COALESCE(un.libres,0)         AS libres,
           COALESCE(un.comprometidas,0)  AS comprometidas,
           COALESCE(un.entregadas,0)     AS entregadas,
           COALESCE(vin.juegos,0)        AS juegos_vin,
           mp.nombre_comercial
      FROM llaves k
      LEFT JOIN ch  ON ch.modelo  = k.modelo AND ch.color  = k.color
      LEFT JOIN un  ON un.modelo  = k.modelo AND un.color  = k.color
      LEFT JOIN vin ON vin.modelo = k.modelo AND vin.color = k.color
      LEFT JOIN modelos_producto mp ON mp.modelo = k.modelo
  )
  INSERT INTO inventario_colores AS ic (
    modelo, color, nombre_comercial, cantidad_disponible, piezas_total,
    piezas_en_revision, piezas_garantia, piezas_no_util, unidades_configuradas,
    unidades_libres, unidades_comprometidas, unidades_entregadas,
    juegos_usados, piezas_recibidas, umbral_alerta, updated_at, recalculado_at)
  SELECT modelo, color, COALESCE(nombre_comercial, modelo), disponibles, piezas_total,
         en_revision, garantia, no_util, configuradas,
         libres, comprometidas, entregadas,
         -- Cada chasis con ese color efectivo ocupa un juego de piezas.
         piezas_total,
         -- Capacidad = juegos que declaró el VIN (los ajustes manuales se suman
         -- en el DO UPDATE, que sí puede leer piezas_extra de la fila que ya existe).
         juegos_vin,
         3, now(), now()
    FROM calc
  ON CONFLICT (modelo, color) DO UPDATE SET
    nombre_comercial       = EXCLUDED.nombre_comercial,
    cantidad_disponible    = EXCLUDED.cantidad_disponible,
    piezas_total           = EXCLUDED.piezas_total,
    piezas_en_revision     = EXCLUDED.piezas_en_revision,
    piezas_garantia        = EXCLUDED.piezas_garantia,
    piezas_no_util         = EXCLUDED.piezas_no_util,
    unidades_configuradas  = EXCLUDED.unidades_configuradas,
    unidades_libres        = EXCLUDED.unidades_libres,
    unidades_comprometidas = EXCLUDED.unidades_comprometidas,
    unidades_entregadas    = EXCLUDED.unidades_entregadas,
    juegos_usados          = EXCLUDED.juegos_usados,
    piezas_recibidas       = EXCLUDED.piezas_recibidas + COALESCE(ic.piezas_extra, 0),
    updated_at             = now(),
    recalculado_at         = now();

  GET DIAGNOSTICS _filas = ROW_COUNT;

  -- Combinaciones que ya no tienen nada: quedan en cero, no se borran, y
  -- conservan su capacidad (los juegos de ese color siguen existiendo).
  UPDATE inventario_colores SET
    cantidad_disponible = 0, piezas_total = 0, piezas_en_revision = 0,
    piezas_garantia = 0, piezas_no_util = 0, unidades_configuradas = 0,
    unidades_libres = 0, unidades_comprometidas = 0, unidades_entregadas = 0,
    juegos_usados = 0, piezas_recibidas = GREATEST(COALESCE(piezas_extra,0), 0),
    updated_at = now(), recalculado_at = now()
  WHERE NOT EXISTS (SELECT 1 FROM inventario_chasis ic
                     WHERE ic.modelo = inventario_colores.modelo
                       AND upper(ic.color) = inventario_colores.color)
    AND NOT EXISTS (SELECT 1 FROM motocarros m
                     WHERE m.modelo = inventario_colores.modelo
                       AND upper(m.color) = inventario_colores.color)
    AND (cantidad_disponible <> 0 OR piezas_total <> 0 OR unidades_libres <> 0
         OR unidades_comprometidas <> 0 OR unidades_entregadas <> 0 OR juegos_usados <> 0);

  RETURN jsonb_build_object('ok', true, 'combinaciones', _filas);
END; $$;
