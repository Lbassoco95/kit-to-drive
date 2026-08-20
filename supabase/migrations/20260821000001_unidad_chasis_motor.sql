-- Migration: Unidad = Chasis + Motor (1:1)
-- Fixes KIT-1: proper unit counting, pareo logic, and error visibility
-- Date: 2026-08-21

-- A1 · Semántica del contenedor: unidades ≠ piezas
ALTER TABLE public.contenedores
  ADD COLUMN IF NOT EXISTS total_chasis  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_motores integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estatus_carga text NOT NULL DEFAULT 'completa'
    CHECK (estatus_carga IN ('completa', 'incompleta'));

COMMENT ON COLUMN public.contenedores.total_unidades IS
  'Unidades (chasis+motor pareados). NO es chasis + motores.';

-- Backfill: recalcular con lo que realmente hay en inventario
UPDATE public.contenedores c SET
  total_chasis  = COALESCE((SELECT count(*) FROM inventario_chasis ic WHERE ic.contenedor_id = c.id), 0),
  total_motores = COALESCE((SELECT count(*) FROM inventario_motor  im WHERE im.contenedor_id = c.id), 0);

-- A2 · Garantizar el 1:1 a nivel de base
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_chasis_motocarro
  ON public.inventario_chasis (motocarro_id) WHERE motocarro_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_motor_motocarro
  ON public.inventario_motor (motocarro_id) WHERE motocarro_id IS NOT NULL;

-- Los seriales de la unidad no se repiten
CREATE UNIQUE INDEX IF NOT EXISTS ux_motocarros_ns_chasis
  ON public.motocarros (ns_chasis) WHERE ns_chasis IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_motocarros_ns_motor
  ON public.motocarros (ns_motor) WHERE ns_motor IS NOT NULL;

