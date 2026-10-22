/**
 * AgriPrice Phase 4: Persistent Order Disputes & Arbitration Ledger
 *
 * Implements audited dispute creation, participant inspection, and administrative
 * arbitration against Supabase table `public.order_disputes` and stored procedures.
 *
 * Security & Double-Entry Integrity:
 * - Participant Isolation: Visible only to claimant, respondent, assigned transporter, and admin.
 * - Atomic Escrow Freeze: Raising a dispute transitions order status to 'disputed',
 *   preventing concurrent progress or unauthorized fund release.
 * - Administrator Arbitration: Only accounts with verified 'admin' role can resolve disputes.
 * - Escrow Separation: Resolving a dispute does NOT directly disburse funds;
 *   fiat settlement must occur via the audited double-entry payment ledger.
 * - Privacy Masking: Projections never leak private farm GPS coordinates or street addresses.
 */

import { createClient, isSupabaseConfigured } from './client.ts';

export type DisputeStatus =
  | 'under_review'
  | 'resolved_seller_paid'
  | 'resolved_buyer_refunded'
  | 'resolved_mutual_split'
  | 'dismissed';

export interface MarketplaceDisputeRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  claimantProfileId: string;
  claimantName: string;
  claimantRole: string;
  respondentProfileId: string;
  respondentName: string;
  commodity: string;
  quantityKg: number;
  escrowLockedAmount: number;
  disputeReason: string;
  evidenceSummary: string;
  evidenceMetadata?: Record<string, unknown>;
  status: DisputeStatus;
  resolutionNotes?: string;
  arbitratedByProfileId?: string;
  filedAt: string;
  resolvedAt?: string | null;
  createdAt: string;
  isLiveDatabaseRecord: boolean;
}

export interface RaiseDisputeParams {
  orderId: string;
  disputeReason: string;
  evidenceSummary: string;
  evidenceMetadata?: Record<string, unknown>;
}

export interface ResolveDisputeParams {
  disputeId: string;
  resolutionStatus: 'resolved_seller_paid' | 'resolved_buyer_refunded' | 'resolved_mutual_split' | 'dismissed';
  resolutionNotes: string;
}

export interface DisputeActionResult {
  success: boolean;
  disputeId?: string;
  message: string;
  error?: string;
  isSavedToDatabase: boolean;
}

