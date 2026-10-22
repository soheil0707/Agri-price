'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../../lib/calculator/decimal';

interface DashboardProps {
  onOpenNewListingModal: () => void;
}

export function FarmerDashboard({ onOpenNewListingModal }: DashboardProps) {
  const {
    currentPersona,
    listings,
    offers,
    orders,
    payments,
    marketPrices,
    setActiveTab,
  } = useMarketplace();

  // Farmer specific filtering
  const farmerListings = listings.filter(
    (l) => l.sellerId === currentPersona.id || l.sellerName.includes('Ramesh') || l.sellerName.includes('Farmer')
  );
  const activeListings = farmerListings.length > 0 ? farmerListings : listings.slice(0, 2);
  const totalHarvestKg = activeListings.reduce((sum, l) => sum + l.totalQuantityKg, 0);
  const availableHarvestKg = activeListings.reduce((sum, l) => sum + l.availableQuantityKg, 0);
  const reservedHarvestKg = activeListings.reduce((sum, l) => sum + l.reservedQuantityKg, 0);

  const farmerOffers = offers.filter(
    (o) => o.sellerId === currentPersona.id || o.sellerName.includes('Ramesh') || o.sellerName.includes('Kolar')
  );
  const pendingBuyerOffers = farmerOffers.filter((o) => o.status === 'pending');

  const isCurrentFarmerOrder = (o: (typeof orders)[number]) =>
    o.sellerId === currentPersona.id ||
    o.sellerName.toLowerCase().includes(currentPersona.name.toLowerCase().split(' ')[0]) ||
    (currentPersona.role === 'farmer' && o.sellerDistrict.toLowerCase() === currentPersona.district.toLowerCase());

  const upcomingPickups = orders.filter(
    (o) =>
      isCurrentFarmerOrder(o) &&
      (o.escrowStatus === 'escrow_funded' || o.escrowStatus === 'in_transit')
  );

  const settledProceeds = payments
    .filter((p) => {
      const relatedOrder = orders.find((o) => o.id === p.orderId || o.orderNumber === p.orderNumber);
      if (relatedOrder && relatedOrder.escrowStatus === 'cancelled') return false;
      return p.eventType === 'farmer_proceeds_settled' || p.eventType === 'dispatch_advance_released';
    })
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6" data-testid="dashboard-farmer">
      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          👨‍🌾
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Producer &amp; Farmer Dashboard</span>
            <span>•</span>
            <span className="text-emerald-200">{currentPersona.organization}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Harvest Operations &amp; Net Proceeds Hub
          </h2>
          <p className="text-sm text-emerald-100 mt-2 leading-relaxed">
            Manage your farmgate harvest lots, compare buyer offers directly against APMC mandi rates, protect margins with the deterministic net proceeds engine, and coordinate verified transport pickups.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={onOpenNewListingModal}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-emerald-900 hover:bg-emerald-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>+</span>
              <span>Post Produce Lot</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-800/90 hover:bg-emerald-800 text-white border border-emerald-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🧮</span>
              <span>Net Proceeds Calculator</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-800/90 hover:bg-emerald-800 text-white border border-emerald-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🤝</span>
              <span>Review Buyer Offers ({pendingBuyerOffers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-900/60 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/50 transition-all cursor-pointer"
            >
              📦 My Farm Inventory
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Available Harvest Inventory */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Available Harvest Volume</span>
            <span className="text-lg">🌾</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {availableHarvestKg.toLocaleString('en-IN')}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">kg</span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
            <span>Total Harvest: {totalHarvestKg.toLocaleString('en-IN')} kg</span>
            <span className="text-amber-600 font-medium">{reservedHarvestKg.toLocaleString('en-IN')} kg reserved</span>
          </div>
        </div>

        {/* Card 2: Inbound Buyer Bids */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Buyer Bids &amp; Offers</span>
            <span className="text-lg">🤝</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {pendingBuyerOffers.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">pending</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            {farmerOffers.length} total offers received in demo session
          </div>
        </div>

        {/* Card 3: Upcoming Pickups */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Upcoming Pickups</span>
            <span className="text-lg">🚚</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {upcomingPickups.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">dispatches</span>
          </div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
            Coordinated with verified cold chain transporters
          </div>
        </div>

        {/* Card 4: Settled Net Proceeds */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Realized Net Proceeds</span>
            <span className="text-lg">💳</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            {formatINR(settledProceeds)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Simulated Escrow Sandbox</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>
      </div>

      {/* APMC Regional Price Benchmarks for Farmer's Crops */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">📈</span>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Regional Mandi Rates &amp; Target Price Spread
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              Simulated APMC Feed
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('prices')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            Compare All APMC Mandis →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {marketPrices.slice(0, 5).map((p) => (
            <div
              key={p.commodity}
              className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{p.commodity}</span>
                <span
                  className={`text-[10px] font-bold ${
                    p.trend === 'up'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : p.trend === 'down'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-zinc-500'
                  }`}
                >
                  {p.trend === 'up' ? '▲' : p.trend === 'down' ? '▼' : '●'} {p.dayChangePercent > 0 ? `+${p.dayChangePercent}%` : `${p.dayChangePercent}%`}
                </span>
              </div>
              <div className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">
                ₹{p.modalPricePerKg.toFixed(2)}{' '}
                <span className="text-[10px] font-normal text-zinc-500 font-sans">/ kg</span>
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {p.marketCenter}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Active Farmgate Lots & Buyer Offers / Upcoming Pickups */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Farmgate Lots & Shelf-Life Watch */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>📦</span>
                <span>Active Farmgate Harvest Lots &amp; Shelf Life Watch</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Field inventory monitoring, reserve allocations, and shelf-life urgency
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Full Inventory ({activeListings.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {activeListings.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
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
                        Harvested on {item.harvestDate} • {item.sellerDistrict}, {item.sellerState}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    Target: ₹{item.targetPricePerKg}/kg
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Total Harvest</span>
                    <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">
                      {item.totalQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Available Now</span>
                    <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      {item.availableQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Shelf Life Watch</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      ⏱️ {item.expectedShelfLifeDays} Days Remaining
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('calculator')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer"
                  >
                    🧮 Model Net Proceeds
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('offers')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    Review Bids
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Inbound Buyer Bids & Scheduled Pickups */}
        <div className="lg:col-span-5 space-y-4">
          {/* Pending Buyer Bids */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>🤝</span>
                  <span>Inbound Buyer Bids</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Offers from industrial food processors and wholesalers
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('offers')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                All Offers ({farmerOffers.length}) →
              </button>
            </div>

            <div className="space-y-2.5">
              {farmerOffers.slice(0, 2).map((offer) => (
                <div
                  key={offer.id}
                  className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{offer.buyerOrganization}</span>
                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                      ₹{offer.offeredPricePerKg}/kg
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>Quantity: {offer.offeredQuantityKg.toLocaleString('en-IN')} kg</span>
                    <span className="capitalize px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold text-[10px]">
                      {offer.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 italic bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                    &quot;{offer.notes}&quot;
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Pickups Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>🚚</span>
                  <span>Upcoming Farmgate Pickups</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Scheduled transport fleet and dispatch milestones
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                View Dispatches →
              </button>
            </div>

            <div className="space-y-2.5">
              {upcomingPickups.slice(0, 2).map((order) => (
                <div
                  key={order.id}
                  className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{order.orderNumber}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {order.escrowStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>
                      {order.commodity} • {order.lockedQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(order.totalAgreedAmount)}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                    <span>Transporter: {order.transporterName || 'Fleet KA-07 Assigned'}</span>
                    <span>Pickup: {order.pickupScheduledAt || 'Scheduled Today'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
