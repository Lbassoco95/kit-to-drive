-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260822000001_configuracion_manual_unidades.sql

CREATE OR REPLACE FUNCTION public.importar_motores_inventario(
  _contenedor_id uuid, _modelo text, _motores jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _m jsonb; _num text; _mod text; _es_nuevo boolean;
  _insertados int := 0; _actualizados int := 0; _invalidos int := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede importar motores';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contenedores WHERE id = _contenedor_id) THEN
    RAISE EXCEPTION 'Contenedor no encontrado';
  END IF;

  FOR _m IN SELECT * FROM jsonb_array_elements(_motores) LOOP
    _num := regexp_replace(
              upper(NULLIF(trim(COALESCE(_m->>'numero_motor', _m->>'engine_number')),'')),
              '[^A-Z0-9-]', '', 'g');
    _mod := COALESCE(NULLIF(trim(COALESCE(_m->>'modelo', _m->>'model_no')),''), _modelo, '200cc 2025');

    IF _num IS NULL OR length(_num) < 4 THEN
      _invalidos := _invalidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO inventario_motor (numero_motor, contenedor_id, modelo, estatus)
    VALUES (_num, _contenedor_id, _mod, 'disponible')
    ON CONFLICT (numero_motor) DO UPDATE
      SET contenedor_id = _contenedor_id, modelo = _mod
    RETURNING (xmax = 0) INTO _es_nuevo;

    IF _es_nuevo THEN _insertados := _insertados + 1;
    ELSE _actualizados := _actualizados + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'insertados', _insertados,
    'actualizados', _actualizados, 'invalidos', _invalidos);
END; $$;
