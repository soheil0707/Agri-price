-- ==============================================================================
-- AgriPrice Phase 3: Cold-Storage Hub Capacity Reservations & Logistics Tracking
--
-- STATUS: SPECIFICATION & PATCH PROPOSAL FOR MANUAL ADMINISTRATOR REVIEW.
-- DO NOT APPLY AUTOMATICALLY.
--
-- This script specifies:
-- 1. Table `public.cold_storage_facilities` for WDRA-registered facility profiles.
-- 2. Table `public.cold_storage_reservations` for atomic space allocation.
-- 3. Table `public.storage_temperature_telemetry` for IoT chamber logging.
-- 4. Atomic stored procedures to prevent capacity double-booking / over-allocation.
-- 5. Row-Level Security (RLS) policies for operators, depositors, and transporters.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: public.cold_storage_facilities
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cold_storage_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  facility_name TEXT NOT NULL CHECK (length(trim(facility_name)) >= 3),
  license_number TEXT UNIQUE NOT NULL CHECK (length(trim(license_number)) >= 5),
  state TEXT NOT NULL CHECK (length(trim(state)) >= 2),
  district TEXT NOT NULL CHECK (length(trim(district)) >= 2),
  pincode TEXT NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  facility_address TEXT NOT NULL,
  total_capacity_mt NUMERIC NOT NULL CHECK (total_capacity_mt > 0),
  reserved_capacity_mt NUMERIC NOT NULL CHECK (reserved_capacity_mt >= 0 AND reserved_capacity_mt <= total_capacity_mt) DEFAULT 0,
  chamber_count INTEGER NOT NULL CHECK (chamber_count >= 1) DEFAULT 1,
  temperature_range TEXT NOT NULL DEFAULT '0°C to 15°C',
  daily_rate_per_quintal NUMERIC NOT NULL CHECK (daily_rate_per_quintal > 0),
  suitable_commodities TEXT[] NOT NULL DEFAULT ARRAY['Tomato', 'Potato', 'Onion', 'Grapes', 'Capsicum'],
  certifications TEXT[] NOT NULL DEFAULT ARRAY['WDRA Registered', 'FSSAI Certified'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. Table: public.cold_storage_reservations
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cold_storage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id) ON DELETE RESTRICT,
  depositor_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  linked_order_id UUID REFERENCES public.reservations_orders(id) ON DELETE SET NULL,
  linked_listing_id UUID REFERENCES public.produce_listings(id) ON DELETE SET NULL,
  commodity TEXT NOT NULL CHECK (length(trim(commodity)) >= 2),
  reserved_mt NUMERIC NOT NULL CHECK (reserved_mt > 0),
  daily_rate_per_quintal NUMERIC NOT NULL CHECK (daily_rate_per_quintal > 0),
  total_estimated_cost NUMERIC NOT NULL CHECK (total_estimated_cost >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  status TEXT NOT NULL CHECK (status IN (
    'pending_confirmation',
    'confirmed',
    'active_stored',
    'discharged',
    'cancelled'
  )) DEFAULT 'confirmed',
  target_chamber_id TEXT,
  check_in_at TIMESTAMPTZ,
  discharged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 3. Table: public.storage_temperature_telemetry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_temperature_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.cold_storage_facilities(id) ON DELETE CASCADE,
  chamber_id TEXT NOT NULL,
  temperature_celsius NUMERIC(5, 2) NOT NULL CHECK (temperature_celsius BETWEEN -40.00 AND 60.00),
  humidity_percent NUMERIC(5, 2) NOT NULL CHECK (humidity_percent BETWEEN 0.00 AND 100.00),
  status_label TEXT NOT NULL DEFAULT 'Optimal',
  recorded_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. Row-Level Security (RLS) Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.cold_storage_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_storage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_temperature_telemetry ENABLE ROW LEVEL SECURITY;

-- Facilities RLS:
-- Publicly readable active directory (macro columns only)
CREATE POLICY "cold_storage_facilities_select_all"
ON public.cold_storage_facilities
FOR SELECT
TO authenticated, anon
USING (is_active = true);

-- Operators and admins can manage their own facility records
CREATE POLICY "cold_storage_facilities_modify_operator"
ON public.cold_storage_facilities
FOR ALL
TO authenticated
USING (
  operator_profile_id = (SELECT auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin')
)
WITH CHECK (
  operator_profile_id = (SELECT auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin')
);

-- Reservations RLS:
-- Visible to the depositor, the facility operator, and platform admin
CREATE POLICY "cold_storage_reservations_select_participants"
ON public.cold_storage_reservations
FOR SELECT
TO authenticated
USING (
  depositor_profile_id = (SELECT auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.cold_storage_facilities csf
    WHERE csf.id = cold_storage_reservations.facility_id
      AND csf.operator_profile_id = (SELECT auth.uid())
  ) OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin'
  )
);

-- Telemetry RLS:
-- Visible to depositors with active reservations at the facility and operators
CREATE POLICY "storage_telemetry_select_authorized"
ON public.storage_temperature_telemetry
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cold_storage_facilities csf
    WHERE csf.id = storage_temperature_telemetry.facility_id
      AND csf.operator_profile_id = (SELECT auth.uid())
  ) OR
  EXISTS (
    SELECT 1 FROM public.cold_storage_reservations csr
    WHERE csr.facility_id = storage_temperature_telemetry.facility_id
      AND csr.depositor_profile_id = (SELECT auth.uid())
      AND csr.status IN ('confirmed', 'active_stored')
  ) OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.profile_id = (SELECT auth.uid()) AND ur.role = 'admin'
  )
);

