-- ==============================================================================
-- AgriPrice: Corrected Database Schema & Migration Proposal (v2)
-- Module: From Produce to Profit (Foundation & Calculation Engine)
-- Target Engine: PostgreSQL 15+ / Supabase
-- Version: v2.0.0-security-hardened
-- 
-- STATUS: Proposed Specification (Pre-Implementation)
-- NOTE: This file is a security-hardened proposal. It has NOT been applied to a live
-- database. Production deployment requires testing in an isolated staging instance.
-- 
-- Key Enhancements in v2:
-- 1. PII Isolation: Masked views for public profile discovery; phone/bank hidden.
-- 2. Anti-Tamper KYC: DB trigger prevents self-elevation of KYC/bank flags.
-- 3. Location Masking: Public views expose only macro district/state; exact GPS
--    and farm street addresses are disclosed strictly post-escrow to order parties.
-- 4. Complete RLS Coverage: Explicit policies defined for all 8 tables.
-- 5. Concurrency-Safe Reservations: Atomic `accept_offer_and_create_reservation`
--    stored procedure with `SELECT ... FOR UPDATE` row-level locks.
-- 6. Inventory Guards: `reserved_quantity_kg` column and check constraints prevent overselling.
-- 7. Payment Ledger Hardening: `payload_hash` SHA-256 field, amount reconciliation,
--    and strict trigger rejecting any UPDATE or DELETE operations.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS & DOMAIN TYPES
CREATE TYPE user_role_type AS ENUM (
    'farmer',
    'trader',
    'processor',
    'fpo_admin',
    'transporter',
    'admin'
);

CREATE TYPE weight_unit_type AS ENUM (
    'kg',
    'quintal',
    'tonne'
);

CREATE TYPE listing_status_type AS ENUM (
    'draft',
    'active',
    'reserved',
    'fulfilled',
    'cancelled',
    'expired'
);

CREATE TYPE offer_status_type AS ENUM (
    'pending',
    'countered',
    'accepted',
    'rejected',
    'cancelled',
    'expired'
);

CREATE TYPE order_status_type AS ENUM (
    'awaiting_escrow',
    'escrow_funded',
    'in_transit',
    'delivered_inspected',
    'settled',
    'disputed',
    'cancelled'
);

CREATE TYPE payment_event_type AS ENUM (
    'escrow_hold_authorized',
    'dispatch_advance_released',
    'quality_acceptance_confirmed',
    'farmer_proceeds_settled',
    'commission_fee_settled',
    'transporter_fee_settled',
    'refund_issued'
);

-- ==============================================================================
-- 3. PROFILES & MULTI-ROLE RBAC
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE NOT NULL, -- References auth.users(id) in Supabase
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone_number TEXT UNIQUE NOT NULL CHECK (phone_number ~ '^\+?[0-9]{10,14}$'),
    email TEXT CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
    kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    bank_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role user_role_type NOT NULL,
    assigned_by UUID REFERENCES public.profiles(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, role)
);

-- Security Trigger: Prevent regular users from self-elevating KYC or Bank Account status
CREATE OR REPLACE FUNCTION public.trg_prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if KYC or bank verification fields are being changed
    IF (NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified OR 
        NEW.bank_account_verified IS DISTINCT FROM OLD.bank_account_verified) THEN
        -- Only admin users or service role can verify profiles
        IF NOT (
            current_user = 'postgres' OR
            current_setting('request.jwt.claim.role', true) = 'service_role' OR
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.profiles p ON p.id = ur.profile_id
                WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
            )
        ) THEN
            RAISE EXCEPTION 'Security Violation: Users cannot alter their own verification status (kyc_verified or bank_account_verified).';
        END IF;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_profile_privilege_escalation();

-- Public Discovery View (Masks phone, email, pincode, bank status)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    full_name,
    district,
    state,
    kyc_verified,
    created_at
FROM public.profiles;

