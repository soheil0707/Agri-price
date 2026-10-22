'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { MakeOfferModal } from '../offers/MakeOfferModal';
import { formatINR, formatWeight } from '../../lib/calculator/decimal';
import type { MarketplaceProduceItem } from '../../lib/marketplace/types';
import type { CalculationInput } from '../../lib/calculator/types';

interface MarketplaceViewProps {
  onLoadListingIntoCalculator: (customInput?: Partial<CalculationInput>) => void;
}

export function MarketplaceView({ onLoadListingIntoCalculator }: MarketplaceViewProps) {
  const {
    listings,
    isLoadingListings,
    refreshListings,
    setActiveTab,
    databaseListingCount,
    isRealDatabaseConnected,
  } = useMarketplace();

  const [selectedCommodity, setSelectedCommodity] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeOfferListing, setActiveOfferListing] = useState<MarketplaceProduceItem | null>(null);

  // Filter listings
  const filteredListings = listings.filter((item) => {
    if (selectedCommodity !== 'all' && item.commodity.toLowerCase() !== selectedCommodity.toLowerCase()) {
      return false;
    }
    if (selectedGrade !== 'all' && !item.grade.includes(selectedGrade)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCommodity = item.commodity.toLowerCase().includes(q);
      const matchDistrict = item.sellerDistrict.toLowerCase().includes(q);
      const matchVariety = item.variety.toLowerCase().includes(q);
      if (!matchTitle && !matchCommodity && !matchDistrict && !matchVariety) {
        return false;
      }
    }
    return true;
  });

  const handleOpenCalculator = (item: MarketplaceProduceItem) => {
    onLoadListingIntoCalculator({
      quantity: item.availableQuantityKg > 0 ? item.availableQuantityKg : item.totalQuantityKg,
      quantityUnit: 'kg',
      pricePerUnit: item.targetPricePerKg,
      priceUnit: 'kg',
    });
    setActiveTab('calculator');
  };

  return (
    <>
      <MakeOfferModal
        listing={activeOfferListing}
        isOpen={Boolean(activeOfferListing)}
        onClose={() => setActiveOfferListing(null)}
      />

      <div className="space-y-6">
        {/* Supabase 0-Rows Notice Banner */}
        {databaseListingCount === 0 && (
          <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3">
            <span className="text-xl mt-0.5">ℹ️</span>
            <div className="space-y-1">
              <div className="font-bold flex items-center space-x-2">
                <span>Demonstration Listings Active (0 Live Database Rows)</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-bold">
                  {isRealDatabaseConnected ? 'Supabase connected · 0 live listings · Demo data shown' : 'Local simulation fallback'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                The read-only query to Supabase view <code>public.public_produce_listings</code> returned <strong>0 published records</strong>. The produce lots displayed below are clearly labeled <strong>Demo Prototype Data</strong> for testing interface workflows, offer negotiation, and calculator integration.
              </p>
            </div>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                Explore Farmgate Produce Listings
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Direct procurement from verified growers and FPOs with zero middlemen markups
              </p>
            </div>
            <button
              type="button"
              onClick={refreshListings}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              ↺ Refresh Listings
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {/* Search Input */}
            <div className="sm:col-span-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by commodity, variety, or district (e.g. Tomato, Kolar, Shivam)..."
                className="w-full py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Commodity Filter */}
            <div>
              <select
                value={selectedCommodity}
                onChange={(e) => setSelectedCommodity(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All Commodities</option>
                <option value="tomato">🍅 Tomato</option>
                <option value="onion">🧅 Onion</option>
                <option value="potato">🥔 Potato</option>
                <option value="banana">🍌 Banana</option>
                <option value="chilli">🌶️ Chilli</option>
              </select>
            </div>

            {/* Grade Filter */}
            <div>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All Quality Grades</option>
                <option value="Grade-A">Grade-A (Export/Premium)</option>
                <option value="Grade-B">Grade-B (Commercial)</option>
                <option value="Grade-C">Grade-C (Processing)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Listings Grid */}
        {isLoadingListings ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <span className="text-4xl">🌾</span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-2">
              No matching produce listings found
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Try adjusting your search criteria or clear the filters to view available farm listings.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCommodity('all');
                setSelectedGrade('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Card Top Banner */}
                <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs bg-zinc-50/50 dark:bg-zinc-800/40">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-lg">{item.emoji}</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {item.commodity}
                    </span>
                    <span className="text-zinc-400">({item.variety})</span>
                  </div>

                  {item.isLiveDatabaseListing ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      Live DB Record
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      Demo Prototype Data
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                      {item.title}
                    </h3>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center space-x-1">
                      <span>📍</span>
                      <span>
                        {item.sellerDistrict}, {item.sellerState}
                      </span>
                      <span>•</span>
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        {item.sellerName}
                      </span>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {item.grade}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold ${
                        item.expectedShelfLifeDays <= 5
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      ⏱ {item.expectedShelfLifeDays}d shelf life
                    </span>
                  </div>

                  {/* Volume and Asking Price */}
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Available Volume</span>
                      <span className={`font-black text-sm ${item.availableQuantityKg <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {formatWeight(item.availableQuantityKg, 'kg')}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">
                        Total lot: {item.totalQuantityKg.toLocaleString('en-IN')} kg
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Asking Target Price</span>
                      <span className="font-black text-emerald-700 dark:text-emerald-400 text-sm font-mono">
                        {formatINR(item.targetPricePerKg)}{' '}
                        <span className="text-[10px] font-normal text-zinc-500">/ kg</span>
                      </span>
                      <span className="text-[10px] text-zinc-400 block">
                        ₹{(item.targetPricePerKg * 100).toFixed(0)} / quintal
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/40 flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={item.availableQuantityKg <= 0}
                    onClick={() => setActiveOfferListing(item)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center space-x-1 ${
                      item.availableQuantityKg <= 0
                        ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <span>{item.availableQuantityKg <= 0 ? '🚫' : '🤝'}</span>
                    <span>{item.availableQuantityKg <= 0 ? 'Zero Stock (No Offers)' : 'Make Offer'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCalculator(item)}
                    title="Load into Net Proceeds Calculator"
                    className="py-2 px-3 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-700 dark:text-zinc-200 transition-colors"
                  >
                    🧮 Model
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
