'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient as createBrowserClient, isSupabaseConfigured } from '../lib/supabase/client';
import type { Database, UserRoleType } from '../lib/supabase/database.types';
import { assignUserRole, type AssignRoleResult } from '../lib/supabase/roles';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  state: string;
  district: string;
  pincode: string;
  organization?: string;
  requestedRole?: string;
}

export interface ProfileFormData {
  fullName: string;
  phoneNumber: string;
  state: string;
  district: string;
  pincode: string;
  organization?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  roles: UserRoleType[];
  isProfileComplete: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null; requiresEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (data: ProfileFormData) => Promise<{ error: string | null }>;
  assignRole: (targetProfileId: string, role: UserRoleType) => Promise<AssignRoleResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRoleType[]>([]);
  const isConfigured = isSupabaseConfigured();
  const [isLoading, setIsLoading] = useState<boolean>(() => isConfigured);

  // Memoize the supabase client so it's not recreated on every render
  const supabase = useMemo(() => {
    if (!isConfigured) return null;
    try {
      return createBrowserClient();
    } catch {
      return null;
    }
  }, [isConfigured]);

  const loadUserProfile = useCallback(async (authUserId: string) => {
    if (!supabase) return;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading profile:', profileError.message);
        setProfile(null);
        setRoles([]);
        return;
      }

      if (profileData) {
        setProfile(profileData);

        // Fetch verified user roles directly from database (never trust client)
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('profile_id', profileData.id);

        if (rolesError) {
          console.error('Error loading roles:', rolesError.message);
          setRoles([]);
        } else if (rolesData) {
          setRoles(rolesData.map((r) => r.role));
        }
      } else {
        setProfile(null);
        setRoles([]);
      }
    } catch (err) {
      console.error('Failed to resolve user profile:', err);
      setProfile(null);
      setRoles([]);
    }
  }, [supabase]);

  // Initial session check and auth listener
  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    async function initializeAuth() {
      try {
        const { data: { user: currentUser } } = await supabase!.auth.getUser();
        if (isMounted) {
          setUser(currentUser);
          if (currentUser) {
            await loadUserProfile(currentUser.id);
          }
        }
      } catch (err) {
        console.error('Error fetching initial user:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const authUser = session?.user ?? null;
        setUser(authUser);
        if (authUser) {
          await loadUserProfile(authUser.id);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadUserProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        return { error: 'Supabase credentials are not configured.' };
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { error: error.message };
        }

        if (data.user) {
          await loadUserProfile(data.user.id);
        }

        return { error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sign in failed.';
        return { error: message };
      }
    },
    [supabase, loadUserProfile]
  );

  const signUp = useCallback(
    async (params: SignUpParams) => {
      if (!supabase) {
        return { error: 'Supabase credentials are not configured.' };
      }

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: params.email.trim(),
          password: params.password,
          options: {
            data: {
              full_name: params.fullName.trim(),
              phone_number: params.phoneNumber.trim(),
              state: params.state.trim(),
              district: params.district.trim(),
              pincode: params.pincode.trim(),
              organization: params.organization ? params.organization.trim() : '',
              requested_role: params.requestedRole ? params.requestedRole.trim() : 'farmer',
            },
          },
        });

        if (authError) {
          return { error: authError.message };
        }

        if (!authData.user) {
          return { error: 'Registration failed: user object was not created.' };
        }

        // If session is immediately active, insert the initial unverified profile
        if (authData.session) {
          const { error: profileError } = await supabase.from('profiles').insert({
            auth_user_id: authData.user.id,
            full_name: params.fullName.trim(),
            phone_number: params.phoneNumber.trim(),
            email: params.email.trim(),
            state: params.state.trim(),
            district: params.district.trim(),
            pincode: params.pincode.trim(),
            kyc_verified: false,
            bank_account_verified: false,
          });

          if (profileError) {
            return { error: `Profile creation error: ${profileError.message}` };
          }

          await loadUserProfile(authData.user.id);
          return { error: null, requiresEmailConfirmation: false };
        }

        // Email confirmation is required by Supabase project settings
        return { error: null, requiresEmailConfirmation: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed.';
        return { error: message };
      }
    },
    [supabase, loadUserProfile]
  );

  const isProfileComplete = useMemo(() => {
    if (!profile) return false;
    return Boolean(
      profile.full_name &&
      profile.full_name.trim().length >= 2 &&
      profile.phone_number &&
      profile.state &&
      profile.district &&
      profile.pincode
    );
  }, [profile]);

  const saveProfile = useCallback(
    async (data: ProfileFormData): Promise<{ error: string | null }> => {
    if (!supabase) {
      return { error: 'Supabase credentials are not configured.' };
    }
    if (!user) {
      return { error: 'User must be authenticated to save a profile.' };
    }

    const trimmedName = data.fullName.trim();
    if (trimmedName.length < 2) {
      return { error: 'Full name must be at least 2 characters.' };
    }

    const trimmedPhone = data.phoneNumber.trim();
    if (!/^\+?[0-9]{10,14}$/.test(trimmedPhone)) {
      return { error: 'Phone number must be between 10 and 14 digits (with optional + prefix).' };
    }

    const trimmedState = data.state.trim();
    if (trimmedState.length < 2) {
      return { error: 'State name must be at least 2 characters.' };
    }

    const trimmedDistrict = data.district.trim();
    if (trimmedDistrict.length < 2) {
      return { error: 'District name must be at least 2 characters.' };
    }

    const trimmedPincode = data.pincode.trim();
    if (!/^[0-9]{6}$/.test(trimmedPincode)) {
      return { error: 'Pincode must be exactly 6 digits.' };
    }

    try {
      // 1. Check if user already has an existing profile record
      const { data: existingProfile, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, auth_user_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (fetchErr) {
        return { error: `Failed to inspect profile: ${fetchErr.message}` };
      }

      if (existingProfile) {
        // Safe UPDATE: Only update user-authorized fields.
        // Never pass kyc_verified, bank_account_verified, id, or auth_user_id.
        // This strictly complies with RLS profiles_update_self and trg_protect_profile_fields.
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: trimmedName,
            phone_number: trimmedPhone,
            email: user.email || null,
            state: trimmedState,
            district: trimmedDistrict,
            pincode: trimmedPincode,
          })
          .eq('auth_user_id', user.id);

        if (updateError) {
          return { error: `Failed to update profile: ${updateError.message}` };
        }
      } else {
        // Safe INSERT: Create initial profile record.
        // RLS profiles_insert_self checks auth.uid() = auth_user_id.
        // Trigger trg_protect_profile_fields strictly requires kyc_verified and bank_account_verified to be false.
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            auth_user_id: user.id,
            full_name: trimmedName,
            phone_number: trimmedPhone,
            email: user.email || null,
            state: trimmedState,
            district: trimmedDistrict,
            pincode: trimmedPincode,
            kyc_verified: false,
            bank_account_verified: false,
          });

        if (insertError) {
          return { error: `Failed to create profile: ${insertError.message}` };
        }
      }

      // 2. Persist organization and user details in Supabase auth user_metadata
      if (data.organization !== undefined) {
        const { data: updatedUserData, error: metaError } = await supabase.auth.updateUser({
          data: {
            organization: data.organization.trim(),
            full_name: trimmedName,
            phone_number: trimmedPhone,
            state: trimmedState,
            district: trimmedDistrict,
            pincode: trimmedPincode,
          },
        });
        if (metaError) {
          console.warn('Metadata update warning:', metaError.message);
        } else if (updatedUserData?.user) {
          setUser(updatedUserData.user);
        }
      }

      // 3. Reload profile from database
      await loadUserProfile(user.id);
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile.';
      return { error: msg };
    }
  }, [supabase, user, loadUserProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during sign out:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setRoles([]);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadUserProfile(user.id);
    }
  }, [user, loadUserProfile]);

  const assignRole = useCallback(
    async (targetProfileId: string, role: UserRoleType): Promise<AssignRoleResult> => {
      const result = await assignUserRole(targetProfileId, role);
      // If assignment was successful and affects current user's profile, refresh in real time
      if (result.success && profile && targetProfileId === profile.id && user) {
        await loadUserProfile(user.id);
      }
      return result;
    },
    [profile, user, loadUserProfile]
  );

  const value = useMemo(
    () => ({
      user,
      profile,
      roles,
      isProfileComplete,
      isLoading,
      isConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      saveProfile,
      assignRole,
    }),
    [
      user,
      profile,
      roles,
      isProfileComplete,
      isLoading,
      isConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      saveProfile,
      assignRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