-- Helper Function: Check User Role with strict search_path
CREATE OR REPLACE FUNCTION public.has_role(p_profile_id UUID, p_role user_role_type)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE profile_id = p_profile_id AND role = p_role
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 4. PRODUCE LISTINGS (WITH LOCATION PRIVACY & RESERVED INVENTORY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.produce_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(trim(title)) >= 5),
    commodity TEXT NOT NULL,
    variety TEXT NOT NULL,
    grade TEXT NOT NULL,
    harvest_quantity NUMERIC(12, 4) NOT NULL CHECK (harvest_quantity > 0),
    quantity_unit weight_unit_type NOT NULL DEFAULT 'kg',
    quantity_in_kg NUMERIC(12, 4) NOT NULL CHECK (quantity_in_kg > 0),
    reserved_quantity_kg NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (reserved_quantity_kg >= 0),
    harvest_date DATE NOT NULL,
    expected_shelf_life_days INT NOT NULL CHECK (expected_shelf_life_days >= 1),
    
    -- Sensitive Location Fields (Protected via Views & Restricted RLS)
    farm_location_address TEXT NOT NULL,
    farm_district TEXT NOT NULL,
    farm_state TEXT NOT NULL,
    farm_pincode TEXT NOT NULL CHECK (farm_pincode ~ '^[0-9]{6}$'),
    latitude NUMERIC(10, 7) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) CHECK (longitude BETWEEN -180 AND 180),
    
    target_price_per_kg NUMERIC(10, 2) CHECK (target_price_per_kg >= 0),
    status listing_status_type NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Concurrency Guard: Reserved quantity cannot exceed total harvest volume
    CONSTRAINT chk_reserved_lte_total CHECK (reserved_quantity_kg <= quantity_in_kg)
);

-- Unit Conversion Consistency Trigger
CREATE OR REPLACE FUNCTION public.trg_sync_listing_kg_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity_unit = 'kg' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity;
    ELSIF NEW.quantity_unit = 'quintal' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity * 100;
    ELSIF NEW.quantity_unit = 'tonne' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity * 1000;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TRIGGER trg_sync_produce_listing_kg
BEFORE INSERT OR UPDATE OF harvest_quantity, quantity_unit ON public.produce_listings
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_listing_kg_quantity();

-- Masked Public Marketplace View (Hides exact street address, GPS, and pincode)
CREATE OR REPLACE VIEW public.public_produce_listings AS
SELECT 
    id,
    seller_profile_id,
    title,
    commodity,
    variety,
    grade,
    harvest_quantity,
    quantity_unit,
    quantity_in_kg,
    reserved_quantity_kg,
    (quantity_in_kg - reserved_quantity_kg) AS available_quantity_kg,
    harvest_date,
    expected_shelf_life_days,
    farm_district,
    farm_state,
    target_price_per_kg,
    status,
    created_at
FROM public.produce_listings
WHERE status IN ('active', 'reserved');

-- ==============================================================================
-- 5. MARKET PRICE BENCHMARKS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.market_price_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mandi_name TEXT NOT NULL,
    market_center_district TEXT NOT NULL,
    market_center_state TEXT NOT NULL,
    commodity TEXT NOT NULL,
    variety TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT 'Standard',
    min_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (min_price_per_kg >= 0),
    modal_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (modal_price_per_kg >= min_price_per_kg),
    max_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (max_price_per_kg >= modal_price_per_kg),
    source_attribution TEXT NOT NULL DEFAULT 'Simulated Historical APMC Benchmark',
    recorded_at DATE NOT NULL,
    is_live_feed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. CALCULATION SNAPSHOTS (IMMUTABLE AUDIT TRAIL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.calculation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    listing_id UUID REFERENCES public.produce_listings(id) ON DELETE SET NULL,
    engine_version TEXT NOT NULL, -- e.g. 'v1.0.0-deterministic'
    input_payload JSONB NOT NULL,
    output_payload JSONB NOT NULL,
    original_quantity_kg NUMERIC(12, 4) NOT NULL CHECK (original_quantity_kg > 0),
    sellable_quantity_kg NUMERIC(12, 4) NOT NULL CHECK (sellable_quantity_kg >= 0),
    expected_loss_percent NUMERIC(5, 2) NOT NULL CHECK (expected_loss_percent BETWEEN 0 AND 100),
    gross_revenue NUMERIC(12, 2) NOT NULL CHECK (gross_revenue >= 0),
    total_deductions NUMERIC(12, 2) NOT NULL CHECK (total_deductions >= 0),
    estimated_net_proceeds NUMERIC(12, 2) NOT NULL,
    cultivation_cost_included BOOLEAN NOT NULL DEFAULT FALSE,
    cultivation_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cultivation_cost_amount >= 0),
    estimated_net_farm_profit NUMERIC(12, 2),
    assumptions_summary JSONB NOT NULL,
    disclaimer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. OFFERS & NEGOTIATIONS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.offers_negotiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE RESTRICT,
    buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    calculation_snapshot_id UUID REFERENCES public.calculation_snapshots(id),
    offered_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (offered_price_per_kg > 0),
    offered_quantity_kg NUMERIC(12, 4) NOT NULL CHECK (offered_quantity_kg > 0),
    delivery_terms TEXT NOT NULL,
    transport_borne_by TEXT NOT NULL CHECK (transport_borne_by IN ('buyer', 'seller', 'shared')),
    status offer_status_type NOT NULL DEFAULT 'pending',
    notes TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_offer_expiry_future CHECK (expires_at > created_at)
);

