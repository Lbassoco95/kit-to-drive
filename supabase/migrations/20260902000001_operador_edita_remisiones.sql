-- ============================================================================
-- El operador puede corregir y complementar sus remisiones, dejando el motivo
-- Fecha: 2026-09-02
--
-- Qué estaba pasando
-- ------------------
-- Corregir una remisión ya capturada era, en la práctica, cosa del
-- administrador: `remision_items` nunca tuvo política de UPDATE (nadie podía
-- cambiar un renglón) y su DELETE seguía pidiendo el rol legado `admin`, o sea
-- sólo el administrador global. El encabezado sí lo podía editar su dueño
-- (`actualizar remisiones` cae a `vendedor_id = auth.uid()`), pero sin poder
-- tocar los renglones no se podía cambiar un modelo, un color, una cantidad,
-- ni agregar unidades a una remisión pasada — el «complemento» que pide
-- Comercial.
--
-- Qué queda
-- ---------
--  1. `remision_items` gana UPDATE y DELETE con la misma escalera del área:
--     el operador sobre las remisiones que capturó, supervisor y administrador
--     de Comercial sobre las de todo su área, y Dirección sobre todas.
--  2. `remisiones` gana una política de UPDATE por área para el operador dueño,
--     equivalente a la que ya existía por rol legado (así el permiso no depende
--     de que el rol legado siga derivándose bien).
--  3. `remision_items.orden_linea`: a qué línea del pedido pertenece cada
--     renglón. Antes la jerarquía «motocarro + sus servicios» vivía en el orden
--     de inserción, y al editar se desordenaba (una cabina agregada después
--     aparecía colgada de otra unidad). Se rellena para lo ya capturado con el
--     orden en que se insertó.
--  4. `remisiones_bitacora`: quién modificó qué remisión, cuándo y **por qué**.
--     El motivo es obligatorio en la tabla, no sólo en la pantalla.
--
-- Nadie gana acceso fuera de su área, y quien está dado de baja sigue fuera
-- (`usuario_activo` vive dentro de `es_area` y `supervisa_area`).
--
-- ADVERTENCIA: idempotente, para el SQL editor de Supabase. NO usar
-- `supabase db push`.
-- ============================================================================

DO $preflight$
BEGIN
  IF to_regprocedure('public.es_area(uuid,public.user_area)') IS NULL
     OR to_regprocedure('public.supervisa_area(uuid,public.user_area)') IS NULL THEN
    RAISE EXCEPTION 'Faltan los helpers de ÁREA × NIVEL. Corre antes 20260823000005_usuarios_niveles_areas.sql y 20260824000003_usuario_activo_se_aplica.sql. No se modificó nada.';
  END IF;
END $preflight$;


-- ============================================================================
-- BLOQUE 1 · A qué línea del pedido pertenece cada renglón
-- ============================================================================

ALTER TABLE public.remision_items
  ADD COLUMN IF NOT EXISTS orden_linea INTEGER;

COMMENT ON COLUMN public.remision_items.orden_linea IS
  'Línea del pedido a la que pertenece el renglón: el motocarro y sus servicios comparten número. El flete usa 999. NULL en remisiones capturadas antes de 2026-09-02, que se agrupan por posición.';

-- Rellenar lo ya capturado: cada renglón `motocarro` abre línea y los que se
-- insertaron después son suyos, que es exactamente como lo leía la pantalla.
WITH ordenado AS (
  SELECT id, remision_id, tipo_servicio,
         ROW_NUMBER() OVER (PARTITION BY remision_id ORDER BY created_at NULLS FIRST, id) AS pos
    FROM public.remision_items
   WHERE orden_linea IS NULL
), numerado AS (
  SELECT id,
         CASE WHEN tipo_servicio = 'flete' THEN 999
              ELSE COUNT(*) FILTER (WHERE tipo_servicio = 'motocarro')
                     OVER (PARTITION BY remision_id ORDER BY pos) - 1
         END AS linea
    FROM ordenado
)
UPDATE public.remision_items ri
   SET orden_linea = GREATEST(n.linea, 0)
  FROM numerado n
 WHERE ri.id = n.id
   AND ri.orden_linea IS NULL;

CREATE INDEX IF NOT EXISTS idx_remision_items_remision_linea
  ON public.remision_items (remision_id, orden_linea);


-- ============================================================================
-- BLOQUE 2 · Corregir los renglones de una remisión
-- ============================================================================
-- Misma escalera que para capturar (20260825000001): lo suyo el operador, todo
-- lo del área de supervisor para arriba.

DROP POLICY IF EXISTS "remision_items_update" ON public.remision_items;
CREATE POLICY "remision_items_update" ON public.remision_items
  FOR UPDATE TO authenticated USING (
    public.es_area(auth.uid(), 'direccion'::public.user_area)
    OR public.supervisa_area(auth.uid(), 'comercial'::public.user_area)
    OR (public.es_area(auth.uid(), 'comercial'::public.user_area)
        AND EXISTS (SELECT 1 FROM public.remisiones r
                     WHERE r.id = remision_id AND r.vendedor_id = auth.uid()))
  );

