# AgriPrice Database Security Test Plan (v3)
**Document Version:** v3.0.0-test-plan  
**Target Specification:** [`docs/database-schema-proposal-v4.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v4.sql)  
**Status:** Verification Test Suite Specification (Pre-Implementation / Staging Target)  
**Safety Scope:** Test harness design only. No live database connected; no migrations executed.

---

## 1. Overview & Test Architecture

This document defines the functional negative authorization, concurrency, idempotency, state transition, and column-level privacy test suite designed to validate the security invariants of `docs/database-schema-proposal-v4.sql`.

### Core Security Invariants Under Test:
1. **Zero-Trust Identity Derivation**: All privileged mutations derive the caller's profile via `auth.uid()`; untrusted caller arguments are eliminated.
2. **Anti-Tamper Profile & KYC Integrity**: Authenticated non-admin callers cannot alter their own `id`, `auth_user_id`, `kyc_verified`, or `bank_account_verified`. Verification triggers do not rely on `current_user = 'postgres'`.
3. **Column-Level Location Privacy**: Non-escrowed users cannot query physical street addresses, pincodes, latitude, or longitude through direct SQL or views. Authorized counterparties retrieve coordinates exclusively via `get_authorized_farm_location()`.
4. **Non-Recursive Multi-Role RBAC**: Administrator authorization uses `public.is_admin()` and direct profile lookups without causing recursive RLS loops.
5. **Simulated Payment Ledger Integrity & Pre-Replay Validation**: Orders and caller authorizations are validated BEFORE checking idempotency replay. Tampered payloads (hash, amount, or order mismatch) raise explicit exceptions. All payment event types require prerequisite order statuses.
6. **Offer Terms Immutability & Clean Expiry Rejection**: Core offer terms are immutable once submitted. Expired offers are rejected cleanly without aborted internal state modifications.
7. **Idempotent Inventory Restoration**: Multiple calls to cancel an order restore inventory exactly once; subsequent calls return `FALSE` without re-crediting volume.

---

## 2. Test Suite 1: Authentication Stubs & Non-Recursive Admin RBAC

### Test 1.1: Verification of Stubs vs. Native Supabase Auth
- **Objective**: Ensure `auth.uid()` and `auth.role()` functions are defined only if missing, preventing overwriting native Supabase mechanisms.
- **Fixture / Setup**:
  ```sql
  -- Verify function definitions exist and are STABLE
  SELECT proname, prosecdef, provolatile 
  FROM pg_proc p 
  JOIN pg_namespace n ON p.pronamespace = n.oid 
  WHERE n.nspname = 'auth' AND p.proname IN ('uid', 'role');
  ```
- **Pass Criteria**: Returns 2 rows; `provolatile = 's'` (STABLE).

### Test 1.2: Non-Recursive Admin Helper Evaluation
- **Objective**: Ensure calling `is_admin()` evaluates cleanly without stack overflow or recursive RLS query loop.
- **Setup**:
  - Profile `profile-user-1` with role `trader`.
  - Profile `profile-admin-1` with role `admin`.
- **Execution**:
  ```sql
  -- As non-admin
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
  SELECT public.is_admin(); -- Expects FALSE

  -- As admin
  SET LOCAL "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';
  SELECT public.is_admin(); -- Expects TRUE
  ```
- **Pass Criteria**: Returns boolean without recursing into RLS policies on `profiles` or `user_roles`.

---

## 3. Test Suite 2: Profile Protection & KYC Anti-Tampering

### Test 2.1: Block Profile Identity Hijack (`auth_user_id` & `id`)
- **Objective**: An authenticated user attempts to reassign their `auth_user_id` or profile `id`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  -- Case A: Attempt auth_user_id reassignment
  UPDATE public.profiles 
  SET auth_user_id = '22222222-2222-2222-2222-222222222222' 
  WHERE auth_user_id = '11111111-1111-1111-1111-111111111111';
  ```
- **Expected Result**: Aborts with:
  `ERROR: Security Policy Violation: Reassignment of auth_user_id is strictly prohibited.`

### Test 2.2: Block Self-Elevation of KYC and Bank Verification
- **Objective**: Verify that non-admin callers cannot toggle `kyc_verified` or `bank_account_verified`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  UPDATE public.profiles 
  SET kyc_verified = TRUE, bank_account_verified = TRUE 
  WHERE auth_user_id = '11111111-1111-1111-1111-111111111111';
  ```
- **Expected Result**: Aborts with:
  `ERROR: Security Policy Violation: Modification of kyc_verified or bank_account_verified requires administrative authority.`

---

## 4. Test Suite 3: Column-Level Location Privacy & Secure Functions

### Test 3.1: Direct Column Selection on Base Table Denied
- **Objective**: Authenticated users attempting to SELECT `farm_location_address`, `latitude`, or `longitude` from `produce_listings` fail with column privilege violations.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

  SELECT farm_location_address, latitude, longitude FROM public.produce_listings;
  ```
- **Expected Result**: Database error:
  `ERROR: permission denied for column farm_location_address of relation produce_listings`
- **Pass Criteria**: Column-level grants strictly withhold micro-location coordinates.

### Test 3.2: Macro Discovery View Exposes Only Permitted Fields
- **Objective**: Unauthenticated and authenticated users can view district and state via `public_produce_listings`.
- **Execution**:
  ```sql
  SET LOCAL ROLE anon;
  SELECT farm_district, farm_state, available_quantity_kg FROM public.public_produce_listings;
  ```
- **Pass Criteria**: Query succeeds, returning macro-geography and available volume without sensitive coordinates.

### Test 3.3: Authorized Coordinate Access Post-Escrow Funding
- **Objective**: Buyer on an `escrow_funded` order successfully queries `get_authorized_farm_location()`.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222'; -- Buyer UID

  SELECT farm_location_address, farm_pincode, latitude, longitude 
  FROM public.get_authorized_farm_location('33333333-3333-3333-3333-333333333333'::uuid);
  ```
- **Pass Criteria**: Returns 1 row containing decrypted location coordinates for verified counterparty.

---

## 5. Test Suite 4: Atomic Concurrency & Offer Terms Protection

### Test 4.1: Offer Core Terms Immutability
- **Objective**: Ensure a buyer cannot alter price, quantity, or listing ID of an existing offer.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

  UPDATE public.offers_negotiations
  SET offered_price_per_kg = 1.00
  WHERE id = '44444444-4444-4444-4444-444444444444'::uuid;
  ```
- **Expected Result**: Aborts with:
  `ERROR: Security Policy Violation: Offer core terms (listing, buyer, price, quantity, expiry) are immutable once submitted.`

### Test 4.2: Clean Rejection of Expired Offers
- **Objective**: Attempting to accept an expired offer fails cleanly without rolling back unpersisted state changes.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111'; -- Farmer UID

  SELECT public.accept_offer_and_create_reservation('55555555-5555-5555-5555-555555555555'::uuid);
  ```
- **Expected Result**: Aborts with:
  `ERROR: Offer 55555555-5555-5555-5555-555555555555 has expired at ... and cannot be accepted.`
- **Pass Criteria**: Error message states offer has expired; no order is created.

### Test 4.3: Concurrent Stock Reservation Boundary Test
- **Objective**: Validate that two concurrent transactions attempting to reserve stock exceeding total volume cannot over-allocate inventory.
- **Scenario**: Listing has 5,000 kg total volume. Offer A requests 3,000 kg. Offer B requests 2,500 kg.
- **Pass Criteria**: One transaction succeeds; the second transaction raises:
  `ERROR: Insufficient Inventory: Available 2000.0000 kg, Requested 2500.0000 kg`

---

## 6. Test Suite 5: Idempotent Inventory Rollback & Cancellation

### Test 6.1: Repeated Cancellation Idempotency
- **Objective**: Calling `cancel_reservation_and_release_inventory` multiple times releases inventory exactly once.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

  -- First cancellation
  SELECT public.cancel_reservation_and_release_inventory('66666666-6666-6666-6666-666666666666'::uuid, 'Buyer timed out');
  -- Second cancellation (duplicate)
  SELECT public.cancel_reservation_and_release_inventory('66666666-6666-6666-6666-666666666666'::uuid, 'Duplicate cancellation call');
  ```
- **Expected Result**:
  - Call 1 returns `TRUE`. Listing `reserved_quantity_kg` is decremented.
  - Call 2 returns `FALSE`. Listing `reserved_quantity_kg` remains unchanged.
- **Pass Criteria**: Zero double-restoration or negative inventory balance.

---

## 7. Test Suite 6: Payment Idempotency & Tamper Detection

### Test 7.1: Pre-Replay Validation on Non-Existent or Unauthorized Order
- **Objective**: Calling `record_simulated_payment_event` with an existing idempotency key on an unauthorized or invalid order must fail BEFORE returning replay.
- **Execution**:
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777'; -- Unrelated attacker UID

  SELECT public.record_simulated_payment_event(
      '66666666-6666-6666-6666-666666666666'::uuid,
      'escrow_hold_authorized'::payment_event_type,
      50000.00,
      'IDEMP-KEY-9999999999',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '{}'::jsonb
  );
  ```
- **Expected Result**: Aborts with:
  `ERROR: Authorization Violation: Caller is not an authorized party to order 66666666-6666-6666-6666-666666666666`

### Test 7.2: Replay with Mismatched SHA-256 Payload Hash Throws Conflict
- **Objective**: Valid participant attempts to reuse idempotency key with modified amount or hash.
- **Execution**:
  ```sql
  -- Attempt replay with different payload hash
  SELECT public.record_simulated_payment_event(
      '66666666-6666-6666-6666-666666666666'::uuid,
      'escrow_hold_authorized'::payment_event_type,
      50000.00,
      'IDEMP-KEY-VALID-01',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      '{}'::jsonb
  );
  ```
- **Expected Result**: Aborts with:
  `ERROR: Idempotency Conflict: Key IDEMP-KEY-VALID-01 was previously submitted with a different payload hash, amount, or order ID.`

### Test 7.3: Format Validation on Payload Hash
- **Objective**: Reject non-hex or non-64-character payload hashes.
- **Execution**:
  ```sql
  SELECT public.record_simulated_payment_event(
      '66666666-6666-6666-6666-666666666666'::uuid,
      'escrow_hold_authorized'::payment_event_type,
      50000.00,
      'IDEMP-KEY-SHORT-01',
      'invalid-short-hash',
      '{}'::jsonb
  );
  ```
- **Expected Result**: Aborts with:
  `ERROR: Invalid Parameter: payload_hash must be a valid 64-character lowercase hex SHA-256 string.`

---

## 8. Executable pgTAP Automated Test Harness Template

```sql
-- ==============================================================================
-- pgTAP Test Harness for database-schema-proposal-v4.sql
-- Run inside an isolated test database: psql -d test_db -f test_v4_security.sql
-- ==============================================================================

BEGIN;
SELECT plan(15);

-- 1. Extensions
SELECT has_extension('uuid-ossp', 'Extension uuid-ossp must be installed');
SELECT has_extension('pgcrypto', 'Extension pgcrypto must be installed');

-- 2. Schema Functions Presence & Signature Check
SELECT has_function('public', 'is_admin', ARRAY[]::text[], 'Helper is_admin() exists');
SELECT has_function('public', 'get_current_profile_id', ARRAY[]::text[], 'Helper get_current_profile_id() exists');
SELECT has_function('public', 'get_authorized_farm_location', ARRAY['uuid'], 'Helper get_authorized_farm_location() exists');
SELECT has_function('public', 'accept_offer_and_create_reservation', ARRAY['uuid'], 'Procedure accept_offer_and_create_reservation() exists');
SELECT has_function('public', 'cancel_reservation_and_release_inventory', ARRAY['uuid', 'text'], 'Procedure cancel_reservation_and_release_inventory() exists');
SELECT has_function('public', 'record_simulated_payment_event', 
    ARRAY['uuid', 'payment_event_type', 'numeric', 'text', 'text', 'jsonb'], 
    'Procedure record_simulated_payment_event() exists'
);

-- 3. Views
SELECT has_view('public', 'public_profiles', 'View public_profiles exists');
SELECT has_view('public', 'public_produce_listings', 'View public_produce_listings exists');

-- 4. Triggers
SELECT has_trigger('public', 'profiles', 'trg_protect_profile_fields', 'Profile field anti-tamper trigger attached');
SELECT has_trigger('public', 'offers_negotiations', 'trg_protect_offer_terms', 'Offer core terms protection trigger attached');
SELECT has_trigger('public', 'simulated_payment_events', 'trg_block_payment_event_modifications', 'Payment ledger immutability trigger attached');

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

SELECT * FROM finish();
ROLLBACK;
```