-- Prevent seller from submitting offers on their own produce
CREATE OR REPLACE FUNCTION public.trg_check_offer_buyer_not_seller()
RETURNS TRIGGER AS $$
DECLARE
    v_seller_profile_id UUID;
BEGIN
    SELECT seller_profile_id INTO v_seller_profile_id
    FROM public.produce_listings
    WHERE id = NEW.listing_id;

    IF v_seller_profile_id = NEW.buyer_profile_id THEN
        RAISE EXCEPTION 'Validation Error: A producer cannot submit purchase offers on their own produce listing.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE TRIGGER trg_ensure_buyer_not_seller
BEFORE INSERT ON public.offers_negotiations
FOR EACH ROW EXECUTE FUNCTION public.trg_check_offer_buyer_not_seller();

-- ==============================================================================
-- 8. RESERVATIONS & ORDERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reservations_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE RESTRICT,
    accepted_offer_id UUID UNIQUE NOT NULL REFERENCES public.offers_negotiations(id) ON DELETE RESTRICT,
    seller_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_transporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    locked_quantity_kg NUMERIC(12, 4) NOT NULL CHECK (locked_quantity_kg > 0),
    agreed_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (agreed_price_per_kg > 0),
    total_agreed_amount NUMERIC(12, 2) NOT NULL CHECK (total_agreed_amount > 0),
    escrow_status order_status_type NOT NULL DEFAULT 'awaiting_escrow',
    pickup_scheduled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Consistency Check: Agreed amount equals quantity * price
    CONSTRAINT chk_order_amount_consistency CHECK (
        total_agreed_amount = ROUND(locked_quantity_kg * agreed_price_per_kg, 2)
    )
);

-- ==============================================================================
-- 9. SIMULATED PAYMENT EVENTS (HARDENED APPEND-ONLY LEDGER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.simulated_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
    event_type payment_event_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    idempotency_key TEXT UNIQUE NOT NULL CHECK (length(trim(idempotency_key)) >= 16),
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64), -- SHA-256 hex string
    source_account_ref TEXT,
    destination_account_ref TEXT,
    ledger_state TEXT NOT NULL DEFAULT 'SIMULATED_SUCCESS',
    payload_audit JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: Strictly block any UPDATE or DELETE on payment ledger
CREATE OR REPLACE FUNCTION public.trg_enforce_payment_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: Payment ledger entries are strictly immutable. Corrections require compensatory events.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_payment_event_modifications
BEFORE UPDATE OR DELETE ON public.simulated_payment_events
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_payment_ledger_immutability();

-- ==============================================================================
-- 10. ATOMIC STORED PROCEDURES (CONCURRENCY-SAFE BUSINESS LOGIC)
-- ==============================================================================

/**
 * Atomic Offer Acceptance & Stock Reservation Procedure
 * 
 * Acquires row-level exclusive locks (FOR UPDATE) on both listing and offer.
 * Guarantees that concurrent buyers cannot over-reserve or race for limited produce.
 */
