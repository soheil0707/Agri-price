# AgriPrice Database Proposal: v2 to v3 Changelog & Security Rationale
**Document Version:** v3.0.0-changelog  
**Associated Files:**
- Previous Version: [`docs/database-schema-proposal-v2.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v2.sql)
- Hardened Version: [`docs/database-schema-proposal-v3.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal-v3.sql)
- Security Test Plan: [`docs/database-security-test-plan-v2.md`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-security-test-plan-v2.md)

---

## 1. Executive Summary

The v3 proposal addresses all vulnerabilities and design gaps identified during the independent audit of v2. Specifically, it eliminates **client-supplied identity spoofing** across all privileged procedures, hardens **payment idempotency and state transitions**, implements **idempotent reservation rollback**, and provides **full repeatability and compatibility** across both Supabase and vanilla PostgreSQL 15+ staging containers.

---

## 2. Itemized Changelog & Security Invariants

### 2.1 Zero-Trust Caller Derivation (Fixes Findings C-01 & C-02)
- **v2 Vulnerability**: `accept_offer_and_create_reservation` accepted `p_seller_profile_id UUID` as a parameter, allowing an attacker to accept offers on behalf of any farmer. Similarly, `cancel_reservation_and_release_inventory` accepted `p_caller_profile_id UUID`, allowing unauthorized order cancellations.
- **v3 Resolution**:
  - Removed `p_seller_profile_id` and `p_caller_profile_id` from the public function signatures.
  - Derived caller identity strictly inside the `SECURITY DEFINER` function via:
    ```sql
    v_caller_auth_id := auth.uid();
    SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = v_caller_auth_id;
    ```
  - Added an explicit check verifying that the caller profile owns the listing and possesses the `farmer` or `fpo_admin` role before locking inventory.
- **Security Invariant Enforced**: *A user can only accept offers or cancel reservations for records to which their authenticated `auth.uid()` is cryptographically bound.*

---

### 2.2 Idempotent Reservation Rollback & Lock Hierarchy (Fixes Finding C-03)
- **v2 Vulnerability**: `cancel_reservation_and_release_inventory` did not check if the order was already in `status = 'cancelled'`. Repeated calls decremented `produce_listings.reserved_quantity_kg` multiple times, draining inventory below zero and corrupting stock allocations for other buyers.
- **v3 Resolution**:
  - Added an idempotency guard:
    ```sql
    IF v_order.escrow_status = 'cancelled' THEN
        RETURN FALSE; -- Already cancelled; inventory already restored
    END IF;
    ```
  - Restricted cancellation eligibility to `awaiting_escrow` and `disputed`. Orders in `in_transit` or `settled` are rejected.
  - Enforced a consistent lock acquisition hierarchy: `reservations_orders` FOR UPDATE &rarr; `produce_listings` FOR UPDATE.
- **Security Invariant Enforced**: *Inventory is restored exactly once upon order cancellation, and cannot be drained through duplicate or replayed cancellation requests.*

---

### 2.3 Payment Idempotency Tamper Detection & State Machine (Fixes Findings C-04 & C-05)
- **v2 Vulnerability**:
  1. `record_simulated_payment_event` had zero caller authorization checks and allowed any user to transition orders to settled or funded.
  2. Replaying an existing `idempotency_key` returned the old event without checking whether `payload_hash`, `amount`, or `order_id` matched, silently masking payload tampering.
  3. Status updates were applied without validating the order's current `escrow_status`.
- **v3 Resolution**:
  - Added caller authorization: only the buyer can authorize escrow holds; only platform administrators can disburse settled proceeds or issue refunds.
  - Implemented payload tamper detection:
    ```sql
    IF (v_existing.payload_hash != p_payload_hash OR 
        v_existing.amount != p_amount OR 
        v_existing.order_id != p_order_id) THEN
        RAISE EXCEPTION 'Idempotency Conflict: Key % was previously submitted with a different payload hash, amount, or order ID.', p_idempotency_key;
    END IF;
    ```
  - Enforced strict prerequisite states:
    * `escrow_hold_authorized` requires `escrow_status = 'awaiting_escrow'` and exact amount match.
    * `quality_acceptance_confirmed` requires `escrow_status = 'in_transit'`.
    * `farmer_proceeds_settled` requires `escrow_status = 'delivered_inspected'`.
    * `refund_issued` requires `escrow_status IN ('escrow_funded', 'disputed')`.
- **Security Invariant Enforced**: *Financial event keys cannot be tampered with or reused for different amounts, and orders can only progress through verified lifecycle stages.*

---

### 2.4 Seller Negotiation Rights on Offers (Fixes Finding H-01)
- **v2 Vulnerability**: `offers_negotiations` only had `offers_update_buyer_cancel`. Sellers had zero `UPDATE` permissions, causing any client-initiated counter-offer or rejection to abort with an RLS error.
- **v3 Resolution**:
  - Added policy `offers_update_seller_decide`:
    ```sql
    CREATE POLICY offers_update_seller_decide ON public.offers_negotiations
        FOR UPDATE TO authenticated
        USING (
            listing_id IN (
                SELECT id FROM public.produce_listings 
                WHERE seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
            ) AND
            status IN ('pending', 'countered')
        )
        WITH CHECK (status IN ('countered', 'rejected'));
    ```
