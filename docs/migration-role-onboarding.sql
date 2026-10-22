-- ==============================================================================
-- AgriPrice: Secure Administrative Role Assignment Migration
-- Target: public.assign_user_role(UUID, public.user_role_type)
-- Description: Allows authenticated platform administrators to assign business roles
--              (farmer, trader, processor, fpo_admin, transporter) to registered
--              profiles while strictly preserving KYC separation and RLS barriers.
-- Security:
--   - SECURITY DEFINER with search_path = ''
--   - Restricts assignment to approved business roles only (prohibits 'admin' via RPC)
--   - Requires caller to be authenticated AND pass public.is_admin()
--   - Idempotent: ON CONFLICT (profile_id, role) DO NOTHING preserves original
--     assigned_by and assigned_at audit stamps
--   - Least-privilege grant to authenticated role only (REVOKE from PUBLIC)
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.assign_user_role(
    p_target_profile_id UUID,
    p_role public.user_role_type
)
RETURNS JSONB AS $$
DECLARE
    v_admin_profile_id UUID;
    v_role_id UUID;
    v_existing_assigned_by UUID;
    v_existing_assigned_at TIMESTAMPTZ;
BEGIN
    -- 1. Ensure caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication Required: Caller must be signed in to assign roles.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Verify caller has administrative authority via existing schema v5 function
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only platform administrators can assign user roles.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Restrict assignable roles: Prevent privilege escalation via this RPC
    -- Only approved supply chain business roles may be assigned by administrators through this endpoint.
    -- The 'admin' role CANNOT be assigned through this RPC; it requires direct project owner intervention.
    IF p_role = 'admin'::public.user_role_type THEN
        RAISE EXCEPTION 'Security Policy Violation: Administrator role cannot be assigned via this procedure.'
            USING ERRCODE = '42501';
    END IF;

    IF p_role NOT IN (
        'farmer'::public.user_role_type,
        'trader'::public.user_role_type,
        'processor'::public.user_role_type,
        'fpo_admin'::public.user_role_type,
        'transporter'::public.user_role_type
    ) THEN
        RAISE EXCEPTION 'Invalid Role: Role % is not an approved business role for onboarding.', p_role
            USING ERRCODE = '22023';
    END IF;

    -- 4. Resolve the administrator's profile ID
    v_admin_profile_id := public.get_current_profile_id();

    -- 5. Verify target profile exists in public.profiles
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_profile_id) THEN
        RAISE EXCEPTION 'Target profile does not exist: %', p_target_profile_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 6. Insert role record (idempotent: ON CONFLICT DO NOTHING to preserve original assigned_by and assigned_at)
    -- Note: This assigns business privileges ONLY; it does NOT alter kyc_verified or bank_account_verified.
    INSERT INTO public.user_roles (
        profile_id,
        role,
        assigned_by,
        assigned_at
    ) VALUES (
        p_target_profile_id,
        p_role,
        v_admin_profile_id,
        NOW()
    )
    ON CONFLICT (profile_id, role) DO NOTHING
    RETURNING id INTO v_role_id;

    -- 7. Handle duplicate / already-assigned case without modifying original attribution
    IF v_role_id IS NULL THEN
        SELECT id, assigned_by, assigned_at
        INTO v_role_id, v_existing_assigned_by, v_existing_assigned_at
        FROM public.user_roles
        WHERE profile_id = p_target_profile_id AND role = p_role;

        RETURN jsonb_build_object(
            'success', true,
            'already_assigned', true,
            'role_id', v_role_id,
            'profile_id', p_target_profile_id,
            'role', p_role,
            'assigned_by', v_existing_assigned_by,
            'assigned_at', v_existing_assigned_at
        );
    END IF;

    -- 8. Return structured JSON confirmation for new assignment
    RETURN jsonb_build_object(
        'success', true,
        'already_assigned', false,
        'role_id', v_role_id,
        'profile_id', p_target_profile_id,
        'role', p_role,
        'assigned_by', v_admin_profile_id,
        'assigned_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Least-Privilege Execution Grants
REVOKE ALL ON FUNCTION public.assign_user_role(UUID, public.user_role_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_user_role(UUID, public.user_role_type) TO authenticated;

COMMENT ON FUNCTION public.assign_user_role(UUID, public.user_role_type) IS
'Administrative procedure for assigning approved business roles (farmer, trader, processor, fpo_admin, transporter) to registered user profiles. Enforces public.is_admin(), prevents self-assignment and admin escalation, uses ON CONFLICT DO NOTHING to preserve original audit trail, and preserves KYC independence.';

COMMIT;