-- ------------------------------------------------------------------------------
-- 5. Atomic Capacity Allocation & Over-Allocation Prevention
-- ------------------------------------------------------------------------------

-- Procedure: book_cold_storage_capacity
-- Locks facility row with FOR UPDATE, guarantees available_capacity_mt >= requested_mt,
-- increments reserved_capacity_mt, and inserts reservation atomically.
CREATE OR REPLACE FUNCTION public.book_cold_storage_capacity(
  p_facility_id UUID,
  p_requested_mt NUMERIC,
  p_commodity TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_linked_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_facility RECORD;
  v_available_mt NUMERIC;
  v_days INTEGER;
  v_estimated_cost NUMERIC;
  v_reservation_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_requested_mt <= 0 THEN
    RAISE EXCEPTION 'Requested storage capacity must be strictly greater than 0 MT.';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date must be greater than or equal to start date.';
  END IF;

  -- 1. Atomically lock facility record to prevent concurrent over-booking
  SELECT * INTO v_facility
  FROM public.cold_storage_facilities
  WHERE id = p_facility_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cold storage facility not found or is currently inactive.';
  END IF;

  -- 2. Verify capacity headroom
  v_available_mt := v_facility.total_capacity_mt - v_facility.reserved_capacity_mt;
  IF p_requested_mt > v_available_mt THEN
    RAISE EXCEPTION 'Insufficient capacity: Requested % MT, but only % MT is available at %.',
      p_requested_mt, v_available_mt, v_facility.facility_name;
  END IF;

  -- 3. Calculate reservation duration and estimated cost
  v_days := GREATEST(1, (p_end_date - p_start_date) + 1);
  -- 1 MT = 10 quintals
  v_estimated_cost := ROUND(p_requested_mt * 10 * v_facility.daily_rate_per_quintal * v_days, 2);

  -- 4. Atomically allocate capacity on facility
  UPDATE public.cold_storage_facilities
  SET
    reserved_capacity_mt = reserved_capacity_mt + p_requested_mt,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_facility_id;

  -- 5. Insert confirmed reservation record
  INSERT INTO public.cold_storage_reservations (
    facility_id,
    depositor_profile_id,
    linked_order_id,
    commodity,
    reserved_mt,
    daily_rate_per_quintal,
    total_estimated_cost,
    start_date,
    end_date,
    status
  ) VALUES (
    p_facility_id,
    v_caller_id,
    p_linked_order_id,
    p_commodity,
    p_requested_mt,
    v_facility.daily_rate_per_quintal,
    v_estimated_cost,
    p_start_date,
    p_end_date,
    'confirmed'
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- Procedure: cancel_cold_storage_reservation
-- Cancels reservation and restores reserved capacity back to facility.
CREATE OR REPLACE FUNCTION public.cancel_cold_storage_reservation(
  p_reservation_id UUID,
  p_cancellation_reason TEXT DEFAULT 'Cancelled by depositor'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_res RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_res
  FROM public.cold_storage_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found.';
  END IF;

  IF v_res.depositor_profile_id <> v_caller_id AND
     NOT EXISTS (
       SELECT 1 FROM public.cold_storage_facilities csf
       WHERE csf.id = v_res.facility_id AND csf.operator_profile_id = v_caller_id
     ) AND
     NOT EXISTS (
       SELECT 1 FROM public.user_roles ur WHERE ur.profile_id = v_caller_id AND ur.role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Authorization Violation: Only depositor, facility operator, or admin can cancel this reservation.';
  END IF;

  IF v_res.status = 'cancelled' THEN
    RETURN TRUE; -- Idempotent no-op
  END IF;

  IF v_res.status = 'discharged' THEN
    RAISE EXCEPTION 'Cannot cancel an already discharged storage batch.';
  END IF;

  -- 1. Mark reservation cancelled
  UPDATE public.cold_storage_reservations
  SET
    status = 'cancelled',
    updated_at = timezone('utc'::text, now())
  WHERE id = p_reservation_id;

  -- 2. Restore reserved capacity to facility
  UPDATE public.cold_storage_facilities
  SET
    reserved_capacity_mt = GREATEST(0, reserved_capacity_mt - v_res.reserved_mt),
    updated_at = timezone('utc'::text, now())
  WHERE id = v_res.facility_id;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Performance Indices
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cold_storage_facilities_district ON public.cold_storage_facilities (district, state);
CREATE INDEX IF NOT EXISTS idx_cold_storage_reservations_depositor ON public.cold_storage_reservations (depositor_profile_id);
CREATE INDEX IF NOT EXISTS idx_cold_storage_reservations_facility ON public.cold_storage_reservations (facility_id);
CREATE INDEX IF NOT EXISTS idx_storage_telemetry_facility_chamber ON public.storage_temperature_telemetry (facility_id, chamber_id, recorded_at DESC);
