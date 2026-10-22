-- ==============================================================================
-- AgriPrice Phase 4 Hotfix: Notifications and Disputes Schema Specification
-- File: docs/hotfix-phase4-notifications-disputes.sql
--
-- PURPOSE:
--  Provides manual migration scripts for database administrators to install:
--   1. public.user_notifications: Real-time user notification stream with RLS
--   2. public.order_disputes: Audited commercial disputes ledger with RLS
--   3. Secure RPCs:
--      - raise_order_dispute: Atomically locks order escrow into 'disputed' state
--      - resolve_order_dispute: Enforces admin arbitration without client escrow manipulation
--      - mark_notification_read: Recipient-isolated read status transition
--
-- SECURITY & COMPLIANCE:
--  - STRICT RLS: Users only read notifications addressed to their profile_id.
--  - ORDER ISOLATION: Disputes are visible only to claimant, respondent, assigned transporter, and admin.
--  - ESCROW FREEZE: Raising a dispute freezes the order state machine at 'disputed'.
--  - NO CLIENT ESCROW TAMPERING: Arbitrating a dispute does NOT release escrow directly;
--    disbursement must occur through the double-entry payment ledger via record_simulated_payment_event.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. NOTIFICATIONS TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('listing', 'offer', 'order', 'payment', 'storage', 'dispute', 'system')),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
    title TEXT NOT NULL CHECK (length(trim(title)) >= 3),
    description TEXT NOT NULL CHECK (length(trim(description)) >= 5),
    action_url_tab TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_unread 
    ON public.user_notifications(recipient_profile_id, is_read, created_at DESC);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Notification Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.user_notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.user_notifications
    FOR SELECT
    USING (
        recipient_profile_id = public.get_current_profile_id()
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Users can update read status on their own notifications" ON public.user_notifications;
CREATE POLICY "Users can update read status on their own notifications"
    ON public.user_notifications
    FOR UPDATE
    USING (
        recipient_profile_id = public.get_current_profile_id()
    )
    WITH CHECK (
        recipient_profile_id = public.get_current_profile_id()
    );

DROP POLICY IF EXISTS "System and authenticated participants can insert notifications" ON public.user_notifications;
CREATE POLICY "System and authenticated participants can insert notifications"
    ON public.user_notifications
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
    );

