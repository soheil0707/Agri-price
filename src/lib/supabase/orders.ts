/**
 * AgriPrice Phase 2: Persistent Orders, Delivery Tracking & Milestone Escrow
 *
 * Implements server-enforced, RLS-secured operations against:
 * - Table: `public.reservations_orders`
 * - Stored Procedures:
 *   - `public.accept_offer_and_create_reservation(p_offer_id UUID)`
 *   - `public.cancel_reservation_and_release_inventory(p_order_id UUID, p_cancellation_reason TEXT)`
 *   - `public.dispatch_order_advance(p_order_id UUID, p_transporter_id UUID, p_advance_amount NUMERIC, ...)`
 *   - `public.record_simulated_payment_event(...)`
 *
 * Security & Integrity Invariants:
 * 1. Participant Isolation: Enforced by RLS `orders_select_participants`.
 * 2. Strict State Machine: Orders only advance along authorized paths.
 * 3. Atomic Inventory Release: Cancellations safely restore reserved volume via stored procedure.
 * 4. Micro-Location Privacy: Farm address and GPS coordinates are NEVER exposed in order projections.
 * 5. Client Self-Settlement Prohibition: Ordinary users cannot self-release restricted escrow funds.
 */

import { createClient, isSupabaseConfigured } from './client.ts';
import type { Database } from './database.types.ts';
import type { MarketplaceOrder, OrderProgressState } from '../marketplace/types.ts';
import {
  recordSimulatedPaymentEvent,
  generateIdempotencyKey,
  computeCanonicalPayloadHash,
} from './payments.ts';

export type DatabaseOrderRow = Database['public']['Tables']['reservations_orders']['Row'];

export interface FetchOrdersResult {
  orders: MarketplaceOrder[];
  error: string | null;
  isConfigured: boolean;
}

export interface AdvanceOrderResult {
  success: boolean;
  nextStatus: OrderProgressState;
  message: string;
  paymentEventId?: string;
  error?: string;
}

/**
 * Validates which role has permission to trigger each milestone transition.
 */
export function getRequiredRoleForMilestone(currentStatus: OrderProgressState): 'buyer' | 'seller' | 'admin' {
  switch (currentStatus) {
    case 'awaiting_escrow':
      return 'buyer'; // Buyer authorizes escrow deposit
    case 'escrow_funded':
      return 'seller'; // Producer / seller dispatches consignment with advance
    case 'in_transit':
      return 'buyer'; // Buyer confirms delivery and quality inspection
    case 'delivered_inspected':
      return 'admin'; // Platform admin / trust authority releases final settlement
    default:
      return 'admin';
  }
}

/**
 * Fetches all orders visible to the authenticated caller (as buyer, seller, or admin).
 * Server-enforced by RLS policy `orders_select_participants`.
 * Private location coordinates are strictly excluded.
 */
