-- ==============================================================================
-- AgriPrice: First Administrator Bootstrap Procedure (One-Time Execution)
-- Target Environment: Supabase SQL Editor (Executed exclusively by Project Owner)
-- Description: Unambiguously identifies the registered project owner account and
--              bootstraps the initial 'admin' entry into public.user_roles.
-- Safety & Security:
--   - Does NOT expose or require service-role keys in application code.
--   - Does NOT create public or unauthenticated admin signup endpoints.
--   - Unambiguously validates auth.users against public.profiles.
--   - Enforces email confirmation before admin role assignment.
--   - Idempotent: ON CONFLICT (profile_id, role) DO NOTHING.
--   - Re-verifies that public.is_admin() evaluates to TRUE.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- =========================================================================
    -- [REQUIRED ACTION BEFORE EXECUTION IN SUPABASE SQL EDITOR]
    -- Replace the placeholder email below with the exact registered email of
    -- the intended first administrator (must already exist in auth.users):
    -- =========================================================================
    c_target_admin_email CONSTANT TEXT := 'soheilshaik07@gmail.com'; -- <-- REPLACE BEFORE RUNNING

    v_auth_user_count INT;
    v_profile_count INT;
    v_auth_user_id UUID;
    v_email_confirmed TIMESTAMPTZ;
    v_profile_id UUID;
    v_profile_email TEXT;
    v_profile_name TEXT;
    v_existing_role_id UUID;
    v_is_admin_check BOOLEAN;
BEGIN
    RAISE NOTICE 'Starting AgriPrice First-Admin Bootstrap for: %', c_target_admin_email;

    -- Step 1: Verify target account exists in auth.users
    SELECT COUNT(*) INTO v_auth_user_count
    FROM auth.users
    WHERE lower(email) = lower(c_target_admin_email);

    IF v_auth_user_count = 0 THEN
        RAISE EXCEPTION 'Bootstrap Aborted: No registered account found in auth.users for email "%". Please register this user via Supabase Auth first.',
            c_target_admin_email
            USING ERRCODE = 'P0002';
    ELSIF v_auth_user_count > 1 THEN
        RAISE EXCEPTION 'Bootstrap Aborted: Ambiguous state - multiple auth.users records found for email "%". Manual database deduplication required.',
            c_target_admin_email
            USING ERRCODE = '23505';
    END IF;

    -- Step 2: Retrieve auth.users details and check email confirmation
    SELECT id, email_confirmed_at
    INTO v_auth_user_id, v_email_confirmed
    FROM auth.users
    WHERE lower(email) = lower(c_target_admin_email);

    IF v_email_confirmed IS NULL THEN
        RAISE EXCEPTION 'Bootstrap Aborted: The target user account (ID: %) has not confirmed their email address. For security, administrative roles cannot be granted to unverified email accounts.',
            v_auth_user_id
            USING ERRCODE = '28000';
    END IF;

    -- Step 3: Verify target account has completed profile registration in public.profiles
    SELECT COUNT(*) INTO v_profile_count
    FROM public.profiles
    WHERE auth_user_id = v_auth_user_id;

    IF v_profile_count = 0 THEN
        RAISE EXCEPTION 'Bootstrap Aborted: Target user exists in auth.users (ID: %) but has not completed their profile in public.profiles. The user must sign in and complete the profile form in AgriPrice before receiving an administrative role.',
            v_auth_user_id
            USING ERRCODE = 'P0002';
    ELSIF v_profile_count > 1 THEN
        RAISE EXCEPTION 'Bootstrap Aborted: Multiple public.profiles rows map to auth_user_id "%". Manual schema integrity resolution required.',
            v_auth_user_id
            USING ERRCODE = '23505';
    END IF;

    SELECT id, email, full_name
    INTO v_profile_id, v_profile_email, v_profile_name
    FROM public.profiles
    WHERE auth_user_id = v_auth_user_id;

    -- Step 4: Verify email alignment between auth.users and public.profiles
    IF v_profile_email IS NOT NULL AND lower(v_profile_email) != lower(c_target_admin_email) THEN
        RAISE EXCEPTION 'Bootstrap Aborted: Email mismatch detected between auth.users ("%") and public.profiles ("%"). Manual verification required.',
            c_target_admin_email, v_profile_email
            USING ERRCODE = '28000';
    END IF;

    RAISE NOTICE 'Target identity verified unambiguously: Profile ID = %, Name = "%", Auth ID = %',
        v_profile_id, v_profile_name, v_auth_user_id;

    -- Step 5: Assign initial 'admin' role in public.user_roles (idempotent)
    -- Note on audit attribution:
    -- The project-owner operator executing this direct SQL bootstrap in the Supabase
    -- SQL Editor acts as the database superuser/system owner ('postgres'), not as an
    -- application user profile. Setting assigned_by = NULL accurately reflects that this
    -- root administrative grant was created out-of-band via database console bootstrap,
    -- avoiding false self-attribution to the newly created administrator.
    INSERT INTO public.user_roles (
        profile_id,
        role,
        assigned_by,
        assigned_at
    ) VALUES (
        v_profile_id,
        'admin'::public.user_role_type,
        NULL, -- Out-of-band system/owner bootstrap (no application profile exists for DB operator)
        NOW()
    )
    ON CONFLICT (profile_id, role) DO NOTHING
    RETURNING id INTO v_existing_role_id;

    IF v_existing_role_id IS NOT NULL THEN
        RAISE NOTICE 'Created new initial administrator role assignment (Role Record ID: %).', v_existing_role_id;
    ELSE
        RAISE NOTICE 'Administrator role was already assigned to this profile. Existing audit record preserved.';
    END IF;

    -- Step 6: Verify public.is_admin() evaluates to TRUE for this user
    -- In the Supabase SQL Editor, the session runs as 'postgres' where auth.uid() is NULL.
    -- To test the actual public.is_admin() helper function for this target user without session pollution,
    -- simulate the target user's authenticated context locally within this transaction.
    -- Safety note: Because is_local = true is specified, PostgreSQL automatically discards these
    -- configuration settings on transaction ROLLBACK if an exception is raised, or via explicit reset below.
    PERFORM set_config('request.jwt.claim.sub', v_auth_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_is_admin_check := public.is_admin();

    -- Reset simulated context immediately after verification
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);

    IF NOT v_is_admin_check THEN
        RAISE EXCEPTION 'Bootstrap Verification Failed: public.is_admin() evaluated to FALSE for user ID % after role assignment.', v_auth_user_id
            USING ERRCODE = 'XX000';
    END IF;

    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'AgriPrice Administrator Bootstrap Completed Successfully!';
    RAISE NOTICE 'Admin Profile ID: %', v_profile_id;
    RAISE NOTICE 'Admin Email:      %', c_target_admin_email;
    RAISE NOTICE 'Target Full Name: %', v_profile_name;
    RAISE NOTICE 'Role Status:      Active in public.user_roles (role = admin)';
    RAISE NOTICE 'is_admin Check:   PASSED (Evaluated TRUE under authenticated user context)';
    RAISE NOTICE '====================================================================';
END;
$$;

COMMIT;
