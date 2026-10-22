'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';
import type { UserPersonaRole } from '../../lib/marketplace/types';
import type { UserRoleType } from '../../lib/supabase/database.types';
import {
  ASSIGNABLE_BUSINESS_ROLES,
  fetchProfilesForAdmin,
  type AdminApplicantProfile,
  type AssignRoleResult,
} from '../../lib/supabase/roles';

// The 6 verified roles supported by docs/database-schema-proposal-v5.sql
const SCHEMA_ROLES: { role: UserRoleType; label: string; icon: string; description: string }[] = [
  {
    role: 'farmer',
    label: 'Farmer / Producer',
    icon: '👨‍🌾',
    description: 'Harvest producer with farmgate inventory listings and reservation management.',
  },
  {
    role: 'trader',
    label: 'Mandi Trader',
    icon: '🏢',
    description: 'Wholesale mandi aggregator submitting bids, offers, and regional procurement.',
  },
  {
    role: 'processor',
    label: 'Food Processor',
    icon: '🏭',
    description: 'Industrial food processing buyer procuring bulk produce via contract farming.',
  },
  {
    role: 'fpo_admin',
    label: 'FPO Administrator',
    icon: '👥',
    description: 'Farmer Producer Organization manager coordinating member collective batches.',
  },
  {
    role: 'transporter',
    label: 'Transporter / Logistics',
    icon: '🚚',
    description: 'Cold chain and transport fleet provider handling verified dispatch and transit.',
  },
  {
    role: 'admin',
    label: 'Platform Administrator',
    icon: '🛡️',
    description: 'System auditor managing role assignment, KYC certifications, and dispute escrow.',
  },
];

interface ProfileEditorFormProps {
  initialData: {
    fullName: string;
    phoneNumber: string;
    state: string;
    district: string;
    pincode: string;
    organization: string;
  };
  isExistingProfile: boolean;
  onSave: (data: {
    fullName: string;
    phoneNumber: string;
    state: string;
    district: string;
    pincode: string;
    organization?: string;
  }) => Promise<{ error: string | null }>;
  onCancel?: () => void;
  onSuccess: () => void;
}

