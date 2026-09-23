-- Compatibilidad genérica / universal (fluidos, aceites, etc.)
ALTER TABLE public.almacen_refacciones_productos
  ADD COLUMN IF NOT EXISTS compat_universal BOOLEAN NOT NULL DEFAULT false;

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
  p.compat_universal,
  p.created_at,
  p.updated_at,
  coalesce(c.num_compat, 0)::INTEGER AS num_compatibilidades,
  (p.compat_universal OR coalesce(c.num_compat, 0) > 0) AS tiene_compatibilidad
FROM public.almacen_refacciones_productos p
LEFT JOIN (
  SELECT producto_id, count(*)::INTEGER AS num_compat
  FROM public.almacen_refacciones_producto_compat
  GROUP BY producto_id
) c ON c.producto_id = p.id;

GRANT SELECT ON public.v_almacen_refacciones TO authenticated;
