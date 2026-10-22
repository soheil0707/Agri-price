'use client';

import React from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../lib/calculator/decimal';
import type { CalculationInput } from '../../lib/calculator/types';
import type { MarketplaceProduceItem } from '../../lib/marketplace/types';

interface InventoryViewProps {
  onOpenNewListingModal: () => void;
  onLoadListingIntoCalculator: (customInput?: Partial<CalculationInput>) => void;
}

export function InventoryView({
  onOpenNewListingModal,
  onLoadListingIntoCalculator,
}: InventoryViewProps) {
  const { listings, offers, currentPersona, setActiveTab } = useMarketplace();

  // Filter listings published by or attributed to the current farmer
  // In demo mode or if farmer persona is active, show the listings
  const farmerListings =
    currentPersona.role === 'farmer'
      ? listings.filter((l) => l.sellerId === currentPersona.id || l.sellerName.includes(currentPersona.name) || !l.isLiveDatabaseListing)
      : listings;

  const totalHarvestKg = farmerListings.reduce((sum, l) => sum + l.totalQuantityKg, 0);
  const totalReservedKg = farmerListings.reduce((sum, l) => sum + l.reservedQuantityKg, 0);
  const totalAvailableKg = farmerListings.reduce((sum, l) => sum + l.availableQuantityKg, 0);

  const handleOpenCalc = (item: MarketplaceProduceItem) => {
    onLoadListingIntoCalculator({
      quantity: item.availableQuantityKg > 0 ? item.availableQuantityKg : item.totalQuantityKg,
      quantityUnit: 'kg',
      pricePerUnit: item.targetPricePerKg,
      priceUnit: 'kg',
    });
    setActiveTab('calculator');
  };

  return (
    <div className="space-y-6">
      {/* Demo Data Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3">
        <span className="text-xl mt-0.5">ℹ️</span>
        <div className="space-y-1">
          <div className="font-bold flex items-center space-x-2">
            <span>Demonstration Inventory Lots</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
              In-Memory Demonstration
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            The items below represent prototype harvest lots. Under database schema v5, publishing live records to Supabase <code>produce_listings</code> requires an authenticated account with an assigned <code>farmer</code> or <code>fpo_admin</code> role.
          </p>
        </div>
      </div>

      {/* Top Banner and Summary */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            {currentPersona.role === 'farmer' ? 'My Produce & Farm Inventory' : 'Producer Inventory Stock'}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Real-time batch stock tracking, reserve allocations, and harvest shelf life status
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewListingModal}
          className="self-start sm:self-auto px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center space-x-1.5"
        >
          <span>+</span>
          <span>Publish New Listing</span>
        </button>
      </div>

      {/* Stock Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Total Harvest Stock</span>
          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
            {totalHarvestKg.toLocaleString('en-IN')} kg
          </span>
          <span className="text-[11px] text-zinc-400">Across {farmerListings.length} tracked produce batches</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Available for Bidding</span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {totalAvailableKg.toLocaleString('en-IN')} kg
          </span>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Open on public marketplace view</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Locked in Contract Escrow</span>
          <span className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
            {totalReservedKg.toLocaleString('en-IN')} kg
          </span>
          <span className="text-[11px] text-amber-700 dark:text-amber-400">Reserved against buyer accepted offers</span>
        </div>
      </div>

      {/* Produce Batches Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
            Active Farm Lots & Allocation Status
          </h3>
          <span className="text-xs text-zinc-500">
            Showing {farmerListings.length} lots
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Commodity & Variety</th>
                <th className="py-3 px-4 font-semibold">Grade</th>
                <th className="py-3 px-4 font-semibold">Data Origin</th>
                <th className="py-3 px-4 font-semibold">Total / Available / Reserved</th>
                <th className="py-3 px-4 font-semibold">Target Price</th>
                <th className="py-3 px-4 font-semibold">Shelf Life</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {farmerListings.map((item) => {
                const itemOffers = offers.filter((o) => o.listingId === item.id);
                const isUrgent = item.expectedShelfLifeDays <= 5;

                return (
                  <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{item.emoji}</span>
                        <div>
                          <div className="font-bold text-zinc-900 dark:text-zinc-100">
                            {item.commodity}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {item.variety} • {item.sellerDistrict}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {item.grade}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.isLiveDatabaseListing ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                          Live DB
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                          Demo Batch
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">
                        {item.availableQuantityKg.toLocaleString('en-IN')} kg available
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        Total: {item.totalQuantityKg.toLocaleString('en-IN')} kg | Reserved: {item.reservedQuantityKg.toLocaleString('en-IN')} kg
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(item.targetPricePerKg)} / kg
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          isUrgent
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {item.expectedShelfLifeDays} Days
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'active'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenCalc(item)}
                        className="py-1 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 text-zinc-700 dark:text-zinc-300"
                        title="Model in Net Proceeds Calculator"
                      >
                        🧮 Model
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('offers')}
                        className="py-1 px-2.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 hover:bg-emerald-100"
                      >
                        Offers ({itemOffers.length})
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
