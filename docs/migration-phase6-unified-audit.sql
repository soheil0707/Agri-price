-- ==============================================================================
-- AGRIPRICE PHASE 6.2: REMEDIATED UNIFIED AUDIT & INTEGRATION MIGRATION CANDIDATE
-- File: docs/migration-phase6-unified-audit.sql
-- Module: Complete Supply Chain Integration (Storage, Disputes, Alerts, Analytics)
-- Target Engine: PostgreSQL 15+ / Supabase
-- Version: v6.2.0-remediated-audit-candidate
--
-- STATUS: REMEDIATED MIGRATION CANDIDATE (DO NOT EXECUTE AUTOMATICALLY)
-- In accordance with Phase 6 security boundaries, this file is prepared for manual
-- review by the database administrator. DO NOT run against production or live Supabase
-- without staging verification.
--
-- REMEDIATION CHANGELOG (Phase 6.2 SQL Remediation & Staging Hardening):
-- 1. PostgreSQL Syntax Hardening:
--    Fixed invalid schema-qualified GREATEST, COALESCE, and CURRENT_DATE expressions.
--    In PostgreSQL, CURRENT_DATE is a syntactic standard keyword that cannot be qualified with pg_catalog.
--    Fixed RAISE EXCEPTION format specifiers in record_storage_temperature_telemetry to prevent parameter mismatch.
-- 2. State-Aware, Idempotent Dispute Refund & Inventory Restoration:
--    Eliminated invalid reference to non-existent produce_listings.available_quantity_kg (which is a computed view column).
--    Enforces state-awareness via pre_dispute_escrow_status so inventory is restored consistently with locked_quantity_kg
--    and idempotently protected against repeat cancellation/refund operations.
-- 3. Original Escrow State Preservation & Restoration on Dismissal:
--    Added pre_dispute_escrow_status column and metadata capture during raise_order_dispute.
--    Dismissing a dispute accurately restores the exact verified pre-dispute escrow milestone without guesswork.
-- 4. Complete Emergency Quarantine Procedure:
--    Introduced callable administrative stored procedure public.emergency_quarantine_phase6() and complete
--    standalone recovery protocol covering all 8 Phase 6 RPCs and write grants.
-- 5. Comprehensive Schema Drift Reconciliation:
--    Explicit ALTER TABLE ... ADD COLUMN IF NOT EXISTS statements for cold_storage_facilities,
--    cold_storage_reservations, storage_temperature_telemetry, user_notifications, order_disputes,
--    and simulated_payment_events to resolve schema drift across all prior hotfix states.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PRECONDITION CHECKS
-- ==============================================================================

DO $$
BEGIN
    -- Check 1: PostgreSQL 15+
    IF current_setting('server_version_num')::integer < 150000 THEN
        RAISE EXCEPTION 'Precondition Failed: PostgreSQL 15+ is required. Found version: %',
            current_setting('server_version');
    END IF;

    -- Check 2: Core Schema v5 Baseline Installed
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'user_roles') OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'produce_listings') OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'reservations_orders') OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'simulated_payment_events') THEN
        RAISE EXCEPTION 'Precondition Failed: Baseline schema v5 is not fully installed. Required tables: profiles, user_roles, produce_listings, reservations_orders, simulated_payment_events.';
    END IF;

    -- Check 3: Identity & Role Helper Functions Exist
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname = 'get_current_profile_id') OR
       NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname = 'is_admin') THEN
        RAISE EXCEPTION 'Precondition Failed: Required helper functions get_current_profile_id() or is_admin() missing from schema v5.';
    END IF;
END $$;

-- ==============================================================================
-- 1. ROLE ENUM UNIFICATION
-- ==============================================================================

-- Add missing supply chain persona roles to user_role_type idempotently
ALTER TYPE public.user_role_type ADD VALUE IF NOT EXISTS 'cold_storage';
ALTER TYPE public.user_role_type ADD VALUE IF NOT EXISTS 'retailer';
ALTER TYPE public.user_role_type ADD VALUE IF NOT EXISTS 'consumer';

-- ==============================================================================
-- 2. COLD-STORAGE HUB & LOGISTICS (PHASE 3 INTEGRATION)
-- ==============================================================================

-- 2.1 Table: public.cold_storage_facilities
CREATE TABLE IF NOT EXISTS public.cold_storage_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    facility_name TEXT NOT NULL CHECK (length(trim(facility_name)) >= 3),
    license_number TEXT UNIQUE NOT NULL CHECK (length(trim(license_number)) >= 5),
    state TEXT NOT NULL CHECK (length(trim(state)) >= 2),
    district TEXT NOT NULL CHECK (length(trim(district)) >= 2),
    pincode TEXT NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    facility_address TEXT NOT NULL,
    total_capacity_mt NUMERIC NOT NULL CHECK (total_capacity_mt > 0),
    reserved_capacity_mt NUMERIC NOT NULL CHECK (reserved_capacity_mt >= 0 AND reserved_capacity_mt <= total_capacity_mt) DEFAULT 0,
    chamber_count INTEGER NOT NULL CHECK (chamber_count >= 1) DEFAULT 1,
    temperature_range TEXT NOT NULL DEFAULT '0°C to 15°C',
    daily_rate_per_quintal NUMERIC NOT NULL CHECK (daily_rate_per_quintal > 0),
    suitable_commodities TEXT[] NOT NULL DEFAULT ARRAY['Tomato', 'Potato', 'Onion', 'Grapes', 'Capsicum'],
    certifications TEXT[] NOT NULL DEFAULT ARRAY['WDRA Registered', 'FSSAI Certified'],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.2 Table: public.cold_storage_reservations
CREATE TABLE IF NOT EXISTS public.cold_storage_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id) ON DELETE RESTRICT,
    depositor_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    linked_order_id UUID REFERENCES public.reservations_orders(id) ON DELETE SET NULL,
    linked_listing_id UUID REFERENCES public.produce_listings(id) ON DELETE SET NULL,
    commodity TEXT NOT NULL CHECK (length(trim(commodity)) >= 2),
    reserved_mt NUMERIC NOT NULL CHECK (reserved_mt > 0),
    daily_rate_per_quintal NUMERIC NOT NULL CHECK (daily_rate_per_quintal > 0),
    total_estimated_cost NUMERIC NOT NULL CHECK (total_estimated_cost >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL CHECK (end_date >= start_date),
    status TEXT NOT NULL CHECK (status IN (
        'pending_confirmation',
        'confirmed',
        'active_stored',
        'discharged',
        'cancelled'
    )) DEFAULT 'confirmed',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    target_chamber_id TEXT,
    check_in_at TIMESTAMPTZ,
    discharged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.3 Table: public.storage_temperature_telemetry
CREATE TABLE IF NOT EXISTS public.storage_temperature_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id) ON DELETE CASCADE,
    chamber_id TEXT NOT NULL,
    temperature_celsius NUMERIC(5, 2) NOT NULL CHECK (temperature_celsius BETWEEN -40.00 AND 60.00),
    humidity_percent NUMERIC(5, 2) NOT NULL CHECK (humidity_percent BETWEEN 0.00 AND 100.00),
    status_label TEXT NOT NULL DEFAULT 'Optimal',
    recorded_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Schema Drift Reconciliation: Ensure all columns exist even if tables pre-existed from earlier hotfixes
