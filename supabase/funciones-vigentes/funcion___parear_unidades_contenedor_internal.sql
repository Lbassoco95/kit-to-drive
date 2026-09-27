-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260821000001_unidad_chasis_motor.sql

CREATE OR REPLACE FUNCTION public._parear_unidades_contenedor_internal(_contenedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _n_chasis int; _n_motores int; _unidades int; _pareadas int := 0;
  _r record; _moto_id uuid; _orden int;
  _sin_motor text[] := '{}'; _sin_chasis text[] := '{}';
BEGIN
  SELECT count(*) INTO _n_chasis  FROM inventario_chasis WHERE contenedor_id = _contenedor_id;
  SELECT count(*) INTO _n_motores FROM inventario_motor  WHERE contenedor_id = _contenedor_id;

  SELECT COALESCE(max(orden_armado),0) INTO _orden FROM motocarros;

  FOR _r IN
    WITH ch AS (
      SELECT id, numero_chasis, modelo, color,
             row_number() OVER (ORDER BY created_at, numero_chasis) AS rn
        FROM inventario_chasis
       WHERE contenedor_id = _contenedor_id AND motocarro_id IS NULL
    ), mo AS (
      SELECT id, numero_motor,
             row_number() OVER (ORDER BY created_at, numero_motor) AS rn
        FROM inventario_motor
       WHERE contenedor_id = _contenedor_id AND motocarro_id IS NULL
    )
    SELECT ch.id AS chasis_id, ch.numero_chasis, ch.modelo, ch.color,
           mo.id AS motor_id, mo.numero_motor
      FROM ch JOIN mo ON mo.rn = ch.rn
     ORDER BY ch.rn
  LOOP
    _orden := _orden + 1;

    INSERT INTO motocarros (orden_armado, modelo, color, ns_chasis, ns_motor,
                            contenedor_id, estatus_armado, estatus_entrega)
    VALUES (_orden, _r.modelo, _r.color, _r.numero_chasis, _r.numero_motor,
            _contenedor_id, 'PENDIENTE', 'NO_APLICA')
    ON CONFLICT (ns_chasis) DO UPDATE
      SET ns_motor = EXCLUDED.ns_motor,
          contenedor_id = EXCLUDED.contenedor_id,
          updated_at = now()
    RETURNING id INTO _moto_id;

    UPDATE inventario_chasis SET motocarro_id = _moto_id, estatus = 'configurado',
           fecha_configuracion = now() WHERE id = _r.chasis_id;
    UPDATE inventario_motor  SET motocarro_id = _moto_id, estatus = 'configurado',
           fecha_configuracion = now() WHERE id = _r.motor_id;

    _pareadas := _pareadas + 1;
  END LOOP;

  SELECT count(*) INTO _unidades FROM inventario_chasis
   WHERE contenedor_id = _contenedor_id AND motocarro_id IS NOT NULL;

  SELECT COALESCE(array_agg(numero_chasis), '{}') INTO _sin_motor
    FROM inventario_chasis WHERE contenedor_id = _contenedor_id AND motocarro_id IS NULL;
  SELECT COALESCE(array_agg(numero_motor), '{}') INTO _sin_chasis
    FROM inventario_motor  WHERE contenedor_id = _contenedor_id AND motocarro_id IS NULL;

  UPDATE contenedores SET
    total_chasis   = _n_chasis,
    total_motores  = _n_motores,
    total_unidades = _unidades,
    estatus_carga  = CASE WHEN array_length(_sin_motor,1) IS NULL
                           AND array_length(_sin_chasis,1) IS NULL
                          THEN 'completa' ELSE 'incompleta' END
  WHERE id = _contenedor_id;

  RETURN jsonb_build_object('ok', true,
    'unidades', _unidades, 'unidades_nuevas', _pareadas,
    'chasis_recibidos', _n_chasis, 'motores_recibidos', _n_motores,
    'chasis_sin_motor', _sin_motor, 'motores_sin_chasis', _sin_chasis,
    'completa', (array_length(_sin_motor,1) IS NULL AND array_length(_sin_chasis,1) IS NULL));
END; $$;
