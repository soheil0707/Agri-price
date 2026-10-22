/**
 * AgriPrice Secure Role Onboarding Client Module
 *
 * Implements client-side data access for administrative role assignments.
 * Strictly enforces:
 *  - Administrative authorization check before RPC invocation
 *  - Restriction to approved business roles (farmer, trader, processor, fpo_admin, transporter)
 *  - Absolute prohibition of 'admin' role assignment via client-facing functions
 *  - Strict UUID format validation
 *  - Clear separation of business roles from KYC / bank account verification
 */

import { createClient as createBrowserClient, isSupabaseConfigured } from './client.ts';
import type { UserRoleType } from './database.types.ts';

export const ASSIGNABLE_BUSINESS_ROLES: {
  role: UserRoleType;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    role: 'farmer',
    label: 'Farmer / Producer',
    icon: '👨‍🌾',
    description: 'Enables farmgate produce listing creation and harvest inventory management.',
  },
  {
    role: 'trader',
    label: 'Mandi Trader',
    icon: '🏢',
    description: 'Enables wholesale mandi bidding, lot aggregation, and regional arbitrage.',
  },
  {
    role: 'processor',
    label: 'Food Processor',
    icon: '🏭',
    description: 'Enables bulk factory procurement, contract lots, and quality specifications.',
  },
  {
    role: 'fpo_admin',
    label: 'FPO Administrator',
    icon: '👥',
    description: 'Enables cluster inventory aggregation and collective farmer batch listings.',
  },
  {
    role: 'transporter',
    label: 'Logistics Provider',
    icon: '🚚',
    description: 'Enables cold chain route dispatch, GPS milestone updates, and transport bids.',
  },
];

export interface AssignRoleResult {
  success: boolean;
  alreadyAssigned?: boolean;
  roleId?: string;
  profileId?: string;
  role?: string;
  assignedBy?: string;
  assignedAt?: string;
  error?: string | null;
}

export interface AdminApplicantProfile {
  id: string;
  authUserId: string;
  fullName: string;
  email: string | null;
  phoneNumber: string;
  state: string;
  district: string;
  pincode: string;
  kycVerified: boolean;
  bankAccountVerified: boolean;
  createdAt: string;
  assignedRoles: UserRoleType[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assigns an approved business role to a registered applicant profile.
 * Restricted to authenticated administrators by database RPC assign_user_role.
 */
export async function assignUserRole(
  targetProfileId: string,
  role: UserRoleType
): Promise<AssignRoleResult> {
  // 1. Client-side input validation
  const trimmedId = targetProfileId.trim();
  if (!UUID_REGEX.test(trimmedId)) {
    return {
      success: false,
      error: 'Invalid Profile ID: Must be a valid 36-character UUID string.',
    };
  }

  // 2. Strict Privilege Escalation Guard
  if (role === 'admin') {
    return {
      success: false,
      error: 'Security Policy Violation: The platform administrator role cannot be assigned through standard role onboarding. It requires direct project-owner manual bootstrap.',
    };
  }

  const isApprovedRole = ASSIGNABLE_BUSINESS_ROLES.some((r) => r.role === role);
  if (!isApprovedRole) {
    return {
      success: false,
      error: `Invalid Role: "${role}" is not an approved business role for onboarding.`,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase client is not configured. Role assignment requires an active database connection.',
    };
  }

  try {
    const supabase = createBrowserClient();

    // 3. Call the SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('assign_user_role', {
      p_target_profile_id: trimmedId,
      p_role: role,
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Database rejected the role assignment request.',
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'No response received from role assignment procedure.',
      };
    }

    const typedData = data as {
      success: boolean;
      already_assigned?: boolean;
      role_id?: string;
      profile_id?: string;
      role?: string;
      assigned_by?: string;
      assigned_at?: string;
    };

    return {
      success: Boolean(typedData.success),
      alreadyAssigned: Boolean(typedData.already_assigned),
      roleId: typedData.role_id,
      profileId: typedData.profile_id,
      role: typedData.role,
      assignedBy: typedData.assigned_by,
      assignedAt: typedData.assigned_at,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error during role assignment';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetches all registered user profiles and their assigned roles for the administrative onboarding panel.
 * Protected by Supabase RLS policy `profiles_select_authenticated` which enforces public.is_admin().
 */
export async function fetchProfilesForAdmin(): Promise<{
  profiles: AdminApplicantProfile[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { profiles: [], error: 'Supabase is not configured' };
  }

  try {
    const supabase = createBrowserClient();

    // 1. Fetch profiles accessible to administrator
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, auth_user_id, full_name, email, phone_number, state, district, pincode, kyc_verified, bank_account_verified, created_at')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return { profiles: [], error: profilesError.message };
    }

    if (!profilesData || profilesData.length === 0) {
      return { profiles: [], error: null };
    }

    // 2. Fetch associated roles from user_roles
    const profileIds = profilesData.map((p) => p.id);
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('profile_id, role')
      .in('profile_id', profileIds);

    if (rolesError) {
      console.warn('Could not fetch roles for admin applicant list:', rolesError.message);
    }

    const rolesByProfileId = new Map<string, UserRoleType[]>();
    if (rolesData) {
      for (const r of rolesData) {
        const existing = rolesByProfileId.get(r.profile_id) || [];
        existing.push(r.role as UserRoleType);
        rolesByProfileId.set(r.profile_id, existing);
      }
    }

    const applicants: AdminApplicantProfile[] = profilesData.map((p) => ({
      id: p.id,
      authUserId: p.auth_user_id,
      fullName: p.full_name,
      email: p.email,
      phoneNumber: p.phone_number,
      state: p.state,
      district: p.district,
      pincode: p.pincode,
      kycVerified: p.kyc_verified,
      bankAccountVerified: p.bank_account_verified,
      createdAt: p.created_at,
      assignedRoles: rolesByProfileId.get(p.id) || [],
    }));

    return { profiles: applicants, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query applicant profiles';
    return { profiles: [], error: message };
  }
}
