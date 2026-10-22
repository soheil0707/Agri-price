-- ==============================================================================
-- AgriPrice: Database Schema & Migration Proposal
-- Module: From Produce to Profit (Foundation & Calculation Engine)
-- Target Engine: PostgreSQL 15+ / Supabase
-- Version: v1.0.0-proposal
-- Note: Proposed schema only. Not connected to external production databases.
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

-- 3. PROFILES & MULTI-ROLE RBAC
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- References auth.users(id) in Supabase
    full_name TEXT NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,
    email TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    pincode TEXT NOT NULL,
    kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    bank_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role user_role_type NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, role)
);

-- 4. PRODUCE LISTINGS
CREATE TABLE IF NOT EXISTS public.produce_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    commodity TEXT NOT NULL,
    variety TEXT NOT NULL,
    grade TEXT NOT NULL, -- e.g., Grade-A, Grade-B, Processing Grade
    harvest_quantity NUMERIC(12, 4) NOT NULL CHECK (harvest_quantity > 0),
    quantity_unit weight_unit_type NOT NULL DEFAULT 'kg',
    quantity_in_kg NUMERIC(12, 4) NOT NULL CHECK (quantity_in_kg > 0),
    harvest_date DATE NOT NULL,
    expected_shelf_life_days INT NOT NULL CHECK (expected_shelf_life_days >= 1),
    farm_location_address TEXT NOT NULL,
    farm_district TEXT NOT NULL,
    farm_state TEXT NOT NULL,
    farm_pincode TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    target_price_per_kg NUMERIC(10, 2) CHECK (target_price_per_kg >= 0),
    status listing_status_type NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. MARKET PRICE BENCHMARKS (AUDITED BENCHMARKS)
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

-- 6. CALCULATION SNAPSHOTS (IMMUTABLE AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS public.calculation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    listing_id UUID REFERENCES public.produce_listings(id) ON DELETE SET NULL,
    engine_version TEXT NOT NULL, -- e.g. 'v1.0.0-deterministic'
    input_payload JSONB NOT NULL,
    output_payload JSONB NOT NULL,
    original_quantity_kg NUMERIC(12, 4) NOT NULL,
    sellable_quantity_kg NUMERIC(12, 4) NOT NULL,
    expected_loss_percent NUMERIC(5, 2) NOT NULL,
    gross_revenue NUMERIC(12, 2) NOT NULL,
    total_deductions NUMERIC(12, 2) NOT NULL,
    estimated_net_proceeds NUMERIC(12, 2) NOT NULL,
    cultivation_cost_included BOOLEAN NOT NULL DEFAULT FALSE,
    cultivation_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    estimated_net_farm_profit NUMERIC(12, 2),
    assumptions_summary JSONB NOT NULL,
    disclaimer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. OFFERS & NEGOTIATIONS
CREATE TABLE IF NOT EXISTS public.offers_negotiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE RESTRICT,
    buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    calculation_snapshot_id UUID REFERENCES public.calculation_snapshots(id),
    offered_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (offered_price_per_kg > 0),
    offered_quantity_kg NUMERIC(12, 4) NOT NULL CHECK (offered_quantity_kg > 0),
    delivery_terms TEXT NOT NULL, -- e.g., 'farmgate_pickup', 'mandi_delivery', 'buyer_warehouse'
    transport_borne_by TEXT NOT NULL CHECK (transport_borne_by IN ('buyer', 'seller', 'shared')),
    status offer_status_type NOT NULL DEFAULT 'pending',
    notes TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. RESERVATIONS & ORDERS
CREATE TABLE IF NOT EXISTS public.reservations_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE RESTRICT,
    accepted_offer_id UUID NOT NULL REFERENCES public.offers_negotiations(id) ON DELETE RESTRICT,
    seller_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_transporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    locked_quantity_kg NUMERIC(12, 4) NOT NULL,
    agreed_price_per_kg NUMERIC(10, 2) NOT NULL,
    total_agreed_amount NUMERIC(12, 2) NOT NULL,
    escrow_status order_status_type NOT NULL DEFAULT 'awaiting_escrow',
    pickup_scheduled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. SIMULATED PAYMENT EVENTS (IMMUTABLE LEDGER)
CREATE TABLE IF NOT EXISTS public.simulated_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
    event_type payment_event_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    idempotency_key TEXT UNIQUE NOT NULL,
    source_account_ref TEXT,
    destination_account_ref TEXT,
    ledger_state TEXT NOT NULL DEFAULT 'SIMULATED_SUCCESS',
    payload_audit JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. INDEXES FOR PERFORMANCE & INTEGRITY
CREATE INDEX IF NOT EXISTS idx_user_roles_profile ON public.user_roles(profile_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_seller ON public.produce_listings(seller_profile_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_status ON public.produce_listings(status);
CREATE INDEX IF NOT EXISTS idx_produce_listings_commodity ON public.produce_listings(commodity, variety);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_lookup ON public.market_price_benchmarks(commodity, market_center_district, recorded_at);
CREATE INDEX IF NOT EXISTS idx_calc_snapshots_creator ON public.calculation_snapshots(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_offers_listing ON public.offers_negotiations(listing_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer ON public.offers_negotiations(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_seller ON public.reservations_orders(buyer_profile_id, seller_profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON public.simulated_payment_events(order_id);

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produce_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_price_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulated_payment_events ENABLE ROW LEVEL SECURITY;

-- Profiles: Authenticated users can read active profiles; self can update own profile
CREATE POLICY profiles_select_authenticated ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = auth_user_id)
    WITH CHECK (auth.uid() = auth_user_id);

-- Listings: Everyone can view active listings; sellers manage their own listings
CREATE POLICY listings_select_public ON public.produce_listings
    FOR SELECT USING (status = 'active' OR seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY listings_insert_farmer ON public.produce_listings
    FOR INSERT TO authenticated
    WITH CHECK (seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY listings_update_owner ON public.produce_listings
    FOR UPDATE TO authenticated
    USING (seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

-- Calculation Snapshots: Immutable; creators can view their snapshots
CREATE POLICY calc_snapshots_select ON public.calculation_snapshots
    FOR SELECT TO authenticated
    USING (created_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY calc_snapshots_insert ON public.calculation_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (created_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

-- Market Benchmarks: Read-only for all users
CREATE POLICY benchmarks_read_all ON public.market_price_benchmarks
    FOR SELECT USING (true);
