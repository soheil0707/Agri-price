'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../../lib/calculator/decimal';

export function ConsumerDashboard() {
  const {
    currentPersona,
    listings,
    setActiveTab,
  } = useMarketplace();

  // Selected quantity state for quick consumer order simulation
  const [selectedKg, setSelectedKg] = useState<Record<string, number>>({
    'PROD-LIST-TOM-01': 10,
    'PROD-LIST-ONI-02': 15,
    'PROD-LIST-BAN-04': 5,
  });

  // Nearby farmgate produce within regional proximity
  const nearbyListings = listings.filter((l) => l.availableQuantityKg > 0);

  // Price Transparency Comparison Model
  const transparencyComparisons = [
    {
      commodity: 'Field Tomatoes',
      farmerDirectPrice: 28.0,
      supermarketRetailPrice: 44.0,
      consumerSavingsPercent: 36.4,
      farmerSharePercent: 82, // 82% of money goes to farmer vs ~35% in conventional mandi chain
    },
    {
      commodity: 'Nashik Red Onions',
      farmerDirectPrice: 34.5,
      supermarketRetailPrice: 52.0,
      consumerSavingsPercent: 33.7,
      farmerSharePercent: 80,
    },
    {
      commodity: 'Cavendish Bananas',
      farmerDirectPrice: 18.5,
      supermarketRetailPrice: 32.0,
      consumerSavingsPercent: 42.2,
      farmerSharePercent: 78,
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-consumer">
      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-green-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          🛒
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Direct Consumer &amp; Housing Collective Hub</span>
            <span>•</span>
            <span className="text-emerald-200">{currentPersona.organization}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Direct Farm-to-Fork Harvests &amp; Fair-Trade Savings
          </h2>
          <p className="text-sm text-emerald-100 mt-2 leading-relaxed">
            Order fresh, unadulterated produce directly from regional farmer producer organizations (FPOs). Cut out 5 layers of wholesale middlemen, ensure farmers receive up to 82% of retail spend, and enjoy harvest delivered within 24 hours.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-emerald-950 hover:bg-emerald-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🛒</span>
              <span>Explore Nearby Farm Harvests ({nearbyListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-900/90 hover:bg-emerald-900 text-white border border-emerald-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🚚</span>
              <span>Track Society Deliveries</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('prices')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-green-950/80 hover:bg-green-950 text-emerald-200 border border-green-800 transition-all cursor-pointer"
            >
              📈 Price Transparency Engine
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Consumer Savings */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Middleman Markups Saved</span>
            <span className="text-lg">💰</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            35.8% avg
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Vs supermarket retail rates</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>

        {/* Card 2: Freshness Window */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Harvest Freshness</span>
            <span className="text-lg">🌿</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            &lt; 24 hrs
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
            Harvested and dispatched same-day from Kolar
          </div>
        </div>

        {/* Card 3: Farmer Share */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Direct Farmer Proceeds</span>
            <span className="text-lg">🤝</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            80.5%
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            vs ~30-35% in conventional mandi supply chains
          </div>
        </div>

        {/* Card 4: Society Orders */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Society Collective Orders</span>
            <span className="text-lg">👥</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            18 Families
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Pooled in Whitefield Green collective
          </div>
        </div>
      </div>

      {/* Price Transparency & Fair Share Breakdown */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>⚖️</span>
              <span>Price Transparency: Farmgate Direct vs Supermarket Markup</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Every rupee accounted for: zero undisclosed middlemen markups
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
            Fair Trade Demo Benchmark
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {transparencyComparisons.map((item) => (
            <div
              key={item.commodity}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{item.commodity}</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Save {item.consumerSavingsPercent}%
                </span>
              </div>

              <div className="space-y-1.5 text-xs py-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">AgriPrice Direct Farmgate:</span>
                  <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                    ₹{item.farmerDirectPrice.toFixed(2)}/kg
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Supermarket Retail Price:</span>
                  <span className="line-through font-mono text-zinc-400">
                    ₹{item.supermarketRetailPrice.toFixed(2)}/kg
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50">
                <div className="flex justify-between text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Farmer Share of Spend:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{item.farmerSharePercent}%</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full"
                    style={{ width: `${item.farmerSharePercent}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Produce Discovery & Interactive Household Quantity Selection */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>🌾</span>
              <span>Direct Harvest Discovery &amp; Household / Collective Quantity Selection</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Select desired kg for your family or pooled apartment delivery
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('marketplace')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            All Produce Listings →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {nearbyListings.slice(0, 3).map((item) => {
            const currentQty = selectedKg[item.id] || 5;
            const subtotal = currentQty * item.targetPricePerKg;

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-3xl">{item.emoji}</span>
                    <div>
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{item.title}</h4>
                      <div className="text-[11px] text-zinc-500">
                        {item.sellerDistrict}, {item.sellerState}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400">
                    ₹{item.targetPricePerKg}/kg
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/50 dark:border-zinc-700/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-medium">Select Quantity:</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-zinc-100">{currentQty} kg</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {[5, 10, 20, 50].map((kg) => (
                      <button
                        key={kg}
                        type="button"
                        onClick={() => setSelectedKg({ ...selectedKg, [item.id]: kg })}
                        className={`flex-1 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          currentQty === kg
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200'
                        }`}
                      >
                        {kg} kg
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Estimated Total:</span>
                    <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                      {formatINR(subtotal)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  Join Society Order ({currentQty} kg) →
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
