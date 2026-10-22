'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../lib/calculator/decimal';

interface CommodityStats {
  commodity: string;
  volumeMt: number;
  avgPricePerKg: number;
  totalGmv: number;
  settlementRatePercent: number;
  topDistrict: string;
}

const COMMODITY_METRICS: CommodityStats[] = [
  {
    commodity: 'Tomato (Hybrid / Table & Processing)',
    volumeMt: 320,
    avgPricePerKg: 24.5,
    totalGmv: 7840000,
    settlementRatePercent: 99.4,
    topDistrict: 'Kolar, Karnataka',
  },
  {
    commodity: 'Onion (Nashik Red / Commercial)',
    volumeMt: 210,
    avgPricePerKg: 28.0,
    totalGmv: 5880000,
    settlementRatePercent: 98.8,
    topDistrict: 'Nashik, Maharashtra',
  },
  {
    commodity: 'Potato (Jyoti / Processing & Storage)',
    volumeMt: 165,
    avgPricePerKg: 18.2,
    totalGmv: 3003000,
    settlementRatePercent: 100.0,
    topDistrict: 'Hassan, Karnataka',
  },
  {
    commodity: 'Green Chilli (G4 Export Grade)',
    volumeMt: 45,
    avgPricePerKg: 42.0,
    totalGmv: 1890000,
    settlementRatePercent: 97.6,
    topDistrict: 'Guntur, Andhra Pradesh',
  },
];