function ProfileEditorForm({
  initialData,
  isExistingProfile,
  onSave,
  onCancel,
  onSuccess,
}: ProfileEditorFormProps) {
  const [formData, setFormData] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation matching PostgreSQL schema v5 constraints
    if (formData.fullName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }
    if (!/^\+?[0-9]{10,14}$/.test(formData.phoneNumber.trim())) {
      setFormError('Please enter a valid phone number (10 to 14 digits, optional + prefix).');
      return;
    }
    if (formData.state.trim().length < 2) {
      setFormError('State name is required (minimum 2 characters).');
      return;
    }
    if (formData.district.trim().length < 2) {
      setFormError('District name is required (minimum 2 characters).');
      return;
    }
    if (!/^[0-9]{6}$/.test(formData.pincode.trim())) {
      setFormError('Pincode must be exactly 6 numeric digits.');
      return;
    }

    setIsSaving(true);
    try {
      if (typeof onSave !== 'function') {
        setFormError('Profile save callback is not configured.');
        return;
      }
      const res = await onSave(formData);
      if (res.error) {
        setFormError(res.error);
      } else {
        onSuccess();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-6 p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-emerald-200 dark:border-emerald-800/80 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h3 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-50 flex items-center space-x-2">
            <span>📝</span>
            <span>{isExistingProfile ? 'Edit Profile Details' : 'Complete Your User Profile'}</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Save your verified contact and regional location to your authorized record in <code>public.profiles</code>.
          </p>
        </div>
        {onCancel && isExistingProfile && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1"
          >
            Cancel
          </button>
        )}
      </div>

      {formError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
          ⚠️ {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Full Legal Name *
            </label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="e.g. Ramesh Patel"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100 font-medium"
            />
            <span className="text-[10px] text-zinc-400 mt-0.5 block">Minimum 2 characters</span>
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Phone Number (WhatsApp Direct) *
            </label>
            <input
              type="tel"
              required
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              placeholder="+919876543210"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100 font-mono"
            />
            <span className="text-[10px] text-zinc-400 mt-0.5 block">10-14 digits, optional + prefix</span>
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              State *
            </label>
            <input
              type="text"
              required
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="e.g. Karnataka"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              District *
            </label>
            <input
              type="text"
              required
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              placeholder="e.g. Kolar"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Postal Pincode *
            </label>
            <input
              type="text"
              required
              maxLength={6}
              value={formData.pincode}
              onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
              placeholder="563101"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100 font-mono"
            />
            <span className="text-[10px] text-zinc-400 mt-0.5 block">Exactly 6 numeric digits</span>
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Registered Organization / Business Name
            </label>
            <input
              type="text"
              value={formData.organization}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              placeholder="e.g. Kolar Farmers Cooperative"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-[10px] text-zinc-400 mt-0.5 block">Stored with your user profile metadata</span>
          </div>
        </div>

        {/* Zero Privilege Escalation Guard Notice */}
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
          🛡️ <strong>Security Guard:</strong> Form submission only saves your contact and regional profile. In accordance with database schema rules, role grants and KYC verification status are strictly managed through authorized administrative channels and cannot be self-elevated.
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2">
          {onCancel && isExistingProfile && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/30 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving to Supabase...</span>
              </>
            ) : (
              <span>Save Profile to Supabase</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminRoleOnboardingPanel() {
  const { assignRole, refreshProfile } = useAuth();
  const { isPrivacyMasked, maskEmail, maskPhone } = useMarketplace();
  const [applicants, setApplicants] = useState<AdminApplicantProfile[]>([]);
  const [isLoadingApplicants, setIsLoadingApplicants] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [targetProfileId, setTargetProfileId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<UserRoleType>('farmer');
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [assignmentResult, setAssignmentResult] = useState<AssignRoleResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadApplicants = useCallback(async () => {
    setIsLoadingApplicants(true);
    setLoadError(null);
    try {
      const res = await fetchProfilesForAdmin();
      if (res.error) {
        setLoadError(res.error);
      } else {
        setApplicants(res.profiles);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Error fetching applicants');
    } finally {
      setIsLoadingApplicants(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await fetchProfilesForAdmin();
        if (isMounted) {
          if (res.error) {
            setLoadError(res.error);
          } else {
            setApplicants(res.profiles);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Error fetching applicants');
        }
      } finally {
        if (isMounted) {
          setIsLoadingApplicants(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAssign = async (profileIdToAssign: string, roleToAssign: UserRoleType) => {
    setIsAssigning(true);
    setActionError(null);
    setAssignmentResult(null);

    try {
      const res = await assignRole(profileIdToAssign, roleToAssign);
      if (!res.success) {
        setActionError(res.error || 'Failed to assign role.');
      } else {
        setAssignmentResult(res);
        await loadApplicants();
        await refreshProfile();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Role assignment procedure failed');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border-2 border-emerald-500/50 dark:border-emerald-500/40 p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h3 className="font-extrabold text-base text-zinc-900 dark:text-zinc-50 flex items-center space-x-2">
            <span>🛡️</span>
            <span>Platform Administrator: Secure Role Onboarding</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Assign business roles to applicant profiles via <code>public.assign_user_role</code> RPC.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
            Admin Verified
          </span>
          <button
            type="button"
            onClick={loadApplicants}
            disabled={isLoadingApplicants}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            {isLoadingApplicants ? 'Refreshing...' : '↻ Refresh Applicants'}
          </button>
        </div>
      </div>

      {/* Security Constraints Notice */}
      <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 text-xs space-y-1">
        <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
          <span>🔒</span>
          <span>Zero-Trust Security & Database Guardrails</span>
        </div>
        <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-4">
          <li>
            <strong>Restricted to Approved Business Roles:</strong> Only <code>farmer</code>, <code>trader</code>, <code>processor</code>, <code>fpo_admin</code>, or <code>transporter</code> can be granted.
          </li>
          <li>
            <strong>Admin Privilege Escalation Guard:</strong> The <code>admin</code> role cannot be granted through this RPC or UI.
          </li>
          <li>
            <strong>Idempotent Conflict Handling:</strong> Duplicate role assignments use <code>ON CONFLICT DO NOTHING</code>, preserving original assignment timestamps.
          </li>
          <li>
            <strong>KYC Separation:</strong> Business role assignment does not alter <code>kyc_verified</code> or <code>bank_account_verified</code>.
          </li>
        </ul>
      </div>

      {/* Manual / Direct Profile UUID Assignment Form */}
      <div className="p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
        <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
          Assign Role to Applicant Profile
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-6 space-y-1">
            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              Target Profile ID (UUID) *
            </label>
            <input
              type="text"
              value={targetProfileId}
              onChange={(e) => setTargetProfileId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              Role to Grant *
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRoleType)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              {ASSIGNABLE_BUSINESS_ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.icon} {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <button
              type="button"
              disabled={isAssigning || !targetProfileId.trim()}
              onClick={() => handleAssign(targetProfileId.trim(), selectedRole)}
              className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-xs"
            >
              {isAssigning ? 'Executing RPC...' : 'Assign Role'}
            </button>
          </div>
        </div>

        {assignmentResult && (
          <div className={`p-3 rounded-xl text-xs ${
            assignmentResult.alreadyAssigned
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
          }`}>
            <div className="font-bold flex items-center space-x-1.5">
              <span>{assignmentResult.alreadyAssigned ? 'ℹ️' : '✓'}</span>
              <span>
                {assignmentResult.alreadyAssigned
                  ? `Role "${assignmentResult.role}" is already assigned to this profile.`
                  : `Successfully assigned role "${assignmentResult.role}".`}
              </span>
            </div>
            <div className="font-mono text-[10px] mt-1 space-y-0.5">
              <div>Profile ID: {assignmentResult.profileId}</div>
              <div>Role Record ID: {assignmentResult.roleId}</div>
              {assignmentResult.alreadyAssigned && (
                <div>Note: ON CONFLICT DO NOTHING preserved the existing assignment record.</div>
              )}
            </div>
          </div>
        )}

        {actionError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs">
            <strong>❌ Error:</strong> {actionError}
          </div>
        )}
      </div>

      {/* Registered Applicant Profiles Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            Registered Applicant Accounts ({applicants.length})
          </h4>
          {loadError && (
            <span className="text-xs text-rose-600 dark:text-rose-400">
              {loadError}
            </span>
          )}
        </div>

        {applicants.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            {isLoadingApplicants ? 'Loading applicant accounts...' : 'No registered applicant profiles found in public.profiles.'}
          </div>
        ) : (
          <div className="space-y-2">
            {applicants.map((applicant) => (
              <div
                key={applicant.id}
                className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {applicant.fullName}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {applicant.id}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-x-2">
                    <span>{applicant.email ? (isPrivacyMasked ? maskEmail(applicant.email) : applicant.email) : 'No email'}</span>
                    <span>•</span>
                    <span className="font-mono">{isPrivacyMasked ? maskPhone(applicant.phoneNumber) : applicant.phoneNumber}</span>
                    <span>•</span>
                    <span>{applicant.district}, {applicant.state}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] font-semibold text-zinc-400">Roles:</span>
                    {applicant.assignedRoles.length === 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        None
                      </span>
                    ) : (
                      applicant.assignedRoles.map((r) => (
                        <span
                          key={r}
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                        >
                          {r}
                        </span>
                      ))
                    )}
                    <span className="text-[10px] text-zinc-400 ml-2">KYC:</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      applicant.kycVerified
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {applicant.kycVerified ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetProfileId(applicant.id);
                      setSelectedRole('farmer');
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    Select ID
                  </button>
                  {!applicant.assignedRoles.includes('farmer') ? (
                    <button
                      type="button"
                      disabled={isAssigning}
                      onClick={() => handleAssign(applicant.id, 'farmer')}
                      className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                    >
                      Grant Farmer Role
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-1">
                      ✓ Farmer Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ProfileViewProps {
  onSave?: (data: {
    fullName: string;
    phoneNumber: string;
    state: string;
    district: string;
    pincode: string;
    organization?: string;
  }) => Promise<{ error: string | null }>;
}

export function ProfileView({ onSave }: ProfileViewProps = {}) {
  const {
    currentPersona,
    activeRole,
    setPersonaRole,
    availablePersonas,
    isPrivacyMasked,
    maskEmail,
    maskPhone,
  } = useMarketplace();
  const { user, profile, roles, isProfileComplete, saveProfile: authSaveProfile } = useAuth();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Wire save callback: prioritize passed prop if supplied, otherwise use AuthContext saveProfile
  const handleProfileSave = onSave || authSaveProfile;

  const initialFormData = {
    fullName: profile?.full_name || (user?.user_metadata?.full_name as string) || '',
    phoneNumber: profile?.phone_number || (user?.user_metadata?.phone_number as string) || '',
    state: profile?.state || (user?.user_metadata?.state as string) || '',
    district: profile?.district || (user?.user_metadata?.district as string) || '',
    pincode: profile?.pincode || (user?.user_metadata?.pincode as string) || '',
    organization: (user?.user_metadata?.organization as string) || '',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Brand Header Banner */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="bg-white p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 shadow-2xs inline-flex items-center justify-center shrink-0">
            <Image
              src="/agriprice-logo.png"
              alt="AgriPrice — From Produce to Profit"
              width={160}
              height={44}
              className="h-10 w-auto max-w-[155px] object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
              AgriPrice Profile &amp; Role Verification
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              From Produce to Profit • Zero-Trust Role &amp; KYC Compliance Directory
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
          PostgreSQL RLS Protected
        </span>
      </div>

      {/* Simulation Banner when exploring Demo Personas */}
      {currentPersona.isDemoPersona && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">🎭</span>
            <div>
              <span className="font-bold text-amber-900 dark:text-amber-200">
                Demo Simulation Mode Active:
              </span>
              <span className="text-amber-800 dark:text-amber-300 ml-1.5">
                Currently exploring as simulated persona <strong>{currentPersona.name}</strong> ({currentPersona.roleLabel}).
              </span>
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => setPersonaRole('authenticated')}
              className="inline-flex items-center px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>👤 Switch to My Real Account</span>
            </button>
          )}
        </div>
      )}

      {/* Profile Header Card */}
      <div className={`rounded-3xl border p-6 sm:p-8 shadow-xs ${
        currentPersona.isDemoPersona
          ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-4xl shadow-inner">
              {currentPersona.avatarEmoji}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
                  {currentPersona.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  currentPersona.isDemoPersona
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : profile
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}>
                  {currentPersona.isDemoPersona
                    ? 'SIMULATION PERSONA'
                    : profile
                    ? '✓ Profile Complete (Database Verified)'
                    : '⚠️ Profile Incomplete (Action Required)'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {currentPersona.roleLabel} • {currentPersona.organization}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold ${
                currentPersona.isDemoPersona
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/60'
                  : currentPersona.kycStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {currentPersona.isDemoPersona
                ? '● Demo Persona (Unverified Mock Profile)'
                : currentPersona.kycStatus === 'verified'
                ? '✓ KYC Verified'
                : '● KYC Pending Admin Verification'}
            </span>
          </div>
        </div>

        {/* Real Authenticated Session Info */}
        {user ? (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">Supabase Authenticated Email:</span>
                  <span className="text-zinc-800 dark:text-zinc-200 font-mono font-bold">
                    {isPrivacyMasked ? maskEmail(user.email) : user.email}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Profile Completion Status:</span>
                  <span className={`font-semibold ${
                    isProfileComplete && profile
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {isProfileComplete && profile
                      ? 'Complete (Persisted in public.profiles)'
                      : 'Incomplete (Registration required to save profile)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className={`font-mono text-[11px] px-2 py-0.5 rounded font-semibold ${
                  roles.length > 0
                    ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
                    : 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100'
                }`}>
                  Database Roles: {roles.length > 0 ? roles.join(', ') : 'No roles assigned (roles = [])'}
                </span>
                {profile && !isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setFormSuccess(null);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    ✏️ Edit Profile
                  </button>
                )}
              </div>
            </div>

            {roles.length === 0 && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                ℹ️ <strong>Role Assignment Notice:</strong> Your authenticated user account has no assigned database roles. Under PostgreSQL RLS policies in schema v5, roles like <code>farmer</code> or <code>trader</code> are managed via <code>user_roles</code> and assigned by authorized administrators.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
            ℹ️ You are viewing the interface as an unauthenticated visitor exploring simulated demo personas. Sign in with Supabase Auth to view and edit your real database account.
          </div>
        )}

        {formSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
            <span>✓ {formSuccess}</span>
            <button
              type="button"
              onClick={() => setFormSuccess(null)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* Profile Completion / Edit Form for Authenticated Users */}
        {user && (isEditing || !profile) ? (
          <ProfileEditorForm
            key={profile ? `${profile.id}-${profile.updated_at}` : 'new-profile'}
            initialData={initialFormData}
            isExistingProfile={Boolean(profile)}
            onSave={handleProfileSave}
            onCancel={() => setIsEditing(false)}
            onSuccess={() => {
              setFormSuccess('Profile successfully saved and reloaded from Supabase database.');
              setIsEditing(false);
            }}
          />
        ) : null}

        {/* Profile Details Grid (Display View) */}
        {(!user || (!isEditing && profile)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 text-xs">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1">
              <span className="text-zinc-400 block font-medium">Registered Business / Organization</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block">
                {currentPersona.organization}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1">
              <span className="text-zinc-400 block font-medium">Regional Location</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block">
                {currentPersona.district}, {currentPersona.state}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1">
              <span className="text-zinc-400 block font-medium">Phone & WhatsApp Direct</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono block">
                {!currentPersona.isDemoPersona && isPrivacyMasked
                  ? maskPhone(currentPersona.phone)
                  : currentPersona.phone}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1">
              <span className="text-zinc-400 block font-medium">Electronic Mail</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono block">
                {!currentPersona.isDemoPersona && isPrivacyMasked
                  ? maskEmail(currentPersona.email)
                  : currentPersona.email}
              </span>
            </div>
          </div>
        )}

        {/* KYC Compliance Policy Guard Notice */}
        <div className="mt-6 p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-bold flex items-center space-x-1.5">
            <span>🛡️</span>
            <span>Zero-Trust Verification Policy (Database Trigger Enforcement)</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
            In accordance with database schema trigger <code>trg_protect_profile_fields</code>, KYC verification and bank account verification cannot be self-assigned or client-updated. Verification marks are granted exclusively by authorized compliance auditors after physical Aadhaar/PAN and APMC license verification.
          </p>
        </div>
      </div>

      {/* Database Roles Supported by Installed Schema v5 */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>🏷️</span>
              <span>Supported Database Schema Roles (v5 Multi-Role RBAC)</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Verified roles defined in PostgreSQL enum <code>user_role_type</code> and stored in <code>public.user_roles</code>.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold self-start sm:self-auto">
            Schema Enum: 6 Roles
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCHEMA_ROLES.map(({ role, label, icon, description }) => {
            const isAssigned = roles.includes(role);

            return (
              <div
                key={role}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isAssigned
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-1 ring-emerald-500/50'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">{icon}</span>
                    <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                      {label}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                    isAssigned
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {isAssigned ? 'Assigned' : 'Unassigned'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mb-1">
                  enum: &apos;{role}&apos;
                </div>
                <div className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                  {description}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/40 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-800 dark:text-zinc-200">
            Role Assignment Security Model:
          </div>
          <p className="text-[11px] leading-relaxed">
            Per PostgreSQL RLS policy <code>user_roles_admin_mutation</code>, row insertion into <code>public.user_roles</code> requires administrative authority (<code>is_admin() = TRUE</code>). Users cannot self-grant roles through any client form.
          </p>
        </div>
      </div>

      {/* Admin-Only Secure Role Onboarding Panel */}
      {roles.includes('admin') && <AdminRoleOnboardingPanel />}

      {/* Presentation Persona Switcher */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs space-y-4">
        <div>
          <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>🎭</span>
            <span>Interactive Demo Personas (Simulation Sandbox)</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Switch between different agricultural supply chain perspectives to test workflows. These are simulated in-memory personas and do not grant or modify authenticated database roles.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {user && (
            <button
              type="button"
              onClick={() => setPersonaRole('authenticated')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                activeRole === 'authenticated'
                  ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-xs ring-1 ring-emerald-500'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-xl">👤</span>
                <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                  My Real Account
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                {profile ? 'Database Profile Complete' : 'Profile Incomplete'}
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 truncate font-mono">
                {isPrivacyMasked ? maskEmail(user.email) : user.email}
              </div>
            </button>
          )}

          {Object.entries(availablePersonas).map(([roleKey, persona]) => {
            const isSelected = activeRole === roleKey;

            return (
              <button
                key={roleKey}
                type="button"
                onClick={() => setPersonaRole(roleKey as UserPersonaRole)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-xs ring-1 ring-emerald-500'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xl">{persona.avatarEmoji}</span>
                  <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                    {persona.name}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                  {persona.roleLabel}
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                  {persona.organization}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
