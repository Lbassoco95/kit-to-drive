-- ============================================================================
-- KIT-4d · Deshacer una configuración equivocada — sólo admin
--
-- Fábrica se puede equivocar al capturar la pareja chasis + motor. Hasta ahora
-- "liberar unidad" lo podía hacer fábrica y sólo si la unidad seguía en
-- PENDIENTE, así que un error detectado después quedaba atorado. Ahora:
--   · lo hace SÓLO un admin (operación) — la corrección de un error de captura
--     no es una acción de piso;
--   · se puede deshacer aunque la unidad ya haya avanzado a EN_PROCESO,
--     ARMADO o LISTO, siempre que no esté comprometida con un cliente;
--   · se registra el motivo con su tipo ('equivocacion' es el caso normal), y
--     queda una bitácora con los datos de la unidad borrada — porque al
--     deshacer, la fila de motocarros desaparece y con ella su historia.
--
-- Fecha: 2026-08-24
--
-- ADVERTENCIA: idempotente, para el SQL editor de Supabase. NO usar
-- `supabase db push`.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 · Bitácora de configuraciones deshechas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bitacora_configuracion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Snapshot de la unidad que se deshizo: la fila de motocarros ya no existe.
  orden_armado    integer,
  modelo          text,
  color           text,
  ns_chasis       text,
  ns_motor        text,
  estatus_armado  text,
  contenedor_id   uuid,
  fecha_armado    date,
  tipo            text NOT NULL CHECK (tipo IN ('equivocacion','cambio_plan','otro')),
  motivo          text NOT NULL,
  actor           uuid REFERENCES auth.users(id),
  creado_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_config_fecha ON public.bitacora_configuracion (creado_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_config_chasis ON public.bitacora_configuracion (ns_chasis);

ALTER TABLE public.bitacora_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados leen bitacora_configuracion" ON public.bitacora_configuracion;
CREATE POLICY "autenticados leen bitacora_configuracion" ON public.bitacora_configuracion
  FOR SELECT TO authenticated USING (true);
-- Sólo escribe la RPC (SECURITY DEFINER).


-- ============================================================================
-- BLOQUE 2 · Deshacer la configuración
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deshacer_configuracion(
  _motocarro_id uuid, _motivo text, _tipo text DEFAULT 'equivocacion')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _m record; _chasis_ids uuid[]; _ns_ch text; _ns_mo text;
BEGIN
  -- Sólo admin: deshacer borra la unidad y devuelve las piezas al pool.
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Sólo un administrador puede deshacer la configuración de una unidad';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo (mínimo 5 caracteres)';
  END IF;
  IF _tipo IS NULL OR _tipo NOT IN ('equivocacion','cambio_plan','otro') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _tipo;
  END IF;

  SELECT * INTO _m FROM motocarros WHERE id = _motocarro_id;
  IF _m IS NULL THEN RAISE EXCEPTION 'Unidad no encontrada'; END IF;

  -- Comprometida con un cliente: primero hay que sacarla de la remisión, si no
  -- la remisión se quedaría contando una unidad que ya no existe.
  IF _m.remision_id IS NOT NULL THEN
    RAISE EXCEPTION 'La unidad #% está asignada a una remisión: quítala de la remisión antes de deshacer la configuración',
      _m.orden_armado;
  END IF;
  IF _m.estatus_entrega = 'ENTREGADA' THEN
    RAISE EXCEPTION 'La unidad #% ya fue entregada; no se puede deshacer', _m.orden_armado;
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO _chasis_ids
    FROM inventario_chasis WHERE motocarro_id = _motocarro_id;

  SELECT numero_chasis INTO _ns_ch FROM inventario_chasis WHERE motocarro_id = _motocarro_id LIMIT 1;
  SELECT numero_motor  INTO _ns_mo FROM inventario_motor  WHERE motocarro_id = _motocarro_id LIMIT 1;

  -- La bitácora se escribe ANTES del DELETE: es lo único que va a quedar.
  INSERT INTO bitacora_configuracion (
    orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado,
    contenedor_id, fecha_armado, tipo, motivo, actor)
  VALUES (
    _m.orden_armado, _m.modelo, _m.color,
    COALESCE(_ns_ch, _m.ns_chasis), COALESCE(_ns_mo, _m.ns_motor),
    _m.estatus_armado::text, _m.contenedor_id, _m.fecha_real_armado,
    _tipo, trim(_motivo), auth.uid());

  UPDATE inventario_chasis SET motocarro_id = NULL, fecha_configuracion = NULL
   WHERE motocarro_id = _motocarro_id;
  UPDATE inventario_motor  SET motocarro_id = NULL, estatus = 'disponible',
         fecha_configuracion = NULL WHERE motocarro_id = _motocarro_id;

  DELETE FROM motocarros WHERE id = _motocarro_id;

  -- Reponer el estatus que le toca a cada chasis según sus incidencias: uno con
  -- garantía abierta no debe volver a 'disponible' nada más porque se deshizo
  -- la unidad.
  IF array_length(_chasis_ids,1) IS NOT NULL THEN
    PERFORM public._sincronizar_estatus_chasis(cid) FROM unnest(_chasis_ids) AS cid;
  END IF;

  UPDATE contenedores c SET total_unidades =
    (SELECT count(*) FROM inventario_chasis ic
      WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
  WHERE c.id = _m.contenedor_id;

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'orden_armado', _m.orden_armado,
    'tipo', _tipo, 'ns_chasis', COALESCE(_ns_ch, _m.ns_chasis),
    'ns_motor', COALESCE(_ns_mo, _m.ns_motor),
    'piezas_liberadas', array_length(_chasis_ids,1));
END; $$;

GRANT EXECUTE ON FUNCTION public.deshacer_configuracion(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.deshacer_configuracion(uuid, text, text) IS
  'Deshace la configuración de una unidad (error de captura). Sólo admin. '
  'Devuelve chasis y motor al inventario y deja el registro en '
  'bitacora_configuracion. No aplica a unidades remisionadas o entregadas.';


-- ============================================================================
-- BLOQUE 3 · La vieja "liberar unidad" queda como envoltura, también admin
-- ============================================================================
-- Antes la podía usar fábrica y sólo en PENDIENTE. Se mantiene la firma para
-- no romper llamadas, pero ahora delega y hereda la regla de admin.

CREATE OR REPLACE FUNCTION public.desconfigurar_unidad(_motocarro_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r jsonb;
BEGIN
  _r := public.deshacer_configuracion(_motocarro_id, _motivo, 'otro');
  RETURN jsonb_build_object('ok', true, 'liberada', _r->'orden_armado');
END; $$;

GRANT EXECUTE ON FUNCTION public.desconfigurar_unidad(uuid, text) TO authenticated;