CREATE OR REPLACE FUNCTION public.accept_offer_and_create_reservation(
    p_offer_id UUID,
    p_seller_profile_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_offer RECORD;
    v_listing RECORD;
    v_order_id UUID;
    v_total_amount NUMERIC(12, 2);
BEGIN
    -- 1. Lock and validate offer
    SELECT * INTO v_offer
    FROM public.offers_negotiations
    WHERE id = p_offer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found: %', p_offer_id;
    END IF;

    IF v_offer.status NOT IN ('pending', 'countered') THEN
        RAISE EXCEPTION 'Offer % cannot be accepted; current status is %', p_offer_id, v_offer.status;
    END IF;

    IF v_offer.expires_at <= NOW() THEN
        UPDATE public.offers_negotiations SET status = 'expired', updated_at = NOW() WHERE id = p_offer_id;
        RAISE EXCEPTION 'Offer % expired at %', p_offer_id, v_offer.expires_at;
    END IF;

    -- 2. Lock and validate listing
    SELECT * INTO v_listing
    FROM public.produce_listings
    WHERE id = v_offer.listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % associated with offer does not exist', v_offer.listing_id;
    END IF;

    IF v_listing.seller_profile_id != p_seller_profile_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller profile % is not the owner of listing %', p_seller_profile_id, v_listing.id;
    END IF;

    IF v_listing.status NOT IN ('active', 'reserved') THEN
        RAISE EXCEPTION 'Listing % is not active (status: %)', v_listing.id, v_listing.status;
    END IF;

    -- 3. Concurrency check: Ensure available volume suffices
    IF (v_listing.reserved_quantity_kg + v_offer.offered_quantity_kg) > v_listing.quantity_in_kg THEN
        RAISE EXCEPTION 'Insufficient Inventory: Available % kg, Requested % kg', 
            (v_listing.quantity_in_kg - v_listing.reserved_quantity_kg), v_offer.offered_quantity_kg;
    END IF;

    -- 4. Calculate total amount
    v_total_amount := ROUND(v_offer.offered_quantity_kg * v_offer.offered_price_per_kg, 2);

    -- 5. Atomically create reservation order
    INSERT INTO public.reservations_orders (
        listing_id,
        accepted_offer_id,
        seller_profile_id,
        buyer_profile_id,
        locked_quantity_kg,
        agreed_price_per_kg,
        total_agreed_amount,
        escrow_status
    ) VALUES (
        v_listing.id,
        v_offer.id,
        v_listing.seller_profile_id,
        v_offer.buyer_profile_id,
        v_offer.offered_quantity_kg,
        v_offer.offered_price_per_kg,
        v_total_amount,
        'awaiting_escrow'
    ) RETURNING id INTO v_order_id;

    -- 6. Update listing reserved balance
    UPDATE public.produce_listings
    SET 
        reserved_quantity_kg = reserved_quantity_kg + v_offer.offered_quantity_kg,
        status = CASE 
            WHEN (reserved_quantity_kg + v_offer.offered_quantity_kg) >= quantity_in_kg THEN 'reserved'::listing_status_type
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = v_listing.id;

    -- 7. Mark offer as accepted
    UPDATE public.offers_negotiations
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = v_offer.id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Atomic Reservation Cancellation & Inventory Rollback
 */
CREATE OR REPLACE FUNCTION public.cancel_reservation_and_release_inventory(
    p_order_id UUID,
    p_caller_profile_id UUID,
    p_cancellation_reason TEXT
)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.seller_profile_id != p_caller_profile_id AND v_order.buyer_profile_id != p_caller_profile_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not a party to this order';
    END IF;

    IF v_order.escrow_status IN ('settled', 'in_transit') THEN
        RAISE EXCEPTION 'Order cannot be unilaterally cancelled once in transit or settled (status: %)', v_order.escrow_status;
    END IF;

    -- Release reserved volume on listing
    UPDATE public.produce_listings
    SET 
        reserved_quantity_kg = GREATEST(0, reserved_quantity_kg - v_order.locked_quantity_kg),
        status = 'active'::listing_status_type,
        updated_at = NOW()
    WHERE id = v_order.listing_id;

    -- Mark order cancelled
    UPDATE public.reservations_orders
    SET 
        escrow_status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_order.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Hardened Simulated Payment Recorder
 */
CREATE OR REPLACE FUNCTION public.record_simulated_payment_event(
    p_order_id UUID,
    p_event_type payment_event_type,
    p_amount NUMERIC,
    p_idempotency_key TEXT,
    p_payload_hash TEXT,
    p_audit JSONB
)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_event_id UUID;
BEGIN
    -- Idempotency check: Return existing event ID if already recorded
    SELECT id INTO v_event_id
    FROM public.simulated_payment_events
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN v_event_id;
    END IF;

    -- Lock and reconcile order
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Amount check for full escrow holds
    IF p_event_type = 'escrow_hold_authorized' AND p_amount != v_order.total_agreed_amount THEN
        RAISE EXCEPTION 'Amount Reconciliation Failure: Escrow hold % does not match agreed order amount %',
            p_amount, v_order.total_agreed_amount;
    END IF;

    -- Record immutable event
    INSERT INTO public.simulated_payment_events (
        order_id,
        event_type,
        amount,
        idempotency_key,
        payload_hash,
        payload_audit
    ) VALUES (
        p_order_id,
        p_event_type,
        p_amount,
        p_idempotency_key,
        p_payload_hash,
        p_audit
    ) RETURNING id INTO v_event_id;

    -- State machine transition
    IF p_event_type = 'escrow_hold_authorized' THEN
        UPDATE public.reservations_orders SET escrow_status = 'escrow_funded', updated_at = NOW() WHERE id = p_order_id;
    ELSIF p_event_type = 'farmer_proceeds_settled' THEN
        UPDATE public.reservations_orders SET escrow_status = 'settled', updated_at = NOW() WHERE id = p_order_id;
    ELSIF p_event_type = 'refund_issued' THEN
        UPDATE public.reservations_orders SET escrow_status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;
    END IF;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 11. INDEXES FOR PERFORMANCE & INTEGRITY
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_auth ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup ON public.user_roles(profile_id, role);
CREATE INDEX IF NOT EXISTS idx_produce_listings_seller ON public.produce_listings(seller_profile_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_status ON public.produce_listings(status);
CREATE INDEX IF NOT EXISTS idx_produce_listings_commodity ON public.produce_listings(commodity, farm_district);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_lookup ON public.market_price_benchmarks(commodity, market_center_district, recorded_at);
CREATE INDEX IF NOT EXISTS idx_calc_snapshots_creator ON public.calculation_snapshots(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_offers_listing ON public.offers_negotiations(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_buyer ON public.offers_negotiations(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_offers_expiry ON public.offers_negotiations(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_parties ON public.reservations_orders(seller_profile_id, buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON public.simulated_payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_hash ON public.simulated_payment_events(payload_hash);

-- ==============================================================================
-- 12. ROW-LEVEL SECURITY (RLS) POLICIES — ALL 8 TABLES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produce_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_price_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulated_payment_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Table 1: profiles
-- ------------------------------------------------------------------------------
-- Users can only read full private profiles if it is their own profile, or if they are an admin
CREATE POLICY profiles_select_self_or_admin ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = auth_user_id OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.profiles p ON p.id = ur.profile_id
            WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
        )
    );

CREATE POLICY profiles_insert_self ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = auth_user_id)
    WITH CHECK (auth.uid() = auth_user_id);

-- ------------------------------------------------------------------------------
-- Table 2: user_roles
-- ------------------------------------------------------------------------------
-- Authenticated users can view their own assigned roles
CREATE POLICY user_roles_select_self ON public.user_roles
    FOR SELECT TO authenticated
    USING (
        profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.profiles p ON p.id = ur.profile_id
            WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
        )
    );

-- Only admins / service role can assign or modify roles
CREATE POLICY user_roles_admin_mutation ON public.user_roles
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.profiles p ON p.id = ur.profile_id
            WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
        )
    );

-- ------------------------------------------------------------------------------
-- Table 3: produce_listings
-- ------------------------------------------------------------------------------
-- Direct table SELECT allowed for: seller, or confirmed order participants (buyer/transporter)
CREATE POLICY listings_select_authorized ON public.produce_listings
    FOR SELECT TO authenticated
    USING (
        seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        id IN (
            SELECT listing_id FROM public.reservations_orders
            WHERE (buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
                   assigned_transporter_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
              AND escrow_status NOT IN ('cancelled', 'awaiting_escrow')
        )
    );

-- Producers (farmer or fpo_admin) can insert listings
CREATE POLICY listings_insert_producers ON public.produce_listings
    FOR INSERT TO authenticated
    WITH CHECK (
        seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.profile_id = seller_profile_id AND ur.role IN ('farmer', 'fpo_admin')
        )
    );

CREATE POLICY listings_update_owner ON public.produce_listings
    FOR UPDATE TO authenticated
    USING (
        seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND
        reserved_quantity_kg = 0 -- Cannot alter core terms while inventory is actively locked
    );

-- ------------------------------------------------------------------------------
-- Table 4: market_price_benchmarks
-- ------------------------------------------------------------------------------
CREATE POLICY benchmarks_select_all ON public.market_price_benchmarks
    FOR SELECT TO public
    USING (true);

-- ------------------------------------------------------------------------------
-- Table 5: calculation_snapshots
-- ------------------------------------------------------------------------------
CREATE POLICY calc_snapshots_select_parties ON public.calculation_snapshots
    FOR SELECT TO authenticated
    USING (
        created_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        id IN (
            SELECT calculation_snapshot_id FROM public.offers_negotiations
            WHERE buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
                  listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
        )
    );

CREATE POLICY calc_snapshots_insert_self ON public.calculation_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (created_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

-- Snapshots are strictly immutable (UPDATE and DELETE prohibited by omitting policies)

-- ------------------------------------------------------------------------------
-- Table 6: offers_negotiations
-- ------------------------------------------------------------------------------
CREATE POLICY offers_select_participants ON public.offers_negotiations
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    );

CREATE POLICY offers_insert_buyers ON public.offers_negotiations
    FOR INSERT TO authenticated
    WITH CHECK (
        buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.profile_id = buyer_profile_id AND ur.role IN ('trader', 'processor', 'fpo_admin')
        )
    );

