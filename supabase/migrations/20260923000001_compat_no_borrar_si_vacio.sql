-- Compat: no borrar enlaces existentes si llega lista vacía (salvo forzar_vaciar_compat).
-- Evita que un reproceso masivo con extract vacío deje todo en cero.
CREATE OR REPLACE FUNCTION public.sincronizar_compat_refacciones(_items JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  prod_id UUID;
  v_codigo TEXT;
  v_corta TEXT;
  unidad_txt TEXT;
  unidad_norm TEXT;
  unidad_id UUID;
  procesados INTEGER := 0;
  links INTEGER := 0;
  omitidos_vacios INTEGER := 0;
  forzar_vaciar BOOLEAN;
  tiene_compat_key BOOLEAN;
  n_comps INTEGER;
BEGIN
  IF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Sin acceso al almacén de refacciones';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.puede_ver_almacen_refacciones() THEN
    RAISE EXCEPTION 'Sin acceso al almacén de refacciones';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Se espera un arreglo JSON';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_codigo := nullif(trim(item->>'codigo_nuevo'), '');
    IF v_codigo IS NULL THEN CONTINUE; END IF;

    SELECT id INTO prod_id
    FROM public.almacen_refacciones_productos
    WHERE codigo_nuevo = v_codigo;
    IF prod_id IS NULL THEN CONTINUE; END IF;

    v_corta := nullif(trim(item->>'descripcion_corta'), '');

    -- Solo toca descripción si viene corta explícita
    IF v_corta IS NOT NULL THEN
      UPDATE public.almacen_refacciones_productos
      SET
        descripcion_original = coalesce(descripcion_original, descripcion),
        descripcion_corta = v_corta,
        descripcion = v_corta,
        updated_at = now()
      WHERE id = prod_id;
    END IF;

    tiene_compat_key := (item ? 'compatibilidades')
      AND jsonb_typeof(item->'compatibilidades') = 'array';
    IF NOT tiene_compat_key THEN
      procesados := procesados + 1;
      CONTINUE;
    END IF;

    n_comps := jsonb_array_length(item->'compatibilidades');
    forzar_vaciar := coalesce((item->>'forzar_vaciar_compat')::boolean, false);

    -- Lista vacía: NO borrar lo ya asignado (salvo forzar desde la ficha)
    IF n_comps = 0 AND NOT forzar_vaciar THEN
      omitidos_vacios := omitidos_vacios + 1;
      procesados := procesados + 1;
      CONTINUE;
    END IF;

    DELETE FROM public.almacen_refacciones_producto_compat WHERE producto_id = prod_id;

    IF n_comps > 0 THEN
      FOR unidad_txt IN
        SELECT nullif(trim(value), '')
        FROM jsonb_array_elements_text(item->'compatibilidades') AS t(value)
      LOOP
        IF unidad_txt IS NULL THEN CONTINUE; END IF;
        unidad_norm := lower(regexp_replace(unidad_txt, '\s+', ' ', 'g'));

        INSERT INTO public.almacen_refacciones_unidades (nombre, nombre_normalizado)
        VALUES (unidad_txt, unidad_norm)
        ON CONFLICT (nombre_normalizado) DO UPDATE SET
          nombre = EXCLUDED.nombre;

        SELECT id INTO unidad_id
        FROM public.almacen_refacciones_unidades
        WHERE nombre_normalizado = unidad_norm;

        INSERT INTO public.almacen_refacciones_producto_compat (producto_id, unidad_id, texto_origen)
        VALUES (prod_id, unidad_id, unidad_txt)
        ON CONFLICT DO NOTHING;
        links := links + 1;
      END LOOP;
    END IF;

    procesados := procesados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'procesados', procesados,
    'compatibilidades', links,
    'omitidos_vacios', omitidos_vacios
  );
END;
$$;
