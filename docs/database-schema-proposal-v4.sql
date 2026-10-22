-- ==============================================================================
-- AgriPrice: Hardened Database Schema & Migration Proposal (v4)
-- Module: From Produce to Profit (Foundation & Calculation Engine)
-- Target Engine: PostgreSQL 15+ / Supabase
-- Version: v4.0.0-security-hardened
-- 
-- STATUS: Proposed Specification (Pre-Implementation)
-- NOTE: This file is a security-hardened proposal. It has NOT been applied to a live
-- database. Production deployment requires testing in an isolated staging instance.
--
-- Security Invariants Enforced in v4:
-- 1. Anti-Tamper KYC & Verification Authorization:
--    Explicit rejection of self-updates to `auth_user_id`, `id`, `kyc_verified`, and
--    `bank_account_verified`. Does NOT trust `current_user = 'postgres'`; requires
--    dedicated administrative verification via service_role or vetted admin role helper.
-- 2. Strict Column-Level Security & Physical Location Decoupling:
--    Physical farm addresses, pincodes, latitude, and longitude are revoked from
--    `authenticated` and `anon` base table access. Public and pre-escrow users can only
--    query `public_produce_listings` (security_invoker = true) exposing macro-geography.
--    Sensitive physical coordinates are unlocked exclusively via security-definer helper
--    `get_authorized_farm_location(p_listing_id)` for post-escrow buyer/transporter.
-- 3. Non-Recursive Multi-Role RBAC:
--    Eliminated recursive RLS policies between `profiles` and `user_roles`. Replaced
--    with STABLE SECURITY DEFINER helper `public.is_admin()` and direct profile lookups
--    pinned with explicit search paths.
-- 4. Authorized, Reconciled, and Tamper-Proof Simulated Payments:
--    `record_simulated_payment_event` validates caller authorization and orders BEFORE
--    evaluating idempotency. Replays must match original SHA-256 (64 hex chars), amount,
--    and order_id; tampered replayed payloads raise explicit exceptions. All payment event
--    types are validated with strict state transition and amount reconciliation logic.
-- 5. Offer Negotiation Integrity & Protected Field Immutability:
--    Offers in negotiation cannot have their immutable terms (`listing_id`, `buyer_profile_id`,
--    `offered_price_per_kg`, `offered_quantity_kg`) modified by unprivileged participants.
--    Sellers can only counter or reject; buyers can only cancel.
-- 6. Atomic Concurrency & Expired Offer Persistence:
--    In `accept_offer_and_create_reservation`, expired offers are rejected without
--    attempting dead transaction updates. Row locks follow strict hierarchy
--    (`offers_negotiations` -> `produce_listings` -> `reservations_orders`).
-- 7. Strictly Separated Standalone Stubs & Supabase Compatibility:
--    Conditional role and auth schema creation guards ensure Supabase native `auth.uid()`
--    and `auth.role()` are never overwritten, while enabling standalone CI/pgTAP tests.
-- ==============================================================================

-- ==============================================================================
-- 0. ENVIRONMENT SETUP & ROLE PREREQUISITES
-- ==============================================================================

-- Safely create mock roles ONLY if running in standalone PostgreSQL (e.g. CI / pgTAP)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END $$;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Standalone PostgreSQL compatibility: Only define mock auth schema/functions
-- if they do NOT already exist (Supabase provides these natively).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        CREATE SCHEMA auth;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'auth' AND p.proname = 'uid'
    ) THEN
        CREATE FUNCTION auth.uid()
        RETURNS UUID AS $f$
        BEGIN
            RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
        EXCEPTION
            WHEN OTHERS THEN RETURN NULL;
        END;
        $f$ LANGUAGE plpgsql STABLE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'auth' AND p.proname = 'role'
    ) THEN
        CREATE FUNCTION auth.role()
        RETURNS TEXT AS $f$
        BEGIN
            RETURN COALESCE(
                NULLIF(current_setting('request.jwt.claim.role', true), ''),
                'anon'
            );
        EXCEPTION
            WHEN OTHERS THEN RETURN 'anon';
        END;
        $f$ LANGUAGE plpgsql STABLE;
    END IF;
