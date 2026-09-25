-- ============================================================================
-- Avisar cuando vence una visita o reunión del CRM
-- Fecha: 2026-09-25
--
-- Qué se necesita
-- ---------------
-- Al agendar una visita, una reunión o una videollamada, el vendedor tiene
-- que enterarse cuando ya pasó la hora y sigue sin atenderse. En la
-- aplicación lo decide la pantalla (campana y la lista de actividades) con
-- la marca `agendada`. El correo lo manda la función
-- `notificar-citas-vencidas`, y sólo si el vendedor tiene un correo real:
-- `aviso_correo_at` evita mandarlo dos veces. Si se recorre la cita a una
-- hora futura, esa marca se limpia y el correo puede salir otra vez.
--
-- `reunion` entra al CHECK de tipo. La pantalla ya lo ofrece; sin esto el
-- INSERT se rechaza.
--
-- ADVERTENCIA: idempotente, para el SQL editor de Supabase. NO usar
-- `supabase db push`.
-- ============================================================================

DO $preflight$
BEGIN
  IF to_regclass('public.crm_actividades') IS NULL THEN
    RAISE EXCEPTION 'No se modificó nada. Falta la tabla crm_actividades (corre antes 20260714000002_crm_ventas.sql).';
  END IF;
END $preflight$;


-- ============================================================================
-- La cita agendada, y el acuse de que ya se avisó por correo
-- ============================================================================

ALTER TABLE public.crm_actividades
  ADD COLUMN IF NOT EXISTS agendada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aviso_correo_at timestamptz;

COMMENT ON COLUMN public.crm_actividades.agendada IS
  'TRUE si se agendó desde Programar visita o reunión. El aviso de vencida sólo mira estas.';
COMMENT ON COLUMN public.crm_actividades.aviso_correo_at IS
  'Cuándo se mandó el correo de que la cita venció. NULL = todavía no, o el vendedor no tiene correo real.';

-- Las que ya estaban programadas y siguen abiertas también avisan, no sólo
-- las que se capturen después de este script.
UPDATE public.crm_actividades
   SET agendada = true
 WHERE agendada = false
   AND tipo IN ('visita', 'videollamada', 'reunion')
   AND coalesce(estatus, 'programada') = 'programada'
   AND (resultado IS NULL OR btrim(resultado) = '')
   AND fecha_actividad >= now() - interval '14 days';

CREATE INDEX IF NOT EXISTS idx_crm_actividades_citas_agendadas
  ON public.crm_actividades (vendedor_id, fecha_actividad)
  WHERE agendada AND estatus = 'programada';


-- ============================================================================
-- El tipo Reunión, junto con los que la pantalla ya ofrecía
-- ============================================================================

DO $tipos$
DECLARE _fuera text;
BEGIN
  SELECT string_agg(DISTINCT tipo, ', ') INTO _fuera
    FROM public.crm_actividades
   WHERE tipo IS NOT NULL
     AND tipo NOT IN ('visita','llamada','demo','seguimiento','cotizacion',
                      'email','whatsapp','nota','videollamada','otro','reunion');
  IF _fuera IS NOT NULL THEN
    RAISE EXCEPTION 'No se modificó nada. Hay actividades con un tipo que la lista nueva no cubre: %.', _fuera;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.crm_actividades'::regclass
                AND conname  = 'crm_actividades_tipo_check') THEN
    ALTER TABLE public.crm_actividades DROP CONSTRAINT crm_actividades_tipo_check;
  END IF;

  ALTER TABLE public.crm_actividades ADD CONSTRAINT crm_actividades_tipo_check
    CHECK (tipo IN ('visita','llamada','demo','seguimiento','cotizacion',
                    'email','whatsapp','nota','videollamada','otro','reunion'));
END $tipos$;


-- ============================================================================
-- El correo lo sella la función (service_role). Quien edita la cita no puede
-- borrar ese sello a mano; si recorre la fecha al futuro, sí se limpia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_crm_actividades_aviso_correo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.aviso_correo_at IS DISTINCT FROM OLD.aviso_correo_at
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    NEW.aviso_correo_at := OLD.aviso_correo_at;
  END IF;

  IF NEW.fecha_actividad IS DISTINCT FROM OLD.fecha_actividad
     AND NEW.fecha_actividad > now() THEN
    NEW.aviso_correo_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_actividades_aviso_correo ON public.crm_actividades;
CREATE TRIGGER trg_crm_actividades_aviso_correo
  BEFORE UPDATE ON public.crm_actividades
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_actividades_aviso_correo();


-- ============================================================================
-- Postflight
-- ============================================================================

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'crm_actividades' AND column_name = 'agendada'
  ) THEN
    RAISE EXCEPTION 'No quedó crm_actividades.agendada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'crm_actividades' AND column_name = 'aviso_correo_at'
  ) THEN
    RAISE EXCEPTION 'No quedó crm_actividades.aviso_correo_at.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.crm_actividades'::regclass
       AND conname = 'crm_actividades_tipo_check'
       AND pg_get_constraintdef(oid) LIKE '%reunion%'
  ) THEN
    RAISE EXCEPTION 'El CHECK de tipo no acepta reunion.';
  END IF;
END $postflight$;
