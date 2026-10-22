-- ============================================================================
-- AGRIPRICE PHASE 1 HOTFIX REFERENCE & VERIFICATION SPECIFICATION
-- Module: Buyer Offers, Bilateral Negotiations & Atomic Inventory Reservation
-- Target: Supabase / PostgreSQL 15+
--
-- DO NOT EXECUTE AUTOMATICALLY. This script serves as documentation, review
-- reference, and repeatable DDL verification for Phase 1 persistence.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table Schema: offers_negotiations
-- ----------------------------------------------------------------------------
-- Enforces typed statuses ('pending', 'countered', 'accepted', 'rejected', 'cancelled', 'expired')
-- Prevents negative quantities/prices and records delivery terms.

CREATE TABLE IF NOT EXISTS public.offers_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE CASCADE,
  buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calculation_snapshot_id UUID REFERENCES public.net_return_calculations(id) ON DELETE SET NULL,
  offered_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (offered_price_per_kg > 0),
  offered_quantity_kg NUMERIC(12, 2) NOT NULL CHECK (offered_quantity_kg > 0),
  delivery_terms TEXT NOT NULL,
  transport_borne_by TEXT NOT NULL CHECK (transport_borne_by IN ('buyer', 'seller', 'shared')),
  status public.offer_status_type NOT NULL DEFAULT 'pending',
  notes TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row-Level Security
ALTER TABLE public.offers_negotiations ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

-- Policy 2.1: Visibility - Only participants (Buyer, Listing Seller, or Admin) can view offers
DROP POLICY IF EXISTS offers_select_participants ON public.offers_negotiations;
CREATE POLICY offers_select_participants ON public.offers_negotiations
  FOR SELECT
  TO authenticated
  USING (
    buyer_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.produce_listings pl
      WHERE pl.id = offers_negotiations.listing_id
        AND pl.seller_profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.profile_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Policy 2.2: Creation - Only verified buyers (trader, processor, fpo_admin) can submit offers
DROP POLICY IF EXISTS offers_insert_buyers ON public.offers_negotiations;
CREATE POLICY offers_insert_buyers ON public.offers_negotiations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    buyer_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.profile_id = auth.uid()
        AND ur.role IN ('trader', 'processor', 'fpo_admin')
    )
  );

-- Policy 2.3: Seller Decision - Seller can only transition to 'countered' or 'rejected'
-- (Note: 'accepted' is intentionally blocked from direct UPDATE to force usage of atomic RPC)
DROP POLICY IF EXISTS offers_update_seller_decide ON public.offers_negotiations;
CREATE POLICY offers_update_seller_decide ON public.offers_negotiations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.produce_listings pl
      WHERE pl.id = offers_negotiations.listing_id
        AND pl.seller_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('countered', 'rejected')
  );

-- Policy 2.4: Buyer Cancellation - Buyer can cancel their own pending offer
DROP POLICY IF EXISTS offers_update_buyer_cancel ON public.offers_negotiations;
CREATE POLICY offers_update_buyer_cancel ON public.offers_negotiations
  FOR UPDATE
  TO authenticated
  USING (
    buyer_profile_id = auth.uid()
  )
  WITH CHECK (
    status = 'cancelled'
  );

-- ----------------------------------------------------------------------------
-- 3. Business Integrity Triggers
-- ----------------------------------------------------------------------------

-- Trigger 3.1: Anti-Wash Trading (Sellers cannot bid on their own listings)
CREATE OR REPLACE FUNCTION public.fn_ensure_buyer_not_seller()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seller_id UUID;
BEGIN
  SELECT seller_profile_id INTO v_seller_id
  FROM public.produce_listings
  WHERE id = NEW.listing_id;

  IF v_seller_id = NEW.buyer_profile_id THEN
    RAISE EXCEPTION 'Platform Integrity Violation: Producers cannot submit offers on their own listings (Anti-Wash Trading Rule).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_buyer_not_seller ON public.offers_negotiations;
CREATE TRIGGER trg_ensure_buyer_not_seller
  BEFORE INSERT ON public.offers_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ensure_buyer_not_seller();