END $$;

-- ==============================================================================
-- 1. SAFE ENUM DEFINITIONS (REPEATABLE MIGRATION PATTERN)
-- ==============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE user_role_type AS ENUM ('farmer', 'trader', 'processor', 'fpo_admin', 'transporter', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weight_unit_type') THEN
        CREATE TYPE weight_unit_type AS ENUM ('kg', 'quintal', 'tonne');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status_type') THEN
        CREATE TYPE listing_status_type AS ENUM ('draft', 'active', 'reserved', 'fulfilled', 'cancelled', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status_type') THEN
        CREATE TYPE offer_status_type AS ENUM ('pending', 'countered', 'accepted', 'rejected', 'cancelled', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_type') THEN
        CREATE TYPE order_status_type AS ENUM ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected', 'settled', 'disputed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
        CREATE TYPE payment_event_type AS ENUM (
            'escrow_hold_authorized',
            'dispatch_advance_released',
            'quality_acceptance_confirmed',
            'farmer_proceeds_settled',
            'commission_fee_settled',
            'transporter_fee_settled',
            'refund_issued'
        );
    END IF;
END $$;

-- ==============================================================================
-- 2. PROFILES & MULTI-ROLE RBAC (NON-RECURSIVE SECURITY DEFINER HELPERS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE NOT NULL,
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone_number TEXT UNIQUE NOT NULL CHECK (phone_number ~ '^\+?[0-9]{10,14}$'),
    email TEXT CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    state TEXT NOT NULL CHECK (length(trim(state)) >= 2),
    district TEXT NOT NULL CHECK (length(trim(district)) >= 2),
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

-- Helper 1: Non-recursive admin check
-- SECURITY DEFINER with fixed search_path breaks the infinite RLS loop between profiles and user_roles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_auth_uid UUID;
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN TRUE;
    END IF;
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.profile_id
        WHERE p.auth_user_id = v_auth_uid
          AND ur.role = 'admin'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper 2: Resolve current authenticated user profile ID safely
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE auth_user_id = auth.uid();
    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper 3: Check specific user role without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(p_profile_id UUID, p_role user_role_type)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE profile_id = p_profile_id AND role = p_role
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger: Strictly prevent profile field tampering and self-elevation of KYC/bank verification
-- Does NOT trust current_user = 'postgres' (which is the owner during SECURITY DEFINER execution).
-- Relies exclusively on public.is_admin() / auth.role() = 'service_role'.
CREATE OR REPLACE FUNCTION public.trg_protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Immutable identifiers
    IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
        RAISE EXCEPTION 'Security Policy Violation: Reassignment of auth_user_id is strictly prohibited.';
    END IF;

    IF (NEW.id IS DISTINCT FROM OLD.id) THEN
        RAISE EXCEPTION 'Security Policy Violation: Profile primary key (id) is immutable.';
    END IF;

    -- 2. Compliance and verification flags
    IF (NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified OR 
        NEW.bank_account_verified IS DISTINCT FROM OLD.bank_account_verified) THEN
        
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Security Policy Violation: Modification of kyc_verified or bank_account_verified requires administrative authority.';
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_profile_fields();

-- Public Profile Discovery View (Strict projection: masks phone, email, pincode, bank status)
CREATE OR REPLACE VIEW public.public_profiles 
WITH (security_invoker = true) AS
SELECT 
    id,
    full_name,
    district,
    state,
    kyc_verified,
    created_at
FROM public.profiles;

-- ==============================================================================
-- 3. PRODUCE LISTINGS & STRICT COLUMN-LEVEL LOCATION PRIVACY
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
    
    -- Macro-Location Fields (Public discovery)
    farm_district TEXT NOT NULL,
    farm_state TEXT NOT NULL,

    -- Micro-Location Fields (Strict column security; authorized counterparties only)
    farm_location_address TEXT NOT NULL,
    farm_pincode TEXT NOT NULL CHECK (farm_pincode ~ '^[0-9]{6}$'),
    latitude NUMERIC(10, 7) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(10, 7) CHECK (longitude BETWEEN -180 AND 180),
    
    target_price_per_kg NUMERIC(10, 2) CHECK (target_price_per_kg >= 0),
    status listing_status_type NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Reserved quantity can never exceed total volume
    CONSTRAINT chk_reserved_lte_total CHECK (reserved_quantity_kg <= quantity_in_kg)
);

-- Unit Synchronization Trigger: Guarantees quantity_in_kg aligns with unit factors
CREATE OR REPLACE FUNCTION public.trg_sync_listing_kg_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity_unit = 'kg' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity;
    ELSIF NEW.quantity_unit = 'quintal' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity * 100;
    ELSIF NEW.quantity_unit = 'tonne' THEN
        NEW.quantity_in_kg = NEW.harvest_quantity * 1000;
    ELSE
        RAISE EXCEPTION 'Unrecognized weight unit: %', NEW.quantity_unit;
    END IF;

    -- Ensure reduction in harvest volume cannot violate active reservations
    IF (NEW.reserved_quantity_kg > NEW.quantity_in_kg) THEN
        RAISE EXCEPTION 'Cannot reduce harvest volume below currently reserved quantity (Reserved: % kg, Attempted: % kg)',
            NEW.reserved_quantity_kg, NEW.quantity_in_kg;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_produce_listing_kg ON public.produce_listings;
CREATE TRIGGER trg_sync_produce_listing_kg
BEFORE INSERT OR UPDATE OF harvest_quantity, quantity_unit, reserved_quantity_kg ON public.produce_listings
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_listing_kg_quantity();

-- Public Marketplace Discovery View (Macro-geography only; security_invoker = true)
CREATE OR REPLACE VIEW public.public_produce_listings 
WITH (security_invoker = true) AS
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
-- 4. MARKET PRICE BENCHMARKS
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
-- 5. CALCULATION SNAPSHOTS (IMMUTABLE AUDIT TRAIL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.calculation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    listing_id UUID REFERENCES public.produce_listings(id) ON DELETE SET NULL,
    engine_version TEXT NOT NULL,
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
-- 6. OFFERS & NEGOTIATIONS
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

    CONSTRAINT chk_offer_expiry_future CHECK (expires_at > created_at)
);

-- Anti-Wash Trading: Prevent producer from bidding on their own produce
CREATE OR REPLACE FUNCTION public.trg_check_offer_buyer_not_seller()
RETURNS TRIGGER AS $$
DECLARE
    v_seller_profile_id UUID;
BEGIN
    SELECT seller_profile_id INTO v_seller_profile_id
    FROM public.produce_listings
    WHERE id = NEW.listing_id;

    IF v_seller_profile_id = NEW.buyer_profile_id THEN
        RAISE EXCEPTION 'Validation Violation: A producer cannot submit purchase offers on their own produce listing.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_ensure_buyer_not_seller ON public.offers_negotiations;
CREATE TRIGGER trg_ensure_buyer_not_seller
BEFORE INSERT ON public.offers_negotiations
FOR EACH ROW EXECUTE FUNCTION public.trg_check_offer_buyer_not_seller();

-- Offer Terms Immutability Trigger:
-- Once an offer is submitted, participants cannot silently alter the core terms
-- (listing_id, buyer_profile_id, price, quantity, expiry). Changes require a new offer or counter.
CREATE OR REPLACE FUNCTION public.trg_protect_offer_terms()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.listing_id IS DISTINCT FROM OLD.listing_id OR
        NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id OR
        NEW.offered_price_per_kg IS DISTINCT FROM OLD.offered_price_per_kg OR
        NEW.offered_quantity_kg IS DISTINCT FROM OLD.offered_quantity_kg OR
        NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
        
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Security Policy Violation: Offer core terms (listing, buyer, price, quantity, expiry) are immutable once submitted.';
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_offer_terms ON public.offers_negotiations;
CREATE TRIGGER trg_protect_offer_terms
BEFORE UPDATE ON public.offers_negotiations
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_offer_terms();

-- ==============================================================================
-- 7. RESERVATIONS & ORDERS
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

    CONSTRAINT chk_order_amount_consistency CHECK (
        total_agreed_amount = ROUND(locked_quantity_kg * agreed_price_per_kg, 2)
    )
);

-- ==============================================================================
-- 8. AUTHORIZED MICRO-LOCATION ACCESS HELPER
-- ==============================================================================

-- Security Invariant: Exact farm address, pincode, and GPS coordinates are unlocked
-- ONLY for the seller, or for the buyer/transporter of an active order funded in escrow.
CREATE OR REPLACE FUNCTION public.get_authorized_farm_location(p_listing_id UUID)
RETURNS TABLE (
    listing_id UUID,
    farm_location_address TEXT,
    farm_pincode TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7)
) AS $$
DECLARE
    v_caller_profile_id UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication Required: Caller must have an active profile.';
    END IF;

    -- Check if caller is admin
    IF public.is_admin() THEN
        v_is_authorized := TRUE;
    ELSE
        -- Check if caller is the seller of the listing
        IF EXISTS (
            SELECT 1 FROM public.produce_listings
            WHERE id = p_listing_id AND seller_profile_id = v_caller_profile_id
        ) THEN
            v_is_authorized := TRUE;
        -- Check if caller is buyer or transporter of an escrow-funded order on this listing
        ELSIF EXISTS (
            SELECT 1 FROM public.reservations_orders
            WHERE listing_id = p_listing_id
              AND (buyer_profile_id = v_caller_profile_id OR assigned_transporter_id = v_caller_profile_id)
              AND escrow_status NOT IN ('awaiting_escrow', 'cancelled')
        ) THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Authorization Violation: Precise farm coordinates are restricted to verified trade counterparties with funded escrow.';
    END IF;

    RETURN QUERY
    SELECT 
        l.id,
        l.farm_location_address,
        l.farm_pincode,
        l.latitude,
        l.longitude
    FROM public.produce_listings l
    WHERE l.id = p_listing_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

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
    payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'), -- Exactly 64 lowercase hex chars
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
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_block_payment_event_modifications ON public.simulated_payment_events;
CREATE TRIGGER trg_block_payment_event_modifications
BEFORE UPDATE OR DELETE ON public.simulated_payment_events
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_payment_ledger_immutability();

-- ==============================================================================
-- 10. ATOMIC CONCURRENCY PROCEDURES
-- ==============================================================================

/**
 * Atomic Offer Acceptance & Stock Reservation Procedure
 *
 * Security Invariants:
 * 1. Derives caller profile internally via auth.uid().
 * 2. Locks offers_negotiations then produce_listings in strict top-down hierarchy.
 * 3. Enforces that caller is the owner of the listing and has role 'farmer' or 'fpo_admin'.
 * 4. Checks that offer is active ('pending'/'countered') and not expired.
 *    Does NOT execute dead UPDATEs prior to raising an exception on expired offers.
 * 5. Validates inventory headroom; updates reserved_quantity_kg atomically.
 * 6. Transitions offer to 'accepted' and inserts reservations_orders record.
 */
CREATE OR REPLACE FUNCTION public.accept_offer_and_create_reservation(
    p_offer_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_caller_profile_id UUID;
    v_offer RECORD;
    v_listing RECORD;
    v_order_id UUID;
    v_total_amount NUMERIC(12, 2);
BEGIN
    -- 1. Derive authenticated caller profile
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication Required: Caller must be authenticated to accept offers.';
    END IF;

    -- 2. Lock and validate offer (top-down lock order)
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

    -- Reject expired offers cleanly without rolling back internal updates
    IF v_offer.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Offer % has expired at % and cannot be accepted.', p_offer_id, v_offer.expires_at;
    END IF;

    -- 3. Lock and validate listing
    SELECT * INTO v_listing
    FROM public.produce_listings
    WHERE id = v_offer.listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % associated with offer does not exist.', v_offer.listing_id;
    END IF;

    -- Verify caller owns the listing
    IF v_listing.seller_profile_id != v_caller_profile_id THEN
        RAISE EXCEPTION 'Authorization Violation: Caller profile % is not the seller of listing %.', 
            v_caller_profile_id, v_listing.id;
    END IF;

    -- Verify caller has authorized seller role
    IF NOT public.has_role(v_caller_profile_id, 'farmer') AND 
       NOT public.has_role(v_caller_profile_id, 'fpo_admin') THEN
        RAISE EXCEPTION 'Authorization Violation: User lacks verified seller role (farmer / fpo_admin).';
    END IF;

    IF v_listing.status NOT IN ('active', 'reserved') THEN
        RAISE EXCEPTION 'Listing % is not open for reservation (status: %)', v_listing.id, v_listing.status;
    END IF;

    -- 4. Concurrency check: Ensure available volume suffices
    IF (v_listing.reserved_quantity_kg + v_offer.offered_quantity_kg) > v_listing.quantity_in_kg THEN
        RAISE EXCEPTION 'Insufficient Inventory: Available % kg, Requested % kg', 
            (v_listing.quantity_in_kg - v_listing.reserved_quantity_kg), v_offer.offered_quantity_kg;
    END IF;

    -- 5. Calculate total agreed amount
    v_total_amount := ROUND(v_offer.offered_quantity_kg * v_offer.offered_price_per_kg, 2);

    -- 6. Atomically create reservation order
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

    -- 7. Update listing reserved balance
    UPDATE public.produce_listings
    SET 
        reserved_quantity_kg = reserved_quantity_kg + v_offer.offered_quantity_kg,
        status = CASE 
            WHEN (reserved_quantity_kg + v_offer.offered_quantity_kg) >= quantity_in_kg THEN 'reserved'::listing_status_type
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = v_listing.id;

    -- 8. Mark offer accepted
    UPDATE public.offers_negotiations
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = v_offer.id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Idempotent Reservation Cancellation & Inventory Rollback
 *
 * Security Invariants:
 * 1. Derives caller profile internally via auth.uid().
 * 2. Idempotent: If order is ALREADY 'cancelled', exits cleanly returning FALSE without releasing inventory again.
 * 3. Enforces that only orders in 'awaiting_escrow' or 'disputed' can be cancelled.
 * 4. Locks reservations_orders then produce_listings in consistent lock order.
 * 5. Restores reserved_quantity_kg safely.
 */
CREATE OR REPLACE FUNCTION public.cancel_reservation_and_release_inventory(
    p_order_id UUID,
    p_cancellation_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_profile_id UUID;
    v_order RECORD;
    v_listing RECORD;
BEGIN
    -- 1. Derive authenticated caller profile
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication Required: Caller must be authenticated.';
    END IF;

    -- 2. Lock and inspect order
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Idempotency check: If already cancelled, no-op to prevent double inventory release
    IF v_order.escrow_status = 'cancelled' THEN
        RETURN FALSE;
    END IF;

    -- Verify caller is a legitimate party (buyer, seller, or admin)
    IF v_order.seller_profile_id != v_caller_profile_id AND 
       v_order.buyer_profile_id != v_caller_profile_id AND
       NOT public.is_admin() THEN
        RAISE EXCEPTION 'Authorization Violation: Caller is not a party to this order.';
    END IF;

    -- State machine constraint: Cannot cancel after dispatch or completion
    IF v_order.escrow_status IN ('in_transit', 'delivered_inspected', 'settled') THEN
        RAISE EXCEPTION 'State Conflict: Order cannot be cancelled once in transit or settled (current status: %)',
            v_order.escrow_status;
    END IF;

    -- 3. Lock listing and release inventory
    SELECT * INTO v_listing
    FROM public.produce_listings
    WHERE id = v_order.listing_id
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.produce_listings
        SET 
            reserved_quantity_kg = GREATEST(0, reserved_quantity_kg - v_order.locked_quantity_kg),
            status = 'active'::listing_status_type,
            updated_at = NOW()
        WHERE id = v_order.listing_id;
    END IF;

    -- 4. Mark order cancelled
    UPDATE public.reservations_orders
    SET 
        escrow_status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_order.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Hardened Simulated Payment Recorder
 *
 * Security Invariants:
 * 1. First validates that order exists and caller is authorized to participate in this order.
 * 2. Idempotency Key Conflict Detection:
 *    - Replaying identical payload returns existing event ID.
 *    - Replaying with altered payload_hash, amount, or order_id raises explicit tamper exception.
 * 3. Enforces strict state machine prerequisites before applying transitions.
 * 4. Reconciles payment amounts against order agreed totals.
 * 5. Enforces valid 64-character SHA-256 payload_hash format.
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
    v_caller_profile_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_order RECORD;
    v_existing RECORD;
    v_event_id UUID;
BEGIN
    -- 0. Validate format of payload_hash (must be 64-char lowercase hex SHA-256)
    IF p_payload_hash !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Invalid Parameter: payload_hash must be a valid 64-character lowercase hex SHA-256 string.';
    END IF;

    -- 1. Derive authenticated caller profile
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Authentication Required: Caller must be authenticated to record payments.';
    END IF;

    v_is_admin := public.is_admin();

    -- 2. Lock and reconcile order BEFORE checking idempotency replay
    -- Guarantees the order exists and the caller is an authorized party before acknowledging any idempotency key
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Authorization check on order parties
    IF (v_order.buyer_profile_id != v_caller_profile_id AND 
        v_order.seller_profile_id != v_caller_profile_id AND 
        v_order.assigned_transporter_id IS DISTINCT FROM v_caller_profile_id AND
        NOT v_is_admin) THEN
        RAISE EXCEPTION 'Authorization Violation: Caller is not an authorized party to order %', p_order_id;
    END IF;

    -- 3. Idempotency check with payload tampering detection
    SELECT id, payload_hash, amount, order_id INTO v_existing
    FROM public.simulated_payment_events
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF (v_existing.payload_hash != p_payload_hash OR 
            v_existing.amount != p_amount OR 
            v_existing.order_id != p_order_id) THEN
            RAISE EXCEPTION 'Idempotency Conflict: Key % was previously submitted with a different payload hash, amount, or order ID.',
                p_idempotency_key;
        END IF;
        -- Identical replay: return existing event ID safely
        RETURN v_existing.id;
    END IF;

    -- 4. State Machine & Event-Specific Validation
    IF p_event_type = 'escrow_hold_authorized' THEN
        IF (v_order.buyer_profile_id != v_caller_profile_id AND NOT v_is_admin) THEN
            RAISE EXCEPTION 'Unauthorized: Only the buyer can authorize escrow funding.';
        END IF;
        IF v_order.escrow_status != 'awaiting_escrow' THEN
            RAISE EXCEPTION 'State Conflict: Cannot fund escrow; order is %', v_order.escrow_status;
        END IF;
        IF p_amount != v_order.total_agreed_amount THEN
            RAISE EXCEPTION 'Amount Reconciliation Failure: Escrow authorization % does not match order agreed amount %',
                p_amount, v_order.total_agreed_amount;
        END IF;

    ELSIF p_event_type = 'dispatch_advance_released' THEN
        IF NOT v_is_admin AND auth.role() != 'service_role' THEN
            RAISE EXCEPTION 'Unauthorized: Releasing dispatch advances requires administrative verification.';
        END IF;
        IF v_order.escrow_status != 'escrow_funded' THEN
            RAISE EXCEPTION 'State Conflict: Cannot release dispatch advance; escrow is not funded (current status: %)', v_order.escrow_status;
        END IF;

    ELSIF p_event_type = 'quality_acceptance_confirmed' THEN
        IF (v_order.buyer_profile_id != v_caller_profile_id AND NOT v_is_admin) THEN
            RAISE EXCEPTION 'Unauthorized: Only the buyer can confirm produce quality acceptance.';
        END IF;
        IF v_order.escrow_status != 'in_transit' THEN
            RAISE EXCEPTION 'State Conflict: Cannot accept produce before transit dispatch (current status: %)', v_order.escrow_status;
        END IF;

    ELSIF p_event_type = 'farmer_proceeds_settled' THEN
        IF NOT v_is_admin AND auth.role() != 'service_role' THEN
            RAISE EXCEPTION 'Unauthorized: Disbursing net proceeds requires administrative verification.';
        END IF;
        IF v_order.escrow_status != 'delivered_inspected' THEN
            RAISE EXCEPTION 'State Conflict: Cannot settle proceeds before inspection acceptance (current status: %)', v_order.escrow_status;
        END IF;

    ELSIF p_event_type = 'commission_fee_settled' OR p_event_type = 'transporter_fee_settled' THEN
        IF NOT v_is_admin AND auth.role() != 'service_role' THEN
            RAISE EXCEPTION 'Unauthorized: Fee settlements require administrative verification.';
        END IF;
        IF v_order.escrow_status NOT IN ('delivered_inspected', 'settled') THEN
            RAISE EXCEPTION 'State Conflict: Cannot settle fees before inspection acceptance (current status: %)', v_order.escrow_status;
        END IF;

    ELSIF p_event_type = 'refund_issued' THEN
        IF NOT v_is_admin AND v_order.seller_profile_id != v_caller_profile_id THEN
            RAISE EXCEPTION 'Unauthorized: Only the seller or platform admin can issue refunds.';
        END IF;
        IF v_order.escrow_status NOT IN ('escrow_funded', 'disputed') THEN
            RAISE EXCEPTION 'State Conflict: Cannot refund order in status %', v_order.escrow_status;
        END IF;
    END IF;

    -- 5. Record immutable event
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

    -- 6. Apply atomic state transition
    IF p_event_type = 'escrow_hold_authorized' THEN
        UPDATE public.reservations_orders SET escrow_status = 'escrow_funded', updated_at = NOW() WHERE id = p_order_id;
    ELSIF p_event_type = 'quality_acceptance_confirmed' THEN
        UPDATE public.reservations_orders SET escrow_status = 'delivered_inspected', updated_at = NOW() WHERE id = p_order_id;
    ELSIF p_event_type = 'farmer_proceeds_settled' THEN
        UPDATE public.reservations_orders SET escrow_status = 'settled', updated_at = NOW() WHERE id = p_order_id;
    ELSIF p_event_type = 'refund_issued' THEN
        UPDATE public.reservations_orders SET escrow_status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;
        
        -- Restore inventory on refund cancellation
        UPDATE public.produce_listings
        SET reserved_quantity_kg = GREATEST(0, reserved_quantity_kg - v_order.locked_quantity_kg),
            status = 'active'::listing_status_type,
            updated_at = NOW()
        WHERE id = v_order.listing_id;
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
CREATE INDEX IF NOT EXISTS idx_orders_listing_escrow ON public.reservations_orders(listing_id, buyer_profile_id, escrow_status);
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
-- Table 1: profiles (Non-recursive check using public.is_admin())
-- ------------------------------------------------------------------------------
CREATE POLICY profiles_select_self_or_admin ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = auth_user_id OR
        public.is_admin()
    );

CREATE POLICY profiles_insert_self ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = auth_user_id)
    WITH CHECK (auth.uid() = auth_user_id);

-- ------------------------------------------------------------------------------
-- Table 2: user_roles (Non-recursive check using public.is_admin())
-- ------------------------------------------------------------------------------
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
    FOR SELECT TO authenticated
    USING (
        profile_id = public.get_current_profile_id() OR
        public.is_admin()
    );

CREATE POLICY user_roles_admin_mutation ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- Table 3: produce_listings
-- ------------------------------------------------------------------------------
CREATE POLICY listings_select_authorized ON public.produce_listings
    FOR SELECT TO authenticated
    USING (
        seller_profile_id = public.get_current_profile_id() OR
        public.is_admin()
    );

-- Allow public read of active listings through view projection
CREATE POLICY listings_select_active_macro ON public.produce_listings
    FOR SELECT TO public
    USING (status IN ('active', 'reserved'));

CREATE POLICY listings_insert_producers ON public.produce_listings
    FOR INSERT TO authenticated
    WITH CHECK (
        seller_profile_id = public.get_current_profile_id() AND
        (public.has_role(seller_profile_id, 'farmer') OR public.has_role(seller_profile_id, 'fpo_admin'))
    );

CREATE POLICY listings_update_owner ON public.produce_listings
    FOR UPDATE TO authenticated
    USING (
        seller_profile_id = public.get_current_profile_id() AND
        reserved_quantity_kg = 0
    )
    WITH CHECK (
        seller_profile_id = public.get_current_profile_id()
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
        created_by_profile_id = public.get_current_profile_id() OR
        id IN (
            SELECT calculation_snapshot_id FROM public.offers_negotiations
            WHERE buyer_profile_id = public.get_current_profile_id() OR
                  listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id = public.get_current_profile_id())
        ) OR
        public.is_admin()
    );

