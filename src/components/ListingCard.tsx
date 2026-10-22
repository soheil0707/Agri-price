'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DEMO_TOMATO_LISTING } from '../lib/calculator/demoData';
import {
  convertFromKg,
  formatINR,
  formatWeight,
  safeMultiply,
  WEIGHT_TO_KG_FACTORS,
} from '../lib/calculator/decimal';
import { fetchPublicProduceListings } from '../lib/supabase/listings';
import type { PublicProduceListing } from '../lib/supabase/database.types';
import type { WeightUnit, CalculationInput } from '../lib/calculator/types';

interface ListingCardProps {
  onLoadListingDefaults: (customInput?: Partial<CalculationInput>) => void;
}

export function ListingCard({ onLoadListingDefaults }: ListingCardProps) {
  const [selectedUnit, setSelectedUnit] = useState<WeightUnit>('kg');
  const [listings, setListings] = useState<PublicProduceListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'database' | 'demo'>('database');

  const executeFetch = useCallback(async () => {
    const result = await fetchPublicProduceListings();

    if (result.error) {
      setError(result.error);
      setListings([]);
      setViewMode('demo');
    } else if (result.listings.length === 0) {
      setListings([]);
      setError(null);
      setViewMode('demo');
    } else {
      setListings(result.listings);
      setError(null);
      setSelectedIndex(0);
      setViewMode('database');
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      const result = await fetchPublicProduceListings();
      if (!isMounted) return;

      if (result.error) {
        setError(result.error);
        setListings([]);
        setViewMode('demo');
      } else if (result.listings.length === 0) {
        setListings([]);
        setError(null);
        setViewMode('demo');
      } else {
        setListings(result.listings);
        setError(null);
        setSelectedIndex(0);
        setViewMode('database');
      }

      setIsLoading(false);
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);
    executeFetch();
  };

  // Demo Fallback Listing Calculations
  const demoListing = DEMO_TOMATO_LISTING;
  const demoDisplayQuantity = convertFromKg(demoListing.quantity, selectedUnit);
  const demoMinPrice =
    demoListing.simulatedBenchmarkPrice.min *
    (selectedUnit === 'quintal' ? 100 : selectedUnit === 'tonne' ? 1000 : 1);
  const demoModalPrice =
    demoListing.simulatedBenchmarkPrice.modal *
    (selectedUnit === 'quintal' ? 100 : selectedUnit === 'tonne' ? 1000 : 1);
  const demoMaxPrice =
    demoListing.simulatedBenchmarkPrice.max *
    (selectedUnit === 'quintal' ? 100 : selectedUnit === 'tonne' ? 1000 : 1);

  // Active Live Listing (if in database mode and listings exist)
  const activeListing: PublicProduceListing | null =
    viewMode === 'database' && listings.length > 0 ? listings[selectedIndex] ?? null : null;

  const liveAvailableKg = activeListing ? activeListing.available_quantity_kg : 0;
  const liveDisplayQuantity = convertFromKg(liveAvailableKg, selectedUnit);
  const livePricePerUnit =
    activeListing && activeListing.target_price_per_kg != null
      ? safeMultiply(activeListing.target_price_per_kg, WEIGHT_TO_KG_FACTORS[selectedUnit])
      : null;

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden mb-6 p-6 animate-pulse">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Connecting to Supabase • Querying public.public_produce_listings...
            </span>
          </div>
          <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          <div className="lg:col-span-8 space-y-4">
            <div className="h-7 w-2/3 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-4 h-48 bg-zinc-100 dark:bg-zinc-800/40 rounded-xl" />
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LIVE DATABASE LISTING VIEW
  // Rendered ONLY when database query returned real rows from public_produce_listings
  // --------------------------------------------------------------------------
  if (activeListing && viewMode === 'database') {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-emerald-300 dark:border-emerald-800/70 shadow-sm overflow-hidden mb-6">
        {/* Verified Live Database Banner */}
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center space-x-2">
            <span className="font-semibold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>Live Database Listing</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300">
              Source: public.public_produce_listings
            </span>
            {listings.length > 1 && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                ({selectedIndex + 1} of {listings.length} listings)
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-[11px]">
            <span className="font-mono text-zinc-500 dark:text-zinc-400">
              ID: {activeListing.id.slice(0, 8)}...
            </span>
            <button
              type="button"
              onClick={() => setViewMode('demo')}
              className="text-emerald-700 dark:text-emerald-300 underline hover:text-emerald-900 dark:hover:text-emerald-100 transition-colors"
            >
              View Demo Fallback
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              title="Refresh Listings from Database"
              className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-100 font-medium transition-colors"
            >
              ↺ Refresh
            </button>
          </div>
        </div>

        {/* Listing Selector Bar (if multiple listings exist) */}
        {listings.length > 1 && (
          <div className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">Select Listing:</span>
              <div className="flex space-x-1">
                {listings.map((l, idx) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      selectedIndex === idx
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300'
                    }`}
                  >
                    #{idx + 1} {l.commodity}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={selectedIndex === listings.length - 1}
                onClick={() => setSelectedIndex((prev) => Math.min(listings.length - 1, prev + 1))}
                className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Main Info */}
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl">🌱</span>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                  {activeListing.title}
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {activeListing.grade}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                    activeListing.status === 'active'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {activeListing.status === 'active' ? 'Active Market Listing' : 'Reserved Listing'}
                </span>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Verified crop listing published directly by farmer/producer. Macro-location verified
                for freight calculation. Private address and exact coordinates are strictly protected
                under zero-knowledge privacy policies.
              </p>

              {/* Metadata Grid: ONLY fields exposed by public.public_produce_listings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                    Commodity & Variety
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {activeListing.commodity} ({activeListing.variety})
                  </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                    Origin Cluster
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {activeListing.farm_district}, {activeListing.farm_state}
                  </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                    Harvest Date
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {activeListing.harvest_date}
                  </span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                    Shelf Life Remaining
                  </span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {activeListing.expected_shelf_life_days} Days (Ambient)
                  </span>
                </div>
              </div>

              {/* Status and Volume Details */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                  Total Harvested: {activeListing.harvest_quantity} {activeListing.quantity_unit} (
                  {activeListing.quantity_in_kg.toLocaleString('en-IN')} kg)
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800/50">
                  Available: {activeListing.available_quantity_kg.toLocaleString('en-IN')} kg
                </span>
                {activeListing.reserved_quantity_kg > 0 && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800/50">
                    Reserved: {activeListing.reserved_quantity_kg.toLocaleString('en-IN')} kg
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[11px] font-mono">
                  Seller Ref: {activeListing.seller_profile_id.slice(0, 8)}...
                </span>
              </div>
            </div>

            {/* Pricing & Units Column */}
            <div className="lg:w-80 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Unit Switcher
                </span>
                <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5 bg-white dark:bg-zinc-900 text-xs">
                  {(['kg', 'quintal', 'tonne'] as WeightUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setSelectedUnit(unit)}
                      className={`px-2 py-1 rounded-md font-medium transition-colors ${
                        selectedUnit === unit
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-medium">
                  Available Batch Volume
                </span>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {formatWeight(liveDisplayQuantity, selectedUnit)}
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {liveAvailableKg.toLocaleString('en-IN')} kg available for purchase
                </span>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-medium">
                  Producer Target Asking Price
                </span>
                {livePricePerUnit != null ? (
                  <>
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(livePricePerUnit)}{' '}
                      <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">
                        / {selectedUnit}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Base asking rate: ₹{activeListing.target_price_per_kg} / kg
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 py-1">
                    Open to Buyer Bidding / Negotiation
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onLoadListingDefaults({
                    quantity:
                      activeListing.available_quantity_kg > 0
                        ? activeListing.available_quantity_kg
                        : activeListing.quantity_in_kg,
                    quantityUnit: 'kg',
                    pricePerUnit: activeListing.target_price_per_kg ?? 25.0,
                    priceUnit: 'kg',
                  })
                }
                className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <span>↺</span>
                <span>Load Live Batch into Calculator</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // EXPLICIT DEMO FALLBACK VIEW
  // Shown when database returns 0 rows, error occurs, or user switches to demo
  // --------------------------------------------------------------------------
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden mb-6">
      {/* Fallback Notice Bar */}
      <div className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wider text-[11px]">
            {error
              ? 'Database Connection Fallback'
              : listings.length === 0
              ? 'Database Notice: No Active Listings in Supabase'
              : 'Viewing Illustrative Demo Data'}
          </span>
          <span className="text-amber-800/80 dark:text-amber-300/80">
            {error
              ? `(${error} — falling back to offline demo)`
              : listings.length === 0
              ? '(public.public_produce_listings returned 0 rows — displaying offline demo batch)'
              : '(Offline benchmark model)'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {listings.length > 0 && (
            <button
              type="button"
              onClick={() => setViewMode('database')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-800"
            >
              Return to Database ({listings.length} live)
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            className="px-2 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 text-[11px] font-medium transition-colors"
          >
            ↺ Re-check Database
          </button>
        </div>
      </div>

      {/* Demo Batch Warning Label */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-900/40 px-4 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
        <div className="flex items-center space-x-2">
          <span className="font-semibold uppercase tracking-wider bg-amber-200 dark:bg-amber-900/80 px-2 py-0.5 rounded text-[11px]">
            Illustrative Demo Produce Batch (Fallback Demo Data)
          </span>
          <span className="text-zinc-600 dark:text-zinc-400">
            Benchmark figures are simulated models. No external APMC data or live API is connected.
          </span>
        </div>
        <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400">
          ID: {demoListing.id}
        </span>
      </div>

      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Main Info */}
          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl">🍅</span>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {demoListing.title}
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {demoListing.grade}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Offline Demo Batch
              </span>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {demoListing.description}
            </p>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                  Commodity & Variety
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {demoListing.commodity} ({demoListing.variety})
                </span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                  Origin Cluster
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {demoListing.harvestLocation}
                </span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                  Harvest Date
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {demoListing.harvestDate}
                </span>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 block font-medium">
                  Shelf Life Remaining
                </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {demoListing.expectedShelfLifeDays} Days (Ambient)
                </span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {demoListing.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Pricing & Units Column */}
          <div className="lg:w-80 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Unit Switcher
              </span>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5 bg-white dark:bg-zinc-900 text-xs">
                {(['kg', 'quintal', 'tonne'] as WeightUnit[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setSelectedUnit(unit)}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${
                      selectedUnit === unit
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-medium">
                Harvest Volume
              </span>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatWeight(demoDisplayQuantity, selectedUnit)}
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Equivalent to 5,000 kg (50 quintals / 5 tonnes)
              </span>
            </div>

            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-medium">
                Simulated Market Rate (Regional Benchmark)
              </span>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatINR(demoModalPrice)}{' '}
                <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">
                  / {selectedUnit} (Modal)
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Range: {formatINR(demoMinPrice)} - {formatINR(demoMaxPrice)} / {selectedUnit}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onLoadListingDefaults()}
              className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <span>↺</span>
              <span>Load Demo Batch into Calculator</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
