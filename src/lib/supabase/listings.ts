import { createClient, isSupabaseConfigured } from './client';
import type { PublicProduceListing } from './database.types';

export interface ListingsFetchResult {
  listings: PublicProduceListing[];
  error: string | null;
  isConfigured: boolean;
}

/**
 * Read-only query to the existing Supabase view `public.public_produce_listings`.
 *
 * Requirements:
 * - Read-only operation; never inserts, updates, or deletes rows.
 * - Explicitly queries only macro fields exposed by the public view.
 * - NEVER queries private columns (farm_location_address, farm_pincode, latitude, longitude).
 */
export async function fetchPublicProduceListings(): Promise<ListingsFetchResult> {
  if (!isSupabaseConfigured()) {
    return {
      listings: [],
      error: 'Supabase client environment variables are not configured.',
      isConfigured: false,
    };
  }

  try {
    const supabase = createClient();
    // Strictly SELECT ONLY the public columns exposed by public_produce_listings.
    // Explicit selection ensures private columns (farm_location_address, farm_pincode, latitude, longitude)
    // are never queried under any circumstances.
    const { data, error } = await supabase
      .from('public_produce_listings')
      .select(
        'id, seller_profile_id, title, commodity, variety, grade, harvest_quantity, quantity_unit, quantity_in_kg, reserved_quantity_kg, available_quantity_kg, harvest_date, expected_shelf_life_days, farm_district, farm_state, target_price_per_kg, status, created_at'
      )
      .order('created_at', { ascending: false });

    if (error) {
      return {
        listings: [],
        error: error.message,
        isConfigured: true,
      };
    }

    return {
      listings: (data as PublicProduceListing[]) ?? [],
      error: null,
      isConfigured: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error occurred';
    return {
      listings: [],
      error: message,
      isConfigured: true,
    };
  }
}
