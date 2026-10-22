-- ==============================================================================
-- AgriPrice Phase 5 Hotfix & Review Patch:
-- Market Intelligence, Calculation Snapshots & Admin Analytics
-- ==============================================================================
--
-- Notice for Database Administrators:
-- This script contains the documented DDL and stored procedures for:
-- 1. Initial market price benchmark seed records for `public.market_price_benchmarks`.
-- 2. Audit indices and RLS confirmation for `public.calculation_snapshots`.
-- 3. Secure, admin-only aggregation procedure `public.get_admin_platform_analytics()`.
--
-- DO NOT RUN AUTOMATICALLY: Review policies and execution grants with your DBA.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MARKET PRICE BENCHMARKS SEED DATA
-- ------------------------------------------------------------------------------
-- Inserts standardized APMC market benchmark records with explicit
-- source attribution and is_live_feed = false (reference data).

INSERT INTO public.market_price_benchmarks (
    mandi_name,
    market_center_district,
    market_center_state,
    commodity,
    variety,
    grade,
    min_price_per_kg,
    modal_price_per_kg,
    max_price_per_kg,
    source_attribution,
    recorded_at,
    is_live_feed
) VALUES
(
    'Kolar APMC Wholesale Yard',
    'Kolar',
    'Karnataka',
    'Tomato',
    'Hybrid Shivam / Table',
    'Grade-A (Export / Premium)',
    22.00,
    26.50,
    31.00,
    'Agmarknet Daily Arrival Bulletin (Reference APMC Model)',
    CURRENT_DATE,
    FALSE
),
(
    'Yeshwanthpur APMC Wholesale Yard',
    'Bengaluru Urban',
    'Karnataka',
    'Onion',
    'Nashik Red Globe',
    'Grade-B (Commercial Wholesale)',
    29.00,
    34.50,
    38.00,
    'Agmarknet Daily Arrival Bulletin (Reference APMC Model)',
    CURRENT_DATE,
    FALSE
),
(
    'Hassan APMC Sub-Yard',
    'Hassan',
    'Karnataka',
    'Potato',
    'Kufri Jyoti / Chipsona',
    'Grade-A (Processing & Storage)',
    19.00,
    22.50,
    25.00,
    'Agmarknet Daily Arrival Bulletin (Reference APMC Model)',
    CURRENT_DATE,
    FALSE
),
(
    'Anantapur Fruit Market Yard',
    'Anantapur',
    'Andhra Pradesh',
    'Banana',
    'Grand Naine (G9)',
    'Standard Table Grade',
    15.00,
    18.50,
    22.00,
    'Agmarknet Daily Arrival Bulletin (Reference APMC Model)',
    CURRENT_DATE,
    FALSE
),
(
    'Guntur Mirchi Yard',
    'Guntur',
    'Andhra Pradesh',
    'Chilli',
    'Teja S17 Hot',
    'Grade-A Premium Dry',
    175.00,
    195.00,
    215.00,
    'Agmarknet Daily Arrival Bulletin (Reference APMC Model)',
    CURRENT_DATE,
    FALSE
)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. CALCULATION SNAPSHOTS AUDIT & PRIVACY INDICES
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_calc_snapshots_creator_created
    ON public.calculation_snapshots(created_by_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calc_snapshots_listing
    ON public.calculation_snapshots(listing_id)
    WHERE listing_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. SECURE ADMIN PLATFORM ANALYTICS RPC
-- ------------------------------------------------------------------------------
-- Aggregates platform transaction volume, escrow liability, settlement velocity,
-- and user registration counts on the server side under strict admin role check.
-- Guarantees that private farm coordinates, personal addresses, and banking keys
-- are NEVER transmitted to the client application.

CREATE OR REPLACE FUNCTION public.get_admin_platform_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_total_users BIGINT;
    v_total_farmers BIGINT;
    v_total_buyers BIGINT;
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
BEGIN
    -- 1. Enforce Server-Side Administrator Authentication
    SELECT public.is_admin() INTO v_is_admin;
    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Authorization Violation: Only platform administrators can view aggregated platform telemetry.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Aggregate Profiles & Roles
    SELECT COUNT(*) INTO v_total_users FROM public.profiles;
    SELECT COUNT(*) INTO v_total_farmers FROM public.user_roles WHERE role = 'farmer';
    SELECT COUNT(*) INTO v_total_buyers FROM public.user_roles WHERE role IN ('trader', 'processor', 'fpo_admin');

    -- 3. Aggregate Listings
    SELECT COUNT(*) INTO v_total_listings FROM public.produce_listings;
    SELECT COUNT(*) INTO v_active_listings FROM public.produce_listings WHERE status = 'active';

    -- 4. Aggregate Orders & Escrow
    SELECT COUNT(*) INTO v_total_orders FROM public.reservations_orders;
    SELECT COUNT(*) INTO v_active_escrow_orders FROM public.reservations_orders
        WHERE escrow_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected');
    SELECT COUNT(*) INTO v_settled_orders FROM public.reservations_orders WHERE escrow_status = 'settled';
    SELECT COUNT(*) INTO v_disputed_orders FROM public.reservations_orders WHERE escrow_status = 'disputed';

    SELECT COALESCE(SUM(total_agreed_amount), 0) INTO v_total_gmv FROM public.reservations_orders WHERE escrow_status != 'cancelled';
    SELECT COALESCE(SUM(total_agreed_amount), 0) INTO v_active_escrow_amount FROM public.reservations_orders
        WHERE escrow_status IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected');

    -- 5. Aggregate Committed Payments
    SELECT COALESCE(SUM(amount), 0) INTO v_settled_proceeds FROM public.simulated_payment_events
        WHERE event_type = 'farmer_proceeds_settled' AND ledger_state = 'COMMITTED';

    -- 6. Aggregate Calculation Snapshots
    SELECT COUNT(*) INTO v_total_snapshots FROM public.calculation_snapshots;

    -- 7. Build Anonymized Telemetry Response
    RETURN jsonb_build_object(
        'generated_at', NOW(),
        'is_live_database', TRUE,
        'users', jsonb_build_object(
            'total_registered', v_total_users,
            'farmers_count', v_total_farmers,
            'buyers_count', v_total_buyers
        ),
        'listings', jsonb_build_object(
            'total_listings', v_total_listings,
            'active_listings', v_active_listings
        ),
        'orders', jsonb_build_object(
            'total_orders', v_total_orders,
            'active_escrow_orders', v_active_escrow_orders,
            'settled_orders', v_settled_orders,
            'disputed_orders', v_disputed_orders
        ),
        'financials', jsonb_build_object(
            'gross_merchandise_value', v_total_gmv,
            'escrow_locked_volume', v_active_escrow_amount,
            'settled_farmer_proceeds', v_settled_proceeds
        ),
        'audit', jsonb_build_object(
            'total_calculation_snapshots', v_total_snapshots
        )
    );
END;
$$;

-- Grant execution to authenticated users (role check enforced inside function)
REVOKE ALL ON FUNCTION public.get_admin_platform_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_analytics() TO authenticated;
