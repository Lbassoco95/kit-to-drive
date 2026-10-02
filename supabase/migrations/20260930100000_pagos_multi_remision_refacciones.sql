-- ============================================================================
-- Pagos multi-remisión de refacciones
-- ----------------------------------------------------------------------------
-- Extiende remisiones_refacciones: cotización → remisión final, montos,
-- pago que aplica a N remisiones del mismo cliente, conciliación Finanzas
-- (comprobante en remisiones-docs) y depósito Compras.
--
-- Idempotente. Pensado para el SQL editor de Supabase, no para db push.
-- ============================================================================

DO $preflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.remisiones_refacciones') IS NULL THEN
    _faltan := _faltan || 'tabla remisiones_refacciones'::text;
  END IF;
  IF to_regprocedure('public.puede_marcar_pago_refacciones(uuid)') IS NULL THEN
    _faltan := _faltan || 'funcion puede_marcar_pago_refacciones'::text;
  END IF;
  IF to_regprocedure('public.puede_leer_remision_refaccion(uuid,uuid)') IS NULL THEN
    _faltan := _faltan || 'funcion puede_leer_remision_refaccion'::text;
  END IF;
  IF to_regprocedure('public.es_compras(uuid)') IS NULL THEN
    _faltan := _faltan || 'funcion es_compras'::text;
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    _faltan := _faltan || 'funcion set_updated_at'::text;
  END IF;
  IF array_length(_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'No se modificó nada. Falta: %', array_to_string(_faltan, ' | ');
  END IF;
END $preflight$;

-- ── Columnas en remisión ────────────────────────────────────────────────────
ALTER TABLE public.remisiones_refacciones
  ADD COLUMN IF NOT EXISTS naturaleza TEXT NOT NULL DEFAULT 'cotizacion',
  ADD COLUMN IF NOT EXISTS monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'sin_pago',
  ADD COLUMN IF NOT EXISTS confirmada_almacen_at TIMESTAMPTZ;

ALTER TABLE public.remisiones_refacciones DROP CONSTRAINT IF EXISTS remisiones_refacciones_naturaleza_check;
ALTER TABLE public.remisiones_refacciones
  ADD CONSTRAINT remisiones_refacciones_naturaleza_check
  CHECK (naturaleza IN ('cotizacion', 'remision_final'));

ALTER TABLE public.remisiones_refacciones DROP CONSTRAINT IF EXISTS remisiones_refacciones_estado_pago_check;
ALTER TABLE public.remisiones_refacciones
  ADD CONSTRAINT remisiones_refacciones_estado_pago_check
  CHECK (estado_pago IN ('sin_pago', 'parcial', 'pagado'));

ALTER TABLE public.remisiones_refacciones DROP CONSTRAINT IF EXISTS remisiones_refacciones_monto_pagado_check;
ALTER TABLE public.remisiones_refacciones
  ADD CONSTRAINT remisiones_refacciones_monto_pagado_check
  CHECK (monto_pagado >= 0);

ALTER TABLE public.remisiones_refacciones DROP CONSTRAINT IF EXISTS remisiones_refacciones_monto_total_check;
ALTER TABLE public.remisiones_refacciones
  ADD CONSTRAINT remisiones_refacciones_monto_total_check
  CHECK (monto_total >= 0);

-- Eventos: área compras
ALTER TABLE public.remision_refaccion_eventos DROP CONSTRAINT IF EXISTS remision_refaccion_eventos_area_check;
ALTER TABLE public.remision_refaccion_eventos
  ADD CONSTRAINT remision_refaccion_eventos_area_check
  CHECK (area IN ('ventas', 'almacen', 'logistica', 'finanzas', 'compras'));

-- Área actual: compras (solo informativo en cabecera de pago; remisión no cambia)
ALTER TABLE public.remisiones_refacciones DROP CONSTRAINT IF EXISTS remisiones_refacciones_area_actual_check;
ALTER TABLE public.remisiones_refacciones
  ADD CONSTRAINT remisiones_refacciones_area_actual_check
  CHECK (area_actual IN ('ventas', 'almacen', 'logistica', 'finanzas', 'compras'));

-- ── Tablas de pago ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_refacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total > 0),
  forma_pago TEXT NOT NULL CHECK (forma_pago IN ('efectivo', 'transferencia')),
  referencia TEXT,
  comprobante_path TEXT,
  estado TEXT NOT NULL DEFAULT 'registrado'
    CHECK (estado IN ('registrado', 'conciliado', 'con_deposito', 'anulado')),
  nota TEXT,
  conciliado_at TIMESTAMPTZ,
  conciliado_por UUID REFERENCES public.profiles(id),
  nota_conciliacion TEXT,
  deposito_folio TEXT,
  deposito_modalidad TEXT,
  deposito_nota TEXT,
  deposito_at TIMESTAMPTZ,
  deposito_por UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pagos_refacciones_folio_unico UNIQUE (folio)
);