- **Security Invariant Enforced**: *Sellers can legitimately negotiate, counter, or reject bids on their own produce while preventing arbitrary status mutations.*

---

### 2.5 Macro vs. Micro Location Decoupling & View Security (Fixes Finding H-02)
- **v2 Vulnerability**: Omitting explicit view security options on PostgreSQL 15+ created ambiguity between view owner privileges and invoker RLS rules.
- **v3 Resolution**:
  - Decoupled public marketplace discovery from private logistics:
    * Public view `public_produce_listings` exposes only `farm_district` and `farm_state`.
    * Added policy `listings_select_active_macro` on the base table to permit view queries without exposing base columns.
    * Direct access to physical street addresses, pincodes, and GPS coordinates on `produce_listings` is governed by `listings_select_authorized`, which restricts access strictly to the seller and to buyers/transporters with orders that have progressed beyond `awaiting_escrow`.
- **Security Invariant Enforced**: *Produce location is anonymized at the district level for marketplace browsing, protecting farmers from theft and offline cartel interception.*

---

### 2.6 Profile Privilege & Identity Tamper Protection (Fixes Finding M-01)
- **v2 Vulnerability**: Trigger `trg_prevent_profile_privilege_escalation` guarded `kyc_verified` and `bank_account_verified`, but allowed modification of `auth_user_id` and `id`.
- **v3 Resolution**:
  - Added immutable checks in `trg_protect_profile_fields`:
    ```sql
    IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
        RAISE EXCEPTION 'Security Policy Violation: Reassignment of auth_user_id is strictly prohibited.';
    END IF;
    IF (NEW.id IS DISTINCT FROM OLD.id) THEN
        RAISE EXCEPTION 'Security Policy Violation: Profile primary key (id) is immutable.';
    END IF;
    ```
- **Security Invariant Enforced**: *Profile identity bindings cannot be hijacked or transferred across authentication accounts.*

---

### 2.7 Environment Repeatability & Safe Type Creation (Fixes Finding H-03)
- **v2 Vulnerability**: Script crashed on standard PostgreSQL containers due to missing Supabase roles (`anon`, `authenticated`, `service_role`) and non-repeatable `CREATE TYPE` statements.
- **v3 Resolution**:
  - Added a prerequisite block creating `anon`, `authenticated`, and `service_role` stubs if they do not exist.
  - Wrapped all enum creations in `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type ...)` guards.
  - Provided mock fallback stubs for `auth.uid()` and `auth.role()` for standalone testing without Supabase dependencies.
- **Security Invariant Enforced**: *The schema can be executed repeatedly and cleanly in any standard PostgreSQL 15+ container or CI pipeline.*

---

### 2.8 Policy Predicate Completion (`WITH CHECK`) (Fixes Finding L-01)
- **v2 Vulnerability**: `listings_update_owner` had `USING` but omitted `WITH CHECK`.
- **v3 Resolution**:
  - Added `WITH CHECK (seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))` to prevent modifying the ownership of the listing on write.

---

## 3. Invariant Enforcement Summary Table

| Security / Business Invariant | Mechanism | Enforcement Level |
| :--- | :--- | :--- |
| Zero-trust caller identity | `auth.uid()` resolution inside functions | PL/pgSQL Runtime |
| Farmer KYC cannot be self-awarded | `trg_protect_profile_fields` | Trigger (BEFORE UPDATE) |
| Profile identity cannot be hijacked | `auth_user_id` immutable check | Trigger (BEFORE UPDATE) |
| Inventory cannot be oversold | `reserved_quantity_kg <= quantity_in_kg` | Database CHECK Constraint |
| Concurrent reservations cannot race | `SELECT ... FOR UPDATE` row locks | Transaction Isolation |
| Order quantity * price matches total | `total_agreed_amount = ROUND(qty * price, 2)` | Database CHECK Constraint |
| Double order creation on same offer blocked | `accepted_offer_id UNIQUE NOT NULL` | Unique Index / Constraint |
| Wash-trading / bidding on own listing blocked | `trg_ensure_buyer_not_seller` | Trigger (BEFORE INSERT) |
| Payment ledger is strictly append-only | `trg_block_payment_event_modifications` | Trigger (BEFORE UPDATE/DELETE) |
| Payment idempotency cannot be tampered | `payload_hash` and `amount` verification | PL/pgSQL Runtime |
| Physical farm GPS protected from public | `public_produce_listings` view projection | View & Column Decoupling |
| Expired offers cannot be reserved | `expires_at > NOW()` validation | PL/pgSQL Runtime |

---

## 4. Status & Next Steps

> [!IMPORTANT]
> The v3 schema represents a static, security-hardened specification. In accordance with platform safety protocols, **no database connection or live migration was performed**. This schema must undergo functional verification using the test harness specified in `docs/database-security-test-plan-v2.md` in an isolated test container before staging deployment.
