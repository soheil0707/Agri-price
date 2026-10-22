/**
 * AgriPrice Phase 1: Buyer Offers and Negotiations Supabase Integration
 *
 * Implements server-enforced, RLS-secured operations against:
 * - Table: `public.offers_negotiations`
 * - Stored Procedure: `public.accept_offer_and_create_reservation(UUID)`
 * - View Projection: `public.produce_listings` / `public.public_produce_listings`
 *
 * Security Invariants:
 * 1. Never trusts client-supplied profile IDs or seller IDs.
 * 2. Enforces buyer role verification ('trader', 'processor', 'fpo_admin').
 * 3. Enforces anti-wash-trading (sellers cannot offer on their own produce).
 * 4. Never exposes private farm addresses or GPS coordinates.
 * 5. Uses atomic database procedure for offer acceptance to guarantee zero overselling.
 */

import { createClient, isSupabaseConfigured } from './client.ts';
import type { Database, OfferStatusType } from './database.types.ts';
import type { ProduceOffer } from '../marketplace/types.ts';

export type DatabaseOfferRow = Database['public']['Tables']['offers_negotiations']['Row'];
export type DatabaseOfferInsert = Database['public']['Tables']['offers_negotiations']['Insert'];

export interface CreateOfferParams {
  listingId: string;
  offeredPricePerKg: number;
  offeredQuantityKg: number;
  deliveryTerms: string;
  transportBorneBy: 'buyer' | 'seller' | 'shared';
  notes?: string;
  expiresInHours?: number;
}

export interface CreateOfferResult {
  success: boolean;
  offerId?: string;
  error?: string;
  message?: string;
}

export interface FetchOffersResult {
  offers: ProduceOffer[];
  error: string | null;
  isConfigured: boolean;
}

export interface AcceptOfferResult {
  success: boolean;
  orderId?: string;
  error?: string;
  message?: string;
}

export interface UpdateOfferStatusResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Validates whether a profile role permits submitting purchase offers.
 * Database RLS policy `offers_insert_buyers` strictly enforces this in PostgreSQL.
 */
export function isAuthorizedBuyerRole(roles: string[]): boolean {
  return roles.some((role) => role === 'trader' || role === 'processor' || role === 'fpo_admin');
}

/**
 * Fetches all offers relevant to the authenticated caller:
 * - Offers submitted by the caller as a buyer
 * - Offers received on produce listings owned by the caller as a seller
 *
 * Server-enforced by RLS policy `offers_select_participants`.
 * Private columns (farm address, GPS) are NEVER selected.
 */
