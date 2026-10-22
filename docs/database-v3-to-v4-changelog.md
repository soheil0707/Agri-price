# AgriPrice Database Schema Migration & Security Changelog (v3 to v4)
**Document Version:** v4.0.0-audit-changelog  
**Source Specification:** [`docs/database-schema-proposal-v3.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v3.sql)  
**Target Specification:** [`docs/database-schema-proposal-v4.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v4.sql)  
**Status:** Audit Remediation & Invariant Verification Changelog  
**Date:** 2026-10-17  

---

## 1. Executive Summary

Following an independent security audit of the `v3` database schema proposal, ten targeted vulnerabilities and design limitations were identified. This document provides a line-by-line audit record of the findings, root causes, remediations applied in `v4`, and the exact security invariants enforced.

---

## 2. Itemized Audit Findings & Remediations

### Finding 1: Untrusted `current_user = 'postgres'` in SECURITY DEFINER KYC Trigger
- **Source Location in v3:** Lines 156–158 of `database-schema-proposal-v3.sql`
- **Root Cause:** Inside a `SECURITY DEFINER` function owned by `postgres`, PostgreSQL evaluates `current_user` to the function's owner (`postgres`), NOT the invoking session user. Consequently, `current_user = 'postgres'` evaluated to `TRUE` for ANY caller, completely disabling the check and allowing ordinary authenticated users to elevate their own `kyc_verified` and `bank_account_verified` flags.
- **Remediation in v4:** Removed `current_user = 'postgres'`. Replaced with `public.is_admin()`, which checks if `auth.role() = 'service_role'` or if the authenticated `auth.uid()` has an assigned `admin` role in `user_roles`.
- **Security Invariant Enforced:** *Identity and Regulatory Compliance Immutability*: Verification flags and identity assignments cannot be self-modified by user sessions under any execution context.

---

### Finding 2: Direct Access to Farm Street Addresses and Coordinates via Base Table
- **Source Location in v3:** Lines 914–927 & 1075 of `database-schema-proposal-v3.sql`
- **Root Cause:** Row-level security (RLS) filters rows, not columns. Baseline `GRANT SELECT ON public.produce_listings TO authenticated` allowed any user who satisfied row conditions to select `farm_location_address`, `latitude`, `longitude`, and `farm_pincode`. Furthermore, `listings_select_active_macro` granted row access to all active listings for public discovery.
- **Remediation in v4:**
  1. Revoked blanket table SELECT from `authenticated` on `produce_listings`.
  2. Applied column-level grants restricting `authenticated` baseline SELECT to macro fields (`id`, `seller_profile_id`, `title`, `commodity`, `variety`, `grade`, `harvest_quantity`, `quantity_unit`, `quantity_in_kg`, `reserved_quantity_kg`, `harvest_date`, `expected_shelf_life_days`, `farm_district`, `farm_state`, `target_price_per_kg`, `status`, `created_at`, `updated_at`).
  3. Physical street address, pincode, latitude, and longitude are accessible exclusively via the security-definer helper `public.get_authorized_farm_location(p_listing_id)`, which explicitly verifies that the caller is the seller or an active, post-escrow buyer/transporter.
- **Security Invariant Enforced:** *Physical Producer Privacy & Decoupled Geolocation*: Exact farm coordinates are withheld from market discovery and disclosed strictly to contractual counterparties upon escrow funding.

---

### Finding 3: Recursive RLS Policy Loop between Profiles and User Roles
- **Source Location in v3:** Lines 867–870 & 887–893 of `database-schema-proposal-v3.sql`
- **Root Cause:** `profiles_select_self_or_admin` queried `user_roles`, while `user_roles_select_self_or_admin` queried `profiles`. This cyclic dependency can lead to infinite recursion errors or excessive query execution overhead during RLS evaluation.
- **Remediation in v4:**
  1. Implemented a dedicated `public.is_admin()` helper defined as `STABLE SECURITY DEFINER` with search path pinned to `public, pg_temp`.
  2. Simplified RLS policies across all tables to call `public.is_admin()` and `public.get_current_profile_id()`, breaking the cyclic dependency.
- **Security Invariant Enforced:** *Deterministic & Non-Recursive Authorization*: RLS policy evaluation terminates deterministically without cyclic table dependencies.

---

### Finding 4: Pre-Replay Validation Flaw in `record_simulated_payment_event`
- **Source Location in v3:** Lines 720–733 of `database-schema-proposal-v3.sql`
- **Root Cause:** The function checked the idempotency key and returned the existing event ID *before* validating that the requested order existed and that the caller was an authorized party. An attacker could probe existing idempotency keys or receive confirmations for orders they had no right to view.
- **Remediation in v4:**
  1. Re-ordered execution: The function locks and validates the order and enforces caller authorization *before* checking the idempotency table.
  2. Added validation for all payment event types (`dispatch_advance_released`, `quality_acceptance_confirmed`, `farmer_proceeds_settled`, `commission_fee_settled`, `transporter_fee_settled`, `refund_issued`).
  3. Added parameter validation ensuring `payload_hash` matches `^[a-f0-9]{64}$`.
- **Security Invariant Enforced:** *Idempotent Financial Settlement Integrity*: Idempotency replays are acknowledged only after authenticating and authorizing the caller against the target financial contract.

---