CREATE POLICY offers_update_buyer_cancel ON public.offers_negotiations
    FOR UPDATE TO authenticated
    USING (
        buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND
        status = 'pending'
    )
    WITH CHECK (status = 'cancelled');

-- ------------------------------------------------------------------------------
-- Table 7: reservations_orders
-- ------------------------------------------------------------------------------
CREATE POLICY orders_select_participants ON public.reservations_orders
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        assigned_transporter_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.profiles p ON p.id = ur.profile_id
            WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
        )
    );

-- Direct client INSERT is prohibited; reservations are created via accept_offer_and_create_reservation()
-- Direct client UPDATE is prohibited; status transitions are governed by stored procedures

-- ------------------------------------------------------------------------------
-- Table 8: simulated_payment_events
-- ------------------------------------------------------------------------------
CREATE POLICY payment_events_select_participants ON public.simulated_payment_events
    FOR SELECT TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.reservations_orders
            WHERE buyer_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
                  seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
                  assigned_transporter_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.profiles p ON p.id = ur.profile_id
            WHERE p.auth_user_id = auth.uid() AND ur.role = 'admin'
        )
    );

-- Direct client INSERT/UPDATE/DELETE prohibited; ledger records are created via record_simulated_payment_event()

-- ==============================================================================
-- 13. REVOKE DEFAULT PUBLIC PRIVILEGES (LEAST PRIVILEGE ENFORCEMENT)
-- ==============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Grant minimal permissions to authenticated users
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_produce_listings TO authenticated, anon;
GRANT SELECT ON public.market_price_benchmarks TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.produce_listings TO authenticated;
GRANT SELECT, INSERT ON public.calculation_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.offers_negotiations TO authenticated;
GRANT SELECT ON public.reservations_orders TO authenticated;
GRANT SELECT ON public.simulated_payment_events TO authenticated;

-- Grant execution of safe stored procedures to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_offer_and_create_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_release_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_simulated_payment_event TO authenticated;