export function AnalyticsView() {
  const { setActiveTab, platformTelemetry, isLoadingTelemetry, refreshTelemetry } = useMarketplace();
  const [selectedTimeframe, setSelectedTimeframe] = useState<'30d' | '90d' | '1y'>('30d');

  const isLiveTelemetry = platformTelemetry.isLiveDatabase;
  const demoTotalGmv = COMMODITY_METRICS.reduce((sum, c) => sum + c.totalGmv, 0);
  const demoTotalVolumeMt = COMMODITY_METRICS.reduce((sum, c) => sum + c.volumeMt, 0);

  return (
    <div className="space-y-6">
      {/* Sourcing Transparency Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex items-start space-x-3 transition-colors ${
          isLiveTelemetry
            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
        }`}
      >
        <span className="text-xl mt-0.5">{isLiveTelemetry ? '🟢' : '📊'}</span>
        <div className="space-y-1.5 flex-1">
          <div className="font-bold flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span>Marketplace Liquidity &amp; Platform Telemetry</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isLiveTelemetry
                    ? 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100'
                    : 'bg-amber-200/90 text-amber-950 dark:bg-amber-900 dark:text-amber-100'
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
              ? 'Real-time database aggregated metrics across active orders, escrow events, and produce listings.'
              : 'Benchmark prototype metrics across farmgate listings, APMC wholesale price spreads, and simulated escrow settlement volumes.'}
          </p>
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            AgriPrice Platform Performance &amp; Liquidity Dashboard
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Transparent marketplace volume tracking, farmer net proceeds realization, and escrow milestone velocity.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-zinc-400">Timeframe:</span>
          {(['30d', '90d', '1y'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedTimeframe === tf
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPI Grid (Live Database vs Demo Sandbox) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {isLiveTelemetry ? 'Verified Database GMV' : 'Traded GMV (Simulated)'}
            </span>
            <span className="text-emerald-600 font-bold">{isLiveTelemetry ? 'Live' : '+18.4%'}</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {formatINR(isLiveTelemetry ? platformTelemetry.financials.totalGmv : demoTotalGmv)}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isLiveTelemetry
              ? `Aggregated from ${platformTelemetry.orders.totalOrders} live contracts`
              : 'Modeled trade volume in benchmark dataset'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {isLiveTelemetry ? 'Active Catalog Volume' : 'Physical Volume Traded'}
            </span>
            <span className="text-emerald-600 font-bold">{isLiveTelemetry ? 'Verified' : '+12.2%'}</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2 font-mono">
            {isLiveTelemetry
              ? `${(platformTelemetry.listings.totalCatalogVolumeKg / 1000).toFixed(1)} MT`
              : `${demoTotalVolumeMt.toLocaleString('en-IN')} MT`}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isLiveTelemetry
              ? `Across ${platformTelemetry.listings.totalListings} produce listings`
              : 'Simulated across benchmark crop batches'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {isLiveTelemetry ? 'Escrow Held / Locked' : 'Modeled Escrow Volume'}
            </span>
            <span className="text-blue-600 font-bold">{isLiveTelemetry ? 'PostgreSQL' : 'Simulated Ledger'}</span>
          </div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-2 font-mono">
            {formatINR(
              isLiveTelemetry
                ? platformTelemetry.financials.escrowLockedAmount
                : 4250000
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isLiveTelemetry
              ? `Settled: ${formatINR(platformTelemetry.financials.settledFarmerProceeds)} to farmers`
              : 'Demonstration milestone hold calculations'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {isLiveTelemetry ? 'Audit Snapshots' : 'Dispute Frequency'}
            </span>
            <span className="text-emerald-600 font-bold">
              {isLiveTelemetry ? 'Audit Trail' : '< 0.9%'}
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {isLiveTelemetry
              ? `${platformTelemetry.snapshots.totalSnapshots} Records`
              : '99.1%'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {isLiveTelemetry
              ? 'Deterministic calculation audit snapshots'
              : 'Benchmark model settlement rate'}
          </div>
        </div>
      </div>

      {/* Commodity Breakdown Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Commodity Trade Volume & Settlement Realization
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Volume allocation, modal pricing, and fulfillment rates by crop category
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('prices')}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            View APMC Mandi Spreads →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase font-bold text-zinc-500">
              <tr>
                <th className="px-5 py-3">Commodity & Grade</th>
                <th className="px-5 py-3">Volume Traded</th>
                <th className="px-5 py-3">Weighted Avg Price</th>
                <th className="px-5 py-3">Gross Value (INR)</th>
                <th className="px-5 py-3">Settlement Success</th>
                <th className="px-5 py-3">Top Sourcing Hub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {COMMODITY_METRICS.map((row) => (
                <tr key={row.commodity} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                  <td className="px-5 py-3.5 font-bold text-zinc-900 dark:text-zinc-100">
                    {row.commodity}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                    {row.volumeMt} MT
                  </td>
                  <td className="px-5 py-3.5 font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                    ₹{row.avgPricePerKg.toFixed(2)}/kg
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    {formatINR(row.totalGmv)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {row.settlementRatePercent}%
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400">
                    {row.topDistrict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Escrow Milestone & Speed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>🛡️ Escrow Smart Contract Velocity</span>
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Avg. Farmer Advance Release (Post-Dispatch)</span>
                <span className="font-bold text-emerald-600">3.8 Hours</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-2 rounded-full w-[88%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Final Settlement Release (Post-Inspection)</span>
                <span className="font-bold text-emerald-600">1.4 Hours</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-2 rounded-full w-[95%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                <span>Automated Dispute Resolution SLA (&lt; 24h)</span>
                <span className="font-bold text-emerald-600">96.8%</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-2 rounded-full w-[96%]" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>❄️ Cold Storage Network Utilization</span>
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40">
              <div>
                <div className="font-bold text-zinc-900 dark:text-zinc-100">Kolar CoolChain Logistics</div>
                <div className="text-[10px] text-zinc-400">Atmospheric CA Chamber (Tomatoes & Mangoes)</div>
              </div>
              <div className="text-right font-mono font-bold text-blue-600">
                84% Utilized
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40">
              <div>
                <div className="font-bold text-zinc-900 dark:text-zinc-100">APMC Mandi Yard Cold Unit</div>
                <div className="text-[10px] text-zinc-400">Short-term buffer staging (Commercial Lots)</div>
              </div>
              <div className="text-right font-mono font-bold text-emerald-600">
                68% Utilized
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40">
              <div>
                <div className="font-bold text-zinc-900 dark:text-zinc-100">Chittoor Border Pre-Cooling Hub</div>
                <div className="text-[10px] text-zinc-400">High-humidity sorting & export blast chiller</div>
              </div>
              <div className="text-right font-mono font-bold text-amber-600">
                92% Utilized
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
