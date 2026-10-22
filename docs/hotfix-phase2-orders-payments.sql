-- ==============================================================================
-- AgriPrice Phase 2 Reference & Hotfix Patch
-- Persistent Orders, Delivery Tracking, and Simulated Payments
--
-- STATUS: FOR MANUAL REVIEW ONLY.
-- DO NOT APPLY AUTOMATICALLY.
--
-- This document describes the installed schema, RLS policies, PostgreSQL constraints,
-- and atomic security procedures governing reservations_orders and simulated_payment_events.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table Definitions (Installed in remote Supabase)
-- ------------------------------------------------------------------------------

-- Table: public.reservations_orders
-- Represents escrow-protected reservations and active delivery orders.
/*
CREATE TABLE IF NOT EXISTS public.reservations_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.produce_listings(id) ON DELETE RESTRICT,
  accepted_offer_id UUID UNIQUE NOT NULL REFERENCES public.offers_negotiations(id) ON DELETE RESTRICT,
  seller_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_transporter_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  locked_quantity_kg NUMERIC NOT NULL CHECK (locked_quantity_kg > 0),
  agreed_price_per_kg NUMERIC NOT NULL CHECK (agreed_price_per_kg > 0),
  total_agreed_amount NUMERIC NOT NULL CHECK (total_agreed_amount = locked_quantity_kg * agreed_price_per_kg),
  escrow_status TEXT NOT NULL CHECK (escrow_status IN (
    'awaiting_escrow',
    'escrow_funded',
    'in_transit',
    'delivered_inspected',
    'settled',
    'cancelled',
    'disputed'
  )) DEFAULT 'awaiting_escrow',
  pickup_scheduled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
*/

-- Table: public.simulated_payment_events
-- Immutable cryptographic ledger of milestone payment authorizations.
/*
CREATE TABLE IF NOT EXISTS public.simulated_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'escrow_hold_authorized',
    'dispatch_advance_released',
    'quality_acceptance_confirmed',
    'farmer_proceeds_settled'
  )),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (currency = 'INR') DEFAULT 'INR',
  idempotency_key TEXT UNIQUE NOT NULL CHECK (length(trim(idempotency_key)) >= 16),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
*/

-- ------------------------------------------------------------------------------
-- 2. Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------

-- Ensure RLS is active
ALTER TABLE public.reservations_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulated_payment_events ENABLE ROW LEVEL SECURITY;

-- Policy: reservations_orders_select_participants
-- Visible only to the counterparty buyer, seller, assigned transporter, or platform admin.
DROP POLICY IF EXISTS "reservations_orders_select_participants" ON public.reservations_orders;
CREATE POLICY "reservations_orders_select_participants"
ON public.reservations_orders
FOR SELECT
TO authenticated
USING (
  seller_profile_id = (SELECT auth.uid()) OR
  buyer_profile_id = (SELECT auth.uid()) OR
  assigned_transporter_id = (SELECT auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin'
  )
);

-- Policy: simulated_payment_events_select_participants
-- Visible only to the participants of the parent order or platform admin.
DROP POLICY IF EXISTS "simulated_payment_events_select_participants" ON public.simulated_payment_events;
CREATE POLICY "simulated_payment_events_select_participants"
ON public.simulated_payment_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reservations_orders ro
    WHERE ro.id = simulated_payment_events.order_id
      AND (
        ro.seller_profile_id = (SELECT auth.uid()) OR
        ro.buyer_profile_id = (SELECT auth.uid()) OR
        ro.assigned_transporter_id = (SELECT auth.uid()) OR
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin'
        )
      )
  )
);

-- Immutable Ledger Trigger: Prohibit UPDATE or DELETE on simulated_payment_events
CREATE OR REPLACE FUNCTION public.fn_enforce_simulated_payment_events_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security Violation: simulated_payment_events is an immutable append-only ledger. UPDATE and DELETE statements are strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_simulated_payment_events_immutable ON public.simulated_payment_events;
CREATE TRIGGER trg_simulated_payment_events_immutable
BEFORE UPDATE OR DELETE ON public.simulated_payment_events
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_simulated_payment_events_immutable();

-- ------------------------------------------------------------------------------
-- 3. Stored Procedures & Atomic Transactions
-- ------------------------------------------------------------------------------

