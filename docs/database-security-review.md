# AgriPrice Database Security & Schema Review
**Document Version:** v1.0.0-review  
**Status:** Read-Only Verification Completed  
**Target Proposal:** [`docs/database-schema-proposal.sql`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/database-schema-proposal.sql) & [`docs/architecture-proposal.md`](file:///c:/Users/shann/OneDrive/Desktop/AgriPrice/agriprice/docs/architecture-proposal.md)  
**Safety Scope:** Static audit only. No database connected, no migrations executed, no application code altered. ResiliNet untouched.

---

## 1. Executive Summary

A comprehensive read-only security and structural audit was performed on the proposed database schema and architecture documents. While the domain modeling (8 core entities, deterministic snapshots, append-only payment concepts) is strong, **several critical security vulnerabilities, missing Row-Level Security (RLS) policies, PII leakage paths, and concurrency risks** were verified directly in the SQL proposal.

### Summary of Critical Discrepancies:
1. **Four Tables Have RLS Enabled but Zero Policies (Total Deny-All Lockout)**: `user_roles`, `offers_negotiations`, `reservations_orders`, and `simulated_payment_events` have `ENABLE ROW LEVEL SECURITY`, but `CREATE POLICY` statements were omitted from the SQL.
2. **Farmer PII & Financial Status Leakage**: `profiles` grants `SELECT TO authenticated USING (true)`, allowing any registered user to scrape farmer phone numbers, emails, KYC verification status, and bank verification flags.
3. **Farmer Physical Location & Crop Theft Risk**: `produce_listings` exposes exact physical street addresses, coordinates (latitude/longitude), and harvest dates to all public users.
4. **Self-Escalation of KYC/Bank Status**: `profiles_update_self` allows users to update any column on their own profile, permitting unauthorized self-verification of `kyc_verified = true` and `bank_account_verified = true`.
5. **Overselling & Concurrency Vulnerability**: No check constraint or locking mechanism prevents multiple concurrent buyers from reserving quantities exceeding available harvest volume.
6. **Payment Event Immutability Missing**: The append-only ledger lacks a database-level trigger blocking `UPDATE` and `DELETE`, and omits the cryptographic payload hash specified in the architecture documentation.

---

## 2. Detailed Findings & Verified Risks

### 2.1 Profile & KYC Permissions (`public.profiles`)

#### Verified Finding in SQL (Lines 227–234):
```sql
CREATE POLICY profiles_select_authenticated ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = auth_user_id)
    WITH CHECK (auth.uid() = auth_user_id);
```

#### Risks:
- **Mass PII Harvesting**: Any authenticated user (even an unverified account) can query the entire `profiles` table to harvest full names, phone numbers, email addresses, and residential districts.
- **Privilege / Trust Escalation**: Because the `UPDATE` policy does not restrict column targeting, a malicious user can send `UPDATE profiles SET kyc_verified = true, bank_account_verified = true WHERE auth_user_id = auth.uid();` and trivially bypass platform trust verification.
- **Missing INSERT Policy**: There is no `CREATE POLICY profiles_insert_self` defined. New users signing up via Supabase Auth would fail to insert their initial profile row unless handled by a `SECURITY DEFINER` trigger.

---

### 2.2 Farmer Location Privacy & Cargo Security (`public.produce_listings`)

#### Verified Finding in SQL (Lines 103–108, 236–247):
```sql
farm_location_address TEXT NOT NULL,
farm_district TEXT NOT NULL,
farm_state TEXT NOT NULL,
farm_pincode TEXT NOT NULL,
latitude NUMERIC(10, 7),
longitude NUMERIC(10, 7),
```
```sql
CREATE POLICY listings_select_public ON public.produce_listings
    FOR SELECT USING (status = 'active' OR seller_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
```

#### Risks:
- **Physical Security & Predatory Interception**: Exposing full physical street addresses (`farm_location_address`), exact GPS coordinates (`latitude`, `longitude`), and harvest readiness dates (`harvest_date`) to unverified public users creates severe risks of produce theft from open farm fields or predatory off-platform harassment by local cartels.
- **Privacy Standard Violation**: Standard agricultural procurement platforms decouple macro-location (district/state for marketplace browsing) from micro-location (exact farmgate GPS). Exact pickup coordinates must be restricted to buyers who have placed an escrow-funded order.

---

### 2.3 Role-Based Access Control (RBAC) Breakdown (`public.user_roles`)

#### Verified Finding in SQL (Lines 82–88, 219):
```sql
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
-- [NO POLICIES DEFINED FOR user_roles]
```

#### Risks:
- **Complete Role Lockout**: With RLS enabled and zero policies defined, PostgreSQL defaults to **Deny All** for non-superusers. No user can read their own assigned roles, and client-side authorization checks will fail.
- **Discrepancy with Architecture**: Section 4 of `docs/architecture-proposal.md` promises: *"Authenticated users can view their own assigned roles"*. The SQL does not implement this.
- **Listing Role Bypass**: The policy `listings_insert_farmer` on `produce_listings` only checks that `seller_profile_id` belongs to `auth.uid()`, but fails to verify that the user possesses the `farmer` or `fpo_admin` role.

---

### 2.4 Missing RLS Policy Matrix (Verified in SQL)

| Table | RLS Enabled? | Policies in SQL | Status in Current SQL | Impact |
| :--- | :---: | :---: | :---: | :--- |
| `profiles` | Yes | 2 (SELECT, UPDATE) | Incomplete (Missing INSERT, DELETE, column guards) | PII leakage, KYC self-verification |
| `user_roles` | Yes | **0** | **Missing entirely** | Total user lockout (Deny All) |
| `produce_listings` | Yes | 3 (SELECT, INSERT, UPDATE) | Incomplete (Missing role check, location leak) | Any role can list; location exposed |
| `market_price_benchmarks` | Yes | 1 (SELECT) | Partial (Read-only verified) | Safe for read; admin mutations undefined |
| `calculation_snapshots` | Yes | 2 (SELECT, INSERT) | Partial (Missing linked buyer access) | Buyer cannot view snapshot in offer |
| `offers_negotiations` | Yes | **0** | **Missing entirely** | Total lockout: buyers cannot submit offers |
| `reservations_orders` | Yes | **0** | **Missing entirely** | Total lockout: orders cannot be read/created |
| `simulated_payment_events` | Yes | **0** | **Missing entirely** | Total lockout: ledger invisible to users |

---

### 2.5 Stock Reservation Concurrency & Inventory Overselling

#### Verified Finding in SQL (Lines 98–100, 155–189):
- `produce_listings` has `harvest_quantity` and `quantity_in_kg`.
- `reservations_orders` has `locked_quantity_kg NUMERIC(12, 4) NOT NULL`.
- There is **no tracking of reserved or available balance** on the listing, and no database constraint preventing over-commitment.

#### Risks:
- **Race Condition / Double Allocation**: If a farmer lists 5,000 kg and two buyers simultaneously submit offers for 3,500 kg and 2,500 kg, concurrent acceptance creates two orders totaling 6,000 kg against a 5,000 kg listing.
- **Unit Drift Risk**: `harvest_quantity` and `quantity_in_kg` can get out of sync if an application client updates one without recalculating the other.
- **Missing Offer Uniqueness**: `accepted_offer_id` in `reservations_orders` lacks a `UNIQUE` constraint, allowing multiple orders to accidentally reference the same accepted offer.

---

### 2.6 Offer & Order Consistency Gaps

#### Verified Finding in SQL (Lines 155–189):
- No foreign key integrity linking `reservations_orders.seller_profile_id` to `produce_listings.seller_profile_id`. A corrupted order could associate Seller A with a listing owned by Seller B.
- No expiration enforcement: While `offers_negotiations.expires_at` exists, there is no index on `expires_at` and no automated state check preventing acceptance of expired offers.

---

### 2.7 Simulated Payment Idempotency & Financial Ledger Safety

#### Verified Finding in SQL (Lines 190–204):
```sql
CREATE TABLE IF NOT EXISTS public.simulated_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
    event_type payment_event_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    idempotency_key TEXT UNIQUE NOT NULL,
    source_account_ref TEXT,
    destination_account_ref TEXT,
    ledger_state TEXT NOT NULL DEFAULT 'SIMULATED_SUCCESS',
    payload_audit JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Risks:
- **Missing Cryptographic Payload Hash**: Architecture section 5 mandates a cryptographic SHA-256 payload hash to detect payload tampering or hash collision. The SQL table omits this column.
- **Lack of Ledger Immutability Enforcement**: While RLS can block client updates, database administrators or application functions could still run `UPDATE` or `DELETE` statements on the ledger. An explicit PostgreSQL trigger preventing `UPDATE` or `DELETE` on `simulated_payment_events` is essential for financial audit compliance.
- **Denial of Payment Event Creation**: Without an explicit `INSERT` policy for the payment ledger, client-initiated checkout simulations will throw an RLS error unless invoked through a `SECURITY DEFINER` function.

---

## 3. Prioritized Recommendations Matrix

| Priority | Category | Action Item | Target File / Area |
| :---: | :--- | :--- | :--- |
| **P0** | **Security / RLS** | Implement missing RLS policies for `user_roles`, `offers_negotiations`, `reservations_orders`, and `simulated_payment_events`. | `docs/database-schema-proposal.sql` |
| **P0** | **Privacy / PII** | Restrict `profiles` SELECT to public safe fields (name, district, badge); hide phone, email, and bank details from general public. | `docs/database-schema-proposal.sql` |
| **P0** | **Integrity** | Guard `kyc_verified` and `bank_account_verified` so they cannot be modified via self-service `UPDATE`. | `docs/database-schema-proposal.sql` |
| **P1** | **Privacy** | Implement location masking on `produce_listings`: public view receives only `farm_district` and `farm_state`; exact coordinates revealed only to confirmed order participants. | `docs/database-schema-proposal.sql` |
| **P1** | **Concurrency** | Add `reserved_quantity_kg` to `produce_listings` and enforce `CHECK (reserved_quantity_kg <= quantity_in_kg)`. | `docs/database-schema-proposal.sql` |
| **P1** | **Integrity** | Add `UNIQUE (accepted_offer_id)` to `reservations_orders` to prevent double-conversion of accepted bids. | `docs/database-schema-proposal.sql` |
| **P2** | **Audit / Ledger** | Add `payload_hash TEXT NOT NULL` and a strict immutable trigger blocking `UPDATE`/`DELETE` on `simulated_payment_events`. | `docs/database-schema-proposal.sql` |
| **P2** | **RBAC** | Add helper function `has_role(user_id, role)` and restrict listing creation to accounts verified as `farmer` or `fpo_admin`. | `docs/database-schema-proposal.sql` |
| **P3** | **Consistency** | Add generated column or check trigger ensuring `quantity_in_kg` strictly matches `harvest_quantity * unit_factor`. | `docs/database-schema-proposal.sql` |

---

## 4. Remediation Proposals (Draft for Future Implementation)

*Note: In accordance with task instructions, these patches are proposed below for review and have **not** been applied to the SQL file yet.*

### 4.1 Remediation Proposal: Profile PII Isolation & KYC Column Protection
```sql
-- Replace overly broad profiles SELECT policy:
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

-- Separate public directory from private PII:
-- 1. Create a secure view for public discovery:
CREATE OR REPLACE VIEW public.public_profiles AS
    SELECT id, full_name, district, state, kyc_verified, created_at
    FROM public.profiles;

-- 2. Restrict direct profiles table access to own record or admin:
CREATE POLICY profiles_select_self ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = auth_user_id OR EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        AND ur.role = 'admin'
    ));

