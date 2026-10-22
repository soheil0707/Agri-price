# AgriPrice Database Security Test Plan (v2)
**Document Version:** v2.0.0-test-plan  
**Target Specification:** [`docs/database-schema-proposal-v3.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v3.sql)  
**Status:** Verification Test Suite Specification (Pre-Implementation / Staging Target)  
**Safety Scope:** Test harness design only. No live database connected; no migrations executed.

---

## 1. Overview & Test Architecture

This test plan defines functional, negative, concurrent, and state-machine tests to verify the security invariants of `docs/database-schema-proposal-v3.sql`.

### Key Verification Focus:
1. **Zero-Trust Caller Derivation**: Privileged functions derive caller identity exclusively from `auth.uid()` and reject spoofed profile parameters.
2. **Idempotent Inventory Restoration**: Repeated reservation cancellations do not decrement inventory multiple times.
3. **Idempotency Key Tamper Detection**: Payment replay with mismatched payload hash or amount triggers an explicit conflict exception.
4. **State Machine Integrity**: Payment actions and offer negotiations enforce prerequisite states and permissible status transitions.
5. **Location Masking & PII Isolation**: Unapproved buyers cannot access farmer phone numbers, bank statuses, physical farm addresses, or GPS coordinates.

---

## 2. Test Suite 1: Zero-Trust Identity & Profile Protection

### Test 1.1: Spoofed Seller Profile ID in Offer Acceptance Rejected
- **Invariant**: A caller cannot accept an offer on another farmer's listing by supplying their profile ID.
- **Setup**:
  - Farmer Profile: `profile-farmer-1` (`auth_user_id = 'user-farmer-1'`).
  - Attacker Profile: `profile-buyer-2` (`auth_user_id = 'user-buyer-2'`).
  - Listing `listing-tomato-5000` owned by `profile-farmer-1`.
  - Offer `offer-101` on listing.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = 'user-buyer-2';
  SELECT public.accept_offer_and_create_reservation('offer-101');
  ```
- **Expected Result**: Aborts with exception:
  `ERROR: Authorization Violation: Caller profile ... is not the seller of listing ...`
- **Pass Criteria**: `reservations_orders` is not created; offer remains pending.

### Test 1.2: Profile Reassignment and Self-KYC Modification Blocked
- **Invariant**: Users cannot change `auth_user_id`, `id`, `kyc_verified`, or `bank_account_verified`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = 'user-farmer-1';

  -- Case A: Attempt auth_user_id hijack
  UPDATE public.profiles SET auth_user_id = 'user-buyer-2' WHERE auth_user_id = 'user-farmer-1';
  -- Case B: Attempt self-KYC elevation
  UPDATE public.profiles SET kyc_verified = TRUE WHERE auth_user_id = 'user-farmer-1';
  ```
- **Expected Result**:
  - Case A raises: `ERROR: Security Policy Violation: Reassignment of auth_user_id is strictly prohibited.`
  - Case B raises: `ERROR: Security Policy Violation: Users cannot alter their own verification status...`
- **Pass Criteria**: Trigger `trg_protect_profile_fields` fires and rolls back both operations.

---

## 3. Test Suite 2: Location Privacy & Micro-Location Decoupling

### Test 3.1: Anonymous Browsing Restricts Location to Macro Geography
- **Invariant**: Unauthenticated users browsing the marketplace receive district and state, but never exact street address or coordinates.
- **Execution**:
  ```sql
  SET LOCAL ROLE anon;
  SELECT farm_district, farm_state FROM public.public_produce_listings WHERE commodity = 'Tomato';
  ```
- **Expected Result**: Returns rows with district and state. Attempting to select `farm_location_address`, `latitude`, `longitude`, or `farm_pincode` from `public_produce_listings` fails at parse time (columns do not exist in view).
- **Pass Criteria**: Zero coordinate or street address leakage.

### Test 3.2: Direct Table Coordinate Access Denied to Non-Escrowed Buyers
- **Invariant**: A buyer who has only submitted an offer (or has an un-funded order) cannot read physical coordinates from `produce_listings`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = 'user-buyer-pending';
  SELECT farm_location_address, latitude, longitude FROM public.produce_listings WHERE id = 'listing-tomato-5000';
  ```
- **Expected Result**: 0 rows returned (blocked by `listings_select_authorized`).
- **Pass Criteria**: Base table RLS hides sensitive columns until order reaches `escrow_funded`.

---

## 4. Test Suite 3: Concurrency-Safe Reservations & Double-Cancellation

### Test 4.1: Concurrent Inventory Reservation Race
- **Invariant**: When concurrent buyers attempt to reserve produce exceeding available inventory, total reservations never exceed total volume.
- **Scenario**: Listing has 5,000 kg.
  - Worker 1 attempts to accept Offer 1 (3,500 kg).
  - Worker 2 attempts to accept Offer 2 (2,500 kg) simultaneously.
- **Execution**:
  - Worker 1: `SELECT public.accept_offer_and_create_reservation('offer-1');`
  - Worker 2: `SELECT public.accept_offer_and_create_reservation('offer-2');`
- **Expected Result**:
  - Worker 1 succeeds, locking 3,500 kg (`reserved_quantity_kg = 3500`).
  - Worker 2 blocks on `SELECT ... FOR UPDATE`, then throws:
    `ERROR: Insufficient Inventory: Available 1500 kg, Requested 2500 kg`
- **Pass Criteria**: `reserved_quantity_kg` equals 3,500 kg, not 6,000 kg.

### Test 4.2: Repeated Cancellation Idempotency (Preventing Inventory Leak)
- **Invariant**: Cancelling an order multiple times does not decrement `reserved_quantity_kg` more than once.
- **Setup**: Order locks 2,000 kg on listing of 5,000 kg (`reserved_quantity_kg = 2000`).
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = 'user-farmer-1';

  -- Call 1: First cancellation
  SELECT public.cancel_reservation_and_release_inventory('order-id', 'Buyer non-responsive');
  -- Call 2: Duplicate cancellation
  SELECT public.cancel_reservation_and_release_inventory('order-id', 'Duplicate cancel request');
  ```
- **Expected Result**:
  - Call 1 returns `TRUE`. Listing `reserved_quantity_kg` drops from 2,000 kg to 0 kg.
  - Call 2 returns `FALSE` (idempotent no-op). Listing `reserved_quantity_kg` remains 0 kg.
- **Pass Criteria**: Inventory is restored exactly once; no double-decrement occurs.

---

## 5. Test Suite 4: Offer Negotiation State Machine

### Test 5.1: Seller Rejection & Countering Permitted
- **Invariant**: Sellers can update incoming pending offers to `rejected` or `countered`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = 'user-farmer-1';

  UPDATE public.offers_negotiations 
  SET status = 'countered', notes = 'Can deliver for ₹29/kg'
  WHERE id = 'offer-101' AND status = 'pending';
  ```
- **Expected Result**: 1 row updated successfully (permitted by `offers_update_seller_decide`).
- **Pass Criteria**: Farmer can negotiate without RLS failure.

### Test 5.2: Seller Cannot Accept Expired Offer
- **Invariant**: Offers past `expires_at` cannot be accepted.
- **Setup**: Offer has `expires_at = NOW() - INTERVAL '10 minutes'`.
- **Execution**:
  ```sql
  SELECT public.accept_offer_and_create_reservation('expired-offer-id');
  ```
- **Expected Result**: Throws `ERROR: Offer ... has expired at ...`. Offer status set to `expired`.
- **Pass Criteria**: Transaction aborts.

---

## 6. Test Suite 5: Payment Idempotency & Tamper Detection

### Test 6.1: Identical Payment Replay Returns Existing Event ID
- **Execution**:
  ```sql
  SELECT public.record_simulated_payment_event('order-1', 'escrow_hold_authorized', 50000.00, 'KEY-12345678901234', 'hash-aaa', '{}');
  -- Second call with identical payload
  SELECT public.record_simulated_payment_event('order-1', 'escrow_hold_authorized', 50000.00, 'KEY-12345678901234', 'hash-aaa', '{}');
  ```
- **Expected Result**: Both calls return identical UUID. `simulated_payment_events` row count remains 1.

### Test 6.2: Replay with Tampered Hash or Amount Throws Conflict
- **Execution**:
  ```sql
  -- Attempt to replay KEY-12345678901234 with altered amount
  SELECT public.record_simulated_payment_event('order-1', 'escrow_hold_authorized', 10000.00, 'KEY-12345678901234', 'hash-tampered', '{}');
  ```
- **Expected Result**: Throws `ERROR: Idempotency Conflict: Key ... was previously submitted with a different payload hash, amount, or order ID.`
- **Pass Criteria**: Replay tampering detected and rejected.

### Test 6.3: Invalid State Transition Rejection
- **Execution**:
  ```sql
  -- Attempt to settle proceeds on an order that is still in 'awaiting_escrow'
  SELECT public.record_simulated_payment_event('order-awaiting', 'farmer_proceeds_settled', 50000.00, 'KEY-SETTLE-001', 'hash-bbb', '{}');
  ```
- **Expected Result**: Throws `ERROR: State Conflict: Cannot settle proceeds before inspection acceptance (current status: awaiting_escrow)`.
- **Pass Criteria**: Premature settlement blocked.

---

## 7. Automated pgTAP Functional Test Harness (Executable Template)

```sql
BEGIN;
SELECT plan(12);

-- 1. Verify Extension & Function Presence
SELECT has_extension('uuid-ossp');
SELECT has_extension('pgcrypto');
SELECT has_function('public', 'accept_offer_and_create_reservation', ARRAY['uuid']);
SELECT has_function('public', 'cancel_reservation_and_release_inventory', ARRAY['uuid', 'text']);
SELECT has_function('public', 'record_simulated_payment_event', ARRAY['uuid', 'payment_event_type', 'numeric', 'text', 'text', 'jsonb']);

-- 2. Negative Authorization Test: Unauthenticated caller cannot accept offer
SELECT throws_ok(
    $$ SELECT public.accept_offer_and_create_reservation('00000000-0000-0000-0000-000000000001'::uuid) $$,
    'Authentication Required: Caller must be authenticated to accept offers.',
    'Unauthenticated offer acceptance must be rejected'
);

-- 3. Verify Payment Ledger Immutability Trigger
SELECT has_trigger('public', 'simulated_payment_events', 'trg_block_payment_event_modifications', 'Payment events immutability trigger attached');

-- 4. Verify Views exist and are readable
SELECT has_view('public', 'public_profiles', 'Public profiles view exists');
SELECT has_view('public', 'public_produce_listings', 'Public produce listings view exists');

SELECT * FROM finish();
ROLLBACK;
```