-- Procedure 1: Dispatch Order Advance (Seller only)
-- Moves order status to 'in_transit' and records 40% dispatch advance event atomically.
CREATE OR REPLACE FUNCTION public.dispatch_order_advance(
  p_order_id UUID,
  p_transporter_id UUID,
  p_advance_amount NUMERIC,
  p_idempotency_key TEXT,
  p_payload_hash TEXT,
  p_audit JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_order RECORD;
  v_event_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_order
  FROM public.reservations_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.seller_profile_id <> v_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.profile_id = v_caller_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Authorization Violation: Only the seller or platform admin can dispatch the order.';
  END IF;

  IF v_order.escrowStatus = 'in_transit' THEN
    -- Check for existing idempotent payment event
    SELECT id INTO v_event_id
    FROM public.simulated_payment_events
    WHERE idempotency_key = p_idempotency_key;
    IF v_event_id IS NOT NULL THEN
      RETURN v_event_id;
    END IF;
  END IF;

  IF v_order.escrow_status <> 'escrow_funded' THEN
    RAISE EXCEPTION 'Cannot dispatch order: Current status is "%", must be "escrow_funded".', v_order.escrow_status;
  END IF;

  -- Update order state
  UPDATE public.reservations_orders
  SET
    escrow_status = 'in_transit',
    assigned_transporter_id = COALESCE(p_transporter_id, assigned_transporter_id),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  -- Record simulated payment advance
  INSERT INTO public.simulated_payment_events (
    order_id,
    event_type,
    amount,
    currency,
    idempotency_key,
    payload_hash,
    audit_metadata,
    recorded_by_profile_id
  ) VALUES (
    p_order_id,
    'dispatch_advance_released',
    p_advance_amount,
    'INR',
    p_idempotency_key,
    p_payload_hash,
    p_audit,
    v_caller_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Procedure 2: Cancel Reservation and Release Inventory
-- Safely unlocks reserved inventory back to active produce listing.
CREATE OR REPLACE FUNCTION public.cancel_reservation_and_release_inventory(
  p_order_id UUID,
  p_cancellation_reason TEXT DEFAULT 'Cancelled before escrow funding'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_order RECORD;
  v_listing RECORD;
  v_new_reserved NUMERIC;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_order
  FROM public.reservations_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.seller_profile_id <> v_caller_id AND
     v_order.buyer_profile_id <> v_caller_id AND
     NOT EXISTS (
       SELECT 1 FROM public.user_roles ur WHERE ur.profile_id = v_caller_id AND ur.role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Authorization Violation: Only order participants can cancel this reservation.';
  END IF;

  IF v_order.escrow_status = 'cancelled' THEN
    RETURN TRUE; -- Idempotent no-op
  END IF;

  IF v_order.escrow_status <> 'awaiting_escrow' AND v_order.escrow_status <> 'disputed' THEN
    RAISE EXCEPTION 'Cannot cancel reservation: Escrow funds have already been committed ("%"). Contact support.', v_order.escrow_status;
  END IF;

  -- 1. Mark order cancelled
  UPDATE public.reservations_orders
  SET
    escrow_status = 'cancelled',
    updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  -- 2. Restore inventory on listing
  SELECT * INTO v_listing
  FROM public.produce_listings
  WHERE id = v_order.listing_id
  FOR UPDATE;

  IF FOUND THEN
    v_new_reserved := GREATEST(0, v_listing.reserved_quantity_kg - v_order.locked_quantity_kg);
    UPDATE public.produce_listings
    SET
      reserved_quantity_kg = v_new_reserved,
      status = 'active',
      updated_at = timezone('utc'::text, now())
    WHERE id = v_order.listing_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Recommended Performance Indices
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_reservations_orders_buyer ON public.reservations_orders (buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_reservations_orders_seller ON public.reservations_orders (seller_profile_id);
CREATE INDEX IF NOT EXISTS idx_reservations_orders_listing ON public.reservations_orders (listing_id);
CREATE INDEX IF NOT EXISTS idx_simulated_payment_events_order ON public.simulated_payment_events (order_id);
CREATE INDEX IF NOT EXISTS idx_simulated_payment_events_idemp ON public.simulated_payment_events (idempotency_key);
