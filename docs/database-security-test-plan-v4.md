# AgriPrice Database Security Test Plan (v4)
**Document Version:** v4.0.0-test-plan  
**Target Specification:** [`docs/database-schema-proposal-v5.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v5.sql)  
**Status:** Verification Test Suite Specification (Pre-Implementation / Staging Target)  
**Safety Scope:** Test harness design only. No live database connected; no migrations executed.

---

## 1. Overview & Test Architecture

This test plan defines the comprehensive functional verification suite for `docs/database-schema-proposal-v5.sql`. It evaluates:
1. **Profile Registration & Anti-Tamper KYC Protection (INSERT & UPDATE)**.
2. **Column Privilege Security & View Accessibility under `anon` and `authenticated`**.
3. **Hardened SECURITY DEFINER Search Paths & Non-Recursive Admin RBAC**.
4. **Canonical Financial Payment Idempotency & Lifecycle Transitions**.
5. **Pre-Status Cancellation Authorization & Rollback Integrity**.
6. **Offer Terms Immutability & Permitted State Transitions**.
7. **Concurrency-Safe Stock Reservations**.

---

## 2. Test Fixtures & Role Definitions

### Global Test Identifiers (RFC-4122 Compliant UUIDs):
- `UUID_USER_FARMER`: `11111111-1111-1111-1111-111111111111`
- `UUID_PROFILE_FARMER`: `a1111111-1111-1111-1111-111111111111`
- `UUID_USER_BUYER`: `22222222-2222-2222-2222-222222222222`
- `UUID_PROFILE_BUYER`: `b2222222-2222-2222-2222-222222222222`
- `UUID_USER_TRANSPORTER`: `33333333-3333-3333-3333-333333333333`
- `UUID_PROFILE_TRANSPORTER`: `c3333333-3333-3333-3333-333333333333`
- `UUID_USER_ADMIN`: `99999999-9999-9999-9999-999999999999`
- `UUID_PROFILE_ADMIN`: `f9999999-9999-9999-9999-999999999999`
- `UUID_USER_ATTACKER`: `77777777-7777-7777-7777-777777777777`
- `UUID_PROFILE_ATTACKER`: `e7777777-7777-7777-7777-777777777777`

- `UUID_LISTING_1`: `10000000-0000-0000-0000-000000000001`
- `UUID_OFFER_1`: `20000000-0000-0000-0000-000000000001`
- `UUID_ORDER_1`: `30000000-0000-0000-0000-000000000001`

- Canonical SHA-256 Hashes:
  - `HASH_VALID_1`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - `HASH_TAMPERED`: `ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`

---

## 3. Test Suites

### Test Suite 1: Profile Anti-Tamper & KYC Protection

#### Test 1.1: Ordinary Authenticated User Cannot INSERT Pre-Verified Profile
- **Security Invariant**: `kyc_verified` and `bank_account_verified` cannot be set to TRUE on profile insertion by non-admin callers.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
  INSERT INTO public.profiles (
      id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified
  ) VALUES (
      'e7777777-7777-7777-7777-777777777777'::uuid,
      '77777777-7777-7777-7777-777777777777'::uuid,
      'Attacker Trader',
      '+919999999999',
      'Maharashtra',
      'Pune',
      '411001',
      TRUE,
      TRUE
  );
  ```
- **Expected Error**: `ERROR: Security Policy Violation: Initial profile registration cannot set kyc_verified or bank_account_verified to TRUE.`
- **Assertion**: `throws_ok(...)`

#### Test 1.2: Ordinary Authenticated User Cannot UPDATE Profile to Elevate KYC
- **Security Invariant**: Non-admin callers cannot toggle `kyc_verified` to TRUE.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
  UPDATE public.profiles SET kyc_verified = TRUE WHERE auth_user_id = '11111111-1111-1111-1111-111111111111';
  ```
- **Expected Error**: `ERROR: Security Policy Violation: Modification of kyc_verified or bank_account_verified requires administrative authority.`
- **Assertion**: `throws_ok(...)`

---

### Test Suite 2: Column Privileges & Public Marketplace Discovery

#### Test 2.1: Anonymous Role Can Query `public_produce_listings`
- **Security Invariant**: `public_produce_listings` is readable by `anon` and returns macro fields without table permission denial.
- **Execution**:
  ```sql
  SET LOCAL ROLE anon;
  SELECT id, title, commodity, farm_district, farm_state, available_quantity_kg 
  FROM public.public_produce_listings;
  ```
- **Pass Criteria**: Query succeeds without error.

#### Test 2.2: Authenticated Role Can Query `public_produce_listings`
- **Security Invariant**: `public_produce_listings` is readable by `authenticated`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  SELECT id, title, farm_district, farm_state FROM public.public_produce_listings;
  ```
- **Pass Criteria**: Query succeeds without error.

#### Test 2.3: Direct Column Selection on Base Table Denied
- **Security Invariant**: Ordinary authenticated callers cannot select `farm_location_address` from `produce_listings`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  SELECT farm_location_address FROM public.produce_listings;
  ```
- **Expected Error**: `permission denied for column farm_location_address of relation produce_listings`
- **Assertion**: `throws_matching(...)`

---

### Test Suite 3: Cancellation Authorization & Rollback Integrity

#### Test 3.1: Attacker Cannot Cancel Unrelated Order or Observe State
- **Security Invariant**: `cancel_reservation_and_release_inventory` validates caller authorization BEFORE checking cancellation idempotency or returning order state.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777'; -- Attacker
  SELECT public.cancel_reservation_and_release_inventory('30000000-0000-0000-0000-000000000001'::uuid, 'Malicious probe');
  ```
- **Expected Error**: `ERROR: Authorization Violation: Caller is not an authorized party to order 30000000-0000-0000-0000-000000000001`
- **Assertion**: `throws_ok(...)`

#### Test 3.2: Repeated Cancellation Idempotency
- **Security Invariant**: Order cancellation releases inventory once; repeated cancellation call returns FALSE without re-crediting inventory.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111'; -- Seller
  -- First Call: Returns TRUE
  SELECT is(public.cancel_reservation_and_release_inventory('30000000-0000-0000-0000-000000000001'::uuid, 'Cancel reason'), TRUE, 'First cancel succeeds');
  -- Second Call: Returns FALSE
  SELECT is(public.cancel_reservation_and_release_inventory('30000000-0000-0000-0000-000000000001'::uuid, 'Duplicate call'), FALSE, 'Duplicate cancel returns false');
  ```
- **Pass Criteria**: First call returns TRUE; second call returns FALSE.

---

### Test Suite 4: Payment Idempotency & Tamper Detection

#### Test 4.1: Replay with Mismatched Event Type Raises Conflict
- **Security Invariant**: Idempotency key cannot be replayed with a different `event_type`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222'; -- Buyer
  -- Attempt replay of key IDEMP-ESCROW-0001 with 'quality_acceptance_confirmed' instead of original 'escrow_hold_authorized'
  SELECT public.record_simulated_payment_event(
      '30000000-0000-0000-0000-000000000001'::uuid,
      'quality_acceptance_confirmed'::public.payment_event_type,
      50000.00,
      'IDEMP-ESCROW-0001',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '{}'::jsonb
  );
  ```
- **Expected Error**: `ERROR: Idempotency Conflict: Key IDEMP-ESCROW-0001 was previously submitted with a different event type, payload hash, amount, or order ID.`
- **Assertion**: `throws_ok(...)`

#### Test 4.2: Amount Reconciliation Failure on Escrow Hold
- **Security Invariant**: Escrow authorization amount must match agreed total order amount.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  SELECT public.record_simulated_payment_event(
      '30000000-0000-0000-0000-000000000001'::uuid,
      'escrow_hold_authorized'::public.payment_event_type,
      1000.00, -- Mismatched amount
      'IDEMP-NEW-KEY-0002',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '{}'::jsonb
  );
  ```
- **Expected Error**: `ERROR: Amount Reconciliation Failure: Escrow authorization 1000.00 does not match order agreed amount 50000.00`
- **Assertion**: `throws_ok(...)`

---

### Test Suite 5: Negotiation Terms Immutability

#### Test 5.1: Altering Delivery Terms or Transport Responsibility Rejected
- **Security Invariant**: `delivery_terms` and `transport_borne_by` cannot be updated on submitted offers.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  UPDATE public.offers_negotiations 
  SET transport_borne_by = 'seller'
  WHERE id = '20000000-0000-0000-0000-000000000001'::uuid;
  ```
- **Expected Error**: `ERROR: Security Policy Violation: Negotiated terms (listing, buyer, price, quantity, delivery, transport, expiry) are immutable once submitted.`
- **Assertion**: `throws_ok(...)`

---

## 4. Multi-Session Concurrency Test Specification

*Note: The following test requires two distinct concurrent PostgreSQL backend connections (Session A and Session B).*

### Scenario: Concurrent Stock Reservation Boundary Test
- **Listing Capacity**: 5,000 kg total volume (`reserved_quantity_kg = 0`).
- **Offer A**: 3,500 kg (`offered_price_per_kg = 20.00`).
- **Offer B**: 2,500 kg (`offered_price_per_kg = 21.00`).
- **Protocol**:
  1. **Session A**:
     ```sql
     BEGIN;
     SELECT public.accept_offer_and_create_reservation('20000000-0000-0000-0000-000000000001'::uuid);
     -- Holds row lock on listing 10000000-0000-0000-0000-000000000001
     ```
  2. **Session B**:
     ```sql
     BEGIN;
     -- Attempts to accept Offer B; blocks waiting for Session A lock
     SELECT public.accept_offer_and_create_reservation('20000000-0000-0000-0000-000000000002'::uuid);
     ```
  3. **Session A**:
     ```sql
     COMMIT;
     ```
  4. **Session B**:
     - Unblocks immediately.
     - Evaluates available quantity: `5000 kg - 3500 kg = 1500 kg`.
     - Fails with: `ERROR: Insufficient Inventory: Available 1500.0000 kg, Requested 2500.0000 kg`.
     - Session B issues `ROLLBACK`.
- **Pass Criteria**: `reserved_quantity_kg` in `produce_listings` equals 3,500 kg, exactly one order is created, and total stock is never over-allocated.

---

## 5. Automated pgTAP Harness Template (Single-Session Test Suite)

```sql
-- ==============================================================================
-- pgTAP Test Harness for database-schema-proposal-v5.sql
-- Executable in an isolated database: psql -d test_db -f test_v5_security.sql
-- ==============================================================================

BEGIN;
SELECT plan(18);

-- 1. Extensions
SELECT has_extension('uuid-ossp', 'Extension uuid-ossp must be installed');
SELECT has_extension('pgcrypto', 'Extension pgcrypto must be installed');

-- 2. Schema Functions & Search Path Check
SELECT has_function('public', 'is_admin', ARRAY[]::text[], 'Helper is_admin() exists');
SELECT has_function('public', 'get_current_profile_id', ARRAY[]::text[], 'Helper get_current_profile_id() exists');
SELECT has_function('public', 'get_authorized_farm_location', ARRAY['uuid'], 'Helper get_authorized_farm_location() exists');
SELECT has_function('public', 'accept_offer_and_create_reservation', ARRAY['uuid'], 'Procedure accept_offer_and_create_reservation() exists');
SELECT has_function('public', 'cancel_reservation_and_release_inventory', ARRAY['uuid', 'text'], 'Procedure cancel_reservation_and_release_inventory() exists');
SELECT has_function('public', 'record_simulated_payment_event', 
    ARRAY['uuid', 'payment_event_type', 'numeric', 'text', 'text', 'jsonb'], 
    'Procedure record_simulated_payment_event() exists'
);
SELECT has_function('public', 'dispatch_order_advance',
    ARRAY['uuid', 'uuid', 'numeric', 'text', 'text'],
    'Procedure dispatch_order_advance() exists'
);

-- 3. Views
SELECT has_view('public', 'public_profiles', 'View public_profiles exists');
SELECT has_view('public', 'public_produce_listings', 'View public_produce_listings exists');

-- 4. Triggers
SELECT has_trigger('public', 'profiles', 'trg_protect_profile_fields', 'Profile field anti-tamper trigger attached');
SELECT has_trigger('public', 'offers_negotiations', 'trg_protect_offer_terms', 'Offer core terms protection trigger attached');
SELECT has_trigger('public', 'simulated_payment_events', 'trg_block_payment_event_modifications', 'Payment ledger immutability trigger attached');
SELECT has_trigger('public', 'produce_listings', 'trg_sync_produce_listing_kg', 'Listing unit sync trigger attached');

-- 5. Negative Authorization: Anonymous offer acceptance rejection
SELECT throws_ok(
    $$ SELECT public.accept_offer_and_create_reservation('00000000-0000-0000-0000-000000000001'::uuid) $$,
    'Authentication Required: Caller must be authenticated to accept offers.',
    'Unauthenticated offer acceptance must be rejected'
);

-- 6. Negative Validation: Invalid SHA-256 hash parameter rejection
SELECT throws_ok(
    $$ SELECT public.record_simulated_payment_event(
        '00000000-0000-0000-0000-000000000001'::uuid,
        'escrow_hold_authorized'::public.payment_event_type,
        100.00,
        'IDEMP-TEST-KEY-0001',
        'bad-hash',
        '{}'::jsonb
    ) $$,
    'Invalid Parameter: payload_hash must be a valid 64-character lowercase hex SHA-256 string.',
    'Malformed SHA-256 payload hash must be rejected'
);

-- 7. Negative Authorization: Attacker cannot probe or cancel non-party order
SELECT throws_ok(
    $$ 
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
    SELECT public.cancel_reservation_and_release_inventory('00000000-0000-0000-0000-000000000001'::uuid, 'Test');
    $$,
    'Order not found: 00000000-0000-0000-0000-000000000001',
    'Non-existent order raises order not found'
);

SELECT * FROM finish();
ROLLBACK;
```
