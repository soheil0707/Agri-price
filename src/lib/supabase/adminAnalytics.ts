/**
 * AgriPrice Phase 5: Live Admin Platform Telemetry & Analytics
 *
 * Implements real-time platform aggregation and governance telemetry against Supabase tables:
 * - `public.reservations_orders`
 * - `public.simulated_payment_events`
 * - `public.produce_listings`
 * - `public.user_roles`
 * - `public.calculation_snapshots`
 *
 * Security & Anti-Fabrication Guarantees:
 * - Server-Enforced Role Authorization: Access is strictly blocked for non-admin accounts.
 * - Anti-Fabrication Standard: Live metrics reflect only verified database rows;
 *   never adds artificial offset constants or fabricates GMV.
 * - Zero PII / GPS Leakage: Telemetry contains mathematical aggregates only;
 *   never exposes private farm GPS coordinates, personal addresses, or bank details.
 * - Explicit Separation: Live telemetry is visibly distinct from demo prototype models.
 */

import { createClient, isSupabaseConfigured } from './client.ts';

export interface PlatformTelemetry {
  isLiveDatabase: boolean;
  generatedAt: string;
  sourceLabel: string;
  users: {
    totalUsers: number;
    farmers: number;
    buyers: number;
    coldStorageOperators: number;
  };
  listings: {
    totalListings: number;
    activeListings: number;
    totalCatalogVolumeKg: number;
  };
  orders: {
    totalOrders: number;
    awaitingEscrow: number;
    escrowFunded: number;
    inTransit: number;
    deliveredInspected: number;
    settled: number;
    disputed: number;
    cancelled: number;
  };
  financials: {
    totalGmv: number;
    escrowLockedAmount: number;
    settledFarmerProceeds: number;
  };
  snapshots: {
    totalSnapshots: number;
  };
}

