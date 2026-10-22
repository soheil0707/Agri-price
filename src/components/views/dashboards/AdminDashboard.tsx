'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../../lib/calculator/decimal';

export function AdminDashboard() {
  const {
    currentPersona,
    listings,
    orders,
    setActiveTab,
    databaseListingCount,
    platformTelemetry,
    isLoadingTelemetry,
    refreshTelemetry,
    telemetryError,
  } = useMarketplace();

  // Verified platform metrics from platformTelemetry (Zero fabricated constants or artificial offset)
  const isLiveTelemetry = platformTelemetry.isLiveDatabase;
  const platformGmv = platformTelemetry.financials.totalGmv;
  const totalVolumeKg = listings.reduce((sum, l) => sum + l.totalQuantityKg, 0);

  // Simulated Verification Queue for Admin Moderation
  const pendingVerifications = [
    {
      id: 'KYC-USR-801',
      name: 'Ramesh Kumar',
      role: 'farmer',
      organization: 'Kolar GreenFields Farmer Producer Co.',
      documents: 'Aadhaar + Land RTC Record (Kolar Taluk)',
      submittedAt: '2 hours ago',
      status: 'Ready for Review',
    },
    {
      id: 'KYC-TRD-802',
      name: 'Gopal Lalwani',
      role: 'trader',
      organization: 'Lalwani Mandi Traders',
      documents: 'APMC Mandi Commission License #KA-BLR-441',
      submittedAt: '5 hours ago',
      status: 'Ready for Review',
    },
    {
      id: 'KYC-STG-803',
      name: 'Venkatesh Rao',
      role: 'cold_storage',
      organization: 'Kolar CoolChain Aggregators & Hubs',
      documents: 'WDRA Warehouse Accreditation Certificate',
      submittedAt: '1 day ago',
      status: 'Ready for Review',
    },
  ];

  // Escrow Milestone Audits derived dynamically from live orders state
  const escrowAudits = orders.map((ord) => {
    let currentMilestone = 'Awaiting Escrow Deposit';
    let nextMilestone = 'Buyer Escrow Funding';
    let riskLevel = 'Low (Pending Funding)';

    if (ord.escrowStatus === 'escrow_funded') {
      currentMilestone = 'Escrow Funded & Locked';
      nextMilestone = 'Logistics Dispatch & 40% Advance';
      riskLevel = 'Low (Escrow Secured)';
    } else if (ord.escrowStatus === 'in_transit') {
      currentMilestone = 'In Transit — 40% Advance Released';
      nextMilestone = 'Destination Quality Clearance (60% Settlement)';
      riskLevel = 'Low (Reefer Monitored)';
    } else if (ord.escrowStatus === 'delivered_inspected') {
      currentMilestone = 'Delivered & Inspected';
      nextMilestone = 'Final Proceeds Disbursement';
      riskLevel = 'Zero (Quality Accepted)';
    } else if (ord.escrowStatus === 'settled') {
      currentMilestone = '100% Payout Settled';
      nextMilestone = 'Ledger Reconciled';
      riskLevel = 'Zero (Settled)';
    } else if (ord.escrowStatus === 'cancelled') {
      currentMilestone = 'Cancelled — Escrow Released';
      nextMilestone = 'Inventory Restored to Listing';
      riskLevel = 'Zero (Cancelled)';
    } else if (ord.escrowStatus === 'disputed') {
      currentMilestone = 'Disputed — Escrow Frozen';
      nextMilestone = 'Administrative Ruling Pending';
      riskLevel = 'High (Active Arbitration)';
    }

    return {
      id: `ESC-AUD-${ord.orderNumber.replace('AGP-ORD-', '')}`,
      orderNumber: ord.orderNumber,
      commodity: `${ord.commodity} (${ord.lockedQuantityKg.toLocaleString('en-IN')} kg)`,
      amount: ord.totalAgreedAmount,
      currentMilestone,
      nextMilestone,
      riskLevel,
    };
  });

  return (
    <div className="space-y-6" data-testid="dashboard-admin">
      {/* Sourcing Transparency & Admin Verification Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex items-start space-x-3 transition-colors ${
          isLiveTelemetry
            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800/60 text-purple-900 dark:text-purple-200'
        }`}
      >
        <span className="text-xl mt-0.5">{isLiveTelemetry ? '🟢' : '🎭'}</span>
        <div className="space-y-1.5 flex-1">
          <div className="font-bold flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span>Admin Governance &amp; Platform Telemetry</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isLiveTelemetry
                    ? 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100'
                    : 'bg-purple-200 text-purple-950 dark:bg-purple-900 dark:text-purple-100'
                }`}
              >
                {platformTelemetry.sourceLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => refreshTelemetry()}
              disabled={isLoadingTelemetry}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-zinc-800 border border-current/30 hover:opacity-80 transition-opacity flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <span>🔄</span>
              <span>{isLoadingTelemetry ? 'Refreshing...' : 'Refresh Telemetry'}</span>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed opacity-90">
            {isLiveTelemetry
              ? 'Real-time aggregated counts from reservations_orders, simulated_payment_events, produce_listings, and calculation_snapshots.'
              : 'Demonstration telemetry dataset for offline verification and sandboxed role demonstrations.'}
          </p>
          {telemetryError && (
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">
              Notice: {telemetryError}
            </div>
          )}
        </div>
      </div>

      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-zinc-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          🛡️
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Platform Operations &amp; Trust Escrow Control</span>
            <span>•</span>
            <span className="text-purple-200">Zero-Trust Infrastructure</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            National Marketplace Oversight &amp; Compliance Hub
          </h2>
          <p className="text-sm text-purple-100 mt-2 leading-relaxed">
            Monitor national agricultural supply transactions, audit smart escrow milestone releases, inspect user KYC documents under PostgreSQL RLS security controls, and moderate produce quality listings.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-purple-950 hover:bg-purple-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🛡️</span>
              <span>Review Verification Queue ({pendingVerifications.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-900/90 hover:bg-purple-900 text-white border border-purple-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>⚖️</span>
              <span>Audit Escrow Milestone Holds</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-900/80 hover:bg-zinc-900 text-purple-200 border border-zinc-700 transition-all cursor-pointer"
            >
              ⚙️ Platform Security &amp; Compliance Rules
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Platform Gross Volume */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">
              {isLiveTelemetry ? 'Verified Platform GMV' : 'Total GMV (Demo Mode)'}
            </span>
            <span className="text-lg">💰</span>
          </div>
          <div className="text-2xl font-black text-purple-700 dark:text-purple-400 mt-2 font-mono">
            {formatINR(platformGmv)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {isLiveTelemetry
              ? `Sum of ${platformTelemetry.orders.totalOrders} live order contracts`
              : 'Prototype sandbox contract volume'}
          </div>
        </div>

        {/* Card 2: Escrow Locked Volume */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Escrow Held &amp; Settled</span>
            <span className="text-lg">🔒</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            {formatINR(platformTelemetry.financials.escrowLockedAmount)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Settled: {formatINR(platformTelemetry.financials.settledFarmerProceeds)} to farmers
          </div>
        </div>

        {/* Card 3: User Accounts Moderated */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Registered Accounts</span>
            <span className="text-lg">👥</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {platformTelemetry.users.totalUsers}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">profiles</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {platformTelemetry.users.farmers} Farmers • {platformTelemetry.users.buyers} Buyers ({totalVolumeKg > 0 ? `${(totalVolumeKg / 1000).toFixed(0)} MT in ${databaseListingCount > 0 ? databaseListingCount : listings.length} listings` : 'Catalog active'})
          </div>
        </div>

        {/* Card 4: Audit Trail & Snapshots */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Audit Snapshots &amp; Security</span>
            <span className="text-lg">📸</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            {platformTelemetry.snapshots.totalSnapshots}{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">snapshots</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
            PostgreSQL RLS &amp; Engine Reproducibility Active
          </div>
        </div>
      </div>

      {/* Admin KYC & Role Verification Queue */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>🛡️</span>
                <span>User KYC &amp; APMC License Verification Queue</span>
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 font-bold">
                DEMO / SIMULATION
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Sample compliance queue demonstrating document review workflows (Simulated mock applicants)
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-semibold hidden sm:inline">
            Administrative Simulation
          </span>
        </div>

        <div className="space-y-3">
          {pendingVerifications.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{item.name}</span>
                  <span className="font-mono text-[10px] text-zinc-400">({item.id} • Demo Record)</span>
                  <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                    Role: {item.role}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.organization} • Submitted {item.submittedAt}
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                  Sample Document Ref: {item.documents}
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-colors cursor-pointer"
                  title="Navigate to Profile to view live database Admin Role Onboarding"
                >
                  Inspect in Profile (Simulation Queue)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Escrow Milestone Oversight Board */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>⚖️</span>
                <span>Escrow Milestone Oversight &amp; Audit Log</span>
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 font-bold">
                DEMO / SIMULATION
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Demonstration audit log for multi-party financial holds, dispatch advances, and settlement milestones
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            Audit All Escrow Accounts →
          </button>
        </div>

        <div className="space-y-3">
          {escrowAudits.map((esc) => (
            <div
              key={esc.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{esc.orderNumber}</span>
                  <span className="font-medium text-zinc-500">{esc.commodity}</span>
                </div>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-400 text-sm">
                  {formatINR(esc.amount)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                <div className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold block text-zinc-700 dark:text-zinc-300">Milestone State:</span>
                  {esc.currentMilestone}
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold block text-zinc-700 dark:text-zinc-300">Next Action:</span>
                  {esc.nextMilestone}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