ALTER TABLE public.cold_storage_facilities
    ADD COLUMN IF NOT EXISTS chamber_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS temperature_range TEXT NOT NULL DEFAULT '0°C to 15°C',
    ADD COLUMN IF NOT EXISTS suitable_commodities TEXT[] NOT NULL DEFAULT ARRAY['Tomato', 'Potato', 'Onion', 'Grapes', 'Capsicum'],
    ADD COLUMN IF NOT EXISTS certifications TEXT[] NOT NULL DEFAULT ARRAY['WDRA Registered', 'FSSAI Certified'],
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.cold_storage_reservations
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS target_chamber_id TEXT,
    ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS discharged_at TIMESTAMPTZ;

ALTER TABLE public.storage_temperature_telemetry
    ADD COLUMN IF NOT EXISTS status_label TEXT NOT NULL DEFAULT 'Optimal';

-- Indices for Storage Performance & Interval Overlap
CREATE INDEX IF NOT EXISTS idx_cold_storage_facilities_district ON public.cold_storage_facilities (district, state);
CREATE INDEX IF NOT EXISTS idx_cold_storage_facilities_operator ON public.cold_storage_facilities (operator_profile_id);
CREATE INDEX IF NOT EXISTS idx_cold_storage_reservations_depositor ON public.cold_storage_reservations (depositor_profile_id);
CREATE INDEX IF NOT EXISTS idx_cold_storage_reservations_facility_status ON public.cold_storage_reservations (facility_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cold_storage_reservations_order ON public.cold_storage_reservations (linked_order_id);
CREATE INDEX IF NOT EXISTS idx_storage_telemetry_facility_chamber ON public.storage_temperature_telemetry (facility_id, chamber_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.cold_storage_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_storage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_temperature_telemetry ENABLE ROW LEVEL SECURITY;

-- Storage RLS Policies
DROP POLICY IF EXISTS "cold_storage_facilities_select_all" ON public.cold_storage_facilities;
CREATE POLICY "cold_storage_facilities_select_all"
ON public.cold_storage_facilities FOR SELECT TO authenticated, anon
USING (is_active = true);

DROP POLICY IF EXISTS "cold_storage_facilities_modify_operator" ON public.cold_storage_facilities;
CREATE POLICY "cold_storage_facilities_modify_operator"
ON public.cold_storage_facilities FOR ALL TO authenticated
USING (
    operator_profile_id = public.get_current_profile_id() OR public.is_admin()
)
WITH CHECK (
    operator_profile_id = public.get_current_profile_id() OR public.is_admin()
);

DROP POLICY IF EXISTS "cold_storage_reservations_select_participants" ON public.cold_storage_reservations;
CREATE POLICY "cold_storage_reservations_select_participants"
ON public.cold_storage_reservations FOR SELECT TO authenticated
USING (
    depositor_profile_id = public.get_current_profile_id()
    OR EXISTS (
        SELECT 1 FROM public.cold_storage_facilities csf
        WHERE csf.id = cold_storage_reservations.facility_id
          AND csf.operator_profile_id = public.get_current_profile_id()
    )
    OR public.is_admin()
    OR (
        linked_order_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.reservations_orders ro
            WHERE ro.id = cold_storage_reservations.linked_order_id
              AND (ro.buyer_profile_id = public.get_current_profile_id() OR ro.seller_profile_id = public.get_current_profile_id() OR ro.assigned_transporter_id = public.get_current_profile_id())
        )
    )
);

DROP POLICY IF EXISTS "storage_telemetry_select_authorized" ON public.storage_temperature_telemetry;
CREATE POLICY "storage_telemetry_select_authorized"
ON public.storage_temperature_telemetry FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.cold_storage_facilities csf
        WHERE csf.id = storage_temperature_telemetry.facility_id
          AND csf.operator_profile_id = public.get_current_profile_id()
    )
    OR EXISTS (
        SELECT 1 FROM public.cold_storage_reservations csr
        WHERE csr.facility_id = storage_temperature_telemetry.facility_id
          AND csr.depositor_profile_id = public.get_current_profile_id()
          AND csr.status IN ('confirmed', 'active_stored')
    )
    OR public.is_admin()
);

DROP POLICY IF EXISTS "storage_telemetry_insert_operator" ON public.storage_temperature_telemetry;
CREATE POLICY "storage_telemetry_insert_operator"
ON public.storage_temperature_telemetry FOR INSERT TO authenticated
WITH CHECK (
    recorded_by_profile_id = public.get_current_profile_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.cold_storage_facilities csf
            WHERE csf.id = storage_temperature_telemetry.facility_id
              AND csf.operator_profile_id = public.get_current_profile_id()
        )
        OR public.is_admin()
    )
);

-- ==============================================================================
-- 3. NOTIFICATIONS & DISPUTES LEDGER (PHASE 4 INTEGRATION)
-- ==============================================================================

