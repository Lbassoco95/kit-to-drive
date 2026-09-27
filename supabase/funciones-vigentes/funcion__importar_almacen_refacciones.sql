-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260922000001_almacen_refacciones.sql

CREATE OR REPLACE FUNCTION public.importar_almacen_refacciones(_items JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  prod_id UUID;
  v_codigo_nuevo TEXT;
  v_codigo_antiguo TEXT;
  v_clave TEXT;
  compat JSONB;
  unidad_txt TEXT;
  unidad_norm TEXT;
  unidad_id UUID;
  procesados INTEGER := 0;
  compat_count INTEGER := 0;
  codigos_count INTEGER := 0;
BEGIN
  IF coalesce(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Sin acceso al almacén de refacciones';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.puede_ver_almacen_refacciones() THEN
    RAISE EXCEPTION 'Sin acceso al almacén de refacciones';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Se espera un arreglo JSON de productos';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_codigo_nuevo := nullif(trim(item->>'codigo_nuevo'), '');
    IF v_codigo_nuevo IS NULL THEN
      CONTINUE;
    END IF;
    v_codigo_antiguo := nullif(trim(item->>'codigo_antiguo'), '');
    v_clave := coalesce(nullif(trim(item->>'clave_completa'), ''), v_codigo_nuevo);

    INSERT INTO public.almacen_refacciones_productos (
      codigo_nuevo, codigo_antiguo, clave_completa, clave_simplificada,
      linea_catalogo, marca, categoria, descripcion, descripcion_corta,
      unidad_medida, piezas_por_caja, precio, stock, visible_venta,
      no_lista, fuente_archivo
    ) VALUES (
      v_codigo_nuevo,
      v_codigo_antiguo,
      v_clave,
      nullif(trim(item->>'clave_simplificada'), ''),
      coalesce(nullif(trim(item->>'linea_catalogo'), ''), 'linea_dorada'),
      nullif(trim(item->>'marca'), ''),
      nullif(trim(item->>'categoria'), ''),
      coalesce(nullif(trim(item->>'descripcion'), ''), v_codigo_nuevo),
      nullif(trim(item->>'descripcion_corta'), ''),
      nullif(trim(item->>'unidad_medida'), ''),
      nullif(trim(item->>'piezas_por_caja'), ''),
      NULLIF(item->>'precio', '')::NUMERIC,
      coalesce(NULLIF(item->>'stock', '')::INTEGER, 0),
      coalesce((item->>'visible_venta')::BOOLEAN, true),
      NULLIF(item->>'no_lista', '')::INTEGER,
      nullif(trim(item->>'fuente_archivo'), '')
    )
    ON CONFLICT (codigo_nuevo) DO UPDATE SET
      codigo_antiguo = EXCLUDED.codigo_antiguo,
      clave_completa = EXCLUDED.clave_completa,
      clave_simplificada = EXCLUDED.clave_simplificada,
      linea_catalogo = EXCLUDED.linea_catalogo,
      marca = EXCLUDED.marca,
      categoria = EXCLUDED.categoria,
      descripcion = EXCLUDED.descripcion,
      descripcion_corta = EXCLUDED.descripcion_corta,
      unidad_medida = EXCLUDED.unidad_medida,
      piezas_por_caja = EXCLUDED.piezas_por_caja,
      precio = EXCLUDED.precio,
      stock = EXCLUDED.stock,
      visible_venta = EXCLUDED.visible_venta,
      no_lista = EXCLUDED.no_lista,
      fuente_archivo = EXCLUDED.fuente_archivo,
      updated_at = now()
    RETURNING id INTO prod_id;

    INSERT INTO public.almacen_refacciones_codigos (producto_id, codigo, tipo)
    VALUES (prod_id, v_codigo_nuevo, 'nuevo')
    ON CONFLICT (codigo) DO UPDATE SET
      producto_id = EXCLUDED.producto_id,
      tipo = 'nuevo';
    codigos_count := codigos_count + 1;

    IF v_codigo_antiguo IS NOT NULL AND v_codigo_antiguo <> v_codigo_nuevo THEN
      -- No sobrescribe un código que ya es "nuevo" canónico de otro producto.
      INSERT INTO public.almacen_refacciones_codigos (producto_id, codigo, tipo)
      VALUES (prod_id, v_codigo_antiguo, 'antiguo')
      ON CONFLICT (codigo) DO UPDATE SET
        producto_id = EXCLUDED.producto_id,
        tipo = 'antiguo'
      WHERE public.almacen_refacciones_codigos.tipo <> 'nuevo';
      codigos_count := codigos_count + 1;
    END IF;

    DELETE FROM public.almacen_refacciones_producto_compat WHERE producto_id = prod_id;

    compat := item->'compatibilidades';
    IF compat IS NOT NULL AND jsonb_typeof(compat) = 'array' THEN
      FOR unidad_txt IN
        SELECT nullif(trim(value), '')
        FROM jsonb_array_elements_text(compat) AS t(value)
      LOOP
        IF unidad_txt IS NULL THEN CONTINUE; END IF;
        unidad_norm := lower(regexp_replace(unidad_txt, '\s+', ' ', 'g'));

        INSERT INTO public.almacen_refacciones_unidades (nombre, nombre_normalizado, tipo_unidad, marca_familia)
        VALUES (
          unidad_txt,
          unidad_norm,
          nullif(trim(item->>'tipo_unidad_sugerido'), ''),
          nullif(trim(item->>'marca'), '')
        )
        ON CONFLICT (nombre_normalizado) DO UPDATE SET
          nombre = EXCLUDED.nombre;

        SELECT id INTO unidad_id
        FROM public.almacen_refacciones_unidades
        WHERE nombre_normalizado = unidad_norm;

        INSERT INTO public.almacen_refacciones_producto_compat (producto_id, unidad_id, texto_origen)
        VALUES (prod_id, unidad_id, unidad_txt)
        ON CONFLICT DO NOTHING;
        compat_count := compat_count + 1;
      END LOOP;
    END IF;

    procesados := procesados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'procesados', procesados,
    'codigos', codigos_count,
    'compatibilidades', compat_count
  );
END;
$$;
