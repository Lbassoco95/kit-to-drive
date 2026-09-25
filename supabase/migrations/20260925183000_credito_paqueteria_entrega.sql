-- ============================================================================
-- Crédito: logística registra la paquetería con fecha estimada y confirma
-- la entrega para que Comercial le avise al cliente
-- Fecha: 2026-09-25
--
-- Qué estaba pasando
-- ------------------
-- El tipo de pago sólo era anticipado o contra entrega. En contra entrega,
-- logística espera el pago. En crédito no: su trabajo es decir CUÁNDO le
-- llega la mercancía al cliente.
--
-- Qué queda
-- ---------
--  1. `remisiones.tipo_pago` acepta `credito`. No frena la entrega por pago.
--  2. Al registrar la paquetería se guarda la paquetería, la guía y la fecha
--     estimada, y la unidad pasa a EN_RUTA.
--  3. Cuando logística confirma que ya se entregó, la unidad queda ENTREGADA
--     y se deja un aviso a Comercial para que le notifique al cliente.
--
-- ADVERTENCIA: idempotente, para el SQL editor de Supabase. NO usar
-- `supabase db push`.
-- ============================================================================

DO $preflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.remisiones') IS NULL THEN _faltan := _faltan || 'tabla remisiones'::text; END IF;
  IF to_regclass('public.motocarros') IS NULL THEN _faltan := _faltan || 'tabla motocarros'::text; END IF;
  IF to_regclass('public.avisos')     IS NULL THEN _faltan := _faltan || 'tabla avisos (corre antes 20260903000001_avisos_entre_areas.sql)'::text; END IF;
  IF to_regclass('public.clientes')   IS NULL THEN _faltan := _faltan || 'tabla clientes'::text; END IF;
  IF to_regprocedure('public.es_area(uuid,public.user_area)') IS NULL THEN
    _faltan := _faltan || 'es_area()'::text;
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    _faltan := _faltan || 'has_role()'::text;
  END IF;

  IF array_length(_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'No se modificó nada. Falta: %.', array_to_string(_faltan, ' | ');
  END IF;
END $preflight$;


-- ============================================================================
-- BLOQUE 1 · Crédito como tipo de pago
-- ============================================================================

DO $tipo_pago$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'remisiones'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%tipo_pago%'
  LOOP
    EXECUTE format('ALTER TABLE public.remisiones DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.remisiones
    ADD CONSTRAINT remisiones_tipo_pago_check
    CHECK (tipo_pago IN ('anticipado', 'contra_entrega', 'credito'));
END $tipo_pago$;

COMMENT ON CONSTRAINT remisiones_tipo_pago_check ON public.remisiones IS
  'anticipado: ya pagó. contra_entrega: logística espera el pago. credito: logística confirma cuándo llega la mercancía y avisa al entregar.';


-- ============================================================================
-- BLOQUE 2 · Datos de la paquetería en la unidad
-- ============================================================================

ALTER TABLE public.motocarros
  ADD COLUMN IF NOT EXISTS paqueteria text,
  ADD COLUMN IF NOT EXISTS numero_guia text,
  ADD COLUMN IF NOT EXISTS paqueteria_registrada_at timestamptz,
  ADD COLUMN IF NOT EXISTS paqueteria_registrada_por uuid,
  ADD COLUMN IF NOT EXISTS cliente_avisado_at timestamptz;

COMMENT ON COLUMN public.motocarros.paqueteria IS
  'Paquetería con la que salió la unidad (crédito). Se captura junto con la fecha estimada de entrega.';
COMMENT ON COLUMN public.motocarros.numero_guia IS
  'Número de guía de la paquetería, para decírselo al cliente.';
COMMENT ON COLUMN public.motocarros.cliente_avisado_at IS
  'Cuándo se le dejó a Comercial el aviso de que la mercancía ya se entregó, para que notifique al cliente.';


-- ============================================================================
-- BLOQUE 3 · Quién opera entregas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.logistica_puede_entregar(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.usuario_activo(_user_id)
     AND (
       public.es_admin_global(_user_id)
       OR public.es_area(_user_id, 'almacen_logistica'::public.user_area)
       OR public.es_area(_user_id, 'administracion'::public.user_area)
       OR public.es_area(_user_id, 'direccion'::public.user_area)
       OR public.has_role(_user_id, 'admin'::public.app_role)
       OR public.has_role(_user_id, 'logistica'::public.app_role)
     );
$$;

REVOKE EXECUTE ON FUNCTION public.logistica_puede_entregar(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.logistica_puede_entregar(uuid) TO authenticated;


-- ============================================================================
-- BLOQUE 4 · Registrar paquetería + fecha estimada
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_paqueteria(
  _motocarro_id uuid,
  _paqueteria text,
  _numero_guia text,
  _fecha_estimada date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tipo text;
  _estatus text;
  _guia text;
  _nombre text;
BEGIN
  IF NOT public.logistica_puede_entregar(auth.uid()) THEN
    RAISE EXCEPTION 'Solo logística puede registrar la paquetería';
  END IF;

  IF _fecha_estimada IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha estimada de entrega';
  END IF;

  _nombre := NULLIF(btrim(COALESCE(_paqueteria, '')), '');
  IF _nombre IS NULL THEN
    RAISE EXCEPTION 'Escribe la paquetería';
  END IF;

  SELECT r.tipo_pago, m.estatus_entrega::text
    INTO _tipo, _estatus
    FROM public.motocarros m
    JOIN public.remisiones r ON r.id = m.remision_id
   WHERE m.id = _motocarro_id;

  IF _tipo IS NULL THEN
    RAISE EXCEPTION 'La unidad no está en una remisión';
  END IF;
  IF _tipo <> 'credito' THEN
    RAISE EXCEPTION 'La paquetería con fecha estimada es para remisiones a crédito';
  END IF;
  IF _estatus = 'ENTREGADA' THEN
    RAISE EXCEPTION 'Esta unidad ya se entregó';
  END IF;

  _guia := NULLIF(btrim(COALESCE(_numero_guia, '')), '');

  UPDATE public.motocarros
     SET paqueteria = _nombre,
         numero_guia = _guia,
         paqueteria_registrada_at = now(),
         paqueteria_registrada_por = auth.uid(),
         fecha_estimada_entrega = _fecha_estimada,
         estatus_entrega = 'EN_RUTA'::public.estatus_entrega,
         confirmada_logistica_at = now(),
         confirmada_logistica_por = auth.uid()
   WHERE id = _motocarro_id;

  RETURN jsonb_build_object(
    'paqueteria', _nombre,
    'numero_guia', _guia,
    'fecha_estimada_entrega', _fecha_estimada
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_paqueteria(uuid, text, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_paqueteria(uuid, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.registrar_paqueteria(uuid, text, text, date) IS
  'En crédito, logística registra la paquetería y la fecha estimada de entrega. La unidad queda EN_RUTA.';


-- ============================================================================
-- BLOQUE 5 · Confirmar que ya se entregó y avisar a Comercial
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_entrega_credito(_motocarro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.motocarros%ROWTYPE;
  _folio text;
  _vendedor uuid;
  _tipo text;
  _cliente text;
  _telefono text;
  _email text;
  _quien text;
  _titulo text;
  _cuerpo text;
  _contacto jsonb;
BEGIN
  IF NOT public.logistica_puede_entregar(auth.uid()) THEN
    RAISE EXCEPTION 'Solo logística puede confirmar la entrega';
  END IF;

  SELECT m.* INTO _m FROM public.motocarros m WHERE m.id = _motocarro_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la unidad';
  END IF;

  -- to_jsonb para no exigir columnas del expediente (email) si ese script
  -- todavía no se corrió: el aviso sale con el contacto que sí exista.
  SELECT r.folio_remision, r.vendedor_id, r.tipo_pago, to_jsonb(c)
    INTO _folio, _vendedor, _tipo, _contacto
    FROM public.remisiones r
    LEFT JOIN public.clientes c ON c.id = r.cliente_id
   WHERE r.id = _m.remision_id;

  _cliente := COALESCE(
    NULLIF(btrim(_contacto->>'nombre_comercial'), ''),
    NULLIF(btrim(_contacto->>'codigo_erp'), ''),
    NULLIF(btrim(_contacto->>'folio_interno'), ''),
    'el cliente'
  );
  _telefono := NULLIF(btrim(_contacto->>'telefono'), '');
  _email := NULLIF(btrim(_contacto->>'email'), '');

  IF _tipo IS DISTINCT FROM 'credito' THEN
    RAISE EXCEPTION 'Esta confirmación es para remisiones a crédito';
  END IF;
  IF _m.estatus_entrega = 'ENTREGADA' THEN
    RAISE EXCEPTION 'Esta unidad ya se entregó';
  END IF;
  IF _m.paqueteria IS NULL OR _m.fecha_estimada_entrega IS NULL THEN
    RAISE EXCEPTION 'Primero registra la paquetería con la fecha estimada de entrega';
  END IF;

  UPDATE public.motocarros
     SET estatus_entrega = 'ENTREGADA'::public.estatus_entrega,
         fecha_real_entrega = CURRENT_DATE,
         confirmada_logistica_at = COALESCE(confirmada_logistica_at, now()),
         confirmada_logistica_por = COALESCE(confirmada_logistica_por, auth.uid()),
         cliente_avisado_at = now()
   WHERE id = _motocarro_id;

  SELECT COALESCE(p.nombre_completo, 'Logística') INTO _quien
    FROM public.profiles p WHERE p.id = auth.uid();

  _titulo := format('Notifica al cliente: %s ya se entregó', COALESCE(_folio, 'la mercancía'));
  _cuerpo := format(
    'La mercancía de %s ya llegó. Cliente: %s. Paquetería: %s. Guía: %s. Fecha estimada: %s. Entregada: %s. Teléfono: %s. Correo: %s. Avísale al cliente.',
    COALESCE(_folio, 'la remisión'),
    _cliente,
    _m.paqueteria,
    COALESCE(_m.numero_guia, 'sin guía'),
    to_char(_m.fecha_estimada_entrega, 'YYYY-MM-DD'),
    to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    COALESCE(_telefono, 'sin teléfono'),
    COALESCE(_email, 'sin correo')
  );

  INSERT INTO public.avisos (
    area_destino, tipo, titulo, cuerpo, remision_id, folio_remision,
    datos, creado_por, nombre_creador
  ) VALUES (
    'comercial'::public.user_area,
    'entrega_credito',
    _titulo,
    _cuerpo,
    _m.remision_id,
    _folio,
    jsonb_build_object(
      'motocarro_id', _motocarro_id,
      'orden_armado', _m.orden_armado,
      'paqueteria', _m.paqueteria,
      'numero_guia', _m.numero_guia,
      'fecha_estimada_entrega', _m.fecha_estimada_entrega,
      'fecha_real_entrega', CURRENT_DATE,
      'cliente', _cliente,
      'telefono', _telefono,
      'email', _email,
      'vendedor_id', _vendedor
    ),
    auth.uid(),
    _quien
  );

  RETURN jsonb_build_object('entregada', true, 'folio', _folio, 'cliente', _cliente);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_entrega_credito(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirmar_entrega_credito(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirmar_entrega_credito(uuid) IS
  'Logística confirma que la mercancía a crédito ya se entregó y deja un aviso a Comercial para que notifique al cliente.';


-- ============================================================================
-- BLOQUE 6 · Comprobación
-- ============================================================================

DO $postflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'public' AND cl.relname = 'remisiones'
       AND co.conname = 'remisiones_tipo_pago_check'
       AND pg_get_constraintdef(co.oid) LIKE '%credito%'
  ) THEN
    _faltan := _faltan || 'restricción tipo_pago con credito'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'motocarros' AND column_name = 'paqueteria'
  ) THEN
    _faltan := _faltan || 'columna motocarros.paqueteria'::text;
  END IF;

  IF to_regprocedure('public.registrar_paqueteria(uuid,text,text,date)') IS NULL THEN
    _faltan := _faltan || 'registrar_paqueteria()'::text;
  END IF;
  IF to_regprocedure('public.confirmar_entrega_credito(uuid)') IS NULL THEN
    _faltan := _faltan || 'confirmar_entrega_credito()'::text;
  END IF;

  IF array_length(_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'La migración quedó incompleta: %.', array_to_string(_faltan, ' | ');
  END IF;
END $postflight$;