### Finding 5: Missing Immutability Protection on Offer Core Terms
- **Source Location in v3:** Lines 1008–1019 of `database-schema-proposal-v3.sql`
- **Root Cause:** While RLS restricted the `status` field to `countered` or `rejected` for sellers, it did not prevent sellers or callers from modifying other columns in `offers_negotiations` (such as `offered_price_per_kg`, `offered_quantity_kg`, or `buyer_profile_id`) during an UPDATE.
- **Remediation in v4:** Added trigger `trg_protect_offer_terms` on `offers_negotiations` that raises an exception if `listing_id`, `buyer_profile_id`, `offered_price_per_kg`, `offered_quantity_kg`, or `expires_at` are altered on existing offers.
- **Security Invariant Enforced:** *Bilateral Contract Integrity*: Negotiated offer terms are immutable once submitted; counter-proposals require distinct offers or formal counter records.

---

### Finding 6: Expired Offer Persistence Anti-Pattern in `accept_offer_and_create_reservation`
- **Source Location in v3:** Lines 507–510 of `database-schema-proposal-v3.sql`
- **Root Cause:** The procedure attempted an `UPDATE offers_negotiations SET status = 'expired' ...` and immediately threw `RAISE EXCEPTION`. In PostgreSQL, throwing an unhandled exception causes the transaction to roll back, completely reverting the UPDATE statement.
- **Remediation in v4:** Removed the dead UPDATE statement. Expired offers are rejected cleanly with `RAISE EXCEPTION 'Offer % has expired at % and cannot be accepted.', p_offer_id, v_offer.expires_at;`.
- **Security Invariant Enforced:** *Clean Transaction Rollback & State Honesty*: Failed contract acceptances leave no partial or phantom state modifications.

---

### Finding 7: Safe Separation of Standalone PostgreSQL vs. Supabase Auth
- **Source Location in v3:** Lines 53–74 of `database-schema-proposal-v3.sql`
- **Root Cause:** Unconditional `CREATE OR REPLACE FUNCTION auth.uid()` in v3 risked overwriting native Supabase JWT extraction logic when running in production.
- **Remediation in v4:** Wrapped auth mock functions in `IF NOT EXISTS` checks querying `pg_proc` and `pg_namespace`. In a Supabase environment, existing native `auth.uid()` and `auth.role()` functions are preserved intact.
- **Security Invariant Enforced:** *Environment Portability & Native Runtime Preservation*: Production runtime functions are never shadowed or degraded by development stubs.

---

### Finding 8: Test Harness Assertion Count Mismatch & Realistic Fixtures
- **Source Location in v3:** `docs/database-security-test-plan-v2.md`
- **Root Cause:** The pgTAP plan declared `plan(12)` but only executed 9 assertion functions. Fixtures used placeholder strings (`'hash-aaa'`, `'order-1'`) instead of valid RFC-compliant UUIDs and 64-character SHA-256 hashes.
- **Remediation in v4:**
  1. Updated pgTAP plan in `database-security-test-plan-v3.md` to declare `plan(15)` with exact 1-to-1 assertion mappings.
  2. All test fixtures updated to compliant UUID formats (`00000000-0000-0000-0000-000000000001`::uuid) and valid 64-character hex strings (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- **Security Invariant Enforced:** *Verifiable Quality Assurance*: Test suites must be executable and mathematically consistent with declared assertion plans.

---

### Finding 9: Consistent Trigger Search Paths
- **Source Location in v3:** Lines 274, 388, 445 of `database-schema-proposal-v3.sql`
- **Root Cause:** Trigger functions omitted explicit `SET search_path = public, pg_temp`, exposing them to schema poisoning if search paths are altered.
- **Remediation in v4:** Pinned `SET search_path = public, pg_temp` across all function and trigger declarations.
- **Security Invariant Enforced:** *Search Path Hijacking Defense*: Execution contexts cannot be redirected to malicious schemas.

---

### Finding 10: Inventory Restoration Consistency on Payment Refund
- **Source Location in v3:** Lines 814–821 of `database-schema-proposal-v3.sql`
- **Root Cause:** Refund processing did not acquire a lock on `produce_listings`, creating a potential race condition with concurrent reservations during inventory restoration.
- **Remediation in v4:** Added `FOR UPDATE` lock on `produce_listings` when processing `refund_issued` events in `record_simulated_payment_event`.
- **Security Invariant Enforced:** *Strict Serializability of Physical Stock Balances*: All inventory modifications occur under explicit row-level locks.

---

## 3. Unresolved Issues & Assumptions Requiring Isolated Testing

> [!WARNING]
> **Status: UNTESTED PROPOSAL**
> Consistent with operating instructions, no database was connected, no SQL was executed, and no migrations were applied.

The following items represent operational assumptions that must be validated in an isolated PostgreSQL 15+ container prior to staging deployment:

1. **pgTAP Test Suite Execution**:
   - The test harness in `docs/database-security-test-plan-v3.md` should be executed against an empty PostgreSQL database with the pgTAP extension enabled to verify zero syntax errors.
2. **Column-Level Privilege Interaction with ORMs**:
   - Because `farm_location_address`, `latitude`, and `longitude` are omitted from the default SELECT grant on `produce_listings`, client libraries performing `SELECT *` on `produce_listings` will receive a column permission error. The application layer must be configured to query `public_produce_listings` for market views and call `get_authorized_farm_location()` for coordinate retrieval.
3. **High-Concurrency Lock Contention Benchmarking**:
   - The locking hierarchy (`offers_negotiations` -> `produce_listings` -> `reservations_orders`) eliminates deadlocks by ordering acquisitions, but throughput under high contention should be benchmarked under simulated load.
