-- Descripción limpia (sin lista COMPATIBLE) + original del Excel aparte
ALTER TABLE public.almacen_refacciones_productos
  ADD COLUMN IF NOT EXISTS descripcion_original TEXT;

UPDATE public.almacen_refacciones_productos
SET descripcion_original = descripcion
WHERE descripcion_original IS NULL;

-- Donde ya hay corta parseada, la descripción visible queda sencilla
UPDATE public.almacen_refacciones_productos
SET descripcion = descripcion_corta
WHERE descripcion_corta IS NOT NULL
  AND nullif(trim(descripcion_corta), '') IS NOT NULL
  AND descripcion IS DISTINCT FROM descripcion_corta;

-- Al sincronizar compat, también limpia la descripción visible
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

    UPDATE public.almacen_refacciones_productos
    SET
      descripcion_original = coalesce(descripcion_original, descripcion),
      descripcion_corta = coalesce(v_corta, descripcion_corta),
      descripcion = coalesce(v_corta, descripcion_corta, descripcion),
      updated_at = now()
    WHERE id = prod_id;

    DELETE FROM public.almacen_refacciones_producto_compat WHERE producto_id = prod_id;

    IF item->'compatibilidades' IS NOT NULL AND jsonb_typeof(item->'compatibilidades') = 'array' THEN
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

  RETURN jsonb_build_object('procesados', procesados, 'compatibilidades', links);
END;
$$;

-- Vista: descripción ya limpia (DROP primero: CREATE OR REPLACE no puede insertar columnas a mitad)
DROP VIEW IF EXISTS public.v_almacen_refacciones;
CREATE VIEW public.v_almacen_refacciones
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.codigo_nuevo,
  p.codigo_antiguo,
  p.clave_completa,
  p.clave_simplificada,
  p.linea_catalogo,
  p.marca,
  p.categoria,
  p.descripcion,
  p.descripcion_corta,
  p.descripcion_original,
  p.unidad_medida,
  p.piezas_por_caja,
  p.precio,
  p.stock,
  p.visible_venta,
  p.no_lista,
  p.fuente_archivo,
  p.created_at,
  p.updated_at,
  coalesce(c.num_compat, 0)::INTEGER AS num_compatibilidades
FROM public.almacen_refacciones_productos p
LEFT JOIN (
  SELECT producto_id, count(*)::INTEGER AS num_compat
  FROM public.almacen_refacciones_producto_compat
  GROUP BY producto_id
) c ON c.producto_id = p.id;

-- Importación futura: descripción limpia + original del Excel
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
  v_desc TEXT;
  v_corta TEXT;
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
    IF v_codigo_nuevo IS NULL THEN CONTINUE; END IF;
    v_codigo_antiguo := nullif(trim(item->>'codigo_antiguo'), '');
    v_clave := coalesce(nullif(trim(item->>'clave_completa'), ''), v_codigo_nuevo);
    v_desc := coalesce(nullif(trim(item->>'descripcion'), ''), v_codigo_nuevo);
    v_corta := coalesce(nullif(trim(item->>'descripcion_corta'), ''), v_desc);

    INSERT INTO public.almacen_refacciones_productos (
      codigo_nuevo, codigo_antiguo, clave_completa, clave_simplificada,
      linea_catalogo, marca, categoria,
      descripcion, descripcion_corta, descripcion_original,
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
      v_corta,
      v_corta,
      v_desc,
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
      descripcion_original = coalesce(public.almacen_refacciones_productos.descripcion_original, EXCLUDED.descripcion_original),
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
    ON CONFLICT (codigo) DO UPDATE SET producto_id = EXCLUDED.producto_id, tipo = 'nuevo';
    codigos_count := codigos_count + 1;

    IF v_codigo_antiguo IS NOT NULL AND v_codigo_antiguo <> v_codigo_nuevo THEN
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
        SELECT nullif(trim(value), '') FROM jsonb_array_elements_text(compat) AS t(value)
      LOOP
        IF unidad_txt IS NULL THEN CONTINUE; END IF;
        unidad_norm := lower(regexp_replace(unidad_txt, '\s+', ' ', 'g'));
        INSERT INTO public.almacen_refacciones_unidades (nombre, nombre_normalizado, tipo_unidad, marca_familia)
        VALUES (unidad_txt, unidad_norm, nullif(trim(item->>'tipo_unidad_sugerido'), ''), nullif(trim(item->>'marca'), ''))
        ON CONFLICT (nombre_normalizado) DO UPDATE SET nombre = EXCLUDED.nombre;
        SELECT id INTO unidad_id FROM public.almacen_refacciones_unidades WHERE nombre_normalizado = unidad_norm;
        INSERT INTO public.almacen_refacciones_producto_compat (producto_id, unidad_id, texto_origen)
        VALUES (prod_id, unidad_id, unidad_txt) ON CONFLICT DO NOTHING;
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