-- El DELETE pedía el rol legado `admin`: sólo el administrador global podía
-- quitar un renglón. Quitar una unidad de la remisión que capturaste es parte
-- de corregirla.
DROP POLICY IF EXISTS "remision_items_delete" ON public.remision_items;
CREATE POLICY "remision_items_delete" ON public.remision_items
  FOR DELETE TO authenticated USING (
    public.es_area(auth.uid(), 'direccion'::public.user_area)
    OR public.supervisa_area(auth.uid(), 'comercial'::public.user_area)
    OR (public.es_area(auth.uid(), 'comercial'::public.user_area)
        AND EXISTS (SELECT 1 FROM public.remisiones r
                     WHERE r.id = remision_id AND r.vendedor_id = auth.uid()))
  );


-- ============================================================================
-- BLOQUE 3 · Editar el encabezado de la remisión
-- ============================================================================
-- Ya existían `actualizar remisiones` (por rol legado, incluye al dueño) y
-- `comercial supervisa remisiones` (supervisor para arriba). Falta la del
-- operador escrita por ÁREA, para que su permiso no dependa de que el rol
-- legado se siga derivando.

DROP POLICY IF EXISTS "comercial edita sus remisiones" ON public.remisiones;
CREATE POLICY "comercial edita sus remisiones" ON public.remisiones
  FOR UPDATE TO authenticated USING (
    public.es_area(auth.uid(), 'direccion'::public.user_area)
    OR public.supervisa_area(auth.uid(), 'comercial'::public.user_area)
    OR (public.es_area(auth.uid(), 'comercial'::public.user_area) AND vendedor_id = auth.uid())
  );


-- ============================================================================
-- BLOQUE 4 · Bitácora de modificaciones de remisión
-- ============================================================================
-- El motivo es NOT NULL con un mínimo de 10 caracteres: si la pantalla se
-- brinca el recuadro, la base no acepta el registro. Y el registro se escribe
-- ANTES de aplicar el cambio, así que una modificación sin justificación no
-- llega a guardarse.

CREATE TABLE IF NOT EXISTS public.remisiones_bitacora (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remision_id    UUID NOT NULL REFERENCES public.remisiones(id) ON DELETE CASCADE,
  usuario_id     UUID REFERENCES auth.users(id),
  nombre_usuario TEXT,
  tipo_cambio    TEXT NOT NULL DEFAULT 'edicion',
  motivo         TEXT NOT NULL,
  datos_antes    JSONB,
  datos_despues  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT remisiones_bitacora_motivo_min CHECK (length(btrim(motivo)) >= 10)
);

CREATE INDEX IF NOT EXISTS idx_remisiones_bitacora_remision ON public.remisiones_bitacora (remision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remisiones_bitacora_usuario  ON public.remisiones_bitacora (usuario_id);

ALTER TABLE public.remisiones_bitacora ENABLE ROW LEVEL SECURITY;

-- Se lee junto con la remisión: quien puede ver la remisión ve su historial.
-- El chisme de "quién le movió y por qué" es justo lo que hace que abrir la
-- edición a todo el área no se vuelva un agujero.
DROP POLICY IF EXISTS "leer bitacora de remisiones" ON public.remisiones_bitacora;
CREATE POLICY "leer bitacora de remisiones" ON public.remisiones_bitacora
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.remisiones r WHERE r.id = remision_id)
  );

-- Nadie firma a nombre de otro.
DROP POLICY IF EXISTS "registrar cambio de remision" ON public.remisiones_bitacora;
CREATE POLICY "registrar cambio de remision" ON public.remisiones_bitacora
  FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());

-- La bitácora no se corrige ni se borra: no se crean políticas de UPDATE ni
-- DELETE, así que con RLS activo nadie (fuera del service role) puede tocarla.


-- ============================================================================
-- BLOQUE 5 · Comprobación
-- ============================================================================

DO $postflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='remision_items'
                    AND column_name='orden_linea') THEN
    _faltan := _faltan || 'remision_items.orden_linea'::text; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='remision_items' AND policyname='remision_items_update') THEN
    _faltan := _faltan || 'remision_items_update'::text; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='remision_items' AND policyname='remision_items_delete'
                   AND qual LIKE '%es_area%') THEN
    _faltan := _faltan || 'remision_items_delete (por área)'::text; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='remisiones' AND policyname='comercial edita sus remisiones') THEN
    _faltan := _faltan || 'comercial edita sus remisiones'::text; END IF;

  IF to_regclass('public.remisiones_bitacora') IS NULL THEN
    _faltan := _faltan || 'remisiones_bitacora'::text; END IF;

  IF array_length(_faltan,1) > 0 THEN
    RAISE EXCEPTION E'Quedó incompleto, se revierte:\n  · %', array_to_string(_faltan, E'\n  · ');
  END IF;
  RAISE NOTICE 'Listo: el operador de Comercial corrige y complementa sus remisiones, y cada cambio queda con motivo en remisiones_bitacora.';
END $postflight$;

-- Verificación a ojo — qué puede hacer cada quien sobre los renglones:
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename IN ('remisiones','remision_items','remisiones_bitacora')
--    ORDER BY tablename, cmd, policyname;
--
-- Y el historial de una remisión:
--   SELECT b.created_at, b.nombre_usuario, b.tipo_cambio, b.motivo
--     FROM public.remisiones_bitacora b
--     JOIN public.remisiones r ON r.id = b.remision_id
--    WHERE r.folio_remision = 'REM-012'
--    ORDER BY b.created_at DESC;
