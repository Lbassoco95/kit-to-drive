-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260822000001_configuracion_manual_unidades.sql

CREATE OR REPLACE FUNCTION public.importar_vins_inventario(
  _contenedor_id uuid, _folio_contenedor text, _modelo text, _vins jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _v jsonb; _num text; _col text; _mod text; _es_nuevo boolean; _new_id uuid;
  _insertados int := 0; _actualizados int := 0; _invalidos int := 0;
  _ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede importar VINs';
  END IF;
  IF _contenedor_id IS NULL THEN RAISE EXCEPTION 'ID de contenedor requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM contenedores WHERE id = _contenedor_id) THEN
    RAISE EXCEPTION 'Contenedor no encontrado';
  END IF;

  IF _folio_contenedor IS NOT NULL AND length(trim(_folio_contenedor)) > 0 THEN
    UPDATE contenedores SET folio_contenedor = trim(_folio_contenedor) WHERE id = _contenedor_id;
  END IF;

  FOR _v IN SELECT * FROM jsonb_array_elements(_vins) LOOP
    _num := regexp_replace(
              upper(NULLIF(trim(COALESCE(_v->>'numero_chasis', _v->>'frame_number')),'')),
              '[^A-Z0-9-]', '', 'g');
    _col := upper(COALESCE(NULLIF(trim(_v->>'color'),''), 'SIN COLOR'));
    _mod := COALESCE(NULLIF(trim(COALESCE(_v->>'modelo', _v->>'model_no')),''), _modelo, '200cc 2025');

    IF _num IS NULL OR length(_num) < 4 THEN
      _invalidos := _invalidos + 1;
      CONTINUE;
    END IF;

    INSERT INTO inventario_chasis (numero_chasis, contenedor_id, modelo, color, estatus)
    VALUES (_num, _contenedor_id, _mod, _col, 'disponible')
    ON CONFLICT (numero_chasis) DO UPDATE
      SET contenedor_id = _contenedor_id, modelo = _mod, color = _col
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
END; $$;
