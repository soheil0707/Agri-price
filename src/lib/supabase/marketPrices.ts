/**
 * AgriPrice Phase 5: Market Intelligence & APMC Mandi Benchmarks
 *
 * Connects regional market-price benchmarks to Supabase table `public.market_price_benchmarks`.
 *
 * Truthful Sourcing & Verification Standard:
 * - When live database rows are returned, displays source attribution, mandi yard,
 *   district, state, and exact recorded timestamp.
 * - If verified automated government feeds are not connected, explicitly labels
 *   displayed data as "Sample / Reference Data (Agmarknet APMC Model)".
 * - Never invents live prices, never claims unverified AI price forecasts, and preserves
 *   the deterministic net-return calculator and its test assertions.
 */

import { createClient, isSupabaseConfigured } from './client.ts';
import type { RegionalMarketPrice } from '../marketplace/types.ts';
import { REGIONAL_MARKET_PRICES } from '../marketplace/seedData.ts';

export interface MarketPriceBenchmarkRecord {
  id: string;
  mandiName: string;
  marketCenterDistrict: string;
  marketCenterState: string;
  commodity: string;
  variety: string;
  grade: string;
  minPricePerKg: number;
  modalPricePerKg: number;
  maxPricePerKg: number;
  sourceAttribution: string;
  recordedAt: string;
  isLiveFeed: boolean;
  createdAt: string;
  isLiveDatabaseRecord: boolean;
}

interface DynamicDatabaseClient {
  from(table: string): {
    select(columns?: string): {
      order(column: string, options?: { ascending?: boolean }): Promise<{
        data: Record<string, unknown>[] | null;
        error: { code?: string; message: string } | null;
      }>;
    };
  };
}

/**
 * Fetches market price benchmarks from Supabase `public.market_price_benchmarks`.
 * Falls back cleanly to seed reference benchmarks if table is empty or unconfigured.
 */
export async function fetchMarketPriceBenchmarks(): Promise<{
  prices: RegionalMarketPrice[];
  isLiveDatabase: boolean;
  sourceDescription: string;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      prices: REGIONAL_MARKET_PRICES.map((p) => ({
        ...p,
        sourceAttribution: 'Agmarknet APMC Model Benchmark (Sample / Reference Data)',
        isLiveFeed: false,
        isLiveDatabaseRecord: false,
      })),
      isLiveDatabase: false,
      sourceDescription: 'Sample / Reference Benchmark Data (Offline Demo Mode)',
      error: null,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;
    const { data, error } = await supabase
      .from('market_price_benchmarks')
      .select('*')
      .order('commodity', { ascending: true });

    if (error) {
      return {
        prices: REGIONAL_MARKET_PRICES.map((p) => ({
          ...p,
          sourceAttribution: 'Agmarknet APMC Model Benchmark (Sample / Reference Data)',
          isLiveFeed: false,
          isLiveDatabaseRecord: false,
        })),
        isLiveDatabase: false,
        sourceDescription: 'Sample / Reference Benchmark Data (Database fallback)',
        error: error.message,
      };
    }

    if (data && data.length > 0) {
      const mapped: RegionalMarketPrice[] = data.map((row) => ({
        id: String(row.id || ''),
        commodity: String(row.commodity || ''),
        variety: String(row.variety || 'Standard Variety'),
        grade: String(row.grade || 'Standard'),
        marketCenter: String(row.mandi_name || 'APMC Yard'),
        district: String(row.market_center_district || ''),
        state: String(row.market_center_state || ''),
        modalPricePerKg: Number(row.modal_price_per_kg || 0),
        minPricePerKg: Number(row.min_price_per_kg || 0),
        maxPricePerKg: Number(row.max_price_per_kg || 0),
        dayChangePercent: 0,
        trend: 'steady',
        updatedAt: row.recorded_at ? `Recorded: ${String(row.recorded_at)}` : 'Current Season',
        sourceAttribution: String(row.source_attribution || 'PostgreSQL Market Benchmark Feed'),
        isLiveFeed: Boolean(row.is_live_feed),
        isLiveDatabaseRecord: true,
      }));

      return {
        prices: mapped,
        isLiveDatabase: true,
        sourceDescription: '🟢 Live Supabase Market Price Benchmarks (public.market_price_benchmarks)',
        error: null,
      };
    }

    // Table exists but currently has 0 rows: display reference data with truthful label
    return {
      prices: REGIONAL_MARKET_PRICES.map((p) => ({
        ...p,
        sourceAttribution: 'Agmarknet APMC Model Benchmark (Sample / Reference Data)',
        isLiveFeed: false,
        isLiveDatabaseRecord: false,
      })),
      isLiveDatabase: false,
      sourceDescription: 'Sample / Reference Data — Live Government Feed Integration Pending Agmarknet Gateway Key',
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query market prices.';
    return {
      prices: REGIONAL_MARKET_PRICES.map((p) => ({
        ...p,
        sourceAttribution: 'Agmarknet APMC Model Benchmark (Sample / Reference Data)',
        isLiveFeed: false,
        isLiveDatabaseRecord: false,
      })),
      isLiveDatabase: false,
      sourceDescription: 'Sample / Reference Benchmark Data (Error fallback)',
      error: msg,
    };
  }
}

/**
 * Checks whether a given market price is an audited live feed or sample reference.
 */
export function isLiveMarketFeed(price: RegionalMarketPrice): boolean {
  return Boolean(price.isLiveFeed && price.isLiveDatabaseRecord);
}

/**
 * Formats commodity rate in either ₹/kg or ₹/quintal.
 */
export function formatPriceUnit(pricePerKg: number, unit: 'kg' | 'quintal' = 'kg'): string {
  if (unit === 'quintal') {
    const perQuintal = pricePerKg * 100;
    return `₹${perQuintal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/qtl`;
  }
  return `₹${pricePerKg.toFixed(2)}/kg`;
}
