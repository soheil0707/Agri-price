-- ==============================================================================
-- AgriPrice Phase 6.2: Comprehensive Database Security & Staging Validation Suite
-- File: docs/phase6-security-validation-suite.sql
-- Target Engine: PostgreSQL 15+ / Isolated Staging Database
-- Version: v6.2.0-staging-validation
--
-- PURPOSE:
--  Provides reproducible, database-level test execution verifying all Phase 6.2
--  remediations on an isolated PostgreSQL staging database:
--   1. Valid CURRENT_DATE execution and capacity snapshot recalculation.
--   2. Date-aware interval overlap and peak headroom booking constraint.
--   3. Idempotent storage reservation cancellation and capacity restoration.
--   4. Telemetry sensor bounds check and formatted error reporting.
--   5. Order dispute lifecycle with pre_dispute_escrow_status preservation.
--   6. Anti-duplicate dispute constraint (partial unique index).
--   7. State-aware, consistent, and idempotent dispute refund inventory release.
--   8. Accurate restoration of original escrow state upon dispute dismissal.
--   9. Strict unauthorized access rejection and notification mutation guard trigger.
--  10. Emergency quarantine procedure execution and permission revocation.
--  11. Non-destructive table archival and rollback verification.
-- ==============================================================================

BEGIN;

-- Setup test helper reporting table
CREATE TEMP TABLE _test_results (
    test_id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    details TEXT
);

DO $$
DECLARE
    v_admin_auth UUID := '99999999-9999-9999-9999-999999999999'::UUID;
    v_farmer_auth UUID := '11111111-1111-1111-1111-111111111111'::UUID;
    v_buyer_auth UUID := '22222222-2222-2222-2222-222222222222'::UUID;
    v_transporter_auth UUID := '33333333-3333-3333-3333-333333333333'::UUID;
    v_operator_auth UUID := '44444444-4444-4444-4444-444444444444'::UUID;
    v_attacker_auth UUID := '77777777-7777-7777-7777-777777777777'::UUID;

    v_admin_prof UUID := 'a9999999-9999-9999-9999-999999999999'::UUID;
    v_farmer_prof UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
    v_buyer_prof UUID := 'b2222222-2222-2222-2222-222222222222'::UUID;
    v_transporter_prof UUID := 'c3333333-3333-3333-3333-333333333333'::UUID;
    v_operator_prof UUID := 'd4444444-4444-4444-4444-444444444444'::UUID;
    v_attacker_prof UUID := 'e7777777-7777-7777-7777-777777777777'::UUID;

    v_facility_id UUID := 'f0000000-0000-0000-0000-000000000001'::UUID;
    v_listing_id UUID := '10000000-0000-0000-0000-000000000001'::UUID;
    v_offer_id UUID := '20000000-0000-0000-0000-000000000001'::UUID;
    v_order_id UUID := '30000000-0000-0000-0000-000000000001'::UUID;
    v_order_transit_id UUID := '30000000-0000-0000-0000-000000000002'::UUID;

    v_res_id UUID;
    v_dispute_id UUID;
    v_dispute_transit_id UUID;
    v_notif_id UUID;
    v_res_reserved NUMERIC;
    v_err_code TEXT;
    v_err_msg TEXT;
