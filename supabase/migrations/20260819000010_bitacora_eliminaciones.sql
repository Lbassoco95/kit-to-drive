-- Re-ejecutable: el SQL editor manda el archivo completo en UNA transacción,
-- así que una sentencia que falla por «already exists» revierte todo el resto.
-- Correrlo dos veces tiene que ser inocuo.

-- Table for audit log of deleted records
CREATE TABLE IF NOT EXISTS public.bitacora_eliminaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL,
  registro_id UUID NOT NULL,
  eliminado_por UUID REFERENCES auth.users(id),
  nombre_usuario TEXT,
  motivo TEXT NOT NULL,
  datos_eliminados JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bitacora_eliminaciones ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Lectura y escritura abiertas (`USING (true)`) dejaban el JSON de lo borrado
-- a cualquier sesión. Aquí queda en el rol legado admin, que ya existe cuando
-- corre este archivo. 20260923000001 lo amplía a cualquier administrador de
-- área: si se vuelve a pegar ESTE archivo, hay que volver a pegar aquel.
DROP POLICY IF EXISTS "solo admin lee bitacora" ON public.bitacora_eliminaciones;
CREATE POLICY "solo admin lee bitacora" ON public.bitacora_eliminaciones 
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "sistema escribe bitacora" ON public.bitacora_eliminaciones;
CREATE POLICY "sistema escribe bitacora" ON public.bitacora_eliminaciones 
  FOR INSERT TO authenticated WITH CHECK (
    eliminado_por = auth.uid() AND public.has_role(auth.uid(), 'admin')
  );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bitacora_eliminaciones_tabla ON public.bitacora_eliminaciones(tabla);
CREATE INDEX IF NOT EXISTS idx_bitacora_eliminaciones_registro_id ON public.bitacora_eliminaciones(registro_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_eliminaciones_eliminado_por ON public.bitacora_eliminaciones(eliminado_por);
CREATE INDEX IF NOT EXISTS idx_bitacora_eliminaciones_created_at ON public.bitacora_eliminaciones(created_at);