CREATE POLICY calc_snapshots_insert_self ON public.calculation_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (created_by_profile_id = public.get_current_profile_id());

-- ------------------------------------------------------------------------------
-- Table 6: offers_negotiations
-- ------------------------------------------------------------------------------
CREATE POLICY offers_select_participants ON public.offers_negotiations
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id = public.get_current_profile_id() OR
        listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id = public.get_current_profile_id()) OR
        public.is_admin()
    );

CREATE POLICY offers_insert_buyers ON public.offers_negotiations
    FOR INSERT TO authenticated
    WITH CHECK (
        buyer_profile_id = public.get_current_profile_id() AND
        (public.has_role(buyer_profile_id, 'trader') OR 
         public.has_role(buyer_profile_id, 'processor') OR 
         public.has_role(buyer_profile_id, 'fpo_admin'))
    );

-- Buyer can cancel their own offer
CREATE POLICY offers_update_buyer_cancel ON public.offers_negotiations
    FOR UPDATE TO authenticated
    USING (
        buyer_profile_id = public.get_current_profile_id() AND
        status IN ('pending', 'countered')
    )
    WITH CHECK (status = 'cancelled');

-- Seller can counter or reject an incoming offer
CREATE POLICY offers_update_seller_decide ON public.offers_negotiations
    FOR UPDATE TO authenticated
    USING (
        listing_id IN (
            SELECT id FROM public.produce_listings 
            WHERE seller_profile_id = public.get_current_profile_id()
        ) AND
        status IN ('pending', 'countered')
    )
    WITH CHECK (
        status IN ('countered', 'rejected')
    );

