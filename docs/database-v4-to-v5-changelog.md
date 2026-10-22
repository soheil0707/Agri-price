# AgriPrice Database Schema Migration & Security Changelog (v4 to v5)
**Document Version:** v5.0.0-audit-changelog  
**Source Specification:** [`docs/database-schema-proposal-v4.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v4.sql)  
**Target Specification:** [`docs/database-schema-proposal-v5.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v5.sql)  
**Status:** Audit Remediation & Invariant Verification Changelog  
**Date:** 2026-10-17  

---

## 1. Executive Summary

Following an audit of `docs/database-schema-proposal-v4.sql`, ten targeted vulnerabilities, privilege gaps, and architectural limitations were identified. This document specifies the exact defect in `v4`, the v4 source lines, the correction implemented in `v5`, the security invariant enforced, and the corresponding test verification in `docs/database-security-test-plan-v4.md`.

---

## 2. Itemized Defects, Source Lines, Remediations & Invariants

### 1. Protection of KYC and Bank Verification on INSERT
- **Original Defect:** In `v4`, trigger `trg_protect_profile_fields` was defined as `BEFORE UPDATE ON public.profiles`. While ordinary users could not update an existing profile to set `kyc_verified = TRUE`, an attacker inserting a new profile could pass `kyc_verified = TRUE` and `bank_account_verified = TRUE` during initial `INSERT`, completely bypassing verification controls.
- **v4 Source Lines:** Lines 226–255 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Trigger updated to `BEFORE INSERT OR UPDATE ON public.profiles`. Added explicit check for `TG_OP = 'INSERT'`: if `NEW.kyc_verified IS TRUE` or `NEW.bank_account_verified IS TRUE`, execution requires `public.is_admin()`, otherwise throwing `Security Policy Violation: Initial profile registration cannot set kyc_verified or bank_account_verified to TRUE.`
- **Security Invariant Enforced:** *Immutable Regulatory & Identity Baseline*: No profile can be created or updated into a verified state without an administrative session.
- **Corresponding Test:** Test 1.1 in `docs/database-security-test-plan-v4.md`

---

### 2. Anonymous & Authenticated Discovery Privilege Alignment for `public_produce_listings`
- **Original Defect:** In `v4`, column privileges on `produce_listings` were granted exclusively to `authenticated`: `GRANT SELECT (id, ...) ON public.produce_listings TO authenticated`. The view `public_produce_listings` was created with `security_invoker = true`. When an anonymous user (`anon`) queried `public_produce_listings`, PostgreSQL 15+ evaluated base table permissions as `anon`, causing an immediate permission denial on the underlying columns.
- **v4 Source Lines:** Lines 1186–1191 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Updated column-level grants to include BOTH `authenticated` and `anon`:
  ```sql
  GRANT SELECT (
      id, seller_profile_id, title, commodity, variety, grade,
      harvest_quantity, quantity_unit, quantity_in_kg, reserved_quantity_kg,
      harvest_date, expected_shelf_life_days, farm_district, farm_state,
      target_price_per_kg, status, created_at, updated_at
  ) ON public.produce_listings TO authenticated, anon;
  ```
  Sensitive micro-location columns (`farm_location_address`, `farm_pincode`, `latitude`, `longitude`) remain completely ungranted to both roles.
- **Security Invariant Enforced:** *Secure Invoker Marketplace Discovery*: Anonymous and authenticated marketplace browsing works under `security_invoker = true` without exposing private physical coordinates.
- **Corresponding Test:** Tests 2.1 & 2.2 in `docs/database-security-test-plan-v4.md`

---

### 3. Empty Search Paths & Schema Qualification in SECURITY DEFINER Functions
- **Original Defect:** In `v4`, `SECURITY DEFINER` functions declared `SET search_path = public, pg_temp;`. While better than no search path, `pg_temp` or dynamic schema resolution could permit search path manipulation.
- **v4 Source Lines:** Lines 194, 207, 221, 250, 561, 723, 803, 972 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Hardened all `SECURITY DEFINER` functions to use an empty search path (`SET search_path = ''`) and fully qualified all schema references (`pg_catalog.*`, `public.*`, `auth.*`).
- **Security Invariant Enforced:** *Immune Execution Context*: Privileged functions execute in a hermetic environment immune to search-path poisoning.
- **Corresponding Test:** Test 2 in automated harness of `docs/database-security-test-plan-v4.md`

---

### 4. Canonical Replay Intent Binding in Payment Idempotency
- **Original Defect:** In `v4`, `simulated_payment_events` checked replay against `payload_hash`, `amount`, and `order_id`, but omitted checking `event_type`. An idempotency key initially generated for an `escrow_hold_authorized` could theoretically be replayed under `quality_acceptance_confirmed` without triggering a conflict.
- **v4 Source Lines:** Lines 866–879 of `database-schema-proposal-v4.sql`
- **v5 Correction:** The idempotency replay check now compares `event_type`, `payload_hash`, `amount`, and `order_id`. Any mismatch raises:
  `ERROR: Idempotency Conflict: Key % was previously submitted with a different event type, payload hash, amount, or order ID.`
- **Security Invariant Enforced:** *Canonical Financial Intent Binding*: A financial idempotency key permanently binds to a single financial operation and cannot be replayed across differing operational contexts.
- **Corresponding Test:** Test 4.1 in `docs/database-security-test-plan-v4.md`

---

