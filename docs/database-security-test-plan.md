# AgriPrice Database Security Test Plan
**Document Version:** v1.0.0-test-plan  
**Target Specification:** [`docs/database-schema-proposal-v2.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v2.sql)  
**Status:** Verification Test Suite Specification (Pre-Implementation / Staging Target)  
**Safety Scope:** Test harness design only. No live database connected; no migrations executed.

---

## 1. Overview & Testing Strategy

This test plan specifies the verification procedures for the security-hardened database schema (`docs/database-schema-proposal-v2.sql`). The tests are designed to be executed in an isolated PostgreSQL 15+ or Supabase local test container (using `pgTAP` or Node/TypeScript integration harnesses) prior to any staging deployment.

### Testing Principles:
- **Zero Production Risk**: Executed exclusively in isolated ephemeral test databases.
- **Negative Testing Priority**: Prove that unauthorized, fraudulent, or malformed operations are strictly rejected at the database engine level.
- **Multi-Tenant Impersonation**: Tests execute with PostgreSQL role switching (`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '...';`) to validate Row-Level Security from the exact perspective of different user roles.

---

## 2. Test Suite 1: Profile Privacy & Anti-Tamper KYC

### Test 1.1: Unauthorized PII Leakage via Direct Table Select
- **Objective**: Verify that an authenticated user cannot read another user's phone number, email, or bank status.
- **Setup**: Create User A (`auth_user_id = 'user-a'`) and User B (`auth_user_id = 'user-b'`).
- **Execution**: Impersonate User B and execute:
  ```sql
  SELECT phone_number, email, bank_account_verified FROM public.profiles WHERE auth_user_id = 'user-a';
  ```
- **Expected Result**: 0 rows returned (blocked by `profiles_select_self_or_admin`).
- **Pass Criteria**: Empty result set.

### Test 1.2: Public Profile Discovery via Masked View
- **Objective**: Verify that marketplace discovery works through `public_profiles` without leaking sensitive columns.
- **Execution**: Impersonate User B and execute:
  ```sql
  SELECT id, full_name, district, state, kyc_verified FROM public.public_profiles WHERE id = (SELECT id FROM public.profiles WHERE auth_user_id = 'user-a');
  ```
- **Expected Result**: 1 row returned containing public fields only.
- **Pass Criteria**: Name and district visible; phone/bank columns do not exist in view.

### Test 1.3: Self-Escalation of KYC & Bank Verification Block
- **Objective**: Verify that a user cannot self-verify their account.
- **Execution**: Impersonate User A and execute:
  ```sql
  UPDATE public.profiles SET kyc_verified = TRUE, bank_account_verified = TRUE WHERE auth_user_id = 'user-a';
  ```
- **Expected Result**: SQL execution aborted with exception:
  `ERROR: Security Violation: Users cannot alter their own verification status (kyc_verified or bank_account_verified).`
- **Pass Criteria**: Transaction rolls back; trigger `trg_protect_profile_fields` fires.

---

## 3. Test Suite 2: Farmer Location Privacy & Physical Security

### Test 2.1: Anonymous Marketplace Browsing Excludes Micro-Location
- **Objective**: Verify that unauthenticated or general buyers cannot see physical street addresses or GPS coordinates.
- **Execution**: Impersonate anonymous/public user on `public_produce_listings`:
  ```sql
  SELECT * FROM public.public_produce_listings WHERE commodity = 'Tomato';
  ```
- **Expected Result**: Results include `farm_district` and `farm_state`; `farm_location_address`, `latitude`, `longitude`, and `farm_pincode` are absent.
- **Pass Criteria**: No physical location coordinates leaked.

### Test 2.2: Direct Physical Location Select Denied to Non-Order Parties
- **Objective**: Verify that direct `produce_listings` table query for GPS coordinates returns 0 rows for unapproved buyers.
- **Execution**: Impersonate Buyer C (who has no active funded order) and query:
  ```sql
  SELECT farm_location_address, latitude, longitude FROM public.produce_listings WHERE id = 'listing-tomato-5000';
  ```
- **Expected Result**: 0 rows returned (blocked by `listings_select_authorized`).
- **Pass Criteria**: Access strictly denied.

### Test 2.3: Physical Address Disclosed Post-Escrow Funding
- **Objective**: Verify that once an order transitions to `escrow_funded`, the buyer and assigned transporter can access pickup coordinates.
- **Setup**: Create order in `escrow_funded` status for Buyer D.
- **Execution**: Impersonate Buyer D:
  ```sql
  SELECT farm_location_address, latitude, longitude FROM public.produce_listings WHERE id = 'listing-tomato-5000';
  ```
- **Expected Result**: 1 row returned with valid pickup location.
- **Pass Criteria**: Legitimate logistics access permitted only after escrow commitment.

---

## 4. Test Suite 3: Concurrency-Safe Inventory Reservations

### Test 3.1: Concurrent Double-Booking Race Condition Simulation
- **Objective**: Verify that two simultaneous transactions attempting to reserve more than available volume are properly serialized.
- **Scenario**: Listing has `5,000 kg` available.
  - Transaction 1 attempts to accept Offer 1 (`3,500 kg`).
  - Transaction 2 attempts to accept Offer 2 (`2,500 kg`) at the identical millisecond.
- **Execution (Simulated Concurrent Workers)**:
  - Worker 1: `SELECT public.accept_offer_and_create_reservation('offer-1', 'seller-id');`
  - Worker 2: `SELECT public.accept_offer_and_create_reservation('offer-2', 'seller-id');`
- **Expected Result**:
  - One transaction succeeds, creating an order and setting `reserved_quantity_kg = 3500`.
  - The second transaction blocks on `SELECT ... FOR UPDATE`, then throws:
    `ERROR: Insufficient Inventory: Available 1500 kg, Requested 2500 kg`
- **Pass Criteria**: No negative available balance; total reserved volume never exceeds 5,000 kg.

### Test 3.2: Direct Listing Oversell Check Constraint
- **Objective**: Verify that the database constraint `chk_reserved_lte_total` blocks accidental over-allocation.
- **Execution**: Run direct query:
  ```sql
  UPDATE public.produce_listings SET reserved_quantity_kg = 5500 WHERE id = 'listing-tomato-5000' AND quantity_in_kg = 5000;
  ```
- **Expected Result**: Fails with check constraint violation `chk_reserved_lte_total`.
- **Pass Criteria**: Hard constraint prevents corrupt updates.

---

## 5. Test Suite 4: Offer & Order Consistency Guards

### Test 5.1: Expired Offer Acceptance Rejection
- **Objective**: Verify that offers with `expires_at <= NOW()` cannot be accepted.
- **Setup**: Insert an offer with `expires_at = NOW() - INTERVAL '1 hour'`.
- **Execution**: Execute `accept_offer_and_create_reservation('expired-offer-id', 'seller-id')`.
- **Expected Result**: Throws exception: `Offer ... expired at ...`. Offer status transitioned to `expired`.
- **Pass Criteria**: Expired bids cannot be converted to orders.

### Test 5.2: Self-Trading Prevention (Farmer Buying Own Listing)
- **Objective**: Verify that a farmer cannot submit a bid on their own listing.
- **Execution**: Attempt to insert row into `offers_negotiations` where `buyer_profile_id` equals the listing's `seller_profile_id`.
- **Expected Result**: Trigger `trg_ensure_buyer_not_seller` fires with exception:
  `ERROR: Validation Error: A producer cannot submit purchase offers on their own produce listing.`
- **Pass Criteria**: Wash-trading and artificial volume generation prevented.

### Test 5.3: Order Amount Consistency Check
- **Objective**: Verify that orders cannot be created with mismatched financial totals.
- **Execution**: Attempt direct insert:
  ```sql
  INSERT INTO public.reservations_orders (..., locked_quantity_kg, agreed_price_per_kg, total_agreed_amount)
  VALUES (..., 1000, 25.00, 30000.00); -- Math says 25,000, but 30,000 entered
  ```
- **Expected Result**: Rejection via constraint `chk_order_amount_consistency`.
- **Pass Criteria**: Agreed amount strictly equals quantity * price.

---

## 6. Test Suite 5: Simulated Payment Ledger Idempotency & Immutability

### Test 6.1: Idempotency Key Replay Prevention
- **Objective**: Verify that re-sending the same payment event with an identical `idempotency_key` returns the existing record without creating duplicate entries or re-triggering state changes.
- **Execution**:
  1. Call `record_simulated_payment_event('order-1', 'escrow_hold_authorized', 25000.00, 'IDEMP-KEY-ABC-12345', 'sha256-hash', '{}');` &rarr; Returns UUID-1.
  2. Call identical function again with `'IDEMP-KEY-ABC-12345'`.
- **Expected Result**: Returns UUID-1. Count of rows in `simulated_payment_events` remains 1.
- **Pass Criteria**: Zero duplicate ledger records created.

### Test 6.2: Direct UPDATE / DELETE on Ledger Blocked
- **Objective**: Verify that financial ledger entries are completely immutable.
- **Execution**:
  ```sql
  UPDATE public.simulated_payment_events SET amount = 0 WHERE idempotency_key = 'IDEMP-KEY-ABC-12345';
  DELETE FROM public.simulated_payment_events WHERE idempotency_key = 'IDEMP-KEY-ABC-12345';
  ```
- **Expected Result**: Both statements throw exception from `trg_block_payment_event_modifications`:
  `ERROR: Security Policy Violation: Payment ledger entries are strictly immutable. Corrections require compensatory events.`
- **Pass Criteria**: Database blocks mutation even from superuser unless trigger is explicitly dropped.

### Test 6.3: Escrow Amount Reconciliation Failure
- **Objective**: Verify that authorization hold cannot be initiated with an amount differing from the agreed order amount.
- **Execution**: Order agreed amount is ₹1,12,380.00. Attempt to record hold with ₹1,00,000.00.
- **Expected Result**: Function raises:
  `ERROR: Amount Reconciliation Failure: Escrow hold 100000.00 does not match agreed order amount 112380.00`
- **Pass Criteria**: Partial or under-funded escrow authorizations rejected.

---

## 7. Test Suite 6: Rollback & Inventory Release Recovery

### Test 6.1: Atomic Reservation Cancellation
- **Objective**: Verify that order cancellation properly returns locked quantity to the listing's available pool.
- **Setup**: Listing starts with 5,000 kg, has 3,000 kg locked in an order (status: `awaiting_escrow`). Available is 2,000 kg.
- **Execution**: Execute `cancel_reservation_and_release_inventory('order-id', 'seller-id', 'Buyer failed escrow authorization');`
- **Expected Result**:
  - `produce_listings.reserved_quantity_kg` resets from 3,000 kg to 0 kg.
  - Listing status returns to `active`.
  - Order status updates to `cancelled`.
- **Pass Criteria**: Inventory immediately becomes available for other buyers.

---

## 8. Automated pgTAP Harness Template (For Staging Verification)

```sql
-- Sample pgTAP harness for automated CI execution in staging container:
BEGIN;
SELECT plan(8);

-- Test 1: Profiles RLS
SELECT has_table('public', 'profiles', 'Profiles table exists');
SELECT policies_are('public', 'profiles', ARRAY['profiles_select_self_or_admin', 'profiles_insert_self', 'profiles_update_self'], 'Profiles RLS policies verified');

-- Test 2: Immutability Trigger
SELECT has_trigger('public', 'simulated_payment_events', 'trg_block_payment_event_modifications', 'Payment events immutability trigger attached');

-- Test 3: Concurrency Function
SELECT has_function('public', 'accept_offer_and_create_reservation', ARRAY['uuid', 'uuid'], 'Atomic reservation procedure exists');

SELECT * FROM finish();
ROLLBACK;
```