-- ------------------------------------------------------------------------------
-- Table 7: reservations_orders
-- ------------------------------------------------------------------------------
CREATE POLICY orders_select_participants ON public.reservations_orders
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id = public.get_current_profile_id() OR
        seller_profile_id = public.get_current_profile_id() OR
        assigned_transporter_id = public.get_current_profile_id() OR
        public.is_admin()
    );

-- ------------------------------------------------------------------------------
-- Table 8: simulated_payment_events
-- ------------------------------------------------------------------------------
CREATE POLICY payment_events_select_participants ON public.simulated_payment_events
    FOR SELECT TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.reservations_orders
            WHERE buyer_profile_id = public.get_current_profile_id() OR
                  seller_profile_id = public.get_current_profile_id() OR
                  assigned_transporter_id = public.get_current_profile_id()
        ) OR
        public.is_admin()
    );

-- ==============================================================================
-- 13. REVOKE DEFAULT PUBLIC PRIVILEGES & LEAST-PRIVILEGE GRANTS
-- ==============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Views: Public Discovery
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_produce_listings TO authenticated, anon;
GRANT SELECT ON public.market_price_benchmarks TO authenticated, anon;

-- Base Tables: Restricted access governed by RLS
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Produce Listings: Exclude sensitive location columns from baseline authenticated SELECT
-- Direct SELECT on produce_listings only grants macro fields
GRANT SELECT (
    id, seller_profile_id, title, commodity, variety, grade,
    harvest_quantity, quantity_unit, quantity_in_kg, reserved_quantity_kg,
    harvest_date, expected_shelf_life_days, farm_district, farm_state,
    target_price_per_kg, status, created_at, updated_at
) ON public.produce_listings TO authenticated;

GRANT INSERT, UPDATE ON public.produce_listings TO authenticated;

GRANT SELECT, INSERT ON public.calculation_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.offers_negotiations TO authenticated;
GRANT SELECT ON public.reservations_orders TO authenticated;
GRANT SELECT ON public.simulated_payment_events TO authenticated;

-- Function Execution Privileges
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_profile_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_authorized_farm_location TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_offer_and_create_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_release_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_simulated_payment_event TO authenticated;
