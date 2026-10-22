-- ==============================================================================
-- AgriPrice Phase 6 Emergency Quarantine & Rollback Procedure
-- File: docs/emergency-quarantine-phase6.sql
-- Target Engine: PostgreSQL 15+ / Supabase
--
-- PURPOSE:
--  Provides an immediate, non-destructive administrative quarantine protocol
--  to halt Phase 6 operations without data destruction or transaction loss.
--  NEVER execute 'DROP TABLE ... CASCADE'.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: IMMEDIATE PROCEDURAL QUARANTINE (EXECUTION HALT)
-- ------------------------------------------------------------------------------
-- Revokes public and authenticated execution permissions across all 8 Phase 6 RPCs
-- and removes client-level write privileges from integrated tables.

BEGIN;

-- 1.1 Revoke RPC Execution Grants
REVOKE EXECUTE ON FUNCTION public.book_cold_storage_capacity(UUID, NUMERIC, TEXT, DATE, DATE, UUID) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_cold_storage_reservation(UUID, TEXT) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_storage_temperature_telemetry(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.raise_order_dispute(UUID, TEXT, TEXT, JSONB) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_order_dispute(UUID, TEXT, TEXT) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_platform_analytics() FROM authenticated, anon, PUBLIC;

-- 1.2 Revoke Write Privileges from Authenticated Users
REVOKE INSERT, UPDATE ON TABLE public.cold_storage_facilities FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.cold_storage_reservations FROM authenticated;
REVOKE INSERT ON TABLE public.storage_temperature_telemetry FROM authenticated;
REVOKE UPDATE ON TABLE public.user_notifications FROM authenticated;
REVOKE INSERT ON TABLE public.order_disputes FROM authenticated;

COMMIT;

-- ------------------------------------------------------------------------------
-- STEP 2: SOFT-DISABLE STORAGE FACILITY OPERATIONS (ZERO DATA LOSS)
-- ------------------------------------------------------------------------------
-- Marks all cold storage facilities inactive to prevent new reservation bookings.

BEGIN;

UPDATE public.cold_storage_facilities
SET is_active = false
WHERE is_active = true;

COMMIT;

-- ------------------------------------------------------------------------------
-- STEP 3: OPTIONAL TABLE ARCHIVAL (IF FULL SCHEMA v5 REVERSION IS MANDATED)
-- ------------------------------------------------------------------------------
-- Non-destructive rename of Phase 6 tables to preserve audit records.
-- Run ONLY if instructed by the Database Administrator.

/*
BEGIN;

ALTER TABLE IF EXISTS public.order_disputes RENAME TO order_disputes_archived_phase6;
ALTER TABLE IF EXISTS public.user_notifications RENAME TO user_notifications_archived_phase6;
ALTER TABLE IF EXISTS public.storage_temperature_telemetry RENAME TO storage_temperature_telemetry_archived_phase6;
ALTER TABLE IF EXISTS public.cold_storage_reservations RENAME TO cold_storage_reservations_archived_phase6;
ALTER TABLE IF EXISTS public.cold_storage_facilities RENAME TO cold_storage_facilities_archived_phase6;

COMMIT;
*/

-- ------------------------------------------------------------------------------
-- STEP 4: HEALTH VERIFICATION AUDIT
-- ------------------------------------------------------------------------------

SELECT
    c.relname AS table_name,
    c.reltuples::bigint AS estimated_row_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (c.relname IN (
      'cold_storage_facilities',
      'cold_storage_reservations',
      'storage_temperature_telemetry',
      'user_notifications',
      'order_disputes'
  ) OR c.relname LIKE '%_archived_phase6')
ORDER BY c.relname;
