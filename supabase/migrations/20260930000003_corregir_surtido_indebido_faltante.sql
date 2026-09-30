-- Corregir partidas que se marcaron Surtida después de reportar faltante/pérdida.
-- El bloqueo de liberar_refaccion_remision evita casos nuevos; esto repara los
-- que ya quedaron mal (p. ej. RF-00001 / 1048RPF-POS-02 con nota "Perdida").
-- Idempotente: si no hay filas que corregir, no hace nada.

DO $$
DECLARE
  v_item public.remision_refaccion_items%ROWTYPE;
  v_qty integer;
  v_folio text;
  v_cliente uuid;
BEGIN
  FOR v_item IN
    SELECT i.*
    FROM public.remision_refaccion_items i
    WHERE i.estatus = 'surtida'
      AND i.cantidad_surtida > 0
      AND i.nota_almacen IS NOT NULL
      AND (
        i.nota_almacen ILIKE '%faltante%'
        OR i.nota_almacen ILIKE '%perdida%'
        OR i.nota_almacen ILIKE '%pérdida%'
      )
    FOR UPDATE
  LOOP
    v_qty := v_item.cantidad_surtida;

    SELECT folio, cliente_id INTO v_folio, v_cliente
    FROM public.remisiones_refacciones
    WHERE id = v_item.remision_id;

    UPDATE public.almacen_refacciones_productos
    SET stock = stock + v_qty
    WHERE id = v_item.producto_id;

    INSERT INTO public.almacen_refacciones_movimientos (
      producto_id, tipo, cantidad, precio_unitario, cliente_id, notas, created_by
    ) VALUES (
      v_item.producto_id, 'ajuste', v_qty, v_item.precio_unitario, v_cliente,
      'Reverso: se había surtido con faltante reportado en remisión ' || coalesce(v_folio, ''),
      NULL
    );

    UPDATE public.remision_refaccion_items
    SET cantidad_bloqueada = cantidad_bloqueada + v_qty,
        cantidad_surtida = 0,
        cantidad_faltante = v_qty,
        estatus = 'faltante'
    WHERE id = v_item.id;

    INSERT INTO public.remision_refaccion_eventos (
      remision_id, item_id, etapa, area, accion, detalle, usuario_id
    ) VALUES (
      v_item.remision_id, v_item.id, 'contingencia', 'ventas', 'reportar_faltante',
      'Corrección: la partida ' || v_item.codigo_nuevo
        || ' se había marcado surtida con faltante/pérdida. Se revirtió el surtido ('
        || v_qty || ') y volvió a contingencia para Ventas.',
      NULL
    );

    PERFORM public.recalcular_etapa_remision_refaccion(v_item.remision_id);
  END LOOP;
END;
$$;

-- Marca para diagnostico_esquema.sql (este script sólo toca datos).
CREATE OR REPLACE FUNCTION public.patch_corregir_surtido_indebido_faltante()
RETURNS void
LANGUAGE sql
IMMUTABLE
AS $$ SELECT NULL $$;

COMMENT ON FUNCTION public.patch_corregir_surtido_indebido_faltante() IS
  'Sentinel 20260930000003: corrige surtidos indebidos tras faltante.';

REVOKE ALL ON FUNCTION public.patch_corregir_surtido_indebido_faltante() FROM PUBLIC;
