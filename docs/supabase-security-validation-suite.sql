-- ==============================================================================
-- AgriPrice: Supabase SQL Editor Security & Permission Validation Suite
-- Target Schema: docs/database-schema-proposal-v5.sql
-- File Path: docs/supabase-security-validation-suite.sql
-- Execution Target: Supabase Dashboard SQL Editor (Single Session)
-- 
-- STATUS: Staging / Pre-Production Validation Script
-- NOTE: This script is fully self-contained. It seeds isolated fixtures inside a
-- single atomic transaction and rolls back at the end, ensuring zero persistent
-- side-effects or test pollution in the project database.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. FIXTURE SETUP (RUN UNDER SERVICE_ROLE / POSTGRES TO SEED IDENTITIES)
-- ==============================================================================

-- Clean up any residual test records from prior runs
DELETE FROM public.profiles WHERE auth_user_id IN (
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid
);

-- Seed Farmer Profile (Initial registration: unverified)
INSERT INTO public.profiles (
    id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
) VALUES (
    'a1111111-1111-1111-1111-111111111111'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Ramesh Patil (Farmer)',
    '+919822011111',
    'Maharashtra',
    'Nashik',
    '422003',
    FALSE,
    FALSE
);

-- Seed Buyer Profile (Initial registration: unverified)
INSERT INTO public.profiles (
    id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
) VALUES (
    'b2222222-2222-2222-2222-222222222222'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'Suresh Agro Traders',
    '+919822022222',
    'Maharashtra',
    'Pune',
    '411001',
    FALSE,
    FALSE
);

-- Seed Transporter Profile (Initial registration: unverified)
INSERT INTO public.profiles (
    id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
) VALUES (
    'c3333333-3333-3333-3333-333333333333'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    'Kisan Logistics',
    '+919822033333',
    'Maharashtra',
    'Nashik',
    '422001',
    FALSE,
    FALSE
);

-- Seed Attacker Profile (Initial registration: unverified)
INSERT INTO public.profiles (
    id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
) VALUES (
    'e7777777-7777-7777-7777-777777777777'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid,
    'Mallory Malicious',
    '+919822077777',
    'Maharashtra',
    'Mumbai',
    '400001',
    FALSE,
    FALSE
);

-- Assign Roles
INSERT INTO public.user_roles (profile_id, role) VALUES 
    ('a1111111-1111-1111-1111-111111111111'::uuid, 'farmer'::public.user_role_type),
    ('b2222222-2222-2222-2222-222222222222'::uuid, 'trader'::public.user_role_type),
    ('c3333333-3333-3333-3333-333333333333'::uuid, 'transporter'::public.user_role_type);

-- Seed Listing with Private Coordinates
INSERT INTO public.produce_listings (
    id, seller_profile_id, title, commodity, variety, grade,
    harvest_quantity, quantity_unit, harvest_date, expected_shelf_life_days,
    farm_district, farm_state, farm_location_address, farm_pincode, latitude, longitude,
    target_price_per_kg, status
) VALUES (
    '10000000-0000-0000-0000-000000000001'::uuid,
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'Premium Fresh Nashik Tomatoes',
    'Tomato',
    'Vaishali Hybrid',
    'Grade A',
    5000.0000,
    'kg'::public.weight_unit_type,
    CURRENT_DATE,
    14,
    'Nashik',
    'Maharashtra',
    'Survey 142/3, Pimpalgaon Baswant',
    '422209',
    20.1742000,
    73.9876000,
    25.00,
    'active'::public.listing_status_type
);

-- Seed Pending Offer
INSERT INTO public.offers_negotiations (
    id, listing_id, buyer_profile_id, offered_price_per_kg, offered_quantity_kg,
    delivery_terms, transport_borne_by, status, expires_at
) VALUES (
    '20000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'b2222222-2222-2222-2222-222222222222'::uuid,
    24.00,
    2000.0000,
    'Ex-Farm Gate Collection within 48h',
    'buyer',
    'pending'::public.offer_status_type,
    NOW() + INTERVAL '2 days'
);