export async function fetchUserOffers(): Promise<FetchOffersResult> {
  if (!isSupabaseConfigured()) {
    return {
      offers: [],
      error: 'Supabase client environment variables are not configured.',
      isConfigured: false,
    };
  }

  try {
    const supabase = createClient();

    // Query offers_negotiations with safe macro listing projection
    const { data: offersData, error: offersError } = await supabase
      .from('offers_negotiations')
      .select(`
        id,
        listing_id,
        buyer_profile_id,
        calculation_snapshot_id,
        offered_price_per_kg,
        offered_quantity_kg,
        delivery_terms,
        transport_borne_by,
        status,
        notes,
        expires_at,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (offersError) {
      return {
        offers: [],
        error: offersError.message,
        isConfigured: true,
      };
    }

    if (!offersData || offersData.length === 0) {
      return {
        offers: [],
        error: null,
        isConfigured: true,
      };
    }

    // Fetch associated listings using public fields only
    const listingIds = Array.from(new Set(offersData.map((o) => o.listing_id)));
    const { data: listingsData } = await supabase
      .from('produce_listings')
      .select('id, title, commodity, variety, grade, farm_district, farm_state, seller_profile_id, target_price_per_kg')
      .in('id', listingIds);

    const listingMap = new Map((listingsData ?? []).map((l) => [l.id, l]));

    // Fetch buyer public profile information using public_profiles view
    const buyerProfileIds = Array.from(new Set(offersData.map((o) => o.buyer_profile_id)));
    const { data: buyersData } = await supabase
      .from('public_profiles')
      .select('id, full_name, district, state, kyc_verified')
      .in('id', buyerProfileIds);

    const buyerMap = new Map((buyersData ?? []).map((b) => [b.id, b]));

    // Map database rows into strongly-typed ProduceOffer objects
    const mappedOffers: ProduceOffer[] = offersData.map((row) => {
      const listing = listingMap.get(row.listing_id);
      const buyer = buyerMap.get(row.buyer_profile_id);

      return {
        id: row.id,
        listingId: row.listing_id,
        listingTitle: listing?.title || `Produce Lot (${row.listing_id.slice(0, 8)})`,
        commodity: listing?.commodity || 'Agricultural Produce',
        buyerId: row.buyer_profile_id,
        buyerName: buyer?.full_name || `Buyer (${row.buyer_profile_id.slice(0, 8)})`,
        buyerOrganization: buyer ? `${buyer.district} Procurement Member` : 'Wholesale Buyer',
        buyerRole: 'processor',
        sellerId: listing?.seller_profile_id || '',
        sellerName: listing ? `Producer (${listing.farm_district})` : 'Farmgate Seller',
        offeredPricePerKg: Number(row.offered_price_per_kg),
        offeredQuantityKg: Number(row.offered_quantity_kg),
        deliveryTerms: row.delivery_terms as ProduceOffer['deliveryTerms'],
        transportBorneBy: row.transport_borne_by as ProduceOffer['transportBorneBy'],
        status: row.status as ProduceOffer['status'],
        notes: row.notes || undefined,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        isLiveDatabaseOffer: true,
      };
    });

    return {
      offers: mappedOffers,
      error: null,
      isConfigured: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error occurred';
    return {
      offers: [],
      error: message,
      isConfigured: true,
    };
  }
}

/**
 * Persists an authenticated buyer's purchase offer to `public.offers_negotiations`.
 *
 * Security Preconditions:
 * 1. Caller must have an authenticated session and profile ID.
 * 2. Caller must possess an authorized buyer role ('trader', 'processor', 'fpo_admin').
 * 3. Anti-Wash Trading: Caller cannot submit an offer on their own listing.
 * 4. Quantity and price must be strictly positive numbers.
 */
export async function createBuyerOffer(
  params: CreateOfferParams,
  callerProfileId: string,
  callerRoles: string[]
): Promise<CreateOfferResult> {
  // 1. Validate caller identity
  if (!callerProfileId || typeof callerProfileId !== 'string' || callerProfileId.trim() === '') {
    return { success: false, error: 'Authentication Required: Valid profile ID is required to submit offers.' };
  }

  // 2. Client-side role pre-flight (mirrors PostgreSQL RLS check)
  if (!isAuthorizedBuyerRole(callerRoles)) {
    return {
      success: false,
      error: 'Authorization Violation: Profile lacks a verified buyer role (trader, processor, or fpo_admin) in public.user_roles.',
    };
  }

  // 3. Validate numerical terms
  if (!Number.isFinite(params.offeredPricePerKg) || params.offeredPricePerKg <= 0) {
    return { success: false, error: 'Validation Violation: Offered price per kg must be greater than zero.' };
  }

  if (!Number.isFinite(params.offeredQuantityKg) || params.offeredQuantityKg <= 0) {
    return { success: false, error: 'Validation Violation: Offered quantity must be greater than zero kg.' };
  }

  // 4. Verify Supabase configuration
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase credentials are not configured.' };
  }

  try {
    const supabase = createClient();

    // 4. Anti-Wash Trading: Pre-flight verify seller is not buyer
    const { data: listingData, error: listingErr } = await supabase
      .from('produce_listings')
      .select('id, seller_profile_id, status, quantity_in_kg, reserved_quantity_kg')
      .eq('id', params.listingId)
      .maybeSingle();

    if (listingErr) {
      return { success: false, error: `Failed to inspect listing: ${listingErr.message}` };
    }

    if (!listingData) {
      return { success: false, error: 'Associated produce listing not found.' };
    }

    if (listingData.seller_profile_id === callerProfileId) {
      return {
        success: false,
        error: 'Validation Violation (trg_ensure_buyer_not_seller): A producer cannot submit purchase offers on their own produce listing.',
      };
    }

    if (listingData.status !== 'active') {
      return {
        success: false,
        error: `Listing is not open for offers (status is "${listingData.status}").`,
      };
    }

    const availableKg = listingData.quantity_in_kg - (listingData.reserved_quantity_kg || 0);
    if (params.offeredQuantityKg > availableKg) {
      return {
        success: false,
        error: `Offered quantity (${params.offeredQuantityKg} kg) exceeds available stock (${availableKg} kg).`,
      };
    }

    // 5. Expiration timestamp (default 48 hours in future)
    const expiresInHours = params.expiresInHours && params.expiresInHours > 0 ? params.expiresInHours : 48;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600000).toISOString();

    // 6. Insert offer into offers_negotiations
    const { data: insertedData, error: insertError } = await supabase
      .from('offers_negotiations')
      .insert({
        listing_id: params.listingId,
        buyer_profile_id: callerProfileId,
        offered_price_per_kg: params.offeredPricePerKg,
        offered_quantity_kg: params.offeredQuantityKg,
        delivery_terms: params.deliveryTerms,
        transport_borne_by: params.transportBorneBy,
        status: 'pending' as OfferStatusType,
        notes: params.notes?.trim() || null,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return {
      success: true,
      offerId: insertedData.id,
      message: 'Offer successfully committed to Supabase database.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit offer to database.';
    return { success: false, error: msg };
  }
}

/**
 * Atomically accepts an offer, reserves inventory, and generates a reservation order.
 *
 * Executes the database stored procedure `public.accept_offer_and_create_reservation(UUID)`.
 * Guarantees zero inventory overselling via top-down locks and headroom verification.
 */
export async function acceptOfferWithReservation(offerId: string): Promise<AcceptOfferResult> {
  if (!offerId || typeof offerId !== 'string' || offerId.trim() === '') {
    return { success: false, error: 'Invalid offer identifier.' };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase credentials are not configured.' };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('accept_offer_and_create_reservation', {
      p_offer_id: offerId,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      orderId: data as string,
      message: 'Offer accepted! Reserved stock and created order in database.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database procedure execution failed.';
    return { success: false, error: msg };
  }
}

/**
 * Rejects an incoming offer as a seller.
 * Server-enforced by RLS policy `offers_update_seller_decide` and trigger `trg_protect_offer_terms`.
 */
export async function rejectSellerOffer(offerId: string): Promise<UpdateOfferStatusResult> {
  if (!offerId || typeof offerId !== 'string' || offerId.trim() === '') {
    return { success: false, error: 'Invalid offer identifier.' };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase credentials are not configured.' };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('offers_negotiations')
      .update({
        status: 'rejected' as OfferStatusType,
      })
      .eq('id', offerId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: 'Offer rejected.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reject offer.';
    return { success: false, error: msg };
  }
}

/**
 * Cancels a pending offer as a buyer.
 * Server-enforced by RLS policy `offers_update_buyer_cancel` and trigger `trg_protect_offer_terms`.
 */
export async function cancelBuyerOffer(offerId: string): Promise<UpdateOfferStatusResult> {
  if (!offerId || typeof offerId !== 'string' || offerId.trim() === '') {
    return { success: false, error: 'Invalid offer identifier.' };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase credentials are not configured.' };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('offers_negotiations')
      .update({
        status: 'cancelled' as OfferStatusType,
      })
      .eq('id', offerId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: 'Offer cancelled.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel offer.';
    return { success: false, error: msg };
  }
}