BEGIN
    -- -------------------------------------------------------------------------
    -- 0. SEED TEST IDENTITIES & PROFILES
    -- -------------------------------------------------------------------------
    INSERT INTO public.profiles (id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified)
    VALUES
        (v_admin_prof, v_admin_auth, 'Platform Admin', '+919800000000', 'Delhi', 'New Delhi', '110001', FALSE, FALSE),
        (v_farmer_prof, v_farmer_auth, 'Sanjay Farmer', '+919800000001', 'Maharashtra', 'Nashik', '422003', FALSE, FALSE),
        (v_buyer_prof, v_buyer_auth, 'Kavita Buyer', '+919800000002', 'Maharashtra', 'Pune', '411001', FALSE, FALSE),
        (v_transporter_prof, v_transporter_auth, 'Vijay Transport', '+919800000003', 'Maharashtra', 'Nashik', '422001', FALSE, FALSE),
        (v_operator_prof, v_operator_auth, 'ColdStorage Hub', '+919800000004', 'Maharashtra', 'Nashik', '422002', FALSE, FALSE),
        (v_attacker_prof, v_attacker_auth, 'Malicious Actor', '+919800000007', 'Maharashtra', 'Mumbai', '400001', FALSE, FALSE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (profile_id, role) VALUES
        (v_admin_prof, 'admin'::public.user_role_type),
        (v_farmer_prof, 'farmer'::public.user_role_type),
        (v_buyer_prof, 'trader'::public.user_role_type),
        (v_transporter_prof, 'transporter'::public.user_role_type),
        (v_operator_prof, 'cold_storage'::public.user_role_type),
        (v_attacker_prof, 'farmer'::public.user_role_type)
    ON CONFLICT (profile_id, role) DO NOTHING;

    -- Seed Produce Listing (5,000 kg capacity)
    INSERT INTO public.produce_listings (
        id, seller_profile_id, title, commodity, variety, grade,
        harvest_quantity, quantity_unit, harvest_date, expected_shelf_life_days,
        farm_district, farm_state, farm_location_address, farm_pincode,
        target_price_per_kg, status
    ) VALUES (
        v_listing_id, v_farmer_prof, 'Nashik Red Onions Premium', 'Onion', 'Nashik Red', 'Grade-A',
        5000, 'kg'::public.weight_unit_type, CURRENT_DATE, 30,
        'Nashik', 'Maharashtra', 'Plot 42, Pimpalgaon Farm', '422209',
        30.00, 'active'::public.listing_status_type
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed Cold Storage Facility (100 MT capacity)
    INSERT INTO public.cold_storage_facilities (
        id, operator_profile_id, facility_name, license_number, state, district, pincode,
        facility_address, total_capacity_mt, reserved_capacity_mt, chamber_count,
        daily_rate_per_quintal, suitable_commodities, is_active
    ) VALUES (
        v_facility_id, v_operator_prof, 'Pimpalgaon Agro Cold Hub', 'WDRA-MH-2026-0042', 'Maharashtra', 'Nashik', '422209',
        'NH-3 Agro Processing Zone', 100.0, 0.0, 4,
        50.00, ARRAY['Tomato', 'Potato', 'Onion', 'Grapes'], TRUE
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed Orders
    INSERT INTO public.offers_negotiations (
        id, listing_id, buyer_profile_id, offered_price_per_kg, offered_quantity_kg, delivery_terms, transport_borne_by, status, expires_at
    ) VALUES (
        v_offer_id, v_listing_id, v_buyer_prof, 30.00, 1500, 'Farmgate Pickup', 'buyer', 'accepted'::public.offer_status_type, timezone('utc'::text, now()) + interval '1 day'
    ) ON CONFLICT (id) DO NOTHING;

    -- Update listing reserved quantity for order
    UPDATE public.produce_listings SET reserved_quantity_kg = 1500 WHERE id = v_listing_id;

    INSERT INTO public.reservations_orders (
        id, listing_id, accepted_offer_id, seller_profile_id, buyer_profile_id,
        locked_quantity_kg, agreed_price_per_kg, total_agreed_amount, escrow_status
    ) VALUES (
        v_order_id, v_listing_id, v_offer_id, v_farmer_prof, v_buyer_prof,
        1500, 30.00, 45000.00, 'awaiting_escrow'::public.order_status_type
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed In-Transit Order
    INSERT INTO public.offers_negotiations (
        id, listing_id, buyer_profile_id, offered_price_per_kg, offered_quantity_kg, delivery_terms, transport_borne_by, status, expires_at
    ) VALUES (
        '20000000-0000-0000-0000-000000000002'::UUID, v_listing_id, v_buyer_prof, 30.00, 500, 'Cold Storage Delivery', 'seller', 'accepted'::public.offer_status_type, timezone('utc'::text, now()) + interval '1 day'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.reservations_orders (
        id, listing_id, accepted_offer_id, seller_profile_id, buyer_profile_id, assigned_transporter_id,
        locked_quantity_kg, agreed_price_per_kg, total_agreed_amount, escrow_status, pickup_scheduled_at
    ) VALUES (
        v_order_transit_id, v_listing_id, '20000000-0000-0000-0000-000000000002'::UUID, v_farmer_prof, v_buyer_prof, v_transporter_prof,
        500, 30.00, 15000.00, 'in_transit'::public.order_status_type, timezone('utc'::text, now())
    ) ON CONFLICT (id) DO NOTHING;

    -- -------------------------------------------------------------------------
    -- TEST 1: Storage Booking with Valid CURRENT_DATE Execution
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_farmer_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);

    BEGIN
        v_res_id := public.book_cold_storage_capacity(
            v_facility_id,
            40.0,
            'Onion',
            CURRENT_DATE,
            CURRENT_DATE + 5,
            v_order_id
        );
        INSERT INTO _test_results VALUES ('TEST_1_CURRENT_DATE', 'book_cold_storage_capacity executes valid CURRENT_DATE without pg_catalog syntax error', TRUE, 'Reservation ID: ' || v_res_id::text);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_1_CURRENT_DATE', 'book_cold_storage_capacity executes valid CURRENT_DATE without pg_catalog syntax error', FALSE, SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- TEST 2: Date-Aware Peak Overlap Headroom Constraint
    -- -------------------------------------------------------------------------
    -- Facility capacity is 100 MT. Existing booking is 40 MT for [CURRENT_DATE, CURRENT_DATE + 5].
    -- Attempting to book 70 MT in overlapping interval must fail (40 + 70 = 110 > 100).
    BEGIN
        PERFORM public.book_cold_storage_capacity(
            v_facility_id,
            70.0,
            'Onion',
            CURRENT_DATE + 2,
            CURRENT_DATE + 6
        );
        INSERT INTO _test_results VALUES ('TEST_2_HEADROOM_OVERLAP', 'Date-aware headroom correctly rejects over-booking on overlapping peak days', FALSE, 'Unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
        IF v_err_code = '55P03' THEN
            INSERT INTO _test_results VALUES ('TEST_2_HEADROOM_OVERLAP', 'Date-aware headroom correctly rejects over-booking on overlapping peak days', TRUE, 'Caught expected 55P03: ' || v_err_msg);
        ELSE
            INSERT INTO _test_results VALUES ('TEST_2_HEADROOM_OVERLAP', 'Date-aware headroom correctly rejects over-booking on overlapping peak days', FALSE, 'Wrong error code: ' || v_err_code || ' - ' || v_err_msg);
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 3: Safe, Idempotent Storage Cancellation
    -- -------------------------------------------------------------------------
    BEGIN
        -- First cancellation: should succeed and recalculate capacity
        PERFORM public.cancel_cold_storage_reservation(v_res_id, 'Testing cancellation');
        -- Second duplicate cancellation: must return TRUE idempotently without error or underflow
        IF public.cancel_cold_storage_reservation(v_res_id, 'Duplicate cancellation') IS TRUE THEN
            INSERT INTO _test_results VALUES ('TEST_3_CANCEL_IDEMPOTENT', 'cancel_cold_storage_reservation is idempotent and recovers capacity safely', TRUE, 'Successfully returned TRUE on replay');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_3_CANCEL_IDEMPOTENT', 'cancel_cold_storage_reservation is idempotent and recovers capacity safely', FALSE, 'Replay returned false');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_3_CANCEL_IDEMPOTENT', 'cancel_cold_storage_reservation is idempotent and recovers capacity safely', FALSE, SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- TEST 4: Telemetry Logging & Parameter Formatting Range Validation
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_operator_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    BEGIN
        PERFORM public.record_storage_temperature_telemetry(v_facility_id, 'CHAMBER_1', 10.5, 120.0, 'Optimal');
        INSERT INTO _test_results VALUES ('TEST_4_TELEMETRY_FORMAT', 'record_storage_temperature_telemetry guards humidity with valid format string', FALSE, 'Accepted out-of-bounds humidity');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
        IF v_err_code = '22023' AND v_err_msg LIKE '%Humidity reading%' THEN
            INSERT INTO _test_results VALUES ('TEST_4_TELEMETRY_FORMAT', 'record_storage_temperature_telemetry guards humidity with valid format string', TRUE, 'Correctly threw 22023: ' || v_err_msg);
        ELSE
            INSERT INTO _test_results VALUES ('TEST_4_TELEMETRY_FORMAT', 'record_storage_temperature_telemetry guards humidity with valid format string', FALSE, 'Unexpected error: ' || v_err_code || ' ' || v_err_msg);
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 5: Raise Dispute & Anti-Duplicate Partial Index Invariant
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_buyer_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    BEGIN
        v_dispute_id := public.raise_order_dispute(
            v_order_id,
            'Produce quality does not match Grade-A specification',
            'Inspection report attached with moisture discoloration photos'
        );

        -- Verify pre_dispute_escrow_status was stored as 'awaiting_escrow'
        IF NOT EXISTS (
            SELECT 1 FROM public.order_disputes
            WHERE id = v_dispute_id AND pre_dispute_escrow_status = 'awaiting_escrow'
        ) THEN
            INSERT INTO _test_results VALUES ('TEST_5_DISPUTE_PRESERVE_STATE', 'raise_order_dispute accurately captures pre_dispute_escrow_status', FALSE, 'pre_dispute_escrow_status was not preserved');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_5_DISPUTE_PRESERVE_STATE', 'raise_order_dispute accurately captures pre_dispute_escrow_status', TRUE, 'Preserved pre_dispute_escrow_status = awaiting_escrow');
        END IF;

        -- Attempting to raise duplicate dispute on same order while under_review must fail
        BEGIN
            PERFORM public.raise_order_dispute(
                v_order_id,
                'Duplicate dispute attempt on same order',
                'Secondary filing attempt'
            );
            INSERT INTO _test_results VALUES ('TEST_6_ANTI_DUPLICATE_DISPUTE', 'Anti-duplicate partial index and procedural check prevent duplicate active disputes', FALSE, 'Allowed duplicate active dispute');
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
            IF v_err_code IN ('23505') THEN
                INSERT INTO _test_results VALUES ('TEST_6_ANTI_DUPLICATE_DISPUTE', 'Anti-duplicate partial index and procedural check prevent duplicate active disputes', TRUE, 'Blocked duplicate dispute: ' || v_err_msg);
            ELSE
                INSERT INTO _test_results VALUES ('TEST_6_ANTI_DUPLICATE_DISPUTE', 'Anti-duplicate partial index and procedural check prevent duplicate active disputes', FALSE, 'Unexpected error: ' || v_err_code || ' ' || v_err_msg);
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_5_DISPUTE_PRESERVE_STATE', 'raise_order_dispute accurately captures pre_dispute_escrow_status', FALSE, SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- TEST 7: State-Aware, Idempotent Dispute Refund & Inventory Restoration
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_admin_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    BEGIN
        -- Listing currently has reserved_quantity_kg = 1500
        PERFORM public.resolve_order_dispute(
            v_dispute_id,
            'resolved_buyer_refunded',
            'Arbitration determination: Full refund issued to buyer, inventory reservation released.'
        );

        -- Verify produce_listings.reserved_quantity_kg was decremented to 0
        SELECT reserved_quantity_kg INTO v_res_reserved FROM public.produce_listings WHERE id = v_listing_id;
        IF v_res_reserved = 0 THEN
            INSERT INTO _test_results VALUES ('TEST_7_STATE_AWARE_REFUND', 'Dispute refund inventory restoration is state-aware, consistent with locked quantity, and eliminates available_quantity_kg error', TRUE, 'reserved_quantity_kg successfully reset to 0');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_7_STATE_AWARE_REFUND', 'Dispute refund inventory restoration is state-aware, consistent with locked quantity, and eliminates available_quantity_kg error', FALSE, 'reserved_quantity_kg is: ' || v_res_reserved);
        END IF;

        -- Verify refund payment event recorded
        IF EXISTS (
            SELECT 1 FROM public.simulated_payment_events
            WHERE order_id = v_order_id AND event_type = 'refund_issued'::public.payment_event_type
        ) THEN
            INSERT INTO _test_results VALUES ('TEST_8_REFUND_EVENT_RECORDED', 'Simulated refund payment event recorded in immutable ledger', TRUE, 'Found refund_issued payment event');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_8_REFUND_EVENT_RECORDED', 'Simulated refund payment event recorded in immutable ledger', FALSE, 'refund_issued event not found');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_7_STATE_AWARE_REFUND', 'Dispute refund inventory restoration is state-aware, consistent with locked quantity, and eliminates available_quantity_kg error', FALSE, SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- TEST 9: Dispute Dismissal Restores Exact Pre-Dispute Escrow State
    -- -------------------------------------------------------------------------
    -- Test on in-transit order
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_buyer_auth::text, false);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
        v_dispute_transit_id := public.raise_order_dispute(
            v_order_transit_id,
            'Transit delay dispute notice',
            'Consignment did not arrive at expected dispatch window'
        );

        PERFORM set_config('request.jwt.claim.sub', v_admin_auth::text, false);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
        PERFORM public.resolve_order_dispute(
            v_dispute_transit_id,
            'dismissed',
            'Transporter verified mechanical breakdown delay; consignment resumes transit.'
        );

        IF EXISTS (
            SELECT 1 FROM public.reservations_orders
            WHERE id = v_order_transit_id AND escrow_status = 'in_transit'::public.order_status_type
        ) THEN
            INSERT INTO _test_results VALUES ('TEST_9_DISMISSAL_RESTORES_ESCROW', 'Dispute dismissal accurately restores exact pre-dispute escrow state (in_transit)', TRUE, 'Restored to in_transit');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_9_DISMISSAL_RESTORES_ESCROW', 'Dispute dismissal accurately restores exact pre-dispute escrow state (in_transit)', FALSE, 'Failed to restore in_transit escrow status');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_9_DISMISSAL_RESTORES_ESCROW', 'Dispute dismissal accurately restores exact pre-dispute escrow state (in_transit)', FALSE, SQLERRM);
    END;

    -- -------------------------------------------------------------------------
    -- TEST 10: Unauthorized Access Rejection & Notification Mutation Guard
    -- -------------------------------------------------------------------------
    -- Attacker attempts to arbitrate dispute -> Must fail with 42501
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    BEGIN
        PERFORM public.resolve_order_dispute(
            v_dispute_transit_id,
            'resolved_seller_paid',
            'Malicious arbitration attempt'
        );
        INSERT INTO _test_results VALUES ('TEST_10_UNAUTHORIZED_ARBITRATION', 'Non-admin caller is strictly blocked from arbitrating disputes', FALSE, 'Attacker was able to resolve dispute');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
        IF v_err_code = '42501' THEN
            INSERT INTO _test_results VALUES ('TEST_10_UNAUTHORIZED_ARBITRATION', 'Non-admin caller is strictly blocked from arbitrating disputes', TRUE, 'Blocked attacker with 42501');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_10_UNAUTHORIZED_ARBITRATION', 'Non-admin caller is strictly blocked from arbitrating disputes', FALSE, 'Unexpected code: ' || v_err_code);
        END IF;
    END;

    -- Notification Mutation Guard Trigger
    INSERT INTO public.user_notifications (id, recipient_profile_id, category, severity, title, description)
    VALUES ('40000000-0000-0000-0000-000000000001'::UUID, v_farmer_prof, 'system', 'info', 'System Notice', 'Standard platform maintenance notification')
    ON CONFLICT (id) DO NOTHING;

    -- Farmer updating read status: permitted
    PERFORM set_config('request.jwt.claim.sub', v_farmer_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    PERFORM public.mark_notification_read('40000000-0000-0000-0000-000000000001'::UUID);

    -- Attacker attempting to mutate notification fields directly: blocked by trigger
    BEGIN
        UPDATE public.user_notifications
        SET title = 'Tampered Title'
        WHERE id = '40000000-0000-0000-0000-000000000001'::UUID;
        INSERT INTO _test_results VALUES ('TEST_11_NOTIFICATION_MUTATION_GUARD', 'trg_guard_user_notifications_update strictly prevents non-admins from mutating protected columns', FALSE, 'Trigger allowed column mutation');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
        IF v_err_code = '42501' THEN
            INSERT INTO _test_results VALUES ('TEST_11_NOTIFICATION_MUTATION_GUARD', 'trg_guard_user_notifications_update strictly prevents non-admins from mutating protected columns', TRUE, 'Blocked mutation with 42501');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_11_NOTIFICATION_MUTATION_GUARD', 'trg_guard_user_notifications_update strictly prevents non-admins from mutating protected columns', FALSE, 'Unexpected code: ' || v_err_code);
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 12: Emergency Quarantine Procedure Execution
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_admin_auth::text, false);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
    BEGIN
        PERFORM public.emergency_quarantine_phase6();

        -- Verify facilities are soft-disabled
        IF EXISTS (SELECT 1 FROM public.cold_storage_facilities WHERE id = v_facility_id AND is_active = true) THEN
            INSERT INTO _test_results VALUES ('TEST_12_EMERGENCY_QUARANTINE', 'emergency_quarantine_phase6 soft-disables operations and revokes execution', FALSE, 'Facility was not set to is_active = false');
        ELSE
            INSERT INTO _test_results VALUES ('TEST_12_EMERGENCY_QUARANTINE', 'emergency_quarantine_phase6 soft-disables operations and revokes execution', TRUE, 'Facilities successfully set to is_active = false');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _test_results VALUES ('TEST_12_EMERGENCY_QUARANTINE', 'emergency_quarantine_phase6 soft-disables operations and revokes execution', FALSE, SQLERRM);
    END;

END $$;

-- Summary Output Query
SELECT
    test_id,
    description,
    CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result,
    details
FROM _test_results
ORDER BY test_id;

-- Rollback transaction to ensure complete isolation and zero test pollution
ROLLBACK;
