'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';

export function TraderDashboard() {
  const {
    currentPersona,
    listings,
    offers,
    setActiveTab,
  } = useMarketplace();

  // Trader specific metrics
  const myTraderOffers = offers.filter(
    (o) => o.buyerId === currentPersona.id || o.buyerOrganization.includes('Lalwani') || o.buyerName.includes('Gopal')
  );

  // Available high-volume lots ready for wholesale aggregation
  const wholesaleLots = listings.filter((l) => l.totalQuantityKg >= 3000);

  // Regional Mandi Price Spreads for Arbitrage
  const mandiArbitragePairs = [
    {
      commodity: 'Tomato',
      farmgateDistrict: 'Kolar APMC (Origin)',
      farmgatePrice: 28.0,
      terminalMandi: 'Yeshwanthpur Wholesale (Bengaluru)',
      terminalPrice: 34.0,
      transportFreightPerKg: 2.2,
      netArbitrageMarginPerKg: 3.8, // 34 - 28 - 2.2 = 3.8
      estimatedLotSizeKg: 5000,
      marginPercent: 13.6,
    },
    {
      commodity: 'Onion',
      farmgateDistrict: 'Bagalkot APMC (Origin)',
      farmgatePrice: 34.5,
      terminalMandi: 'K.R. Market Terminal (Bengaluru)',
      terminalPrice: 42.0,
      transportFreightPerKg: 3.0,
      netArbitrageMarginPerKg: 4.5, // 42 - 34.5 - 3 = 4.5
      estimatedLotSizeKg: 10000,
      marginPercent: 13.0,
    },
    {
      commodity: 'Potato',
      farmgateDistrict: 'Hassan APMC (Origin)',
      farmgatePrice: 22.5,
      terminalMandi: 'Mysuru Bandipalya Market',
      terminalPrice: 28.0,
      transportFreightPerKg: 1.8,
      netArbitrageMarginPerKg: 3.7, // 28 - 22.5 - 1.8 = 3.7
      estimatedLotSizeKg: 8000,
      marginPercent: 16.4,
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-trader">
      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-700 to-stone-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          🏢
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Wholesale Mandi Commission &amp; Trading Hub</span>
            <span>•</span>
            <span className="text-amber-200">{currentPersona.organization}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Wholesale Consignment &amp; Mandi Arbitrage Terminal
          </h2>
          <p className="text-sm text-amber-100 mt-2 leading-relaxed">
            Scan real-time APMC price differentials across primary farmgate yards and terminal mandis, secure bulk lots directly from growers, manage bilateral counter-bids, and orchestrate rapid mandi consignments.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('prices')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-stone-900 hover:bg-amber-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>📈</span>
              <span>APMC Price Arbitrage Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-900/90 hover:bg-amber-900 text-white border border-amber-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🛒</span>
              <span>Available Bulk Lots ({wholesaleLots.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-900/90 hover:bg-amber-900 text-white border border-amber-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🤝</span>
              <span>Trading Book &amp; Counter-Bids ({myTraderOffers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-stone-900/80 hover:bg-stone-900 text-amber-200 border border-stone-700 transition-all cursor-pointer"
            >
              🧮 Model Trading Margin
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Daily Trading Volume */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Trading Turnover (Simulated)</span>
            <span className="text-lg">💰</span>
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-2 font-mono">
            ₹4,85,000
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
            <span>Commission Book (+14.2%)</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>

        {/* Card 2: Active APMC Spreads */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">APMC Price Spreads Tracked</span>
            <span className="text-lg">📈</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {mandiArbitragePairs.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">active routes</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            Avg net margin: ₹4.00/kg across corridors
          </div>
        </div>

        {/* Card 3: Available Bulk Lots */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Wholesale Batches</span>
            <span className="text-lg">📦</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {wholesaleLots.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">bulk lots</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            &gt;= 3,000 kg lots ready for mandi bidding
          </div>
        </div>

        {/* Card 4: Open Trade Offers */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Bilateral Trade Book</span>
            <span className="text-lg">🤝</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {myTraderOffers.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">offers placed</span>
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Includes active farmer counter-proposals
          </div>
        </div>
      </div>

      {/* APMC Regional Arbitrage Matrix */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>⚡</span>
              <span>Regional APMC Arbitrage Matrix (Farmgate vs Terminal Mandi)</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Net margin realization after factoring freight, loading, and market yard handling fees
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
            Simulated Trade Intelligence
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mandiArbitragePairs.map((pair) => (
            <div
              key={pair.commodity}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{pair.commodity}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  +{pair.marginPercent}% Net Spread
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <span>Farmgate Origin:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">₹{pair.farmgatePrice.toFixed(2)}/kg</span>
                </div>
                <div className="text-[10px] text-zinc-400">{pair.farmgateDistrict}</div>

                <div className="flex justify-between text-zinc-500 pt-1">
                  <span>Terminal Mandi:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">₹{pair.terminalPrice.toFixed(2)}/kg</span>
                </div>
                <div className="text-[10px] text-zinc-400">{pair.terminalMandi}</div>

                <div className="flex justify-between text-zinc-500 pt-1">
                  <span>Est. Freight &amp; Handling:</span>
                  <span className="font-bold text-zinc-600 dark:text-zinc-400">-₹{pair.transportFreightPerKg.toFixed(2)}/kg</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs">
                <span className="font-bold text-amber-900 dark:text-amber-200">Net Profit Spread:</span>
                <span className="font-black font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                  +₹{pair.netArbitrageMarginPerKg.toFixed(2)}/kg
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className="w-full py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
              >
                Bid on Available {pair.commodity} Lots →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Available High-Volume Produce & Active Bilateral Bids */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: High-Volume Produce Lots */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>📦</span>
                <span>High-Volume Farmgate Batches Ready for Mandi Aggregation</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Bulk lots directly from farmer producer organizations (FPOs)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
            >
              Explore All Batches →
            </button>
          </div>

          <div className="space-y-3">
            {wholesaleLots.map((item) => (
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
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {item.grade}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Seller: {item.sellerName} • {item.sellerDistrict}, {item.sellerState}
                      </div>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-lg">
                    Target: ₹{item.targetPricePerKg}/kg
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Available Quantity</span>
                    <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">
                      {item.availableQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Harvest Date</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{item.harvestDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Mandi Arbitrage</span>
                    <span className="font-bold text-emerald-600">High Spread Potential</span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('offers')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    Place Wholesale Bid →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Bilateral Negotiation Book & Consignment Activity */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>🤝</span>
                  <span>Bilateral Negotiation Book</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Offers submitted to farmers with counter-proposals
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('offers')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                All Offers →
              </button>
            </div>

            <div className="space-y-2.5">
              {myTraderOffers.map((off) => (
                <div
                  key={off.id}
                  className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{off.sellerName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {off.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>Offered: ₹{off.offeredPricePerKg}/kg ({off.offeredQuantityKg.toLocaleString('en-IN')} kg)</span>
                    {off.counterPricePerKg && (
                      <span className="font-bold text-rose-600">Counter: ₹{off.counterPricePerKg}/kg</span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 italic bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                    &quot;{off.notes}&quot;
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mandi Consignment Escrow Protection Notice */}
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5">
              <span>🛡️</span>
              <span>APMC Yard Mandi License &amp; Escrow Guarantee</span>
            </div>
            <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              Consignment trades executed via AgriPrice secure both the grower and commission agent with verified gate pass generation and instant bank-to-bank electronic settlement upon weighbridge clearance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