-- Trigger 3.2: Protection of Offer Terms (Immutability of financial parameters)
CREATE OR REPLACE FUNCTION public.fn_protect_offer_terms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.listing_id <> OLD.listing_id OR
     NEW.buyer_profile_id <> OLD.buyer_profile_id OR
     NEW.offered_price_per_kg <> OLD.offered_price_per_kg OR
     NEW.offered_quantity_kg <> OLD.offered_quantity_kg OR
     NEW.delivery_terms <> OLD.delivery_terms OR
     NEW.transport_borne_by <> OLD.transport_borne_by OR
     NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'Platform Security Violation: Offer financial parameters and terms cannot be modified after initial submission.';
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_offer_terms ON public.offers_negotiations;
CREATE TRIGGER trg_protect_offer_terms
  BEFORE UPDATE ON public.offers_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_offer_terms();

-- ----------------------------------------------------------------------------
-- 4. Atomic Stored Procedure: accept_offer_and_create_reservation
-- ----------------------------------------------------------------------------
-- Guarantees race-condition-free offer acceptance and inventory locking.
-- Locks offers_negotiations row, then produce_listings row FOR UPDATE.
-- Verifies:
--   1. Caller owns the listing (or is admin).
--   2. Offer is currently 'pending' or 'countered'.
--   3. Offer has not expired.
--   4. (reserved_quantity_kg + offered_quantity_kg) <= quantity_in_kg.
-- Atomically creates a reservations_orders row in 'awaiting_escrow' state.

CREATE OR REPLACE FUNCTION public.accept_offer_and_create_reservation(
  p_offer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer RECORD;
  v_listing RECORD;
  v_reservation_id UUID;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication Violation: Caller must be signed in to accept offers.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE profile_id = v_caller_id AND role = 'admin'
  ) INTO v_is_admin;

  -- Step A: Lock and validate offer
  SELECT * INTO v_offer
  FROM public.offers_negotiations
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found (ID: %).', p_offer_id;
  END IF;

  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'Invalid State Transition: Only pending or countered offers can be accepted (Current status: %).', v_offer.status;
  END IF;

  IF v_offer.expires_at < timezone('utc'::text, now()) THEN
    UPDATE public.offers_negotiations SET status = 'expired' WHERE id = p_offer_id;
    RAISE EXCEPTION 'Validation Violation: Cannot accept expired offer.';
  END IF;

  -- Step B: Lock and validate produce listing
  SELECT * INTO v_listing
  FROM public.produce_listings
  WHERE id = v_offer.listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated produce listing not found (ID: %).', v_offer.listing_id;
  END IF;

  -- Authorization check: Caller must be listing seller or platform admin
  IF v_listing.seller_profile_id <> v_caller_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Authorization Violation: Only the verified producer owning this listing can accept offers.';
  END IF;

  -- Concurrency check: Ensure inventory headroom
  IF (v_listing.reserved_quantity_kg + v_offer.offered_quantity_kg) > v_listing.quantity_in_kg THEN
    RAISE EXCEPTION 'Insufficient Inventory: Listing only has % kg available, cannot fulfill offer for % kg.',
      (v_listing.quantity_in_kg - v_listing.reserved_quantity_kg),
      v_offer.offered_quantity_kg;
  END IF;

  -- Step C: Atomically update listing reserved volume and status
  UPDATE public.produce_listings
  SET
    reserved_quantity_kg = reserved_quantity_kg + v_offer.offered_quantity_kg,
    status = CASE
      WHEN (reserved_quantity_kg + v_offer.offered_quantity_kg) >= quantity_in_kg THEN 'reserved'::public.listing_status_type
      ELSE status
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = v_listing.id;

  -- Step D: Update offer status to accepted
  UPDATE public.offers_negotiations
  SET
    status = 'accepted',
    updated_at = timezone('utc'::text, now())
  WHERE id = p_offer_id;

  -- Step E: Create escrow reservation order
  INSERT INTO public.reservations_orders (
    listing_id,
    buyer_profile_id,
    accepted_offer_id,
    reserved_quantity_kg,
    agreed_price_per_kg,
    total_agreed_amount,
    escrow_status,
    delivery_terms,
    transport_borne_by
  ) VALUES (
    v_listing.id,
    v_offer.buyer_profile_id,
    p_offer_id,
    v_offer.offered_quantity_kg,
    v_offer.offered_price_per_kg,
    ROUND((v_offer.offered_quantity_kg * v_offer.offered_price_per_kg), 2),
    'awaiting_escrow',
    v_offer.delivery_terms,
    v_offer.transport_borne_by
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_offer_and_create_reservation(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_offer_and_create_reservation(UUID) FROM anon;