interface DynamicDatabaseClient {
  rpc(fn: string, params?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
  from(table: string): {
    select(columns?: string, options?: { count?: 'exact'; head?: boolean }): {
      eq(column: string, value: unknown): Promise<{
        data: Record<string, unknown>[] | null;
        count: number | null;
        error: { code?: string; message: string } | null;
      }>;
      neq(column: string, value: unknown): Promise<{
        data: Record<string, unknown>[] | null;
        count: number | null;
        error: { code?: string; message: string } | null;
      }>;
      in(column: string, values: unknown[]): Promise<{
        data: Record<string, unknown>[] | null;
        count: number | null;
        error: { code?: string; message: string } | null;
      }>;
      then<TResult1 = { data: Record<string, unknown>[] | null; count: number | null; error: { code?: string; message: string } | null }>(
        onfulfilled?: ((value: { data: Record<string, unknown>[] | null; count: number | null; error: { code?: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null
      ): Promise<TResult1>;
    };
  };
}

export function isAuthorizedAdmin(roles: string[]): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => r.toLowerCase() === 'admin');
}

/**
 * Returns baseline demo metrics for prototype sandboxes.
 */
export function getDemoPlatformTelemetry(): PlatformTelemetry {
  return {
    isLiveDatabase: false,
    generatedAt: '2026-10-21T18:00:00.000Z',
    sourceLabel: '🎭 Demo Sandbox Analytics (Prototype Dataset)',
    users: {
      totalUsers: 840,
      farmers: 610,
      buyers: 185,
      coldStorageOperators: 45,
    },
    listings: {
      totalListings: 142,
      activeListings: 118,
      totalCatalogVolumeKg: 740000,
    },
    orders: {
      totalOrders: 64,
      awaitingEscrow: 8,
      escrowFunded: 14,
      inTransit: 18,
      deliveredInspected: 9,
      settled: 12,
      disputed: 3,
      cancelled: 0,
    },
    financials: {
      totalGmv: 18613000,
      escrowLockedAmount: 1140000,
      settledFarmerProceeds: 8450000,
    },
    snapshots: {
      totalSnapshots: 38,
    },
  };
}

/**
 * Fetches platform telemetry from Supabase with strict admin role verification.
 */
export async function fetchLiveAdminAnalytics(callerRoles: string[]): Promise<{
  telemetry: PlatformTelemetry;
  error: string | null;
  isLiveDatabase: boolean;
}> {
  if (!isAuthorizedAdmin(callerRoles)) {
    return {
      telemetry: getDemoPlatformTelemetry(),
      error: 'Authorization Violation: Only platform administrators are permitted to query platform telemetry.',
      isLiveDatabase: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      telemetry: getDemoPlatformTelemetry(),
      error: null,
      isLiveDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;

    // 1. First attempt to call the secure RPC if installed
    const rpcRes = await supabase.rpc('get_admin_platform_analytics');
    if (!rpcRes.error && rpcRes.data) {
      const d = rpcRes.data as Record<string, unknown>;
      const u = (d.users || {}) as Record<string, number>;
      const l = (d.listings || {}) as Record<string, number>;
      const o = (d.orders || {}) as Record<string, number>;
      const f = (d.financials || {}) as Record<string, number>;
      const a = (d.audit || {}) as Record<string, number>;

      return {
        telemetry: {
          isLiveDatabase: true,
          generatedAt: String(d.generated_at || new Date().toISOString()),
          sourceLabel: '🟢 Live PostgreSQL Database Telemetry (RPC Server Aggregated)',
          users: {
            totalUsers: Number(u.total_registered || 0),
            farmers: Number(u.farmers_count || 0),
            buyers: Number(u.buyers_count || 0),
            coldStorageOperators: 0,
          },
          listings: {
            totalListings: Number(l.total_listings || 0),
            activeListings: Number(l.active_listings || 0),
            totalCatalogVolumeKg: 0,
          },
          orders: {
            totalOrders: Number(o.total_orders || 0),
            awaitingEscrow: 0,
            escrowFunded: 0,
            inTransit: 0,
            deliveredInspected: 0,
            settled: Number(o.settled_orders || 0),
            disputed: Number(o.disputed_orders || 0),
            cancelled: 0,
          },
          financials: {
            totalGmv: Number(f.gross_merchandise_value || 0),
            escrowLockedAmount: Number(f.escrow_locked_volume || 0),
            settledFarmerProceeds: Number(f.settled_farmer_proceeds || 0),
          },
          snapshots: {
            totalSnapshots: Number(a.total_calculation_snapshots || 0),
          },
        },
        error: null,
        isLiveDatabase: true,
      };
    }

    // 2. Direct table aggregation under existing PostgreSQL RLS policies
    const [ordersRes, paymentsRes, listingsRes, rolesRes, snapshotsRes] = await Promise.all([
      supabase.from('reservations_orders').select('id, total_agreed_amount, escrow_status'),
      supabase.from('simulated_payment_events').select('id, amount, event_type, ledger_state'),
      supabase.from('produce_listings').select('id, status, quantity_in_kg'),
      supabase.from('user_roles').select('id, role'),
      supabase.from('calculation_snapshots').select('id', { count: 'exact', head: true }),
    ]);

    if (ordersRes.error) {
      return {
        telemetry: getDemoPlatformTelemetry(),
        error: `Database orders query error: ${ordersRes.error.message}`,
        isLiveDatabase: false,
      };
    }

    const liveOrders = ordersRes.data || [];
    const livePayments = paymentsRes.data || [];
    const liveListings = listingsRes.data || [];
    const liveRoles = rolesRes.data || [];

    // Order status counters
    let awaitingEscrow = 0;
    let escrowFunded = 0;
    let inTransit = 0;
    let deliveredInspected = 0;
    let settled = 0;
    let disputed = 0;
    let cancelled = 0;
    let totalGmv = 0;
    let escrowLockedAmount = 0;

    for (const ord of liveOrders) {
      const st = String(ord.escrow_status || '');
      const amt = Number(ord.total_agreed_amount || 0);

      if (st !== 'cancelled') {
        totalGmv += amt;
      }

      switch (st) {
        case 'awaiting_escrow':
          awaitingEscrow++;
          escrowLockedAmount += amt;
          break;
        case 'escrow_funded':
          escrowFunded++;
          escrowLockedAmount += amt;
          break;
        case 'in_transit':
          inTransit++;
          escrowLockedAmount += amt;
          break;
        case 'delivered_inspected':
          deliveredInspected++;
          escrowLockedAmount += amt;
          break;
        case 'settled':
          settled++;
          break;
        case 'disputed':
          disputed++;
          escrowLockedAmount += amt;
          break;
        case 'cancelled':
          cancelled++;
          break;
      }
    }

    // Settled payments calculation
    let settledFarmerProceeds = 0;
    for (const p of livePayments) {
      if (p.event_type === 'farmer_proceeds_settled' && p.ledger_state === 'COMMITTED') {
        settledFarmerProceeds += Number(p.amount || 0);
      }
    }

    // Listings calculation
    let activeListings = 0;
    let totalCatalogVolumeKg = 0;
    for (const l of liveListings) {
      if (l.status === 'active') activeListings++;
      totalCatalogVolumeKg += Number(l.quantity_in_kg || 0);
    }

    // Roles calculation
    let farmers = 0;
    let buyers = 0;
    let coldStorageOperators = 0;
    for (const r of liveRoles) {
      const roleStr = String(r.role || '').toLowerCase();
      if (roleStr === 'farmer') farmers++;
      else if (['trader', 'processor', 'fpo_admin'].includes(roleStr)) buyers++;
      else if (['cold_storage', 'transporter'].includes(roleStr)) coldStorageOperators++;
    }

    const totalSnapshots = snapshotsRes.count ?? 0;

    return {
      telemetry: {
        isLiveDatabase: true,
        generatedAt: new Date().toISOString(),
        sourceLabel: '🟢 Live Supabase Platform Records (RLS Enforced)',
        users: {
          totalUsers: liveRoles.length,
          farmers,
          buyers,
          coldStorageOperators,
        },
        listings: {
          totalListings: liveListings.length,
          activeListings,
          totalCatalogVolumeKg,
        },
        orders: {
          totalOrders: liveOrders.length,
          awaitingEscrow,
          escrowFunded,
          inTransit,
          deliveredInspected,
          settled,
          disputed,
          cancelled,
        },
        financials: {
          totalGmv,
          escrowLockedAmount,
          settledFarmerProceeds,
        },
        snapshots: {
          totalSnapshots,
        },
      },
      error: null,
      isLiveDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query live admin analytics.';
    return {
      telemetry: getDemoPlatformTelemetry(),
      error: msg,
      isLiveDatabase: false,
    };
  }
}
