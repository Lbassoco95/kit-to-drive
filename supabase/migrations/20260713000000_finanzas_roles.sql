-- ============================================================
-- Sprint Finanzas — roles (parte 1 de 2)
-- 2026-07-13
-- ------------------------------------------------------------
-- IMPORTANTE: los ALTER TYPE ... ADD VALUE deben vivir en su
-- propia migración/transacción. Postgres NO permite usar un
-- valor de enum recién agregado dentro de la misma transacción
-- (error: "unsafe use of new value of enum type"). El resto del
-- módulo (que ya usa estos valores en policies) va en
-- 20260713000001_finanzas_module.sql, que corre después.
-- ============================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'finanzas';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin_financiero';