-- A3 · Arreglar importar_motores_inventario (P5: distingue insert vs update)
DROP FUNCTION IF EXISTS public.importar_motores_inventario(uuid, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.importar_motores_inventario(
  _contenedor_id uuid,
  _modelo text,
  _motores jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _m jsonb; _num text; _mod text;
  _insertados int := 0; _actualizados int := 0; _invalidos int := 0;
  _es_nuevo boolean;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede importar motores';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contenedores WHERE id = _contenedor_id) THEN
    RAISE EXCEPTION 'Contenedor no encontrado';
  END IF;

  FOR _m IN SELECT * FROM jsonb_array_elements(_motores) LOOP
    _num := upper(NULLIF(trim(COALESCE(_m->>'numero_motor', _m->>'engine_number')), ''));
    _mod := COALESCE(NULLIF(trim(COALESCE(_m->>'modelo', _m->>'model_no')),''), _modelo, '200cc 2025');

    IF _num IS NULL OR length(_num) < 4 THEN
      _invalidos := _invalidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO inventario_motor (numero_motor, contenedor_id, modelo, estatus, created_at)
    VALUES (_num, _contenedor_id, _mod, 'disponible', NOW())
    ON CONFLICT (numero_motor) DO UPDATE
      SET contenedor_id = _contenedor_id, modelo = _mod, updated_at = now()
    RETURNING (xmax = 0) INTO _es_nuevo;

    IF _es_nuevo THEN
      _insertados := _insertados + 1;
    ELSE
      _actualizados := _actualizados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'insertados', _insertados,
                            'actualizados', _actualizados, 'invalidos', _invalidos);
END;
$$;
GRANT EXECUTE ON FUNCTION public.importar_motores_inventario(uuid, text, jsonb) TO authenticated;

-- A4 · importar_vins_inventario: llaves alternas, conteo real y sin inflar colores
DROP FUNCTION IF EXISTS public.importar_vins_inventario(uuid, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.importar_vins_inventario(
  _contenedor_id uuid,
  _folio_contenedor text,
  _modelo text,
  _vins jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _v jsonb; _num_chasis text; _col text; _mod text;
  _insertados int := 0; _actualizados int := 0; _invalidos int := 0;
  _new_id uuid; _es_nuevo boolean;
  _ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede importar VINs';
  END IF;

  IF _contenedor_id IS NULL THEN
    RAISE EXCEPTION 'ID de contenedor requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM contenedores WHERE id = _contenedor_id) THEN
    RAISE EXCEPTION 'Contenedor no encontrado';
  END IF;

  IF _folio_contenedor IS NOT NULL THEN
    UPDATE contenedores SET folio_contenedor = _folio_contenedor WHERE id = _contenedor_id;
  END IF;

  FOR _v IN SELECT * FROM jsonb_array_elements(_vins) LOOP
    _num_chasis := upper(NULLIF(trim(COALESCE(_v->>'numero_chasis', _v->>'frame_number')), ''));
    _col        := upper(COALESCE(NULLIF(trim(_v->>'color'),''), 'SIN COLOR'));
    _mod        := COALESCE(NULLIF(trim(COALESCE(_v->>'modelo', _v->>'model_no')),''), _modelo, '200cc 2025');

    IF _num_chasis IS NULL OR length(_num_chasis) < 4 THEN
      _invalidos := _invalidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO inventario_chasis (numero_chasis, contenedor_id, modelo, color, estatus, created_at)
    VALUES (_num_chasis, _contenedor_id, _mod, _col, 'disponible', NOW())
    ON CONFLICT (numero_chasis) DO UPDATE SET
      contenedor_id = _contenedor_id,
      modelo = _mod,
      color = _col,
      updated_at = now()
    RETURNING id, (xmax = 0) INTO _new_id, _es_nuevo;

    _ids := array_append(_ids, _new_id);

    IF _es_nuevo THEN
      _insertados := _insertados + 1;
      PERFORM public.incrementar_inventario_color(_mod, _col, 1);
    ELSE
      _actualizados := _actualizados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contenedor_id', _contenedor_id,
                            'insertados', _insertados, 'actualizados', _actualizados,
                            'invalidos', _invalidos, 'chasis_ids', _ids);
END;
$$;
GRANT EXECUTE ON FUNCTION public.importar_vins_inventario(uuid, text, text, jsonb) TO authenticated;

-- A5 · Función interna de pareo (P1, P2, P3)
DROP FUNCTION IF EXISTS public._parear_unidades_contenedor_internal(uuid);

CREATE OR REPLACE FUNCTION public._parear_unidades_contenedor_internal(_contenedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _n_chasis int; _n_motores int; _pareadas int := 0; _unidades int;
  _r record; _moto_id uuid; _orden int;
  _sin_motor text[] := '{}'; _sin_chasis text[] := '{}';
BEGIN
  SELECT count(*) INTO _n_chasis  FROM inventario_chasis
   WHERE contenedor_id = _contenedor_id;
  SELECT count(*) INTO _n_motores FROM inventario_motor
   WHERE contenedor_id = _contenedor_id;

  SELECT COALESCE(max(orden_armado), 0) INTO _orden FROM motocarros;

  FOR _r IN
    WITH ch AS (
      SELECT id, numero_chasis, modelo, color,
             row_number() OVER (ORDER BY created_at, numero_chasis) AS rn
      FROM inventario_chasis
      WHERE contenedor_id = _contenedor_id AND motocarro_id IS NULL
    ), mo AS (
      SELECT id, numero_motor, modelo,
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

    INSERT INTO motocarros (orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado, estatus_entrega, created_at)
    VALUES (_orden, _r.modelo, _r.color, _r.numero_chasis, _r.numero_motor, 'PENDIENTE', 'NO_APLICA', NOW())
    ON CONFLICT (ns_chasis) WHERE ns_chasis IS NOT NULL DO UPDATE
      SET ns_motor = EXCLUDED.ns_motor, updated_at = now()
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

  RETURN jsonb_build_object(
    'ok', true,
    'unidades', _unidades,
    'unidades_nuevas', _pareadas,
    'chasis_recibidos', _n_chasis,
    'motores_recibidos', _n_motores,
    'chasis_sin_motor', _sin_motor,
    'motores_sin_chasis', _sin_chasis,
    'completa', (array_length(_sin_motor,1) IS NULL AND array_length(_sin_chasis,1) IS NULL)
  );
END;
$$;

-- P3 · No exponer la función interna por PostgREST
REVOKE EXECUTE ON FUNCTION public._parear_unidades_contenedor_internal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._parear_unidades_contenedor_internal(uuid) FROM anon, authenticated;

-- A5b · Función pública: sólo validación de rol y envoltorio
DROP FUNCTION IF EXISTS public.parear_unidades_contenedor(uuid);

CREATE OR REPLACE FUNCTION public.parear_unidades_contenedor(_contenedor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede parear unidades';
  END IF;
  RETURN public._parear_unidades_contenedor_internal(_contenedor_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.parear_unidades_contenedor(uuid) TO authenticated;

-- A6 · Reagrupar lo ya cargado (backfill)
DO $$
DECLARE _c record;
BEGIN
  FOR _c IN SELECT id FROM contenedores
            WHERE EXISTS (SELECT 1 FROM inventario_chasis ic WHERE ic.contenedor_id = contenedores.id
                          AND ic.motocarro_id IS NULL)
  LOOP
    PERFORM public._parear_unidades_contenedor_internal(_c.id);
  END LOOP;
END $$;