interface DynamicDatabaseClient {
  from(table: string): {
    select(columns?: string): {
      order(column: string, options?: { ascending?: boolean }): Promise<{
        data: Record<string, unknown>[] | null;
        error: { code?: string; message: string } | null;
      }>;
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): Promise<{
          data: Record<string, unknown>[] | null;
          error: { code?: string; message: string } | null;
        }>;
        single(): Promise<{
          data: Record<string, unknown> | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
  rpc(fn: string, params: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

/**
 * Checks if an order's current escrow status makes it eligible for filing a dispute.
 * Settled, cancelled, or already disputed orders cannot have a new dispute raised.
 */
export function isEligibleDisputeOrder(escrowStatus: string): boolean {
  if (!escrowStatus) return false;
  const eligible = ['awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected'];
  return eligible.includes(escrowStatus.toLowerCase());
}

/**
 * Validates if the caller holds the authorized 'admin' role required to arbitrate disputes.
 */
export function isAuthorizedDisputeResolver(roles: string[]): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => r.toLowerCase() === 'admin');
}

/**
 * Validates whether a caller is an authorized participant (buyer, seller, or admin) on an order.
 */
export function isAuthorizedOrderParticipant(
  callerProfileId: string,
  buyerProfileId: string,
  sellerProfileId: string,
  callerRoles: string[],
  transporterProfileId?: string
): boolean {
  if (!callerProfileId) return false;
  if (
    callerProfileId === buyerProfileId ||
    callerProfileId === sellerProfileId ||
    (transporterProfileId && callerProfileId === transporterProfileId)
  ) {
    return true;
  }
  return isAuthorizedDisputeResolver(callerRoles);
}

/**
 * Fetches disputes visible to the authenticated user under RLS.
 */
export async function fetchOrderDisputes(
  callerProfileId: string,
  callerRoles: string[]
): Promise<{
  disputes: MarketplaceDisputeRecord[];
  error: string | null;
  isSchemaInstalled: boolean;
}> {
  if (!callerProfileId) {
    return {
      disputes: [],
      error: 'Authentication required to inspect disputes.',
      isSchemaInstalled: false,
    };
  }

  void callerRoles;

  if (!isSupabaseConfigured()) {
    return {
      disputes: [],
      error: 'Supabase credentials are not configured.',
      isSchemaInstalled: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;
    const { data: disputesData, error: disputesErr } = await supabase
      .from('order_disputes')
      .select('*')
      .order('filed_at', { ascending: false });

    if (disputesErr) {
      const isMissingTable = disputesErr.code === 'PGRST205' || disputesErr.message.includes('schema cache');
      return {
        disputes: [],
        error: isMissingTable
          ? 'Table public.order_disputes is not yet installed in the live database. (See docs/hotfix-phase4-notifications-disputes.sql).'
          : disputesErr.message,
        isSchemaInstalled: !isMissingTable,
      };
    }

    if (!disputesData || disputesData.length === 0) {
      return {
        disputes: [],
        error: null,
        isSchemaInstalled: true,
      };
    }

    // Map into MarketplaceDisputeRecord with privacy guarantees
    const mapped: MarketplaceDisputeRecord[] = disputesData.map((d) => ({
      id: String(d.id),
      orderId: String(d.order_id),
      orderNumber: `AGP-ORD-${String(d.order_id).slice(0, 8).toUpperCase()}`,
      claimantProfileId: String(d.claimant_profile_id),
      claimantName: 'Authenticated Claimant',
      claimantRole: 'Order Participant',
      respondentProfileId: String(d.respondent_profile_id),
      respondentName: 'Counterparty',
      commodity: 'Agricultural Produce',
      quantityKg: 0,
      escrowLockedAmount: 0,
      disputeReason: String(d.dispute_reason),
      evidenceSummary: String(d.evidence_summary),
      evidenceMetadata: (d.evidence_metadata as Record<string, unknown>) || {},
      status: (d.status as DisputeStatus) || 'under_review',
      resolutionNotes: d.resolution_notes ? String(d.resolution_notes) : undefined,
      arbitratedByProfileId: d.arbitrated_by_profile_id ? String(d.arbitrated_by_profile_id) : undefined,
      filedAt: String(d.filed_at),
      resolvedAt: d.resolved_at ? String(d.resolved_at) : null,
      createdAt: String(d.created_at),
      isLiveDatabaseRecord: true,
    }));

    return {
      disputes: mapped,
      error: null,
      isSchemaInstalled: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query disputes.';
    return {
      disputes: [],
      error: msg,
      isSchemaInstalled: false,
    };
  }
}

/**
 * Files a dispute on an active order. Atomically transitions order status to 'disputed'.
 */
export async function raiseOrderDispute(
  params: RaiseDisputeParams,
  callerProfileId: string,
  callerRoles: string[] = []
): Promise<DisputeActionResult> {
  if (!callerProfileId) {
    return {
      success: false,
      message: 'Authentication required to raise a dispute.',
      error: 'Caller profile ID is missing.',
      isSavedToDatabase: false,
    };
  }

  void callerRoles;

  // Validation
  if (!params.orderId) {
    return {
      success: false,
      message: 'A valid Order reference is required to file a dispute.',
      error: 'Order ID missing.',
      isSavedToDatabase: false,
    };
  }

  if (!params.disputeReason || params.disputeReason.trim().length < 10) {
    return {
      success: false,
      message: 'Dispute reason must be a detailed description of at least 10 characters.',
      error: 'Dispute reason too short.',
      isSavedToDatabase: false,
    };
  }

  if (!params.evidenceSummary || params.evidenceSummary.trim().length < 10) {
    return {
      success: false,
      message: 'Evidence summary must specify inspection reports, weighbridge slips, or lab certificates (min 10 chars).',
      error: 'Evidence summary too short.',
      isSavedToDatabase: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase credentials are not configured.',
      error: 'Supabase credentials are not configured.',
      isSavedToDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;

    // Call atomic stored procedure if available in PostgreSQL
    const { data, error } = await supabase.rpc('raise_order_dispute', {
      p_order_id: params.orderId,
      p_dispute_reason: params.disputeReason.trim(),
      p_evidence_summary: params.evidenceSummary.trim(),
      p_evidence_metadata: params.evidenceMetadata || {},
    });

    if (error) {
      const isMissingProcedure = error.code === 'PGRST202' || error.message.includes('schema cache');
      if (isMissingProcedure) {
        return {
          success: false,
          message: 'Database Schema Notice: Procedure raise_order_dispute is pending manual administrator review in docs/hotfix-phase4-notifications-disputes.sql.',
          error: error.message,
          isSavedToDatabase: false,
        };
      }
      return {
        success: false,
        message: error.message,
        error: error.message,
        isSavedToDatabase: false,
      };
    }

    return {
      success: true,
      disputeId: data as string,
      message: `Dispute filed successfully under ID ${data}. Order escrow state is frozen for administrative arbitration.`,
      isSavedToDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dispute transaction failed.';
    return {
      success: false,
      message: msg,
      error: msg,
      isSavedToDatabase: false,
    };
  }
}

/**
 * Arbitrates and resolves an open dispute. Restricted strictly to platform administrators.
 */
export async function resolveOrderDispute(
  params: ResolveDisputeParams,
  callerProfileId: string,
  callerRoles: string[]
): Promise<DisputeActionResult> {
  // Strict Role Authorization: Only Admin
  if (!isAuthorizedDisputeResolver(callerRoles)) {
    return {
      success: false,
      message: 'Authorization Violation: Only platform administrators are authorized to arbitrate and resolve disputes.',
      error: 'Unauthorized dispute resolution attempt.',
      isSavedToDatabase: false,
    };
  }

  if (!params.disputeId) {
    return {
      success: false,
      message: 'Dispute ID is required.',
      error: 'Dispute ID missing.',
      isSavedToDatabase: false,
    };
  }

  if (!params.resolutionNotes || params.resolutionNotes.trim().length < 10) {
    return {
      success: false,
      message: 'Arbitration determination requires documented findings and notes (min 10 characters).',
      error: 'Resolution notes too short.',
      isSavedToDatabase: false,
    };
  }

  void callerProfileId;

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase credentials are not configured.',
      error: 'Supabase credentials are not configured.',
      isSavedToDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;

    const { error } = await supabase.rpc('resolve_order_dispute', {
      p_dispute_id: params.disputeId,
      p_resolution_status: params.resolutionStatus,
      p_resolution_notes: params.resolutionNotes.trim(),
    });

    if (error) {
      const isMissingProcedure = error.code === 'PGRST202' || error.message.includes('schema cache');
      if (isMissingProcedure) {
        return {
          success: false,
          message: 'Database Schema Notice: Procedure resolve_order_dispute is pending manual administrator review in docs/hotfix-phase4-notifications-disputes.sql.',
          error: error.message,
          isSavedToDatabase: false,
        };
      }
      return {
        success: false,
        message: error.message,
        error: error.message,
        isSavedToDatabase: false,
      };
    }

    return {
      success: true,
      message: `Dispute arbitrated as "${params.resolutionStatus}". Findings recorded in immutable audit log.`,
      isSavedToDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dispute arbitration failed.';
    return {
      success: false,
      message: msg,
      error: msg,
      isSavedToDatabase: false,
    };
  }
}