-- ------------------------------------------------------------------------------
-- 2. ORDER DISPUTES TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.reservations_orders(id) ON DELETE RESTRICT,
    claimant_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    respondent_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    dispute_reason TEXT NOT NULL CHECK (length(trim(dispute_reason)) >= 10),
    evidence_summary TEXT NOT NULL CHECK (length(trim(evidence_summary)) >= 10),
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'under_review' CHECK (
        status IN ('under_review', 'resolved_seller_paid', 'resolved_buyer_refunded', 'resolved_mutual_split', 'dismissed')
    ),
    resolution_notes TEXT,
    arbitrated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    filed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_disputes_order_id ON public.order_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_claimant ON public.order_disputes(claimant_profile_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_respondent ON public.order_disputes(respondent_profile_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON public.order_disputes(status);

-- Enable RLS
ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;

-- Dispute Policies
DROP POLICY IF EXISTS "Dispute participants and admins can view disputes" ON public.order_disputes;
CREATE POLICY "Dispute participants and admins can view disputes"
    ON public.order_disputes
    FOR SELECT
    USING (
        claimant_profile_id = public.get_current_profile_id()
        OR respondent_profile_id = public.get_current_profile_id()
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.reservations_orders ro
            WHERE ro.id = order_disputes.order_id
            AND ro.assigned_transporter_id = public.get_current_profile_id()
        )
    );

-- Only platform admins can update dispute status
DROP POLICY IF EXISTS "Only platform admins can arbitrate disputes" ON public.order_disputes;
CREATE POLICY "Only platform admins can arbitrate disputes"
    ON public.order_disputes
    FOR UPDATE
    USING (
        public.is_admin()
    )
    WITH CHECK (
        public.is_admin()
    );

-- ------------------------------------------------------------------------------
-- 3. STORED PROCEDURE: raise_order_dispute
-- Atomically freezes order state to 'disputed' and files dispute record.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.raise_order_dispute(
    p_order_id UUID,
    p_dispute_reason TEXT,
    p_evidence_summary TEXT,
    p_evidence_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile_id UUID;
    v_order RECORD;
    v_respondent_profile_id UUID;
    v_dispute_id UUID;
BEGIN
    -- 1. Identify caller profile
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: Unable to resolve caller profile ID.';
    END IF;

    -- 2. Validate input strings
    IF length(trim(p_dispute_reason)) < 10 THEN
        RAISE EXCEPTION 'Dispute reason must be at least 10 characters long.';
    END IF;
    IF length(trim(p_evidence_summary)) < 10 THEN
        RAISE EXCEPTION 'Evidence summary must be at least 10 characters long.';
    END IF;

    -- 3. Lock order row for update
    SELECT * INTO v_order
    FROM public.reservations_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order reference % not found.', p_order_id;
    END IF;

    -- 4. Check participant eligibility
    IF v_order.buyer_profile_id = v_caller_profile_id THEN
        v_respondent_profile_id := v_order.seller_profile_id;
    ELSIF v_order.seller_profile_id = v_caller_profile_id THEN
        v_respondent_profile_id := v_order.buyer_profile_id;
    ELSIF public.is_admin() THEN
        v_respondent_profile_id := v_order.seller_profile_id;
    ELSE
        RAISE EXCEPTION 'Authorization Violation: Only the buyer, seller, or platform admin can raise a dispute on Order %.', p_order_id;
    END IF;

    -- 5. Check order status eligibility
    IF v_order.escrow_status NOT IN ('awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected') THEN
        RAISE EXCEPTION 'Order in status "%" is not eligible for dispute. Only active escrow orders can be disputed.', v_order.escrow_status;
    END IF;

    -- 6. Insert dispute record
    INSERT INTO public.order_disputes (
        order_id,
        claimant_profile_id,
        respondent_profile_id,
        dispute_reason,
        evidence_summary,
        evidence_metadata,
        status,
        filed_at
    ) VALUES (
        p_order_id,
        v_caller_profile_id,
        v_respondent_profile_id,
        trim(p_dispute_reason),
        trim(p_evidence_summary),
        p_evidence_metadata,
        'under_review',
        now()
    ) RETURNING id INTO v_dispute_id;

    -- 7. Freeze order escrow status to 'disputed'
    UPDATE public.reservations_orders
    SET escrow_status = 'disputed',
        updated_at = now()
    WHERE id = p_order_id;

    -- 8. Generate notification for respondent
    INSERT INTO public.user_notifications (
        recipient_profile_id,
        category,
        severity,
        title,
        description,
        action_url_tab,
        metadata
    ) VALUES (
        v_respondent_profile_id,
        'dispute',
        'warning',
        'Commercial Dispute Raised on Order',
        format('A dispute was filed regarding Order %s: %s', v_order.id, trim(p_dispute_reason)),
        'disputes',
        jsonb_build_object('order_id', p_order_id, 'dispute_id', v_dispute_id)
    );

    RETURN v_dispute_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. STORED PROCEDURE: resolve_order_dispute
-- Strictly admin-authorized arbitration.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_order_dispute(
    p_dispute_id UUID,
    p_resolution_status TEXT,
    p_resolution_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_profile_id UUID;
    v_dispute RECORD;
BEGIN
    -- 1. Require admin caller
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Authorization Violation: Only platform administrators are authorized to arbitrate disputes.';
    END IF;

    v_admin_profile_id := public.get_current_profile_id();

    -- 2. Validate resolution status
    IF p_resolution_status NOT IN ('resolved_seller_paid', 'resolved_buyer_refunded', 'resolved_mutual_split', 'dismissed') THEN
        RAISE EXCEPTION 'Invalid resolution status: %. Must be resolved_seller_paid, resolved_buyer_refunded, resolved_mutual_split, or dismissed.', p_resolution_status;
    END IF;

    -- 3. Lock dispute row
    SELECT * INTO v_dispute
    FROM public.order_disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispute % not found.', p_dispute_id;
    END IF;

    IF v_dispute.status != 'under_review' THEN
        RAISE EXCEPTION 'Dispute % has already been resolved with status "%".', p_dispute_id, v_dispute.status;
    END IF;

    -- 4. Update dispute record
    UPDATE public.order_disputes
    SET status = p_resolution_status,
        resolution_notes = trim(p_resolution_notes),
        arbitrated_by_profile_id = v_admin_profile_id,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    -- 5. Notify both claimant and respondent
    INSERT INTO public.user_notifications (
        recipient_profile_id,
        category,
        severity,
        title,
        description,
        action_url_tab,
        metadata
    ) VALUES 
    (
        v_dispute.claimant_profile_id,
        'dispute',
        'info',
        'Dispute Determination Rendered',
        format('Dispute for Order %s resolved: %s. %s', v_dispute.order_id, p_resolution_status, trim(p_resolution_notes)),
        'disputes',
        jsonb_build_object('dispute_id', p_dispute_id, 'status', p_resolution_status)
    ),
    (
        v_dispute.respondent_profile_id,
        'dispute',
        'info',
        'Dispute Determination Rendered',
        format('Dispute for Order %s resolved: %s. %s', v_dispute.order_id, p_resolution_status, trim(p_resolution_notes)),
        'disputes',
        jsonb_build_object('dispute_id', p_dispute_id, 'status', p_resolution_status)
    );

    RETURN true;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. STORED PROCEDURE: mark_notification_read
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_notification_read(
    p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile_id UUID;
BEGIN
    v_caller_profile_id := public.get_current_profile_id();
    IF v_caller_profile_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE public.user_notifications
    SET is_read = true,
        read_at = now()
    WHERE id = p_notification_id
    AND (recipient_profile_id = v_caller_profile_id OR public.is_admin());

    RETURN true;
END;
$$;
