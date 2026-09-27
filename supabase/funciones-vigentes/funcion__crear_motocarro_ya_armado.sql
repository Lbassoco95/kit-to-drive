-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260908000002_tope_unidades_ya_armadas.sql

CREATE OR REPLACE FUNCTION public.crear_motocarro_ya_armado(
  _ns_chasis text,
  _ns_motor text,
  _modelo text,        -- nombre comercial o código interno de fábrica
  _color text,
  _remision_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _ch text; _mo text; _col text; _modelo_input text; _modelo_interno text;
  _nc_input text; _nc_chasis text; _nc_chasis_texto text;
  _chasis_id uuid; _motor_id uuid; _moto_id uuid; _orden_final int;
  _remision record; _ch_existente record; _mo_existente record;
  _usados int; _vin int;
  _color_cambiado boolean := false; _color_vin text;
  _capacidad_ajustada boolean := false; _cap_antes int;
  _limite int; _cargadas int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin o fábrica puede crear unidades ya armadas';
  END IF;

  -- El lote es cerrado: sólo las unidades que ya estaban ensambladas antes del
  -- sistema. Pasado el tope no se sigue de largo — pero tampoco es un muro sin
  -- salida: el mensaje dice quién lo puede subir y dónde.
  SELECT limite_ya_armados INTO _limite FROM config_general WHERE id = 1;
  _limite := COALESCE(_limite, 50);
  SELECT count(*) INTO _cargadas FROM motocarros WHERE carga_ya_armado;
  IF _cargadas >= _limite THEN
    RAISE EXCEPTION 'Ya se cargaron % unidades ya armadas y el tope acordado es %. Si de verdad aparecieron más, Dirección sube el límite en Configuración; si no, esta unidad se arma en Producción con su chasis y su motor',
      _cargadas, _limite;
  END IF;

  -- Saneo de seriales (mismo criterio que capturar_seriales_unidad)
  _ch := NULLIF(regexp_replace(upper(COALESCE(_ns_chasis,'')), '[^A-Z0-9-]', '', 'g'), '');
  _mo := NULLIF(regexp_replace(upper(COALESCE(_ns_motor,'')), '[^A-Z0-9-]', '', 'g'), '');
  _col := public.norm_color(_color);
  _modelo_input := upper(trim(COALESCE(_modelo, '')));

  IF _ch IS NULL OR _mo IS NULL THEN
    RAISE EXCEPTION 'Se requiere NS chasis y NS motor para registrar un motocarro ya armado';
  END IF;
  IF _ch !~ '^[A-Z0-9-]{4,30}$' THEN
    RAISE EXCEPTION 'NS chasis inválido: usa de 4 a 30 caracteres (letras, números o guion)';
  END IF;
  IF _mo !~ '^[A-Z0-9-]{4,30}$' THEN
    RAISE EXCEPTION 'NS motor inválido: usa de 4 a 30 caracteres (letras, números o guion)';
  END IF;
  IF _modelo_input = '' THEN
    RAISE EXCEPTION 'Se requiere el cilindraje (modelo) del motocarro';
  END IF;
  IF _col IS NULL OR _col = '' THEN
    RAISE EXCEPTION 'Se requiere el color del motocarro';
  END IF;

  -- Resolver modelo comercial a código interno de fábrica. El nombre comercial
  -- se guarda aparte: es con el que se compara contra el chasis, porque varios
  -- códigos de fábrica comparten uno.
  SELECT modelo, upper(COALESCE(NULLIF(trim(nombre_comercial), ''), modelo))
    INTO _modelo_interno, _nc_input
    FROM modelos_producto
   WHERE upper(COALESCE(nombre_comercial, '')) = _modelo_input
      OR upper(modelo) = _modelo_input
   ORDER BY (upper(modelo) = _modelo_input) DESC
   LIMIT 1;
  IF _modelo_interno IS NULL THEN
    RAISE EXCEPTION 'No se encontró el modelo % en el catálogo. Regístralo en Modelos de producto.', _modelo;
  END IF;

  -- Validar remisión destino
  SELECT * INTO _remision FROM remisiones WHERE id = _remision_id;
  IF _remision IS NULL THEN
    RAISE EXCEPTION 'Remisión no encontrada';
  END IF;
  IF _remision.estatus NOT IN ('NUEVA', 'PARCIAL') THEN
    RAISE EXCEPTION 'La remisión % no está disponible para asignar unidades', _remision.folio_remision;
  END IF;

  -- Los seriales no pueden repetirse en otro motocarro
  IF EXISTS (SELECT 1 FROM motocarros WHERE ns_chasis = _ch) THEN
    RAISE EXCEPTION 'El NS chasis % ya está registrado en otra unidad', _ch;
  END IF;
  IF EXISTS (SELECT 1 FROM motocarros WHERE ns_motor = _mo) THEN
    RAISE EXCEPTION 'El NS motor % ya está registrado en otra unidad', _mo;
  END IF;

  -- ── Chasis ────────────────────────────────────────────────────────────────
  SELECT * INTO _ch_existente FROM inventario_chasis WHERE numero_chasis = _ch;
  IF _ch_existente.id IS NOT NULL THEN
    IF _ch_existente.motocarro_id IS NOT NULL THEN
      RAISE EXCEPTION 'El chasis % ya es parte de otra unidad', _ch;
    END IF;
    IF public.chasis_bloqueado(_ch_existente.id) THEN
      RAISE EXCEPTION 'El chasis % está bloqueado por una incidencia; resuélvela antes de asignarlo', _ch;
    END IF;
    _chasis_id := _ch_existente.id;

    -- El VIN ya dijo qué pieza es ésta. Un cilindraje distinto no se
    -- sobreescribe desde aquí: o el chasis está mal capturado —y eso se
    -- corrige en Inventario, con su propio rastro— o el cilindraje elegido no
    -- es el de esta unidad.
    SELECT COALESCE(NULLIF(trim(nombre_comercial), ''), modelo) INTO _nc_chasis_texto
      FROM modelos_producto WHERE modelo = _ch_existente.modelo;
    _nc_chasis_texto := COALESCE(_nc_chasis_texto, _ch_existente.modelo);
    _nc_chasis := upper(_nc_chasis_texto);
    IF _nc_chasis <> _nc_input THEN
      RAISE EXCEPTION 'El chasis % está registrado en inventario como % y elegiste %. Corrige el chasis en Inventario o elige el cilindraje que de verdad trae la unidad',
        _ch, _nc_chasis_texto, trim(_modelo);
    END IF;
    -- Con el nombre comercial ya cuadrado, el código de fábrica que manda es
    -- el del chasis (dos códigos pueden compartir nombre comercial).
    _modelo_interno := _ch_existente.modelo;

    -- Color: fábrica declara con cuál está armada la unidad. Si no es el que
    -- traía el chasis, el cambio pasa por `cambiar_color_chasis` —igual que al
    -- configurar una unidad—, que valida que haya juego libre de ese color y
    -- lo deja en `bitacora_color`. Así el chasis y la unidad no terminan con
    -- dos colores distintos.
    _color_vin := upper(COALESCE(_ch_existente.color_original, _ch_existente.color));
    IF _col <> upper(_ch_existente.color) THEN
      -- La unidad ya está armada: si no hay juego libre de ese color, el juego
      -- ya se ocupó en el piso de todas formas. Se registra el extra —con
      -- motivo, igual que un chasis sin VIN previo— en vez de dejar la unidad
      -- fuera del sistema. `cambiar_color_chasis` valida contra la capacidad,
      -- así que este ajuste tiene que ir antes.
      IF public.capacidad_color_libre(_modelo_interno, _col) <= 0 THEN
        SELECT count(*) INTO _usados
          FROM inventario_chasis WHERE modelo = _modelo_interno AND upper(color) = _col;
        SELECT count(*) INTO _vin
          FROM inventario_chasis
         WHERE modelo = _modelo_interno AND upper(COALESCE(color_original, color)) = _col;
        SELECT COALESCE(piezas_recibidas, 0) INTO _cap_antes
          FROM inventario_colores WHERE modelo = _modelo_interno AND color = _col;
        PERFORM public.ajustar_capacidad_color(
          _modelo_interno, _col,
          GREATEST(_usados + 1, _vin, COALESCE(_cap_antes, 0)),
          'Juego ' || _col || ' extra: entró armado el motocarro ' || _ch ||
          ', que el VIN traía en ' || _color_vin);
        _capacidad_ajustada := true;
      END IF;
      PERFORM public.cambiar_color_chasis(_chasis_id, _col,
        'Color declarado al ingresar el motocarro ya armado (el chasis venía en ' || _color_vin || ')');
      SELECT * INTO _ch_existente FROM inventario_chasis WHERE id = _chasis_id;  -- releer el color nuevo
      _color_cambiado := true;
    END IF;
  ELSE
    -- Reservar capacidad de color para el chasis nuevo, si no el trigger
    -- _verificar_capacidad_color tumba la transacción.
    SELECT count(*) INTO _usados
      FROM inventario_chasis WHERE modelo = _modelo_interno AND upper(color) = _col;
    SELECT count(*) INTO _vin
      FROM inventario_chasis
     WHERE modelo = _modelo_interno AND upper(COALESCE(color_original, color)) = _col;
    PERFORM public.ajustar_capacidad_color(
      _modelo_interno, _col,
      GREATEST(_usados + 1, _vin),
      'Carga de motocarro ya armado (sin VIN previo)'
    );

    INSERT INTO inventario_chasis (numero_chasis, modelo, color, estatus)
    VALUES (_ch, _modelo_interno, _col, 'disponible')
    RETURNING id INTO _chasis_id;
  END IF;

  -- ── Motor ─────────────────────────────────────────────────────────────────
  SELECT * INTO _mo_existente FROM inventario_motor WHERE numero_motor = _mo;
  IF _mo_existente.id IS NOT NULL THEN
    IF _mo_existente.motocarro_id IS NOT NULL THEN
      RAISE EXCEPTION 'El motor % ya es parte de otra unidad', _mo;
    END IF;
    _motor_id := _mo_existente.id;
  ELSE
    INSERT INTO inventario_motor (numero_motor, modelo, estatus)
    VALUES (_mo, _modelo_interno, 'disponible')
    RETURNING id INTO _motor_id;
  END IF;

  -- Orden de armado siguiente
  _orden_final := (SELECT COALESCE(max(orden_armado), 0) + 1 FROM motocarros);

  -- Crear el motocarro ya armado, asignado directamente a la remisión. El
  -- color sale del chasis, que es el que ya pasó por la validación: no de la
  -- variable, para que no puedan quedar distintos.
  INSERT INTO motocarros (
    orden_armado, modelo, color, ns_chasis, ns_motor,
    contenedor_id, estatus_armado, estatus_entrega,
    remision_id, fecha_real_armado, carga_ya_armado
  )
  VALUES (
    _orden_final, _modelo_interno, COALESCE(upper(_ch_existente.color), _col), _ch, _mo,
    _ch_existente.contenedor_id, 'ARMADO', 'PROGRAMADA',
    _remision_id, CURRENT_DATE, true
  )
  RETURNING id INTO _moto_id;

  -- Vincular las piezas del inventario a la unidad nueva
  UPDATE inventario_chasis
     SET motocarro_id = _moto_id, estatus = 'configurado', fecha_configuracion = now()
   WHERE id = _chasis_id;
  UPDATE inventario_motor
     SET motocarro_id = _moto_id, estatus = 'configurado', fecha_configuracion = now()
   WHERE id = _motor_id;

  -- El historial de la pieza viaja con la unidad: el cambio de color que se
  -- acaba de registrar tiene que quedar colgado del motocarro, no suelto.
  UPDATE bitacora_color SET motocarro_id = _moto_id
   WHERE chasis_id = _chasis_id AND motocarro_id IS NULL;

  -- Recalcular total del contenedor si el chasis viene de uno
  IF _ch_existente.contenedor_id IS NOT NULL THEN
    UPDATE contenedores c SET total_unidades =
      (SELECT count(*) FROM inventario_chasis ic
        WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
     WHERE c.id = _ch_existente.contenedor_id;
  END IF;

  -- Actualizar estatus de la remisión según cuántas unidades ya tiene
  UPDATE remisiones
     SET estatus = CASE
       WHEN (SELECT count(*) FROM motocarros mm WHERE mm.remision_id = _remision_id) >= total_unidades_solicitadas
         THEN 'COMPLETA'::estatus_remision
       ELSE 'PARCIAL'::estatus_remision
     END
   WHERE id = _remision_id;

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object(
    'ok', true,
    'motocarro_id', _moto_id,
    'orden_armado', _orden_final,
    'ns_chasis', _ch,
    'ns_motor', _mo,
    'modelo', _modelo_interno,
    'color', COALESCE(upper(_ch_existente.color), _col),
    'color_cambiado', _color_cambiado,
    'capacidad_ajustada', _capacidad_ajustada,
    'ya_armados_cargados', _cargadas + 1,
    'ya_armados_limite', _limite,
    'color_vin', COALESCE(_color_vin, _col),
    'chasis_existente', (_ch_existente.id IS NOT NULL),
    'motor_existente', (_mo_existente.id IS NOT NULL)
  );
END; $$;
