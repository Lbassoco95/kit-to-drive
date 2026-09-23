-- Foto y características del producto + bucket de imágenes
ALTER TABLE public.almacen_refacciones_productos
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS caracteristicas TEXT;

-- Vista con foto / características / original
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
  p.caracteristicas,
  p.foto_url,
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

GRANT SELECT ON public.v_almacen_refacciones TO authenticated;

-- Storage: fotos del catálogo (público para verlas en la ficha)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'refacciones-fotos',
  'refacciones-fotos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ref_fotos_leer" ON storage.objects;
CREATE POLICY "ref_fotos_leer"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'refacciones-fotos');

DROP POLICY IF EXISTS "ref_fotos_leer_anon" ON storage.objects;
CREATE POLICY "ref_fotos_leer_anon"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'refacciones-fotos');

DROP POLICY IF EXISTS "ref_fotos_subir" ON storage.objects;
CREATE POLICY "ref_fotos_subir"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'refacciones-fotos'
  AND public.puede_ver_almacen_refacciones()
);

DROP POLICY IF EXISTS "ref_fotos_actualizar" ON storage.objects;
CREATE POLICY "ref_fotos_actualizar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'refacciones-fotos'
  AND public.puede_ver_almacen_refacciones()
)
WITH CHECK (
  bucket_id = 'refacciones-fotos'
  AND public.puede_ver_almacen_refacciones()
);

DROP POLICY IF EXISTS "ref_fotos_borrar" ON storage.objects;
CREATE POLICY "ref_fotos_borrar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'refacciones-fotos'
  AND public.puede_ver_almacen_refacciones()
);