-- 3. Prevent self-elevation of verification flags using a trigger:
CREATE OR REPLACE FUNCTION public.protect_profile_verification_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified OR 
        NEW.bank_account_verified IS DISTINCT FROM OLD.bank_account_verified) THEN
        -- Only service role / admin can alter verification flags
        IF (auth.jwt() ->> 'role' != 'service_role') THEN
            RAISE EXCEPTION 'Unauthorized: Verification flags can only be modified by system administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_protect_profile_verification
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_verification_fields();
```

### 4.2 Remediation Proposal: Location Masking on Produce Listings
```sql
-- Create a masked public marketplace view:
CREATE OR REPLACE VIEW public.public_produce_listings AS
    SELECT 
        id, seller_profile_id, title, commodity, variety, grade,
        harvest_quantity, quantity_unit, quantity_in_kg, harvest_date,
        expected_shelf_life_days, farm_district, farm_state,
        target_price_per_kg, status, created_at
        -- Excludes: farm_location_address, farm_pincode, latitude, longitude
    FROM public.produce_listings
    WHERE status = 'active';

-- Allow full physical location access only to seller, accepted buyer, or assigned transporter:
DROP POLICY IF EXISTS listings_select_public ON public.produce_listings;
CREATE POLICY listings_select_scoped ON public.produce_listings
    FOR SELECT TO authenticated
    USING (
        status = 'active' OR
        seller_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        id IN (SELECT listing_id FROM public.reservations_orders WHERE buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    );
```

### 4.3 Remediation Proposal: Missing RLS Policies for Commercial Flow
```sql
-- 1. user_roles: Users can read their own roles; admins can manage
CREATE POLICY user_roles_select_self ON public.user_roles
    FOR SELECT TO authenticated
    USING (profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

-- 2. offers_negotiations: Buyer and Seller can view and manage active bids
CREATE POLICY offers_select_participants ON public.offers_negotiations
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    );

CREATE POLICY offers_insert_buyer ON public.offers_negotiations
    FOR INSERT TO authenticated
    WITH CHECK (buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY offers_update_participants ON public.offers_negotiations
    FOR UPDATE TO authenticated
    USING (
        (buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND status = 'pending') OR
        listing_id IN (SELECT id FROM public.produce_listings WHERE seller_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
    );

-- 3. reservations_orders: Order participants can view; updates constrained to state machine
CREATE POLICY orders_select_participants ON public.reservations_orders
    FOR SELECT TO authenticated
    USING (
        buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        seller_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
        assigned_transporter_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- 4. simulated_payment_events: Read-only for order participants; inserts restricted to ledger RPC
CREATE POLICY payment_events_select_participants ON public.simulated_payment_events
    FOR SELECT TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.reservations_orders 
            WHERE buyer_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
               OR seller_profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
        )
    );
```

### 4.4 Remediation Proposal: Immutable Payment Ledger Enforcement
```sql
-- Block any UPDATE or DELETE on the simulated payment events table:
CREATE OR REPLACE FUNCTION public.enforce_payment_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: Payment ledger entries are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_payment_events
BEFORE UPDATE OR DELETE ON public.simulated_payment_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_ledger_immutability();
```

---

## 5. Audit & Safety Compliance Report

| Safety Requirement | Status | Verification Detail |
| :--- | :---: | :--- |
| **ResiliNet Isolation** | **Compliant** | Zero ResiliNet files, repos, or databases touched or referenced. |
| **Credential / Secret Protection** | **Compliant** | No `.env` or `.env.local` files inspected or printed. No secrets exposed. |
| **Database Modification** | **Compliant** | No external database created or connected. No SQL executed. |
| **Application Code Untouched** | **Compliant** | Next.js App Router code, calculation engine, and tests remain intact. |
| **Original SQL Proposal** | **Compliant** | `docs/database-schema-proposal.sql` remains completely unmodified. |