-- 3.1 Table: public.user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('listing', 'offer', 'order', 'payment', 'storage', 'dispute', 'system')),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
    title TEXT NOT NULL CHECK (length(trim(title)) >= 3),
    description TEXT NOT NULL CHECK (length(trim(description)) >= 5),
    action_url_tab TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_unread 
    ON public.user_notifications(recipient_profile_id, is_read, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.user_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.user_notifications FOR SELECT
USING (
    recipient_profile_id = public.get_current_profile_id() OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can update read status on their own notifications" ON public.user_notifications;
CREATE POLICY "Users can update read status on their own notifications"
ON public.user_notifications FOR UPDATE
USING (
    recipient_profile_id = public.get_current_profile_id()
)
WITH CHECK (
    recipient_profile_id = public.get_current_profile_id()
);

-- Guard Trigger: Restrict direct updates strictly to is_read and read_at
CREATE OR REPLACE FUNCTION public.trg_guard_user_notifications_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        IF NEW.id <> OLD.id OR
           NEW.recipient_profile_id <> OLD.recipient_profile_id OR
           NEW.category <> OLD.category OR
           NEW.severity <> OLD.severity OR
           NEW.title <> OLD.title OR
           NEW.description <> OLD.description OR
           NEW.created_at <> OLD.created_at OR
           NEW.action_url_tab IS DISTINCT FROM OLD.action_url_tab OR
           NEW.metadata IS DISTINCT FROM OLD.metadata THEN
            RAISE EXCEPTION 'Security Violation: Users may only update is_read and read_at on notification records.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_notifications_update ON public.user_notifications;
CREATE TRIGGER trg_guard_user_notifications_update
BEFORE UPDATE ON public.user_notifications
FOR EACH ROW
EXECUTE FUNCTION public.trg_guard_user_notifications_update();

-- 3.2 Table: public.order_disputes
CREATE TABLE IF NOT EXISTS public.order_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
    claimant_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    respondent_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    dispute_reason TEXT NOT NULL CHECK (length(trim(dispute_reason)) >= 10),
    evidence_summary TEXT NOT NULL CHECK (length(trim(evidence_summary)) >= 10),
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'under_review' CHECK (
        status IN ('under_review', 'resolved_seller_paid', 'resolved_buyer_refunded', 'resolved_mutual_split', 'dismissed')
    ),
    pre_dispute_escrow_status TEXT CHECK (
        pre_dispute_escrow_status IS NULL OR pre_dispute_escrow_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected')
    ),
    resolution_notes TEXT,
    arbitrated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    filed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Schema Drift Reconciliation: Ensure all columns exist even if tables pre-existed from earlier hotfixes
ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS action_url_tab TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.order_disputes
    ADD COLUMN IF NOT EXISTS pre_dispute_escrow_status TEXT,
    ADD COLUMN IF NOT EXISTS evidence_metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
    ADD COLUMN IF NOT EXISTS arbitrated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'chk_order_disputes_pre_escrow_status'
    ) THEN
        ALTER TABLE public.order_disputes
        ADD CONSTRAINT chk_order_disputes_pre_escrow_status
        CHECK (pre_dispute_escrow_status IS NULL OR pre_dispute_escrow_status IN (
            'awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected'
        ));
    END IF;
END $$;

ALTER TABLE public.simulated_payment_events
    ADD COLUMN IF NOT EXISTS source_account_ref TEXT,
    ADD COLUMN IF NOT EXISTS destination_account_ref TEXT,
    ADD COLUMN IF NOT EXISTS ledger_state TEXT NOT NULL DEFAULT 'SIMULATED_SUCCESS',
    ADD COLUMN IF NOT EXISTS payload_audit JSONB;

CREATE INDEX IF NOT EXISTS idx_order_disputes_order_id ON public.order_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_claimant ON public.order_disputes(claimant_profile_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON public.order_disputes(status);

-- Anti-Duplicate Constraint: Prevent multiple active disputes for the same order
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_disputes_active_order 
ON public.order_disputes(order_id) 
WHERE (status = 'under_review');

ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dispute participants and admins can view disputes" ON public.order_disputes;
CREATE POLICY "Dispute participants and admins can view disputes"
ON public.order_disputes FOR SELECT
USING (
    claimant_profile_id = public.get_current_profile_id()
    OR respondent_profile_id = public.get_current_profile_id()
    OR public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.reservations_orders ro
        WHERE ro.id = order_disputes.order_id
          AND ro.assigned_transporter_id = public.get_current_profile_id()
    )
);

DROP POLICY IF EXISTS "Only platform admins can arbitrate disputes" ON public.order_disputes;
CREATE POLICY "Only platform admins can arbitrate disputes"
ON public.order_disputes FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================================================
-- 4. HARDENED STORED PROCEDURES (SECURITY DEFINER, SET search_path = '')
-- ==============================================================================

-- 4.1 Procedure: public.book_cold_storage_capacity
-- Date-aware capacity validation, commodity compatibility, and linked-order verification.
CREATE OR REPLACE FUNCTION public.book_cold_storage_capacity(
    p_facility_id UUID,
    p_requested_mt NUMERIC,
    p_commodity TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_linked_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_profile_id UUID;
    v_facility RECORD;
    v_order RECORD;
    v_order_commodity TEXT;
    v_peak_existing_mt NUMERIC;
    v_days INTEGER;
    v_estimated_cost NUMERIC;
    v_reservation_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'User profile record not found.' USING ERRCODE = 'P0002';
    END IF;

    IF p_requested_mt <= 0 THEN
        RAISE EXCEPTION 'Requested storage capacity must be strictly greater than 0 MT.' USING ERRCODE = '22023';
    END IF;

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'End date must be greater than or equal to start date.' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.length(trim(p_commodity)) < 2 THEN
        RAISE EXCEPTION 'Valid commodity name is required.' USING ERRCODE = '22023';
    END IF;

    -- Atomically lock facility record to serialize concurrent bookings
    SELECT * INTO v_facility
    FROM public.cold_storage_facilities
    WHERE id = p_facility_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cold storage facility not found or inactive.' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Verify Commodity Compatibility
    IF NOT (pg_catalog.lower(trim(p_commodity)) = ANY(
        SELECT pg_catalog.lower(trim(c)) FROM pg_catalog.unnest(v_facility.suitable_commodities) AS c
    )) THEN
        RAISE EXCEPTION 'Commodity "%" is incompatible with facility "%". Certified commodities: %',
            p_commodity, v_facility.facility_name, pg_catalog.array_to_string(v_facility.suitable_commodities, ', ')
            USING ERRCODE = '22023';
    END IF;

    -- 2. Verify Linked Order Participation & Commodity (if provided)
    IF p_linked_order_id IS NOT NULL THEN
        SELECT * INTO v_order
        FROM public.reservations_orders
        WHERE id = p_linked_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Linked order % not found.', p_linked_order_id USING ERRCODE = 'P0002';
        END IF;

        IF v_order.buyer_profile_id <> v_caller_profile_id AND
           v_order.seller_profile_id <> v_caller_profile_id AND
           COALESCE(v_order.assigned_transporter_id, '00000000-0000-0000-0000-000000000000'::UUID) <> v_caller_profile_id AND
           NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Caller is not a participant (buyer, seller, or transporter) in linked order %.',
                p_linked_order_id USING ERRCODE = '42501';
        END IF;

        -- Verify order commodity matches requested reservation
        SELECT commodity INTO v_order_commodity
        FROM public.produce_listings
        WHERE id = v_order.listing_id;

        IF v_order_commodity IS NOT NULL AND
           pg_catalog.lower(trim(v_order_commodity)) <> pg_catalog.lower(trim(p_commodity)) THEN
            RAISE EXCEPTION 'Commodity mismatch: Reservation commodity "%" does not match linked order commodity "%".',
                p_commodity, v_order_commodity USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 3. Date-Aware Headroom Validation
    -- Calculate the maximum concurrent MT reserved across all active bookings on any day in [p_start_date, p_end_date]
    SELECT COALESCE(pg_catalog.max(daily_usage), 0)
    INTO v_peak_existing_mt
    FROM (
        SELECT d.day::date, COALESCE(pg_catalog.sum(csr.reserved_mt), 0) AS daily_usage
        FROM pg_catalog.generate_series(p_start_date, p_end_date, INTERVAL '1 day') AS d(day)
        LEFT JOIN public.cold_storage_reservations csr
          ON csr.facility_id = p_facility_id
         AND csr.status IN ('confirmed', 'active_stored')
         AND csr.start_date <= d.day::date
         AND csr.end_date >= d.day::date
        GROUP BY d.day::date
    ) daily_series;

    IF v_peak_existing_mt + p_requested_mt > v_facility.total_capacity_mt THEN
        RAISE EXCEPTION 'Insufficient capacity: Requested % MT exceeds facility capacity on peak day. Peak existing: % MT, Facility total: % MT, Available headroom: % MT.',
            p_requested_mt, v_peak_existing_mt, v_facility.total_capacity_mt, (v_facility.total_capacity_mt - v_peak_existing_mt)
            USING ERRCODE = '55P03';
    END IF;

    -- 4. Calculate Duration & Cost (using un-qualified GREATEST keyword)
    v_days := GREATEST(1, (p_end_date - p_start_date) + 1);
    v_estimated_cost := pg_catalog.round(p_requested_mt * 10 * v_facility.daily_rate_per_quintal * v_days, 2);

    -- 5. Insert Confirmed Reservation
    INSERT INTO public.cold_storage_reservations (
        facility_id,
        depositor_profile_id,
        linked_order_id,
        commodity,
        reserved_mt,
        daily_rate_per_quintal,
        total_estimated_cost,
        start_date,
        end_date,
        status
    ) VALUES (
        p_facility_id,
        v_caller_profile_id,
        p_linked_order_id,
        trim(p_commodity),
        p_requested_mt,
        v_facility.daily_rate_per_quintal,
        v_estimated_cost,
        p_start_date,
        p_end_date,
        'confirmed'
    ) RETURNING id INTO v_reservation_id;

    -- 6. Update facility current active capacity snapshot for today
    UPDATE public.cold_storage_facilities
    SET reserved_capacity_mt = (
        SELECT COALESCE(pg_catalog.sum(reserved_mt), 0)
        FROM public.cold_storage_reservations
        WHERE facility_id = p_facility_id
          AND status IN ('confirmed', 'active_stored')
          AND start_date <= CURRENT_DATE
          AND end_date >= CURRENT_DATE
    ),
    updated_at = pg_catalog.now()
    WHERE id = p_facility_id;

    RETURN v_reservation_id;
END;
$$;

-- 4.2 Procedure: public.cancel_cold_storage_reservation
-- Safe, idempotent cancellation with non-underflowing capacity recovery.
CREATE OR REPLACE FUNCTION public.cancel_cold_storage_reservation(
    p_reservation_id UUID,
    p_cancellation_reason TEXT DEFAULT 'Cancelled by depositor'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_res RECORD;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_res
    FROM public.cold_storage_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Authorization Check
    IF v_res.depositor_profile_id <> v_caller_profile_id AND
       NOT EXISTS (
           SELECT 1 FROM public.cold_storage_facilities csf
           WHERE csf.id = v_res.facility_id AND csf.operator_profile_id = v_caller_profile_id
       ) AND
       NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only depositor, operator, or admin can cancel this reservation.' USING ERRCODE = '42501';
    END IF;

    -- Safe Idempotency: Already cancelled reservation returns true without repeating capacity deductions
    IF v_res.status = 'cancelled' THEN
        RETURN TRUE;
    END IF;

    IF v_res.status = 'discharged' THEN
        RAISE EXCEPTION 'Cannot cancel an already discharged storage batch.' USING ERRCODE = '22023';
    END IF;

    -- Apply cancellation
    UPDATE public.cold_storage_reservations
    SET status = 'cancelled',
        cancellation_reason = trim(p_cancellation_reason),
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_reservation_id;

    -- Recalculate facility's current active capacity snapshot
    UPDATE public.cold_storage_facilities
    SET reserved_capacity_mt = (
        SELECT COALESCE(pg_catalog.sum(reserved_mt), 0)
        FROM public.cold_storage_reservations
        WHERE facility_id = v_res.facility_id
          AND status IN ('confirmed', 'active_stored')
          AND start_date <= CURRENT_DATE
          AND end_date >= CURRENT_DATE
    ),
    updated_at = pg_catalog.now()
    WHERE id = v_res.facility_id;

    RETURN TRUE;
END;
$$;

-- 4.3 Procedure: public.record_storage_temperature_telemetry
-- Operator-authorized IoT telemetry logger with sensor bounds validation.
CREATE OR REPLACE FUNCTION public.record_storage_temperature_telemetry(
    p_facility_id UUID,
    p_chamber_id TEXT,
    p_temperature_celsius NUMERIC,
    p_humidity_percent NUMERIC,
    p_status_label TEXT DEFAULT 'Optimal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_telemetry_id UUID;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- Validate caller is operator of facility or platform admin
    IF NOT EXISTS (
        SELECT 1 FROM public.cold_storage_facilities
        WHERE id = p_facility_id AND operator_profile_id = v_caller_profile_id
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the facility operator or admin may log telemetry.' USING ERRCODE = '42501';
    END IF;

    -- Validate sensor ranges
    IF p_temperature_celsius < -40.00 OR p_temperature_celsius > 60.00 THEN
        RAISE EXCEPTION 'Temperature reading %°C is out of allowable range (-40°C to 60°C).', p_temperature_celsius USING ERRCODE = '22023';
    END IF;

    IF p_humidity_percent < 0.00 OR p_humidity_percent > 100.00 THEN
        RAISE EXCEPTION 'Humidity reading % percent is out of allowable range (0 to 100 percent).', p_humidity_percent USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.storage_temperature_telemetry (
        facility_id,
        chamber_id,
        temperature_celsius,
        humidity_percent,
        status_label,
        recorded_by_profile_id
    ) VALUES (
        p_facility_id,
        trim(p_chamber_id),
        p_temperature_celsius,
        p_humidity_percent,
        trim(p_status_label),
        v_caller_profile_id
    ) RETURNING id INTO v_telemetry_id;

    RETURN v_telemetry_id;
END;
$$;

-- 4.4 Procedure: public.raise_order_dispute
-- Locks order into 'disputed' state and prevents duplicate active disputes.
CREATE OR REPLACE FUNCTION public.raise_order_dispute(
    p_order_id UUID,
    p_dispute_reason TEXT,
    p_evidence_summary TEXT,
    p_evidence_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_order RECORD;
    v_respondent_profile_id UUID;
    v_dispute_id UUID;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF pg_catalog.length(trim(p_dispute_reason)) < 10 THEN
        RAISE EXCEPTION 'Dispute reason must be at least 10 characters long.' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.length(trim(p_evidence_summary)) < 10 THEN
        RAISE EXCEPTION 'Evidence summary must be at least 10 characters long.' USING ERRCODE = '22023';
    END IF;

    -- Atomically lock order record
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order reference % not found.', p_order_id USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller is trade participant or admin
    IF v_order.buyer_profile_id = v_caller_profile_id THEN
        v_respondent_profile_id := v_order.seller_profile_id;
    ELSIF v_order.seller_profile_id = v_caller_profile_id THEN
        v_respondent_profile_id := v_order.buyer_profile_id;
    ELSIF v_order.assigned_transporter_id = v_caller_profile_id THEN
        v_respondent_profile_id := v_order.seller_profile_id;
    ELSIF public.is_admin() THEN
        v_respondent_profile_id := v_order.seller_profile_id;
    ELSE
        RAISE EXCEPTION 'Unauthorized: Only buyer, seller, transporter, or admin can dispute Order %.', p_order_id USING ERRCODE = '42501';
    END IF;

    -- Anti-Duplicate Check: Block if an active dispute is already open
    IF EXISTS (
        SELECT 1 FROM public.order_disputes
        WHERE order_id = p_order_id AND status = 'under_review'
    ) THEN
        RAISE EXCEPTION 'An active dispute is already open for Order % under review.', p_order_id USING ERRCODE = '23505';
    END IF;

    -- Verify eligibility (cannot dispute cancelled or settled orders)
    IF v_order.escrow_status NOT IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected') THEN
        RAISE EXCEPTION 'Order status "%" is not eligible for dispute. Only active or delivered orders can be disputed.', v_order.escrow_status USING ERRCODE = '22023';
    END IF;

    -- Record dispute with preserved pre-dispute escrow state
    INSERT INTO public.order_disputes (
        order_id,
        claimant_profile_id,
        respondent_profile_id,
        dispute_reason,
        evidence_summary,
        evidence_metadata,
        status,
        pre_dispute_escrow_status,
        filed_at
    ) VALUES (
        p_order_id,
        v_caller_profile_id,
        v_respondent_profile_id,
        trim(p_dispute_reason),
        trim(p_evidence_summary),
        p_evidence_metadata || pg_catalog.jsonb_build_object('pre_dispute_escrow_status', v_order.escrow_status::text),
        'under_review',
        v_order.escrow_status::text,
        pg_catalog.now()
    ) RETURNING id INTO v_dispute_id;

    -- Freeze escrow state machine
    UPDATE public.reservations_orders
    SET escrow_status = 'disputed'::public.order_status_type,
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Dispatch secure notification to respondent
    INSERT INTO public.user_notifications (
        recipient_profile_id,
        category,
        severity,
        title,
        description,
        action_url_tab,
        metadata
    ) VALUES (
        v_respondent_profile_id,
        'dispute',
        'warning',
        'Commercial Dispute Raised on Order',
        pg_catalog.format('A commercial dispute was filed regarding Order %s.', v_order.id),
        'disputes',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'dispute_id', v_dispute_id)
    );

    RETURN v_dispute_id;
END;
$$;

-- 4.5 Procedure: public.resolve_order_dispute
-- Arbitrates dispute, reconciles order escrow_status, records simulated payment events,
-- and restores listing inventory if buyer refund is granted.
CREATE OR REPLACE FUNCTION public.resolve_order_dispute(
    p_dispute_id UUID,
    p_resolution_status TEXT,
    p_resolution_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_profile_id UUID;
    v_dispute RECORD;
    v_order RECORD;
    v_listing RECORD;
    v_half_amount NUMERIC;
    v_rem_amount NUMERIC;
    v_idempotency_key_seller TEXT;
    v_idempotency_key_buyer TEXT;
    v_payload_hash_seller TEXT;
    v_payload_hash_buyer TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform administrators can arbitrate disputes.' USING ERRCODE = '42501';
    END IF;

    v_admin_profile_id := public.get_current_profile_id();

    IF p_resolution_status NOT IN ('resolved_seller_paid', 'resolved_buyer_refunded', 'resolved_mutual_split', 'dismissed') THEN
        RAISE EXCEPTION 'Invalid resolution status: %. Must be resolved_seller_paid, resolved_buyer_refunded, resolved_mutual_split, or dismissed.', p_resolution_status USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.length(trim(p_resolution_notes)) < 10 THEN
        RAISE EXCEPTION 'Arbitration determination requires documented findings and notes (min 10 characters).' USING ERRCODE = '22023';
    END IF;

    -- Lock dispute record
    SELECT * INTO v_dispute
    FROM public.order_disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id USING ERRCODE = 'P0002';
    END IF;

    IF v_dispute.status != 'under_review' THEN
        RAISE EXCEPTION 'Dispute % already resolved with status "%".', p_dispute_id, v_dispute.status USING ERRCODE = '22023';
    END IF;

    -- Lock linked order record
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked order % not found.', v_dispute.order_id USING ERRCODE = 'P0002';
    END IF;

    -- 1. Apply Order Escrow State Transition & Simulated Payment Ledger Events
    IF p_resolution_status = 'resolved_seller_paid' THEN
        -- Transition order to settled
        UPDATE public.reservations_orders
        SET escrow_status = 'settled',
            updated_at = pg_catalog.now()
        WHERE id = v_order.id;

        -- Record simulated payment event for farmer net proceeds
        v_idempotency_key_seller := pg_catalog.format('dispute-settle-seller-%s', p_dispute_id);
        v_payload_hash_seller := pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.format('order:%s:dispute:%s:settle:seller:%s', v_order.id, p_dispute_id, v_order.total_agreed_amount),
                'UTF8'
            )),
            'hex'
        );

        INSERT INTO public.simulated_payment_events (
            order_id,
            event_type,
            amount,
            currency,
            idempotency_key,
            payload_hash,
            source_account_ref,
            destination_account_ref,
            ledger_state,
            payload_audit
        ) VALUES (
            v_order.id,
            'farmer_proceeds_settled'::public.payment_event_type,
            v_order.total_agreed_amount,
            'INR',
            v_idempotency_key_seller,
            v_payload_hash_seller,
            'ESCROW_HOLD_POOL',
            pg_catalog.format('SELLER_PROFILE_%s', v_order.seller_profile_id),
            'SIMULATED_SUCCESS',
            pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution_status, 'arbitrated_by', v_admin_profile_id)
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

    ELSIF p_resolution_status = 'resolved_buyer_refunded' THEN
        -- 1. State-Aware, Idempotent Order Cancellation & Inventory Restoration
        -- Only transition and release inventory if the order was not already cancelled
        IF v_order.escrow_status <> 'cancelled'::public.order_status_type THEN
            -- Transition order to cancelled
            UPDATE public.reservations_orders
            SET escrow_status = 'cancelled'::public.order_status_type,
                updated_at = pg_catalog.now()
            WHERE id = v_order.id;

            -- State-Aware Inventory Restoration:
            -- If dispute was opened while produce was held in reservation before transit/delivery,
            -- or if physical produce return is verified in evidence metadata, restore listing reservation headroom.
            IF COALESCE(v_dispute.pre_dispute_escrow_status, v_dispute.evidence_metadata->>'pre_dispute_escrow_status') IN ('awaiting_escrow', 'escrow_funded')
               OR (v_dispute.evidence_metadata->>'restock_inventory')::boolean IS TRUE THEN
                
                SELECT * INTO v_listing
                FROM public.produce_listings
                WHERE id = v_order.listing_id
                FOR UPDATE;

                IF FOUND THEN
                    UPDATE public.produce_listings
                    SET reserved_quantity_kg = GREATEST(0::numeric, reserved_quantity_kg - v_order.locked_quantity_kg),
                        status = CASE 
                            WHEN status = 'reserved'::public.listing_status_type THEN 'active'::public.listing_status_type 
                            ELSE status 
                        END,
                        updated_at = pg_catalog.now()
                    WHERE id = v_order.listing_id;
                END IF;
            END IF;
        END IF;

        -- Record simulated refund payment event (idempotent with ON CONFLICT DO NOTHING)
        v_idempotency_key_buyer := pg_catalog.format('dispute-refund-buyer-%s', p_dispute_id);
        v_payload_hash_buyer := pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.format('order:%s:dispute:%s:refund:buyer:%s', v_order.id, p_dispute_id, v_order.total_agreed_amount),
                'UTF8'
            )),
            'hex'
        );

        INSERT INTO public.simulated_payment_events (
            order_id,
            event_type,
            amount,
            currency,
            idempotency_key,
            payload_hash,
            source_account_ref,
            destination_account_ref,
            ledger_state,
            payload_audit
        ) VALUES (
            v_order.id,
            'refund_issued'::public.payment_event_type,
            v_order.total_agreed_amount,
            'INR',
            v_idempotency_key_buyer,
            v_payload_hash_buyer,
            'ESCROW_HOLD_POOL',
            pg_catalog.format('BUYER_PROFILE_%s', v_order.buyer_profile_id),
            'SIMULATED_SUCCESS',
            pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution_status, 'arbitrated_by', v_admin_profile_id)
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

    ELSIF p_resolution_status = 'resolved_mutual_split' THEN
        -- Mutual split: 50% proceeds settled to seller, 50% refunded to buyer
        UPDATE public.reservations_orders
        SET escrow_status = 'settled',
            updated_at = pg_catalog.now()
        WHERE id = v_order.id;

        v_half_amount := pg_catalog.round(v_order.total_agreed_amount / 2.0, 2);
        v_rem_amount := v_order.total_agreed_amount - v_half_amount;

        -- 1. Seller share
        v_idempotency_key_seller := pg_catalog.format('dispute-split-seller-%s', p_dispute_id);
        v_payload_hash_seller := pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.format('order:%s:dispute:%s:split:seller:%s', v_order.id, p_dispute_id, v_half_amount),
                'UTF8'
            )),
            'hex'
        );

        INSERT INTO public.simulated_payment_events (
            order_id,
            event_type,
            amount,
            currency,
            idempotency_key,
            payload_hash,
            source_account_ref,
            destination_account_ref,
            ledger_state,
            payload_audit
        ) VALUES (
            v_order.id,
            'farmer_proceeds_settled'::public.payment_event_type,
            v_half_amount,
            'INR',
            v_idempotency_key_seller,
            v_payload_hash_seller,
            'ESCROW_HOLD_POOL',
            pg_catalog.format('SELLER_PROFILE_%s', v_order.seller_profile_id),
            'SIMULATED_SUCCESS',
            pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'resolution', 'mutual_split_seller', 'split_ratio', '50/50')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        -- 2. Buyer refund share
        v_idempotency_key_buyer := pg_catalog.format('dispute-split-buyer-%s', p_dispute_id);
        v_payload_hash_buyer := pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.format('order:%s:dispute:%s:split:buyer:%s', v_order.id, p_dispute_id, v_rem_amount),
                'UTF8'
            )),
            'hex'
        );

        INSERT INTO public.simulated_payment_events (
            order_id,
            event_type,
            amount,
            currency,
            idempotency_key,
            payload_hash,
            source_account_ref,
            destination_account_ref,
            ledger_state,
            payload_audit
        ) VALUES (
            v_order.id,
            'refund_issued'::public.payment_event_type,
            v_rem_amount,
            'INR',
            v_idempotency_key_buyer,
            v_payload_hash_buyer,
            'ESCROW_HOLD_POOL',
            pg_catalog.format('BUYER_PROFILE_%s', v_order.buyer_profile_id),
            'SIMULATED_SUCCESS',
            pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'resolution', 'mutual_split_buyer', 'split_ratio', '50/50')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

    ELSIF p_resolution_status = 'dismissed' THEN
        -- Dispute dismissed: accurately restore order's verified pre-dispute escrow status
        DECLARE
            v_orig_status TEXT;
        BEGIN
            v_orig_status := COALESCE(
                v_dispute.pre_dispute_escrow_status,
                v_dispute.evidence_metadata->>'pre_dispute_escrow_status'
            );

            IF v_orig_status IS NOT NULL AND v_orig_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected') THEN
                UPDATE public.reservations_orders
                SET escrow_status = v_orig_status::public.order_status_type,
                    updated_at = pg_catalog.now()
                WHERE id = v_order.id;
            ELSE
                -- Defensive fallback for legacy records prior to pre_dispute_escrow_status column
                IF v_order.delivered_at IS NOT NULL THEN
                    UPDATE public.reservations_orders SET escrow_status = 'delivered_inspected'::public.order_status_type, updated_at = pg_catalog.now() WHERE id = v_order.id;
                ELSIF v_order.pickup_scheduled_at IS NOT NULL THEN
                    UPDATE public.reservations_orders SET escrow_status = 'in_transit'::public.order_status_type, updated_at = pg_catalog.now() WHERE id = v_order.id;
                ELSE
                    UPDATE public.reservations_orders SET escrow_status = 'escrow_funded'::public.order_status_type, updated_at = pg_catalog.now() WHERE id = v_order.id;
                END IF;
            END IF;
        END;
    END IF;

    -- 2. Update Dispute Record
    UPDATE public.order_disputes
    SET status = p_resolution_status,
        resolution_notes = trim(p_resolution_notes),
        arbitrated_by_profile_id = v_admin_profile_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_dispute_id;

    -- 3. Notify Participants
    INSERT INTO public.user_notifications (recipient_profile_id, category, severity, title, description, action_url_tab, metadata)
    VALUES
    (
        v_dispute.claimant_profile_id,
        'dispute',
        'info',
        'Dispute Determination Rendered',
        pg_catalog.format('Dispute for Order %s resolved: %s.', v_dispute.order_id, p_resolution_status),
        'disputes',
        pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'status', p_resolution_status)
    ),
    (
        v_dispute.respondent_profile_id,
        'dispute',
        'info',
        'Dispute Determination Rendered',
        pg_catalog.format('Dispute for Order %s resolved: %s.', v_dispute.order_id, p_resolution_status),
        'disputes',
        pg_catalog.jsonb_build_object('dispute_id', p_dispute_id, 'status', p_resolution_status)
    );

    RETURN TRUE;