### 5. Pre-Status Cancellation Authorization Ordering
- **Original Defect:** In `v4`, `cancel_reservation_and_release_inventory` checked if `escrow_status = 'cancelled'` and returned `FALSE` *before* checking whether the caller was a legitimate order participant. An unauthorized attacker could query cancellation status on arbitrary orders without being rejected.
- **v4 Source Lines:** Lines 738–747 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Re-ordered checks: The function verifies caller authorization (buyer, seller, or admin) *before* evaluating the current `escrow_status`. Unauthorized callers receive an authorization exception regardless of order status.
- **Security Invariant Enforced:** *Zero Information Leakage in State Machine Operations*: Callers must prove participant identity before receiving any order state or execution outcome.
- **Corresponding Test:** Test 3.1 in `docs/database-security-test-plan-v4.md`

---

### 6. Protection of Negotiated Terms (`delivery_terms`, `transport_borne_by`)
- **Original Defect:** In `v4`, `trg_protect_offer_terms` protected price, quantity, listing, and buyer, but omitted `delivery_terms` and `transport_borne_by`. A participant could unilaterally alter transport costs or delivery timelines during an update.
- **v4 Source Lines:** Lines 460–476 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Added `NEW.delivery_terms IS DISTINCT FROM OLD.delivery_terms` and `NEW.transport_borne_by IS DISTINCT FROM OLD.transport_borne_by` to the immutable terms trigger. Added state transition validation restricting status transitions to valid paths (`pending` -> `countered`/`accepted`/`rejected`/`cancelled`).
- **Security Invariant Enforced:** *Comprehensive Commercial Terms Protection*: All terms agreed upon or proposed are immutable once submitted.
- **Corresponding Test:** Test 5.1 in `docs/database-security-test-plan-v4.md`

---

### 7. Listing Trigger Volatility Correction
- **Original Defect:** In `v4`, `trg_sync_listing_kg_quantity` was marked `IMMUTABLE`. Trigger functions that modify `NEW.updated_at = NOW()` and raise dynamic exceptions based on table state are not immutable; declaring them immutable violates PostgreSQL optimizer expectations.
- **v4 Source Lines:** Line 329 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Declared `trg_sync_listing_kg_quantity` as `VOLATILE`.
- **Security Invariant Enforced:** *Optimizer & Execution Correctness*: Trigger volatility flags match actual side-effect semantics.
- **Corresponding Test:** Test 4 in automated harness of `docs/database-security-test-plan-v4.md`

---

### 8. Order Fulfillment State Machine Functions
- **Original Defect:** In `v4`, orders could transition to `awaiting_escrow` and `escrow_funded`, but there were no procedural mechanisms to transition orders to `in_transit` with transporter assignment, or to record dispatch advances.
- **v4 Source Lines:** Lines 894–909 of `database-schema-proposal-v4.sql`
- **v5 Correction:** Added `public.dispatch_order_advance()` procedure enforcing seller/admin authorization, prerequisite `escrow_funded` status, advance amount bounds, and atomic assignment of `assigned_transporter_id` and `in_transit` state.
- **Security Invariant Enforced:** *Complete & Audited State Machine Progression*: Order status transitions require explicit, authenticated business procedures.
- **Corresponding Test:** Test 2 in automated harness of `docs/database-security-test-plan-v4.md`

---

### 9. Multi-Session Concurrency Test Specification
- **Original Defect:** `v3` test plan did not specify how concurrent stock reservation tests should be executed in multi-session environments.
- **v4 Source Lines:** `docs/database-security-test-plan-v3.md` section 4
- **v5 Correction:** Created Section 4 in `docs/database-security-test-plan-v4.md` detailing exact two-session lock protocols, interleaving commit/rollback instructions, and boundary conditions.
- **Security Invariant Enforced:** *Verifiable Serializability Under Contention*: Multi-threaded boundary safety is formally specified.
- **Corresponding Test:** Section 4 in `docs/database-security-test-plan-v4.md`

---

### 10. Self-Consistent pgTAP Assertion Plan
- **Original Defect:** Previous test plans had mismatches between declared test plans and actual assertion calls.
- **v4 Source Lines:** `docs/database-security-test-plan-v3.md` line 184
- **v5 Correction:** Updated `database-security-test-plan-v4.md` to declare `SELECT plan(18);` with exactly 18 assertion statements covering extensions, functions, views, triggers, and negative tests.
- **Security Invariant Enforced:** *Test Suite Mathematical Integrity*: pgTAP test counts match actual executed assertions.
- **Corresponding Test:** Section 5 in `docs/database-security-test-plan-v4.md`

---

## 3. Unresolved Issues & Assumptions Requiring Isolated Testing

> [!WARNING]
> **Status: UNTESTED PROPOSAL**
> Consistent with operating instructions, no database was connected, no SQL was executed, and no migrations were applied.

The following items represent operational assumptions requiring execution in an isolated PostgreSQL 15+ container before staging deployment:

1. **pgTAP Test Suite Execution**:
   - The test harness in `docs/database-security-test-plan-v4.md` should be executed against an empty PostgreSQL database with the pgTAP extension enabled to verify zero syntax errors.
2. **PostgREST Column Privilege Behavior**:
   - When calling Supabase PostgREST clients, ensure queries on `produce_listings` do not request ungranted columns. Queries should target `public_produce_listings` for market views and call `get_authorized_farm_location(p_listing_id)` for coordinate retrieval.
3. **Concurrent Lock Contention Profiling**:
   - The locking hierarchy (`offers_negotiations` -> `produce_listings` -> `reservations_orders`) eliminates deadlocks by ordering acquisitions, but throughput under high contention should be benchmarked under simulated load.