-- Seed Disputed Order (for cancellation/refund tests)
INSERT INTO public.reservations_orders (
    id, listing_id, accepted_offer_id, seller_profile_id, buyer_profile_id,
    locked_quantity_kg, agreed_price_per_kg, total_agreed_amount, escrow_status
) VALUES (
    '30000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'b2222222-2222-2222-2222-222222222222'::uuid,
    2000.0000,
    24.00,
    48000.00,
    'awaiting_escrow'::public.order_status_type
);

-- ==============================================================================
-- 2. TEST EXECUTION: ISOLATED ASSERTION RUNNER
-- ==============================================================================

DO $$
DECLARE
    v_test_failed BOOLEAN := FALSE;
    v_listing RECORD;
    v_event_id UUID;
    v_cancel_res BOOLEAN;
BEGIN
    RAISE NOTICE '------------------------------------------------------------';
    RAISE NOTICE 'AGRIPRICE SECURITY VALIDATION SUITE — SUPABASE TEST EXECUTION';
    RAISE NOTICE '------------------------------------------------------------';

    -- --------------------------------------------------------------------------
    -- TEST 1.1: KYC / Bank Verification Tampering on INSERT Blocked
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        INSERT INTO public.profiles (
            id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
        ) VALUES (
            'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
            '88888888-8888-8888-8888-888888888888'::uuid,
            'Fake KYC User',
            '+919999900000',
            'Maharashtra',
            'Pune',
            '411001',
            TRUE,
            TRUE
        );
        RAISE EXCEPTION 'TEST 1.1 FAILED: Profile with pre-verified KYC was inserted by authenticated role!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Security Policy Violation: Initial profile registration cannot set kyc_verified or bank_account_verified to TRUE%' THEN
                RAISE NOTICE '✔ TEST 1.1 PASSED: Self-KYC elevation on INSERT was rejected.';
            ELSE
                RAISE EXCEPTION 'TEST 1.1 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 1.2: KYC / Bank Verification Tampering on UPDATE Blocked
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        UPDATE public.profiles 
        SET kyc_verified = TRUE 
        WHERE auth_user_id = '77777777-7777-7777-7777-777777777777'::uuid;

        RAISE EXCEPTION 'TEST 1.2 FAILED: User modified kyc_verified flag without admin role!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Security Policy Violation: Modification of kyc_verified or bank_account_verified requires administrative authority%' THEN
                RAISE NOTICE '✔ TEST 1.2 PASSED: Self-KYC elevation on UPDATE was rejected.';
            ELSE
                RAISE EXCEPTION 'TEST 1.2 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 2.1: Anonymous Role Can Query public_produce_listings View
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE anon;
        SET LOCAL "request.jwt.claim.role" = 'anon';

        SELECT id, farm_district, farm_state, available_quantity_kg INTO v_listing
        FROM public.public_produce_listings
        WHERE id = '10000000-0000-0000-0000-000000000001'::uuid;

        IF v_listing.farm_district = 'Nashik' AND v_listing.available_quantity_kg = 5000.0000 THEN
            RAISE NOTICE '✔ TEST 2.1 PASSED: Anonymous user successfully queried public_produce_listings.';
        ELSE
            RAISE EXCEPTION 'TEST 2.1 FAILED: Unexpected listing values returned to anonymous role.';
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 2.2: Direct Column Access to Private Location Denied
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        EXECUTE 'SELECT farm_location_address FROM public.produce_listings WHERE id = ''10000000-0000-0000-0000-000000000001''::uuid';
        RAISE EXCEPTION 'TEST 2.2 FAILED: Buyer directly accessed private farm_location_address on base table!';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '✔ TEST 2.2 PASSED: Direct column access to private farm address was denied.';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%permission denied for column farm_location_address of relation produce_listings%' THEN
                RAISE NOTICE '✔ TEST 2.2 PASSED: Direct column access to private farm address was denied.';
            ELSE
                RAISE EXCEPTION 'TEST 2.2 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 3.1: Attacker Cannot Cancel Unrelated Order (Authorization Pre-Check)
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777'; -- Attacker
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        PERFORM public.cancel_reservation_and_release_inventory(
            '30000000-0000-0000-0000-000000000001'::uuid, 
            'Malicious cancellation probe'
        );
        RAISE EXCEPTION 'TEST 3.1 FAILED: Attacker cancelled unrelated order!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Authorization Violation: Caller is not an authorized party to order%' THEN
                RAISE NOTICE '✔ TEST 3.1 PASSED: Unrelated caller was denied cancellation before status check.';
            ELSE
                RAISE EXCEPTION 'TEST 3.1 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 3.2: Repeated Cancellation Idempotency
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111'; -- Seller
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        v_cancel_res := public.cancel_reservation_and_release_inventory(
            '30000000-0000-0000-0000-000000000001'::uuid, 
            'Legitimate seller cancellation'
        );
        IF v_cancel_res IS NOT TRUE THEN
            RAISE EXCEPTION 'TEST 3.2 FAILED: First cancellation should have returned TRUE';
        END IF;

        -- Second duplicate cancellation call
        v_cancel_res := public.cancel_reservation_and_release_inventory(
            '30000000-0000-0000-0000-000000000001'::uuid, 
            'Duplicate cancellation call'
        );
        IF v_cancel_res IS FALSE THEN
            RAISE NOTICE '✔ TEST 3.2 PASSED: Duplicate cancellation returned FALSE without repeated rollback.';
        ELSE
            RAISE EXCEPTION 'TEST 3.2 FAILED: Duplicate cancellation did not return FALSE!';
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 4.1: Tampered Payment Replay Raises Idempotency Conflict
    -- --------------------------------------------------------------------------
    BEGIN
        -- Re-arm order fixture under admin role before running payment test
        RESET ROLE;
        UPDATE public.reservations_orders 
        SET escrow_status = 'awaiting_escrow'::public.order_status_type
        WHERE id = '30000000-0000-0000-0000-000000000001'::uuid;

        -- Switch to authenticated buyer for payment invariant test
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222'; -- Buyer
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        v_event_id := public.record_simulated_payment_event(
            '30000000-0000-0000-0000-000000000001'::uuid,
            'escrow_hold_authorized'::public.payment_event_type,
            48000.00,
            'IDEMP-KEY-TEST-0000001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            '{"action": "escrow_hold"}'::jsonb
        );

        -- Attempt replay with tampered amount (40000 instead of 48000)
        PERFORM public.record_simulated_payment_event(
            '30000000-0000-0000-0000-000000000001'::uuid,
            'escrow_hold_authorized'::public.payment_event_type,
            40000.00,
            'IDEMP-KEY-TEST-0000001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            '{"action": "escrow_hold"}'::jsonb
        );

        RAISE EXCEPTION 'TEST 4.1 FAILED: Tampered payment replay did not trigger Idempotency Conflict!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Idempotency Conflict: Key IDEMP-KEY-TEST-0000001 was previously submitted with a different%' THEN
                RAISE NOTICE '✔ TEST 4.1 PASSED: Tampered payment replay raised Idempotency Conflict.';
            ELSE
                RAISE EXCEPTION 'TEST 4.1 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 5.1: Negotiated Terms Immutability Enforced
    -- --------------------------------------------------------------------------
    BEGIN
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222'; -- Buyer
        SET LOCAL "request.jwt.claim.role" = 'authenticated';

        UPDATE public.offers_negotiations 
        SET transport_borne_by = 'seller'
        WHERE id = '20000000-0000-0000-0000-000000000001'::uuid;

        RAISE EXCEPTION 'TEST 5.1 FAILED: Buyer altered transport_borne_by on existing offer!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Security Policy Violation: Negotiated terms (listing, buyer, price, quantity, delivery, transport, expiry) are immutable once submitted%' THEN
                RAISE NOTICE '✔ TEST 5.1 PASSED: Negotiated transport terms cannot be altered on submitted offer.';
            ELSE
                RAISE EXCEPTION 'TEST 5.1 UNEXPECTED ERROR: %', SQLERRM;
            END IF;
    END;

    RAISE NOTICE '------------------------------------------------------------';
    RAISE NOTICE 'ALL 7 CRITICAL SINGLE-SESSION INVARIANTS VERIFIED SUCCESSFULLY.';
    RAISE NOTICE '------------------------------------------------------------';
END $$;

-- Rollback the entire transaction so no scratch data persists in Supabase
ROLLBACK;