END;
$$;

-- 4.6 Procedure: public.mark_notification_read
-- Accurate error reporting for missing (P0002) and unauthorized (42501) notification IDs.
CREATE OR REPLACE FUNCTION public.mark_notification_read(
    p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_notif RECORD;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_notif
    FROM public.user_notifications
    WHERE id = p_notification_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification % not found.', p_notification_id USING ERRCODE = 'P0002';
    END IF;

    IF v_notif.recipient_profile_id <> v_caller_profile_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Cannot mark another recipient''s notification as read.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.user_notifications
    SET is_read = true,
        read_at = pg_catalog.now()
    WHERE id = p_notification_id;

    RETURN TRUE;
END;
$$;

-- 4.7 Procedure: public.mark_all_notifications_read
-- Bulk marks all notifications belonging to the caller as read.
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_count INTEGER;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    WITH updated AS (
        UPDATE public.user_notifications
        SET is_read = true,
            read_at = pg_catalog.now()
        WHERE recipient_profile_id = v_caller_profile_id
          AND is_read = false
        RETURNING id
    )
    SELECT pg_catalog.count(*) INTO v_count FROM updated;

    RETURN v_count;
END;
$$;

-- 4.8 Procedure: public.get_admin_platform_analytics
-- Admin-only analytics with explicit simulation declarations and un-qualified COALESCE.
CREATE OR REPLACE FUNCTION public.get_admin_platform_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_users BIGINT;
    v_total_farmers BIGINT;
    v_total_buyers BIGINT;
    v_total_storage_operators BIGINT;
    v_total_listings BIGINT;
    v_active_listings BIGINT;
    v_total_orders BIGINT;
    v_active_escrow_orders BIGINT;
    v_settled_orders BIGINT;
    v_disputed_orders BIGINT;
    v_total_gmv NUMERIC;
    v_active_escrow_amount NUMERIC;
    v_settled_proceeds NUMERIC;
    v_total_snapshots BIGINT;
    v_total_benchmarks BIGINT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform administrators can access platform analytics.' USING ERRCODE = '42501';
    END IF;

    SELECT pg_catalog.count(*) INTO v_total_users FROM public.profiles;
    SELECT pg_catalog.count(*) INTO v_total_farmers FROM public.user_roles WHERE role = 'farmer';
    SELECT pg_catalog.count(*) INTO v_total_buyers FROM public.user_roles WHERE role IN ('trader', 'processor', 'fpo_admin', 'retailer', 'consumer');
    SELECT pg_catalog.count(*) INTO v_total_storage_operators FROM public.user_roles WHERE role = 'cold_storage';

    SELECT pg_catalog.count(*) INTO v_total_listings FROM public.produce_listings;
    SELECT pg_catalog.count(*) INTO v_active_listings FROM public.produce_listings WHERE status = 'active';

    SELECT pg_catalog.count(*) INTO v_total_orders FROM public.reservations_orders;
    SELECT pg_catalog.count(*) INTO v_active_escrow_orders FROM public.reservations_orders
        WHERE escrow_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected');
    SELECT pg_catalog.count(*) INTO v_settled_orders FROM public.reservations_orders WHERE escrow_status = 'settled';
    SELECT pg_catalog.count(*) INTO v_disputed_orders FROM public.reservations_orders WHERE escrow_status = 'disputed';

    -- Financial aggregates using standard keyword COALESCE
    SELECT COALESCE(pg_catalog.sum(total_agreed_amount), 0) INTO v_total_gmv 
    FROM public.reservations_orders WHERE escrow_status != 'cancelled';

    SELECT COALESCE(pg_catalog.sum(total_agreed_amount), 0) INTO v_active_escrow_amount 
    FROM public.reservations_orders
    WHERE escrow_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected');

    SELECT COALESCE(pg_catalog.sum(amount), 0) INTO v_settled_proceeds 
    FROM public.simulated_payment_events
    WHERE event_type = 'farmer_proceeds_settled';

    SELECT pg_catalog.count(*) INTO v_total_snapshots FROM public.calculation_snapshots;
    SELECT pg_catalog.count(*) INTO v_total_benchmarks FROM public.market_price_benchmarks;

    RETURN pg_catalog.jsonb_build_object(
        'generated_at', pg_catalog.now(),
        'is_live_database', TRUE,
        'users', pg_catalog.jsonb_build_object(
            'total_registered', v_total_users,
            'farmers_count', v_total_farmers,
            'buyers_count', v_total_buyers,
            'cold_storage_operators_count', v_total_storage_operators
        ),
        'listings', pg_catalog.jsonb_build_object(
            'total_listings', v_total_listings,
            'active_listings', v_active_listings
        ),
        'orders', pg_catalog.jsonb_build_object(
            'total_orders', v_total_orders,
            'active_escrow_orders', v_active_escrow_orders,
            'settled_orders', v_settled_orders,
            'disputed_orders', v_disputed_orders
        ),
        'financials', pg_catalog.jsonb_build_object(
            'payment_rail_type', 'SIMULATED_INTERNAL_ESCROW',
            'is_live_external_banking_connected', FALSE,
            'simulation_disclaimer', 'All financial values represent simulated marketplace escrow and internal ledger calculations. No real-world banking rails, UPI gateways, or external monetary transfers are executed.',
            'gross_merchandise_value', v_total_gmv,
            'escrow_locked_volume', v_active_escrow_amount,
            'settled_farmer_proceeds', v_settled_proceeds,
            'simulated_gross_merchandise_value', v_total_gmv,
            'simulated_escrow_locked_volume', v_active_escrow_amount,
            'simulated_settled_farmer_proceeds', v_settled_proceeds
        ),
        'audit', pg_catalog.jsonb_build_object(
            'total_calculation_snapshots', v_total_snapshots,
            'total_market_price_benchmarks', v_total_benchmarks
        )
    );
END;
$$;

-- 4.9 Procedure: public.emergency_quarantine_phase6
-- Admin-authorized immediate procedural quarantine and operations soft-disable.
-- Revokes client execution from authenticated users across all 8 Phase 6 RPCs and write grants.
CREATE OR REPLACE FUNCTION public.emergency_quarantine_phase6()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_report JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform administrators can execute emergency quarantine.' USING ERRCODE = '42501';
    END IF;

    -- 1. Soft-disable cold storage facilities so no new reservations can be created
    UPDATE public.cold_storage_facilities SET is_active = false WHERE is_active = true;

    -- 2. Revoke execution on ALL 8 Phase 6 RPCs from authenticated and anon
    REVOKE EXECUTE ON FUNCTION public.book_cold_storage_capacity(UUID, NUMERIC, TEXT, DATE, DATE, UUID) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.cancel_cold_storage_reservation(UUID, TEXT) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.record_storage_temperature_telemetry(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.raise_order_dispute(UUID, TEXT, TEXT, JSONB) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.resolve_order_dispute(UUID, TEXT, TEXT) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM authenticated, anon;
    REVOKE EXECUTE ON FUNCTION public.get_admin_platform_analytics() FROM authenticated, anon;

    -- 3. Revoke write permissions from authenticated on newly integrated tables
    REVOKE INSERT, UPDATE ON TABLE public.cold_storage_facilities FROM authenticated;
    REVOKE INSERT, UPDATE ON TABLE public.cold_storage_reservations FROM authenticated;
    REVOKE INSERT ON TABLE public.storage_temperature_telemetry FROM authenticated;
    REVOKE UPDATE ON TABLE public.user_notifications FROM authenticated;
    REVOKE INSERT ON TABLE public.order_disputes FROM authenticated;

    v_report := pg_catalog.jsonb_build_object(
        'quarantine_executed_at', pg_catalog.now(),
        'quarantined_by', public.get_current_profile_id(),
        'status', 'ACTIVE_QUARANTINE',
        'rpc_revoked_count', 8,
        'facilities_disabled', TRUE,
        'table_writes_revoked', TRUE
    );

    RETURN v_report;
END;
$$;

-- ==============================================================================
-- 5. EXPLICIT PRIVILEGES & FUNCTION EXECUTION GRANTS
-- ==============================================================================

-- Table Privileges: Explicit Revoke from PUBLIC
REVOKE ALL ON TABLE public.cold_storage_facilities FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.cold_storage_reservations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.storage_temperature_telemetry FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.user_notifications FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.order_disputes FROM PUBLIC, anon;

-- Read Grants
GRANT SELECT ON TABLE public.cold_storage_facilities TO authenticated, anon;
GRANT SELECT ON TABLE public.cold_storage_reservations TO authenticated;
GRANT SELECT ON TABLE public.storage_temperature_telemetry TO authenticated;
GRANT SELECT ON TABLE public.user_notifications TO authenticated;
GRANT SELECT ON TABLE public.order_disputes TO authenticated;

-- Write Grants
GRANT INSERT, UPDATE ON TABLE public.cold_storage_facilities TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.cold_storage_reservations TO authenticated;
GRANT INSERT ON TABLE public.storage_temperature_telemetry TO authenticated;
GRANT UPDATE ON TABLE public.user_notifications TO authenticated;
GRANT INSERT ON TABLE public.order_disputes TO authenticated;

-- Stored Procedure Execution Grants
REVOKE ALL ON FUNCTION public.book_cold_storage_capacity(UUID, NUMERIC, TEXT, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_cold_storage_capacity(UUID, NUMERIC, TEXT, DATE, DATE, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_cold_storage_reservation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_cold_storage_reservation(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_storage_temperature_telemetry(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_storage_temperature_telemetry(UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.raise_order_dispute(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_order_dispute(UUID, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_order_dispute(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_order_dispute(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_platform_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_analytics() TO authenticated;

REVOKE ALL ON FUNCTION public.emergency_quarantine_phase6() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_quarantine_phase6() TO authenticated;

COMMIT;

-- ==============================================================================
-- 6. SAFE NON-DESTRUCTIVE RECOVERY GUIDANCE (EMERGENCY ROLLBACK PROTOCOL)
-- ==============================================================================
/*
EMERGENCY RECOVERY PROTOCOL (NON-DESTRUCTIVE):
If anomalies or unexpected state locks are observed after staging application,
NEVER execute destructive 'DROP TABLE ... CASCADE' commands. Dropping tables destroys
business transactions, audited dispute records, and IoT compliance data.

Follow this 4-step safe recovery protocol:

STEP 1: Immediate Procedural Quarantine (Disable External Execution)
Can be executed by a platform administrator via:
  SELECT public.emergency_quarantine_phase6();

Or manually via administrative SQL session:
BEGIN;
  -- Revoke execution from authenticated users across ALL 8 Phase 6 RPCs
  REVOKE EXECUTE ON FUNCTION public.book_cold_storage_capacity(UUID, NUMERIC, TEXT, DATE, DATE, UUID) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.cancel_cold_storage_reservation(UUID, TEXT) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.record_storage_temperature_telemetry(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.raise_order_dispute(UUID, TEXT, TEXT, JSONB) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.resolve_order_dispute(UUID, TEXT, TEXT) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM authenticated, anon;
  REVOKE EXECUTE ON FUNCTION public.get_admin_platform_analytics() FROM authenticated, anon;

  -- Revoke table write grants
  REVOKE INSERT, UPDATE ON TABLE public.cold_storage_facilities FROM authenticated;
  REVOKE INSERT, UPDATE ON TABLE public.cold_storage_reservations FROM authenticated;
  REVOKE INSERT ON TABLE public.storage_temperature_telemetry FROM authenticated;
  REVOKE UPDATE ON TABLE public.user_notifications FROM authenticated;
  REVOKE INSERT ON TABLE public.order_disputes FROM authenticated;
COMMIT;

STEP 2: Soft-Disable Operations (Zero Data Loss)
BEGIN;
  -- Soft-disable active facilities so no new reservations can be created
  UPDATE public.cold_storage_facilities SET is_active = false WHERE is_active = true;
COMMIT;

STEP 3: Table Archival Renaming (If Full Reversion is Required by DBA)
BEGIN;
  -- Move tables out of production path without dropping data or breaking existing schema v5
  ALTER TABLE IF EXISTS public.order_disputes RENAME TO order_disputes_archived_phase6;
  ALTER TABLE IF EXISTS public.user_notifications RENAME TO user_notifications_archived_phase6;
  ALTER TABLE IF EXISTS public.storage_temperature_telemetry RENAME TO storage_temperature_telemetry_archived_phase6;
  ALTER TABLE IF EXISTS public.cold_storage_reservations RENAME TO cold_storage_reservations_archived_phase6;
  ALTER TABLE IF EXISTS public.cold_storage_facilities RENAME TO cold_storage_facilities_archived_phase6;
COMMIT;

STEP 4: Health Verification Query
SELECT
    c.relname AS table_name,
    c.reltuples::bigint AS estimated_row_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE '%_archived_phase6'
ORDER BY c.relname;
*/
