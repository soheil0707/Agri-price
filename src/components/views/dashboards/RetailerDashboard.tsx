'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../../lib/calculator/decimal';

export function RetailerDashboard() {
  const {
    currentPersona,
    listings,
    orders,
    setActiveTab,
  } = useMarketplace();

  // Retailer purchase orders
  const myRetailOrders = orders.filter(
    (o) => o.buyerId === currentPersona.id || o.buyerOrganization.includes('FreshBite') || o.buyerName.includes('Suresh')
  );

  // Premium Grade-A produce suitable for supermarket shelves
  const premiumShelfListings = listings.filter((l) => l.grade === 'Grade-A (Export / Premium)');

  // Supermarket Fresh Categories Restocking Needs
  const categoryRestocking = [
    {
      category: 'Fresh Salad & Cooking Vegetables',
      targetWeeklyKg: 8000,
      deliveredKg: 6200,
      fillRate: 77.5,
      criticalCrops: 'Tomato, Capsicum, Onion',
      status: 'Restocking On Track',
    },
    {
      category: 'Sub-Tropical Orchard Fruits',
      targetWeeklyKg: 5000,
      deliveredKg: 4400,
      fillRate: 88.0,
      criticalCrops: 'Cavendish Banana, Grapes',
      status: 'High Shelf Freshness',
    },
    {
      category: 'Root Vegetables & Staples',
      targetWeeklyKg: 10000,
      deliveredKg: 7500,
      fillRate: 75.0,
      criticalCrops: 'Potato, Onion, Ginger',
      status: 'In Transit',
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-retailer">
      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-teal-700 via-emerald-800 to-zinc-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          🏪
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Supermarket Category Buyer Hub</span>
            <span>•</span>
            <span className="text-emerald-200">{currentPersona.organization}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Retail Produce Procurement &amp; Shelf Replenishment
          </h2>
          <p className="text-sm text-emerald-100 mt-2 leading-relaxed">
            Source 100% Grade-A harvest lots directly from certified FPOs, guarantee farmgate-to-shelf traceability, replenish supermarket hypermarket distribution centers, and monitor scheduled dock delivery arrivals.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-teal-900 hover:bg-emerald-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🛒</span>
              <span>Source Grade-A Lots ({premiumShelfListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-900/90 hover:bg-emerald-900 text-white border border-emerald-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🚚</span>
              <span>Track Hypermarket Deliveries ({myRetailOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-900/80 hover:bg-zinc-900 text-emerald-200 border border-zinc-700 transition-all cursor-pointer"
            >
              🤝 Direct Farmer Contracts
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Weekly Sourcing Volume */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Weekly Sourcing Volume</span>
            <span className="text-lg">🛒</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            18,100 <span className="text-sm font-normal text-zinc-500 font-sans">kg</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
            Across fresh vegetable &amp; fruit categories
          </div>
        </div>

        {/* Card 2: On-Time Delivery Rate */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">On-Time Dock Arrival</span>
            <span className="text-lg">⏱️</span>
          </div>
          <div className="text-2xl font-black text-teal-700 dark:text-teal-400 mt-2 font-mono">
            98.4%
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Reefer trucks arriving within delivery windows
          </div>
        </div>

        {/* Card 3: Grade-A Acceptance Rate */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Quality Acceptance Rate</span>
            <span className="text-lg">✅</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            99.1%
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 font-semibold">
            Pre-calibrated farmgate inspection pass (Demo)
          </div>
        </div>

        {/* Card 4: Active Retail Orders */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Active Store Deliveries</span>
            <span className="text-lg">🚚</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {myRetailOrders.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">orders</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Settled &amp; in transit</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>
      </div>

      {/* Supermarket Category Restocking Board */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>📋</span>
              <span>Supermarket Fresh Category Restocking &amp; Fill Rates</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Weekly procurement quotas, critical crop inventory, and shelf replenishment
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
            Weekly Cycle: Week 42
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {categoryRestocking.map((cat) => (
            <div
              key={cat.category}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
            >
              <div className="flex items-start justify-between">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{cat.category}</h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {cat.status}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Delivered: {cat.deliveredKg.toLocaleString('en-IN')} kg</span>
                  <span>Quota: {cat.targetWeeklyKg.toLocaleString('en-IN')} kg</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-600 h-full rounded-full"
                    style={{ width: `${cat.fillRate}%` }}
                  />
                </div>
              </div>

              <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Key Commodities: </span>
                {cat.criticalCrops}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className="w-full py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer"
              >
                Source Category Lots →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Grade-A Farmgate Listings & Hypermarket Deliveries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Grade-A Produce Listings */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>🛒</span>
                <span>Verified Grade-A Farmgate Lots (Retail Ready)</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Premium harvest lots with verified farmer credentials and harvest dates
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              View All ({listings.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {premiumShelfListings.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-3xl">{item.emoji}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{item.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {item.grade}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        FPO / Grower: {item.sellerName} • {item.sellerDistrict}, {item.sellerState}
                      </div>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-sm text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 px-2.5 py-1 rounded-lg">
                    ₹{item.targetPricePerKg}/kg
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Available</span>
                    <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">
                      {item.availableQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Harvest Date</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{item.harvestDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Freshness Window</span>
                    <span className="font-bold text-emerald-600">{item.expectedShelfLifeDays} Days Shelf Life</span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('offers')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    Place Direct Retail Order →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Inbound Hypermarket Deliveries & Settlements */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>🚚</span>
                  <span>Hypermarket Inbound Shipments</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Live tracking of store distribution dock deliveries
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
              >
                All Orders →
              </button>
            </div>

            <div className="space-y-2.5">
              {myRetailOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{ord.orderNumber}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        ord.escrowStatus === 'cancelled'
                          ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {ord.escrowStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>
                      {ord.commodity} ({ord.variety}) • {ord.lockedQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {formatINR(ord.totalAgreedAmount)}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between">
                    <span>
                      Delivery Status:{' '}
                      {ord.escrowStatus === 'cancelled'
                        ? 'Cancelled — No Delivery'
                        : ord.escrowStatus === 'settled' || ord.escrowStatus === 'delivered_inspected'
                        ? ord.deliveredAt ? `Delivered: ${ord.deliveredAt}` : 'Delivered & Accepted'
                        : ord.escrowStatus === 'in_transit'
                        ? 'In Transit — Scheduled Today'
                        : 'Awaiting Escrow Deposit'}
                    </span>
                    <span>Store: FreshBite Hub Mysuru</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Farm-to-Shelf Traceability Guarantee */}
          <div className="p-4 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5">
              <span>🏷️</span>
              <span>Farm-to-Shelf Consumer Traceability</span>
            </div>
            <p className="text-[11px] text-teal-800/90 dark:text-teal-300/90 leading-relaxed">
              Every retail batch sourced through AgriPrice includes digital batch origin QR codes showing farmer harvest origin, cold storage milestones, and zero chemical pesticide residue test results for retail consumers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
