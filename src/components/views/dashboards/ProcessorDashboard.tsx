'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../../lib/calculator/decimal';

export function ProcessorDashboard() {
  const {
    currentPersona,
    listings,
    offers,
    orders,
    setActiveTab,
  } = useMarketplace();

  // Processor specific procurement metrics
  const myProcurementOrders = orders.filter(
    (o) => o.buyerId === currentPersona.id || o.buyerOrganization.includes('AgroPure') || o.buyerName.includes('Anita')
  );
  const myOffers = offers.filter(
    (o) => o.buyerId === currentPersona.id || o.buyerOrganization.includes('AgroPure') || o.buyerName.includes('Anita')
  );

  const totalProcuredKg = myProcurementOrders.reduce((sum, o) => sum + o.lockedQuantityKg, 0);
  const totalAgreedSpend = myProcurementOrders.reduce((sum, o) => sum + o.totalAgreedAmount, 0);

  // Available industrial processing grade produce
  const processingGradeListings = listings.filter(
    (l) => l.grade === 'Grade-C (Processing)' || l.commodity === 'Tomato' || l.commodity === 'Potato'
  );

  // Simulated Factory Procurement Requisitions
  const procurementDemands = [
    {
      id: 'REQ-TOM-PULP-01',
      crop: 'Tomato (Hybrid Roma / Shivam)',
      spec: 'Brix >= 4.8%, High Lycopene, Firm Skin',
      requiredKg: 15000,
      fulfilledKg: 5000,
      maxBudgetPerKg: 28.0,
      deadline: '2026-10-24',
      status: 'Procuring Active',
    },
    {
      id: 'REQ-POT-CHIP-02',
      crop: 'Potato (Kufri Chipsona-1)',
      spec: 'High Dry Matter >= 21%, Low Reducing Sugars',
      requiredKg: 20000,
      fulfilledKg: 6000,
      maxBudgetPerKg: 22.0,
      deadline: '2026-10-28',
      status: 'Contract In Transit',
    },
    {
      id: 'REQ-ONI-FLAKE-03',
      crop: 'Onion (White / Dehydrator)',
      spec: 'TSS >= 14%, Export Cured',
      requiredKg: 10000,
      fulfilledKg: 2000,
      maxBudgetPerKg: 35.0,
      deadline: '2026-11-05',
      status: 'Sourcing Open',
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-processor">
      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          🏭
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Food Processor &amp; Industrial Buyer Hub</span>
            <span>•</span>
            <span className="text-blue-200">{currentPersona.organization}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Raw Material Procurement &amp; Factory Sourcing
          </h2>
          <p className="text-sm text-blue-100 mt-2 leading-relaxed">
            Source bulk processing-grade agricultural commodities directly from FPO farmer clusters, compare supplier specifications (Brix, solids, moisture), coordinate farmgate reefer trucks, and track escrow-backed factory intake.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-indigo-900 hover:bg-blue-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🛒</span>
              <span>Source Farmgate Lots ({listings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-900/90 hover:bg-indigo-900 text-white border border-indigo-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🤝</span>
              <span>Active Factory Offers ({myOffers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-900/90 hover:bg-indigo-900 text-white border border-indigo-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🚚</span>
              <span>Inbound Factory Shipments ({myProcurementOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800/80 hover:bg-slate-800 text-blue-200 border border-slate-600/50 transition-all cursor-pointer"
            >
              ❄️ Cold Buffer Inventory
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Seasonal Fulfillment */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Procurement Target Fulfilled</span>
            <span className="text-lg">🎯</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {totalProcuredKg.toLocaleString('en-IN')}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">/ 45,000 kg</span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((totalProcuredKg / 45000) * 100))}%` }}
            />
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center justify-between">
            <span>Active Contract Batches</span>
            <span className="text-indigo-600 font-bold">{Math.round((totalProcuredKg / 45000) * 100)}% seasonal quota</span>
          </div>
        </div>

        {/* Card 2: Active Purchase Orders */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Inbound Factory Orders</span>
            <span className="text-lg">🚚</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {myProcurementOrders.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">shipments</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            En route to Bengaluru &amp; Hosur processing plants
          </div>
        </div>

        {/* Card 3: Pending Supplier Bids */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Active Procurement Bids</span>
            <span className="text-lg">🤝</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {myOffers.length}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">offers submitted</span>
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            {myOffers.filter((o) => o.status === 'pending').length} awaiting FPO cluster response
          </div>
        </div>

        {/* Card 4: Escrow Committed Spend */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Committed Escrow Capital</span>
            <span className="text-lg">💳</span>
          </div>
          <div className="text-2xl font-black text-indigo-700 dark:text-indigo-400 mt-2 font-mono">
            {formatINR(totalAgreedSpend)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Simulated Escrow Sandbox</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>
      </div>

      {/* Industrial Procurement Requisitions Board */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>📋</span>
              <span>Industrial Procurement Requisitions &amp; Demand Specs</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Current factory intake requirements, quality specifications, and fulfillment status
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
            Seasonal Factory Quota: 45 MT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {procurementDemands.map((req) => (
            <div
              key={req.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-[10px] text-zinc-400 uppercase font-bold block">{req.id}</span>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{req.crop}</h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {req.status}
                </span>
              </div>

              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-700/50">
                <span className="font-bold text-zinc-700 dark:text-zinc-300 block mb-0.5">Factory Quality Spec:</span>
                {req.spec}
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Fulfilled: {req.fulfilledKg.toLocaleString('en-IN')} kg</span>
                  <span>Target: {req.requiredKg.toLocaleString('en-IN')} kg</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full"
                    style={{ width: `${Math.round((req.fulfilledKg / req.requiredKg) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                <span className="text-[11px] text-zinc-500">Max Budget: ₹{req.maxBudgetPerKg}/kg</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('marketplace')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer"
                >
                  Source Batches →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Available Sourcing Lots & Supplier Quality Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Direct Farmgate Lots Available for Industrial Procurement */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>🛒</span>
                <span>Available Farmgate Batches Suitable for Processing</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Bulk lots matching high-volume industrial processing criteria
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Browse All Lots ({listings.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {processingGradeListings.map((item) => (
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
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          {item.grade}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Seller: {item.sellerName} • {item.sellerDistrict}, {item.sellerState}
                      </div>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-lg">
                    ₹{item.targetPricePerKg}/kg
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Available Volume</span>
                    <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">
                      {item.availableQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Shelf Life</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{item.expectedShelfLifeDays} Days</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Cold Logistics</span>
                    <span className="font-bold text-indigo-600">Reefer Truck Advised</span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('offers')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    Submit Procurement Bid →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Inbound Factory Purchase Orders & Active Offers */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>🚚</span>
                  <span>Inbound Factory Deliveries</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Reefer trucks dispatched to processing plants
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                All Orders →
              </button>
            </div>

            <div className="space-y-2.5">
              {myProcurementOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{ord.orderNumber}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {ord.escrowStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span>
                      {ord.commodity} ({ord.variety}) • {ord.lockedQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
                      {formatINR(ord.totalAgreedAmount)}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between">
                    <span>Transporter: {ord.transporterName}</span>
                    <span>Intake Yard: Plant-1 (Hosur)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplier Quality Benchmark Notice */}
          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5">
              <span>🔬</span>
              <span>Industrial Supplier Quality Assurance</span>
            </div>
            <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
              All factory contracts enforce farmgate moisture inspection and digital weighbridge calibration before escrow milestone release. Payouts are guarded under multi-stage escrow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
