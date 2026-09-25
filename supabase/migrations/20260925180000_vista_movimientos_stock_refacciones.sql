-- ============================================================================
-- Vista de movimientos de stock de refacciones
-- ----------------------------------------------------------------------------
-- Cada liberación/ajuste de remisión ya escribe en
-- almacen_refacciones_movimientos (quién recibió, cuánto bajó). Esta vista
-- junta producto + cliente para que el inventario muestre el historial:
-- a quién se envió y cómo va disminuyendo el stock.
-- Idempotente. Pensado para el SQL editor de Supabase.
-- ============================================================================

DO $preflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.almacen_refacciones_movimientos') IS NULL THEN
    _faltan := _faltan || 'tabla almacen_refacciones_movimientos'::text;
  END IF;
  IF to_regclass('public.almacen_refacciones_productos') IS NULL THEN
    _faltan := _faltan || 'tabla almacen_refacciones_productos'::text;
  END IF;
  IF to_regclass('public.clientes') IS NULL THEN
    _faltan := _faltan || 'tabla clientes'::text;
  END IF;
  IF array_length(_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'No se modificó nada. Falta: %', array_to_string(_faltan, ' | ');
  END IF;
END $preflight$;

CREATE OR REPLACE VIEW public.v_almacen_refacciones_movimientos
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.producto_id,
  m.tipo,
  m.cantidad,
  m.precio_unitario,
  m.unidad_compatible_id,
  m.cliente_id,
  m.notas,
  m.created_by,
  m.created_at,
  p.codigo_nuevo,
  p.codigo_antiguo,
  p.descripcion,
  p.descripcion_corta,
  p.stock AS stock_actual,
  p.linea_catalogo,
  c.nombre_comercial AS cliente_nombre,
  c.codigo_erp AS cliente_codigo_erp,
  c.folio_interno AS cliente_folio_interno,
  coalesce(nullif(trim(c.nombre_comercial), ''), c.codigo_erp, c.folio_interno, '—') AS cliente_etiqueta
FROM public.almacen_refacciones_movimientos m
JOIN public.almacen_refacciones_productos p ON p.id = m.producto_id
LEFT JOIN public.clientes c ON c.id = m.cliente_id;

GRANT SELECT ON public.v_almacen_refacciones_movimientos TO authenticated;

COMMENT ON VIEW public.v_almacen_refacciones_movimientos IS
  'Kardex de refacciones: salidas/ajustes con cliente y stock actual del producto.';

NOTIFY pgrst, 'reload schema';
