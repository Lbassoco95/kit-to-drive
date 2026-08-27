// Acceso a las tablas del módulo financiero.
//
// Vive aparte de `finanzas.ts` a propósito: las reglas de negocio de ese
// archivo son puras y se prueban sin levantar el cliente de Supabase.
import { supabase } from "@/integrations/supabase/client";

/**
 * Las tablas de finanzas todavía no están en el `Database` generado, así que
 * el acceso pasa sin tipar por aquí — un solo punto en lugar de casts sueltos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fdb = supabase as any;
