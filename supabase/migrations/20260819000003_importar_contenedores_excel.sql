-- RPC: importar_contenedores_excel — creates multiple containers from Excel sheets
CREATE OR REPLACE FUNCTION public.importar_contenedores_excel(
  _contenedores jsonb  -- [{folio_contenedor, fecha_arribo, modelo, color, unidades: [{ns_chasis, ns_motor, chasis_asignado?, color?}]}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_contenedores int;
  _contenedor jsonb;
  _cont_id uuid;
  _next_orden int;
  _u jsonb;
  _i int;
  _ns_ch text; _ns_mo text; _ch text; _col text;
  _new_id uuid;
  _contenedor_ids uuid[] := ARRAY[]::uuid[];
  _total_unidades int := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede importar contenedores';
  END IF;

  _total_contenedores := jsonb_array_length(_contenedores);
  IF _total_contenedores = 0 THEN RAISE EXCEPTION 'Debe incluir al menos un contenedor'; END IF;

  -- Get next orden_armado
  SELECT COALESCE(MAX(orden_armado),0) INTO _next_orden FROM motocarros;

  -- Process each container
  FOR _contenedor IN SELECT * FROM jsonb_array_elements(_contenedores) LOOP
    -- Validate required fields
    IF NULLIF(trim(_contenedor->>'folio_contenedor'),'') IS NULL THEN
      RAISE EXCEPTION 'Folio de contenedor requerido';
    END IF;

    -- Check for duplicate folio
    IF EXISTS (SELECT 1 FROM contenedores WHERE folio_contenedor = trim(_contenedor->>'folio_contenedor')) THEN
      RAISE EXCEPTION 'Folio de contenedor ya existe: %', trim(_contenedor->>'folio_contenedor');
    END IF;

    -- Insert container
    INSERT INTO contenedores (folio_contenedor, fecha_arribo, modelo_default, total_unidades)
    VALUES (
      trim(_contenedor->>'folio_contenedor'),
      _contenedor->>'fecha_arribo',
      NULLIF(trim(_contenedor->>'modelo'),''),
      jsonb_array_length(_contenedor->'unidades')
    )
    RETURNING id INTO _cont_id;

    _contenedor_ids := array_append(_contenedor_ids, _cont_id);

    -- Process units for this container
    _i := 0;
    FOR _u IN SELECT * FROM jsonb_array_elements(_contenedor->'unidades') LOOP
      _i := _i + 1;
      _ns_ch := NULLIF(trim(_u->>'ns_chasis'),'');
      _ns_mo := NULLIF(trim(_u->>'ns_motor'),'');
      _ch := NULLIF(trim(_u->>'chasis_asignado'),'');
      _col := COALESCE(NULLIF(trim(_u->>'color'),''), NULLIF(trim(_contenedor->>'color'),''), 'BLANCO');

      INSERT INTO motocarros (modelo, color, ns_chasis, ns_motor, chasis_asignado, contenedor_id, orden_armado, estatus_armado)
      VALUES (
        COALESCE(NULLIF(trim(_contenedor->>'modelo'),''), '200cc 2025'),
        upper(_col),
        _ns_ch,
        _ns_mo,
        _ch,
        _cont_id,
        _next_orden + _total_unidades + _i,
        'PENDIENTE'
      );

      _total_unidades := _total_unidades + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'contenedores_creados', _total_contenedores,
    'total_unidades', _total_unidades,
    'contenedor_ids', _contenedor_ids
  );
END;
$$;