CREATE INDEX IF NOT EXISTS idx_pagos_ref_cliente
  ON public.pagos_refacciones (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_ref_estado
  ON public.pagos_refacciones (estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pago_refaccion_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id UUID NOT NULL REFERENCES public.pagos_refacciones(id) ON DELETE CASCADE,
  remision_id UUID NOT NULL REFERENCES public.remisiones_refacciones(id),
  monto_aplicado NUMERIC(12, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT pago_ref_aplicacion_unica UNIQUE (pago_id, remision_id)
);

CREATE INDEX IF NOT EXISTS idx_pago_ref_apl_remision
  ON public.pago_refaccion_aplicaciones (remision_id);
CREATE INDEX IF NOT EXISTS idx_pago_ref_apl_pago
  ON public.pago_refaccion_aplicaciones (pago_id);

DROP TRIGGER IF EXISTS trg_pagos_ref_updated ON public.pagos_refacciones;
CREATE TRIGGER trg_pagos_ref_updated
  BEFORE UPDATE ON public.pagos_refacciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Helpers de monto ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.importe_linea_refaccion(
  _precio NUMERIC,
  _cantidad INTEGER,
  _desc_pieza NUMERIC,
  _desc_general NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    GREATEST(0, coalesce(_precio, 0))
      * GREATEST(0, coalesce(_cantidad, 0))
      * (1 - LEAST(100, GREATEST(0, coalesce(_desc_pieza, 0))) / 100.0)
      * (1 - LEAST(100, GREATEST(0, coalesce(_desc_general, 0))) / 100.0)
  , 2);
$$;

CREATE OR REPLACE FUNCTION public.recalcular_montos_remision_refaccion(_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nat text;
  v_desc numeric;
  v_total numeric := 0;
  v_pagado numeric;
  v_estado text;
  v_pagado_flag boolean;
BEGIN
  SELECT naturaleza, descuento_pct, monto_pagado
    INTO v_nat, v_desc, v_pagado
  FROM public.remisiones_refacciones
  WHERE id = _id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT coalesce(sum(
    public.importe_linea_refaccion(
      i.precio_unitario,
      CASE
        WHEN v_nat = 'remision_final' THEN i.cantidad_surtida
        WHEN i.estatus = 'cancelada' THEN i.cantidad_surtida
        WHEN i.estatus = 'sin_existencia' THEN i.cantidad_surtida
        ELSE i.cantidad
      END,
      i.descuento_pct,
      v_desc
    )
  ), 0)
  INTO v_total
  FROM public.remision_refaccion_items i
  WHERE i.remision_id = _id;

  v_pagado := coalesce(v_pagado, 0);
  IF v_pagado <= 0 THEN
    v_estado := 'sin_pago';
    v_pagado_flag := false;
  ELSIF v_total > 0 AND v_pagado + 0.009 >= v_total THEN
    v_estado := 'pagado';
    v_pagado_flag := true;
  ELSE
    v_estado := 'parcial';
    v_pagado_flag := false;
  END IF;

  UPDATE public.remisiones_refacciones
  SET monto_total = v_total,
      estado_pago = v_estado,
      pagado = v_pagado_flag,
      pagado_at = CASE WHEN v_pagado_flag THEN coalesce(pagado_at, now()) ELSE NULL END
  WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_monto_pagado_remision(_remision_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
BEGIN
  SELECT coalesce(sum(a.monto_aplicado), 0)
    INTO v_sum
  FROM public.pago_refaccion_aplicaciones a
  JOIN public.pagos_refacciones p ON p.id = a.pago_id
  WHERE a.remision_id = _remision_id
    AND p.estado <> 'anulado';

  UPDATE public.remisiones_refacciones
  SET monto_pagado = v_sum
  WHERE id = _remision_id;

  PERFORM public.recalcular_montos_remision_refaccion(_remision_id);
END;
$$;

REVOKE ALL ON FUNCTION public.importe_linea_refaccion(NUMERIC, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importe_linea_refaccion(NUMERIC, INTEGER, NUMERIC, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.recalcular_montos_remision_refaccion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_montos_remision_refaccion(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_monto_pagado_remision(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_monto_pagado_remision(UUID) TO authenticated;

-- Backfill montos de remisiones existentes
DO $backfill$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.remisiones_refacciones LOOP
    -- Si ya hay piezas surtidas, es remisión final
    IF EXISTS (
      SELECT 1 FROM public.remision_refaccion_items i
      WHERE i.remision_id = r.id AND i.cantidad_surtida > 0
    ) THEN
      UPDATE public.remisiones_refacciones
      SET naturaleza = 'remision_final',
          confirmada_almacen_at = coalesce(confirmada_almacen_at, lista_logistica_at, updated_at, now())
      WHERE id = r.id AND naturaleza = 'cotizacion';
    END IF;
    PERFORM public.recalcular_montos_remision_refaccion(r.id);
    -- Respeta flag histórico pagado sin aplicaciones
    UPDATE public.remisiones_refacciones
    SET monto_pagado = monto_total,
        estado_pago = 'pagado'
    WHERE id = r.id
      AND pagado = true
      AND monto_pagado = 0
      AND monto_total > 0;
  END LOOP;
END $backfill$;

-- ── Marcar remisión final al liberar ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_remision_final_si_surtida(_remision_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.remisiones_refacciones
  SET naturaleza = 'remision_final',
      confirmada_almacen_at = coalesce(confirmada_almacen_at, now())
  WHERE id = _remision_id
    AND naturaleza = 'cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.remision_refaccion_items i
      WHERE i.remision_id = _remision_id AND i.cantidad_surtida > 0
    );
  PERFORM public.recalcular_montos_remision_refaccion(_remision_id);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_remision_final_si_surtida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_remision_final_si_surtida(UUID) TO authenticated;

-- Parchea liberar_refaccion_remision para marcar remisión final + montos.
-- Se redefine envolviendo la lógica existente vía AFTER hook en recalcular.
CREATE OR REPLACE FUNCTION public.recalcular_etapa_remision_refaccion(_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _abierta boolean;
  _hay_faltante boolean;
  _hay_surtida boolean;
  _hay_sin boolean;
  _etapa text;
  _area text;
  _entregada timestamptz;
BEGIN
  SELECT entregada_at INTO _entregada
  FROM public.remisiones_refacciones WHERE id = _id;

  SELECT
    bool_or(estatus IN ('bloqueada', 'faltante')),
    bool_or(estatus = 'faltante'),
    bool_or(cantidad_surtida > 0),
    bool_or(estatus = 'sin_existencia')
  INTO _abierta, _hay_faltante, _hay_surtida, _hay_sin
  FROM public.remision_refaccion_items
  WHERE remision_id = _id;

  IF NOT FOUND OR _abierta IS NULL THEN
    _etapa := 'cancelada';
    _area := 'ventas';
    _abierta := false;
  ELSIF _entregada IS NOT NULL THEN
    _etapa := 'entregada';
    _area := 'logistica';
    _abierta := false;
  ELSIF _abierta AND _hay_faltante THEN
    _etapa := 'contingencia';
    _area := 'almacen';
  ELSIF _abierta THEN
    _etapa := 'almacen';
    _area := 'almacen';
  ELSIF _hay_surtida THEN
    _etapa := 'logistica';
    _area := 'logistica';
    _abierta := false;
  ELSIF _hay_sin THEN
    _etapa := 'contingencia';
    _area := 'almacen';
    _abierta := false;
  ELSE
    _etapa := 'cancelada';
    _area := 'ventas';
    _abierta := false;
  END IF;

  UPDATE public.remisiones_refacciones
  SET etapa = _etapa,
      area_actual = _area,
      abierta = coalesce(_abierta, false),
      lista_logistica_at = CASE
        WHEN _etapa = 'logistica' THEN coalesce(lista_logistica_at, now())
        ELSE lista_logistica_at
      END
  WHERE id = _id;

  PERFORM public.marcar_remision_final_si_surtida(_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_etapa_remision_refaccion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_etapa_remision_refaccion(UUID) TO authenticated;

-- Recalcula montos cuando cambian partidas (alta inicial o surtido)
CREATE OR REPLACE FUNCTION public._trg_rem_ref_item_montos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rem uuid;
BEGIN
  v_rem := coalesce(NEW.remision_id, OLD.remision_id);
  IF v_rem IS NOT NULL THEN
    PERFORM public.recalcular_montos_remision_refaccion(v_rem);
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rem_ref_montos_insert ON public.remisiones_refacciones;
DROP TRIGGER IF EXISTS trg_rem_ref_item_montos ON public.remision_refaccion_items;
CREATE TRIGGER trg_rem_ref_item_montos
  AFTER INSERT OR UPDATE OF cantidad, cantidad_surtida, cantidad_bloqueada, precio_unitario, descuento_pct, estatus
  OR DELETE ON public.remision_refaccion_items
  FOR EACH ROW EXECUTE FUNCTION public._trg_rem_ref_item_montos();

-- ── Lectura / permisos pagos ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.puede_leer_pago_refacciones(
  _pago_id UUID,
  _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente uuid;
BEGIN
  IF _user_id IS NULL OR _pago_id IS NULL THEN RETURN false; END IF;
  IF public.puede_marcar_pago_refacciones(_user_id) THEN RETURN true; END IF;
  IF public.es_compras(_user_id) THEN RETURN true; END IF;
  IF public.rol_comercial(_user_id) IN ('global', 'supervisor') THEN RETURN true; END IF;

  SELECT cliente_id INTO v_cliente FROM public.pagos_refacciones WHERE id = _pago_id;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.remisiones_refacciones r
    WHERE r.cliente_id = v_cliente
      AND public.puede_leer_remision_refaccion(r.id, _user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.puede_leer_pago_refacciones(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_leer_pago_refacciones(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_registrar_deposito_refacciones(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.es_compras(_user_id) OR public.rol_comercial(_user_id) = 'global';
$$;

REVOKE ALL ON FUNCTION public.puede_registrar_deposito_refacciones(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_registrar_deposito_refacciones(UUID) TO authenticated;

-- Extiende lectura de remisión para compras
CREATE OR REPLACE FUNCTION public.puede_leer_remision_refaccion(
  _remision_id UUID,
  _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rol text;
  _area text;
  _vendedor uuid;
  _creador uuid;
BEGIN
  IF _user_id IS NULL OR _remision_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.activo = false) THEN
    RETURN false;
  END IF;

  SELECT r.vendedor_id, r.created_by INTO _vendedor, _creador
  FROM public.remisiones_refacciones r
  WHERE r.id = _remision_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.puede_ver_almacen_refacciones(_user_id) THEN RETURN true; END IF;
  IF public.puede_marcar_pago_refacciones(_user_id) THEN RETURN true; END IF;
  IF public.es_compras(_user_id) THEN RETURN true; END IF;

  _rol := public.rol_comercial(_user_id);
  IF _rol IN ('global', 'supervisor') THEN RETURN true; END IF;
  IF _rol = 'operador' AND (_vendedor = _user_id OR _creador = _user_id) THEN RETURN true; END IF;

  SELECT ur.area::text INTO _area
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  LIMIT 1;
  RETURN _area IN ('direccion', 'administracion', 'almacen_logistica', 'compras');
END;
$$;

-- ── RPC: registrar pago multi-remisión ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_pago_refacciones(
  _cliente_id UUID,
  _monto_total NUMERIC,
  _forma_pago TEXT,
  _referencia TEXT,
  _nota TEXT,
  _comprobante_path TEXT,
  _aplicaciones JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago_id UUID;
  v_folio TEXT;
  v_seq INTEGER;
  v_item JSONB;
  v_rem_id UUID;
  v_monto NUMERIC;
  v_cliente_rem UUID;
  v_saldo NUMERIC;
  v_suma NUMERIC := 0;
  v_etapa TEXT;
BEGIN
  IF NOT public.puede_marcar_pago_refacciones() THEN
    RAISE EXCEPTION 'Sólo finanzas puede registrar un pago de refacciones';
  END IF;
  IF _cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = _cliente_id) THEN
    RAISE EXCEPTION 'Selecciona un cliente';
  END IF;
  IF _monto_total IS NULL OR _monto_total <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;
  IF _forma_pago IS NULL OR _forma_pago NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'La forma de pago es efectivo o transferencia';
  END IF;
  IF _aplicaciones IS NULL OR jsonb_typeof(_aplicaciones) <> 'array' OR jsonb_array_length(_aplicaciones) = 0 THEN
    RAISE EXCEPTION 'Aplica el pago al menos a una remisión';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pagos_refacciones')::bigint);
  SELECT coalesce(max((regexp_match(folio, '^PRF-(\d+)$'))[1]::int), 0) + 1
    INTO v_seq
  FROM public.pagos_refacciones;
  v_folio := 'PRF-' || lpad(v_seq::text, 5, '0');

  -- Pre-valida aplicaciones y suma
  FOR v_item IN SELECT value FROM jsonb_array_elements(_aplicaciones)
  LOOP
    BEGIN
      v_rem_id := (v_item->>'remision_id')::uuid;
      v_monto := (v_item->>'monto')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Aplicación inválida';
    END;
    IF v_rem_id IS NULL OR v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'Cada aplicación necesita remisión y monto > 0';
    END IF;

    SELECT cliente_id, etapa, GREATEST(monto_total - monto_pagado, 0)
      INTO v_cliente_rem, v_etapa, v_saldo
    FROM public.remisiones_refacciones
    WHERE id = v_rem_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró una remisión de la aplicación';
    END IF;
    IF v_cliente_rem <> _cliente_id THEN
      RAISE EXCEPTION 'Todas las remisiones deben ser del mismo cliente del pago';
    END IF;
    IF v_etapa = 'cancelada' THEN
      RAISE EXCEPTION 'No se puede aplicar pago a una remisión cancelada';
    END IF;
    IF v_monto > v_saldo + 0.009 THEN
      RAISE EXCEPTION 'El monto aplicado (%) supera el saldo pendiente (%) de la remisión', v_monto, v_saldo;
    END IF;
    v_suma := v_suma + v_monto;
  END LOOP;

  IF v_suma > _monto_total + 0.009 THEN
    RAISE EXCEPTION 'La suma aplicada (%) supera el monto del pago (%)', v_suma, _monto_total;
  END IF;

  INSERT INTO public.pagos_refacciones (
    folio, cliente_id, monto_total, forma_pago, referencia, comprobante_path,
    estado, nota, created_by
  ) VALUES (
    v_folio, _cliente_id, round(_monto_total, 2), _forma_pago,
    nullif(trim(_referencia), ''), nullif(trim(_comprobante_path), ''),
    'registrado', nullif(trim(_nota), ''), auth.uid()
  )
  RETURNING id INTO v_pago_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_aplicaciones)
  LOOP
    v_rem_id := (v_item->>'remision_id')::uuid;
    v_monto := round((v_item->>'monto')::numeric, 2);
    INSERT INTO public.pago_refaccion_aplicaciones (pago_id, remision_id, monto_aplicado, created_by)
    VALUES (v_pago_id, v_rem_id, v_monto, auth.uid());
    PERFORM public.sincronizar_monto_pagado_remision(v_rem_id);
    INSERT INTO public.remision_refaccion_eventos (remision_id, etapa, area, accion, detalle, usuario_id)
    SELECT v_rem_id, r.etapa, 'finanzas', 'aplicar_pago',
           'Pago ' || v_folio || ' aplicó $' || v_monto::text || '.',
           auth.uid()
    FROM public.remisiones_refacciones r WHERE r.id = v_rem_id;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_pago_id,
    'folio', v_folio,
    'disponible', round(_monto_total - v_suma, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_refacciones(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_refacciones(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ── Conciliar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conciliar_pago_refacciones(
  _pago_id UUID,
  _nota TEXT,
  _comprobante_path TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pagos_refacciones%ROWTYPE;
  v_path text;
BEGIN
  IF NOT public.puede_marcar_pago_refacciones() THEN
    RAISE EXCEPTION 'Sólo finanzas puede conciliar un pago';
  END IF;
  IF nullif(trim(_nota), '') IS NULL OR char_length(trim(_nota)) < 3 THEN
    RAISE EXCEPTION 'Anota cómo se verificó el pago (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_row FROM public.pagos_refacciones WHERE id = _pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el pago'; END IF;
  IF v_row.estado = 'anulado' THEN RAISE EXCEPTION 'Un pago anulado no se concilia'; END IF;
  IF v_row.estado IN ('conciliado', 'con_deposito') THEN
    RAISE EXCEPTION 'Este pago ya está conciliado';
  END IF;

  v_path := coalesce(nullif(trim(_comprobante_path), ''), v_row.comprobante_path);
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'Sube el comprobante (transferencia) o el vale de cobro (efectivo) antes de conciliar';
  END IF;

  UPDATE public.pagos_refacciones
  SET estado = 'conciliado',
      comprobante_path = v_path,
      conciliado_at = now(),
      conciliado_por = auth.uid(),
      nota_conciliacion = trim(_nota)
  WHERE id = _pago_id;

  INSERT INTO public.remision_refaccion_eventos (remision_id, etapa, area, accion, detalle, usuario_id)
  SELECT a.remision_id, r.etapa, 'finanzas', 'conciliar_pago',
         'Pago ' || v_row.folio || ' conciliado. ' || trim(_nota),
         auth.uid()
  FROM public.pago_refaccion_aplicaciones a
  JOIN public.remisiones_refacciones r ON r.id = a.remision_id
  WHERE a.pago_id = _pago_id;
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_pago_refacciones(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conciliar_pago_refacciones(UUID, TEXT, TEXT) TO authenticated;

-- ── Depósito Compras ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_deposito_pago_refacciones(
  _pago_id UUID,
  _folio_recibo TEXT,
  _modalidad TEXT,
  _nota TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pagos_refacciones%ROWTYPE;
BEGIN
  IF NOT public.puede_registrar_deposito_refacciones() THEN
    RAISE EXCEPTION 'Sólo compras puede registrar el depósito';
  END IF;
  IF nullif(trim(_folio_recibo), '') IS NULL OR char_length(trim(_folio_recibo)) < 2 THEN
    RAISE EXCEPTION 'Indica el folio del recibo/depósito';
  END IF;
  IF nullif(trim(_modalidad), '') IS NULL OR char_length(trim(_modalidad)) < 3 THEN
    RAISE EXCEPTION 'Indica la modalidad confirmada al cliente (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_row FROM public.pagos_refacciones WHERE id = _pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el pago'; END IF;
  IF v_row.estado <> 'conciliado' THEN
    RAISE EXCEPTION 'Sólo se registra depósito sobre un pago ya conciliado por finanzas';
  END IF;

  UPDATE public.pagos_refacciones
  SET estado = 'con_deposito',
      deposito_folio = trim(_folio_recibo),
      deposito_modalidad = trim(_modalidad),
      deposito_nota = nullif(trim(_nota), ''),
      deposito_at = now(),
      deposito_por = auth.uid()
  WHERE id = _pago_id;

  INSERT INTO public.remision_refaccion_eventos (remision_id, etapa, area, accion, detalle, usuario_id)
  SELECT a.remision_id, r.etapa, 'compras', 'registrar_deposito',
         'Depósito ' || trim(_folio_recibo) || ' · ' || trim(_modalidad)
           || coalesce('. ' || nullif(trim(_nota), ''), ''),
         auth.uid()
  FROM public.pago_refaccion_aplicaciones a
  JOIN public.remisiones_refacciones r ON r.id = a.remision_id
  WHERE a.pago_id = _pago_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_deposito_pago_refacciones(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_deposito_pago_refacciones(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Compat: marcar_pago_remision_refaccion sigue existiendo; sincroniza montos
CREATE OR REPLACE FUNCTION public.marcar_pago_remision_refaccion(
  _remision_id UUID,
  _pagado BOOLEAN,
  _nota TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.remisiones_refacciones%ROWTYPE;
BEGIN
  IF NOT public.puede_marcar_pago_refacciones() THEN
    RAISE EXCEPTION 'Sólo finanzas puede marcar el pago';
  END IF;
  IF coalesce(_pagado, false) AND (nullif(trim(_nota), '') IS NULL OR char_length(trim(_nota)) < 3) THEN
    RAISE EXCEPTION 'Anota cómo se verificó el pago (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_row FROM public.remisiones_refacciones WHERE id = _remision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la remisión'; END IF;
  IF v_row.etapa = 'cancelada' THEN
    RAISE EXCEPTION 'Una remisión cancelada no se marca como pagada';
  END IF;

  -- Si hay aplicaciones reales, no permitir el atajo boolean
  IF EXISTS (
    SELECT 1 FROM public.pago_refaccion_aplicaciones a
    JOIN public.pagos_refacciones p ON p.id = a.pago_id
    WHERE a.remision_id = _remision_id AND p.estado <> 'anulado'
  ) THEN
    RAISE EXCEPTION 'Esta remisión tiene pagos aplicados. Usa el flujo de pagos multi-remisión.';
  END IF;

  UPDATE public.remisiones_refacciones
  SET pagado = coalesce(_pagado, false),
      pagado_at = CASE WHEN coalesce(_pagado, false) THEN now() ELSE NULL END,
      pagado_por = CASE WHEN coalesce(_pagado, false) THEN auth.uid() ELSE NULL END,
      nota_pago = nullif(trim(_nota), ''),
      monto_pagado = CASE WHEN coalesce(_pagado, false) THEN monto_total ELSE 0 END,
      estado_pago = CASE
        WHEN coalesce(_pagado, false) AND monto_total > 0 THEN 'pagado'
        WHEN coalesce(_pagado, false) THEN 'pagado'
        ELSE 'sin_pago'
      END
  WHERE id = _remision_id;

  INSERT INTO public.remision_refaccion_eventos (remision_id, etapa, area, accion, detalle, usuario_id)
  VALUES (
    _remision_id, v_row.etapa, 'finanzas',
    CASE WHEN coalesce(_pagado, false) THEN 'marcar_pagado' ELSE 'marcar_no_pagado' END,
    CASE WHEN coalesce(_pagado, false)
      THEN 'Finanzas verificó el pago. ' || coalesce(trim(_nota), '')
      ELSE 'Finanzas dejó la remisión como no pagada. ' || coalesce(trim(_nota), '')
    END,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_pago_remision_refaccion(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_pago_remision_refaccion(UUID, BOOLEAN, TEXT) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.pagos_refacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_refaccion_aplicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer pagos refacciones" ON public.pagos_refacciones;
CREATE POLICY "leer pagos refacciones"
  ON public.pagos_refacciones
  FOR SELECT TO authenticated
  USING (public.puede_leer_pago_refacciones(id));

DROP POLICY IF EXISTS "leer aplicaciones pago refacciones" ON public.pago_refaccion_aplicaciones;
CREATE POLICY "leer aplicaciones pago refacciones"
  ON public.pago_refaccion_aplicaciones
  FOR SELECT TO authenticated
  USING (public.puede_leer_pago_refacciones(pago_id));

GRANT SELECT ON public.pagos_refacciones TO authenticated;
GRANT SELECT ON public.pago_refaccion_aplicaciones TO authenticated;

-- Storage: lectura de comprobantes de pagos-refacciones para finanzas/compras
DROP POLICY IF EXISTS "leer comprobantes pagos refacciones" ON storage.objects;
CREATE POLICY "leer comprobantes pagos refacciones" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'remisiones-docs'
    AND (storage.foldername(name))[1] = 'pagos-refacciones'
    AND (
      public.puede_marcar_pago_refacciones(auth.uid())
      OR public.es_compras(auth.uid())
      OR public.rol_comercial(auth.uid()) = 'global'
      OR public.es_area(auth.uid(), 'direccion'::public.user_area)
    )
  );

DROP POLICY IF EXISTS "subir comprobantes pagos refacciones" ON storage.objects;
CREATE POLICY "subir comprobantes pagos refacciones" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'remisiones-docs'
    AND (storage.foldername(name))[1] = 'pagos-refacciones'
    AND public.puede_marcar_pago_refacciones(auth.uid())
  );

DROP POLICY IF EXISTS "actualizar comprobantes pagos refacciones" ON storage.objects;
CREATE POLICY "actualizar comprobantes pagos refacciones" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'remisiones-docs'
    AND (storage.foldername(name))[1] = 'pagos-refacciones'
    AND public.puede_marcar_pago_refacciones(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