export async function fetchUserOrders(): Promise<FetchOrdersResult> {
  if (!isSupabaseConfigured()) {
    return {
      orders: [],
      error: 'Supabase credentials are not configured.',
      isConfigured: false,
    };
  }

  try {
    const supabase = createClient();

    // 1. Fetch orders governed by RLS
    const { data: ordersData, error: ordersErr } = await supabase
      .from('reservations_orders')
      .select(`
        id,
        listing_id,
        accepted_offer_id,
        seller_profile_id,
        buyer_profile_id,
        assigned_transporter_id,
        locked_quantity_kg,
        agreed_price_per_kg,
        total_agreed_amount,
        escrow_status,
        pickup_scheduled_at,
        delivered_at,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (ordersErr) {
      return {
        orders: [],
        error: ordersErr.message,
        isConfigured: true,
      };
    }

    if (!ordersData || ordersData.length === 0) {
      return {
        orders: [],
        error: null,
        isConfigured: true,
      };
    }

    // 2. Fetch associated macro listings (commodity, variety, district)
    const listingIds = Array.from(new Set(ordersData.map((o) => o.listing_id)));
    const { data: listingsData } = await supabase
      .from('produce_listings')
      .select('id, title, commodity, variety, grade, farm_district, farm_state')
      .in('id', listingIds);

    const listingMap = new Map((listingsData || []).map((l) => [l.id, l]));

    // 3. Fetch associated profiles for counterparty names
    const profileIds = Array.from(
      new Set([
        ...ordersData.map((o) => o.seller_profile_id),
        ...ordersData.map((o) => o.buyer_profile_id),
      ])
    );

    const { data: profilesData } = await supabase
      .from('public_profiles')
      .select('id, full_name, district, state')
      .in('id', profileIds);

    const profileMap = new Map((profilesData || []).map((p) => [p.id, p]));

    // 4. Map into UI MarketplaceOrder model
    const mappedOrders: MarketplaceOrder[] = ordersData.map((o) => {
      const listing = listingMap.get(o.listing_id);
      const seller = profileMap.get(o.seller_profile_id);
      const buyer = profileMap.get(o.buyer_profile_id);

      const orderNumber = `AGP-ORD-${o.id.slice(0, 8).toUpperCase()}`;

      return {
        id: o.id,
        orderNumber,
        listingId: o.listing_id,
        offerId: o.accepted_offer_id,
        commodity: listing?.commodity || 'Agricultural Produce',
        variety: listing?.variety || 'Standard Commercial',
        grade: listing?.grade || 'Standard',
        sellerId: o.seller_profile_id,
        sellerName: seller?.full_name || `Producer (${listing?.farm_district || 'District'})`,
        sellerDistrict: listing?.farm_district || seller?.district || 'Agricultural Zone',
        buyerId: o.buyer_profile_id,
        buyerName: buyer?.full_name || 'Verified Buyer',
        buyerOrganization: buyer?.full_name ? `${buyer.full_name} Procurement` : 'Wholesale Buyer',
        lockedQuantityKg: Number(o.locked_quantity_kg),
        agreedPricePerKg: Number(o.agreed_price_per_kg),
        totalAgreedAmount: Number(o.total_agreed_amount),
        escrowStatus: o.escrow_status as OrderProgressState,
        storageProvider: 'AgriPrice Verified Cold Chain',
        transporterName: o.assigned_transporter_id
          ? `Transporter (${o.assigned_transporter_id.slice(0, 6)})`
          : 'Dedicated Logistics Fleet',
        pickupScheduledAt: o.pickup_scheduled_at || undefined,
        deliveredAt: o.delivered_at || undefined,
        createdAt: o.created_at,
        isLiveDatabaseOrder: true,
      };
    });

    return {
      orders: mappedOrders,
      error: null,
      isConfigured: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch orders from database.';
    return {
      orders: [],
      error: msg,
      isConfigured: true,
    };
  }
}

/**
 * Advances an order's milestone lifecycle in the database with strict role authorization.
 */
export async function advanceOrderState(
  order: MarketplaceOrder,
  callerProfileId: string,
  callerRoles: string[]
): Promise<AdvanceOrderResult> {
  if (!order || !order.id) {
    return {
      success: false,
      nextStatus: order ? order.escrowStatus : 'awaiting_escrow',
      message: 'Invalid order reference.',
      error: 'Invalid order reference.',
    };
  }

  if (order.escrowStatus === 'settled' || order.escrowStatus === 'cancelled') {
    return {
      success: false,
      nextStatus: order.escrowStatus,
      message: `Order is already in finalized state "${order.escrowStatus}".`,
      error: `Order is already in finalized state "${order.escrowStatus}".`,
    };
  }

  const isAdmin = callerRoles.includes('admin');
  const isBuyer = callerProfileId === order.buyerId;
  const isSeller = callerProfileId === order.sellerId;

  // Milestone 1: Awaiting Escrow -> Escrow Funded (Buyer Action)
  if (order.escrowStatus === 'awaiting_escrow') {
    if (!isBuyer && !isAdmin) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Authorization Violation: Only the verified buyer can authorize escrow deposit funding.',
        error: 'Only the verified buyer can authorize escrow deposit funding.',
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Supabase credentials are not configured.',
        error: 'Supabase credentials are not configured.',
      };
    }

    const idempotencyKey = generateIdempotencyKey('escrow', order.id);
    const payRes = await recordSimulatedPaymentEvent({
      orderId: order.id,
      eventType: 'escrow_hold_authorized',
      amount: order.totalAgreedAmount,
      idempotencyKey,
      auditMetadata: {
        action: 'escrow_deposit',
        buyerProfileId: callerProfileId,
        orderNumber: order.orderNumber,
      },
    });

    if (!payRes.success) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: payRes.error || 'Failed to authorize escrow deposit in database.',
        error: payRes.error,
      };
    }

    return {
      success: true,
      nextStatus: 'escrow_funded',
      message: `Escrow hold of ₹${order.totalAgreedAmount.toLocaleString('en-IN')} authorized in database ledger. Consignment ready for dispatch.`,
      paymentEventId: payRes.eventId,
    };
  }

  // Milestone 2: Escrow Funded -> In Transit (Seller Dispatch Action)
  if (order.escrowStatus === 'escrow_funded') {
    if (!isSeller && !isAdmin) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Authorization Violation: Only the producer/seller can dispatch the order and claim advance.',
        error: 'Only the producer/seller can dispatch the order.',
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Supabase credentials are not configured.',
        error: 'Supabase credentials are not configured.',
      };
    }

    try {
      const supabase = createClient();
      const advanceAmount = Math.round(order.totalAgreedAmount * 0.4);
      const idempotencyKey = generateIdempotencyKey('dispatch', order.id);
      const payloadHash = await computeCanonicalPayloadHash({
        orderId: order.id,
        advanceAmount,
        idempotencyKey,
      });

      // Use the seller profile or dedicated transporter if available
      const transporterId = callerProfileId;

      const { data, error } = await supabase.rpc('dispatch_order_advance', {
        p_order_id: order.id,
        p_transporter_id: transporterId,
        p_advance_amount: advanceAmount,
        p_idempotency_key: idempotencyKey,
        p_payload_hash: payloadHash,
        p_audit: {
          action: 'dispatch_order_advance',
          sellerProfileId: callerProfileId,
          orderNumber: order.orderNumber,
        },
      });

      if (error) {
        return {
          success: false,
          nextStatus: order.escrowStatus,
          message: error.message,
          error: error.message,
        };
      }

      return {
        success: true,
        nextStatus: 'in_transit',
        message: `Consignment dispatched! 40% advance (₹${advanceAmount.toLocaleString('en-IN')}) released to farmer in database.`,
        paymentEventId: data as string,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dispatch operation failed.';
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: msg,
        error: msg,
      };
    }
  }

  // Milestone 3: In Transit -> Delivered & Inspected (Buyer Quality Inspection Action)
  if (order.escrowStatus === 'in_transit') {
    if (!isBuyer && !isAdmin) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Authorization Violation: Only the destination buyer can confirm delivery and quality inspection.',
        error: 'Only the buyer can confirm delivery and quality inspection.',
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Supabase credentials are not configured.',
        error: 'Supabase credentials are not configured.',
      };
    }

    const idempotencyKey = generateIdempotencyKey('inspect', order.id);
    const payRes = await recordSimulatedPaymentEvent({
      orderId: order.id,
      eventType: 'quality_acceptance_confirmed',
      amount: 0,
      idempotencyKey,
      auditMetadata: {
        action: 'quality_acceptance_confirmed',
        buyerProfileId: callerProfileId,
        qualityGrade: order.grade,
      },
    });

    if (!payRes.success) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: payRes.error || 'Failed to record quality acceptance in database.',
        error: payRes.error,
      };
    }

    return {
      success: true,
      nextStatus: 'delivered_inspected',
      message: `Quality inspection confirmed for ${order.commodity}. Net farmer settlement ready for release.`,
      paymentEventId: payRes.eventId,
    };
  }

  // Milestone 4: Delivered & Inspected -> Settled (Platform Admin / Trust Authority Action)
  if (order.escrowStatus === 'delivered_inspected') {
    // Prohibition of Client Self-Settlement: Only platform admin can trigger final release
    if (!isAdmin) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Client Self-Settlement Denied: Only AgriPrice platform administrators or authorized clearing agents can disburse final escrow proceeds.',
        error: 'Client Self-Settlement Denied: Only AgriPrice platform administrators can disburse final escrow proceeds.',
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: 'Supabase credentials are not configured.',
        error: 'Supabase credentials are not configured.',
      };
    }

    const finalAmount = Math.round(order.totalAgreedAmount * 0.54); // remaining net payout
    const idempotencyKey = generateIdempotencyKey('settle', order.id);

    const payRes = await recordSimulatedPaymentEvent({
      orderId: order.id,
      eventType: 'farmer_proceeds_settled',
      amount: finalAmount,
      idempotencyKey,
      auditMetadata: {
        action: 'farmer_proceeds_settled',
        adminProfileId: callerProfileId,
        finalSettlement: true,
      },
    });

    if (!payRes.success) {
      return {
        success: false,
        nextStatus: order.escrowStatus,
        message: payRes.error || 'Failed to disburse final proceeds in database.',
        error: payRes.error,
      };
    }

    return {
      success: true,
      nextStatus: 'settled',
      message: `Transaction complete! Net proceeds of ₹${finalAmount.toLocaleString('en-IN')} settled to farmer in database.`,
      paymentEventId: payRes.eventId,
    };
  }

  return {
    success: false,
    nextStatus: order.escrowStatus,
    message: `Order is already in finalized state "${order.escrowStatus}".`,
  };
}

/**
 * Cancels an order reservation and atomically restores reserved inventory on the produce listing.
 * Server-enforced by procedure `public.cancel_reservation_and_release_inventory`.
 */
export async function cancelOrderReservation(
  orderId: string,
  cancellationReason: string
): Promise<{ success: boolean; message: string; error?: string }> {
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
    return { success: false, message: 'Invalid order identifier.' };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase credentials are not configured.' };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('cancel_reservation_and_release_inventory', {
      p_order_id: orderId,
      p_cancellation_reason: cancellationReason.trim() || 'Buyer/Seller cancellation',
    });

    if (error) {
      return { success: false, message: error.message, error: error.message };
    }

    return {
      success: true,
      message: data
        ? 'Reservation cancelled and reserved inventory restored to active marketplace listing.'
        : 'Order was already cancelled (idempotent no-op).',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel order reservation.';
    return { success: false, message: msg, error: msg };
  }
}
