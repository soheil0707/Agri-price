'use client';

import React from 'react';
import type { CalculationResult } from '../lib/calculator/types.ts';
import { formatINR, formatWeight } from '../lib/calculator/decimal.ts';

interface ResultsDisplayProps {
  result: CalculationResult | null;
  error?: string | null;
  onSaveSnapshot?: () => void;
  isSavingSnapshot?: boolean;
  lastSavedSnapshotResult?: {
    success: boolean;
    message: string;
    snapshotId?: string;
    isLiveDatabaseRecord?: boolean;
  } | null;
}

export function ResultsDisplay({
  result,
  error,
  onSaveSnapshot,
  isSavingSnapshot,
  lastSavedSnapshotResult,
}: ResultsDisplayProps) {
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-red-900 dark:text-red-200">
        <div className="flex items-center space-x-2 font-bold text-sm mb-1">
          <span>⚠️</span>
          <span>Calculation Input Error</span>
        </div>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const proceedsPercent =
    result.grossRevenue > 0
      ? Math.max(0, Math.min(100, (result.estimatedNetProceeds / result.grossRevenue) * 100))
      : 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-6">
      {/* Header & Version Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Deterministic Engine Output
          </span>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Net Proceeds & Realization Analysis
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
            {result.version}
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Snapshot Audit Verified
          </span>
        </div>
      </div>

      {/* Decoupling Notice: Pre-Trade Simulation vs Realized Outcome */}
      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
        <span className="text-base mt-0.5">⚠️</span>
        <div className="space-y-0.5 flex-1">
          <div className="font-bold flex items-center justify-between">
            <span>Pre-Trade Simulation Estimate — Decoupled from Realized Settlement</span>
            <span className="text-[10px] font-mono font-bold bg-amber-200 dark:bg-amber-900 px-1.5 py-0.2 rounded text-amber-950 dark:text-amber-100">
              SIMULATION PROJECTION
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            This deterministic calculation is a pre-trade projection for negotiation planning. Actual realized farmgate returns depend on destination physical weighment, moisture/quality grading, and mutual escrow release upon delivery.
          </p>
        </div>
      </div>

      {/* Snapshot Persistence Action Bar */}
      {onSaveSnapshot && (
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
              <span>📸</span>
              <span>Deterministic Snapshot Audit Trail</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Permanently freeze input parameters, deductions, and engine {result.version} output for transaction reproducibility.
            </p>
            {lastSavedSnapshotResult && (
              <div
                className={`text-[11px] font-mono mt-1.5 font-bold ${
                  lastSavedSnapshotResult.success
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {lastSavedSnapshotResult.message}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onSaveSnapshot}
            disabled={isSavingSnapshot}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <span>💾</span>
            <span>{isSavingSnapshot ? 'Recording...' : 'Save Audit Snapshot'}</span>
          </button>
        </div>
      )}

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Estimated Net Proceeds Hero Card */}
        <div className="bg-gradient-to-br from-emerald-900 to-teal-900 text-white rounded-xl p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-200">
            <span>Estimated Net Proceeds (Payout)</span>
            <span className="bg-emerald-800/80 px-2 py-0.5 rounded-full text-[11px] text-emerald-100">
              {proceedsPercent.toFixed(1)}% of Gross
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold tracking-tight">
              {formatINR(result.estimatedNetProceeds)}
            </div>
            <div className="text-xs text-emerald-200/90 mt-1 flex items-center justify-between">
              <span>Realization: <strong>{formatINR(result.netProceedsPerKg)}</strong> / kg sold</span>
              <span>Based on {formatWeight(result.sellableQuantityKg, 'kg')} delivered</span>
            </div>
          </div>
          {/* Important Terminology Pill */}
          <div className="bg-emerald-950/80 rounded-lg p-2 text-[11px] text-emerald-200/90 border border-emerald-700/50 flex items-start space-x-1.5">
            <span className="text-xs">🛡️</span>
            <span>
              <strong>Net Proceeds, Not Farm Profit:</strong> Excludes seed, fertilizer, and in-field cultivation costs.
            </span>
          </div>
        </div>

        {/* Gross Revenue & Sellable Volume */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200 dark:border-zinc-700 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Gross Realization
            </span>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              @ {formatINR(result.pricePerKg)}/kg
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatINR(result.grossRevenue)}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Sellable Volume: <strong>{formatWeight(result.sellableDisplayQuantity, result.displayUnit)}</strong>
              {result.expectedLossPercent > 0 && (
                <span className="text-amber-600 dark:text-amber-400 ml-1">
                  ({formatWeight(result.expectedLossKg, 'kg')} / {result.expectedLossPercent}% transit loss deducted)
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Total Deductions:</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">
              - {formatINR(result.totalPostHarvestDeductions)}
              {result.grossRevenue > 0 && (
                <span className="text-[11px] font-normal text-zinc-500 ml-1">
                  ({((result.totalPostHarvestDeductions / result.grossRevenue) * 100).toFixed(1)}%)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Conditional Net Farm Profit Card (if cultivation cost supplied) */}
      {result.cultivationCostIncluded && result.estimatedNetFarmProfit !== null && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <span>🌾</span>
              <span>Estimated Net Farm Profit (Pre-Harvest Expenses Deducted)</span>
            </div>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
              Net Proceeds ({formatINR(result.estimatedNetProceeds)}) minus declared cultivation cost ({formatINR(result.cultivationCostAmount)}).
            </p>
          </div>
          <div className="text-xl font-extrabold text-emerald-800 dark:text-emerald-300">
            {formatINR(result.estimatedNetFarmProfit)}
          </div>
        </div>
      )}

      {/* Visual Realization Distribution Bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2">
          <span className="font-semibold uppercase tracking-wider">Gross Realization Distribution</span>
          <span>100% Total Realized Value</span>
        </div>
        <div className="w-full h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${proceedsPercent}%` }}
            className="bg-emerald-500 h-full transition-all duration-300"
            title={`Net Proceeds: ${proceedsPercent.toFixed(1)}%`}
          />
          {result.costs.map((cost, idx) => {
            const colors = ['bg-rose-400', 'bg-amber-400', 'bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-zinc-400'];
            const color = colors[idx % colors.length];
            return cost.percentOfGross > 0 ? (
              <div
                key={cost.id}
                style={{ width: `${cost.percentOfGross}%` }}
                className={`${color} h-full transition-all duration-300`}
                title={`${cost.label}: ${cost.percentOfGross}%`}
              />
            ) : null;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Net Proceeds ({proceedsPercent.toFixed(1)}%)</span>
          </div>
          {result.costs.map((c, i) => {
            const colors = ['bg-rose-400', 'bg-amber-400', 'bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-zinc-400'];
            return c.amount > 0 ? (
              <div key={c.id} className="flex items-center space-x-1">
                <span className={`w-2.5 h-2.5 rounded-full ${colors[i % colors.length]}`}></span>
                <span>{c.label.split(' ')[0]} ({c.percentOfGross}%)</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Itemized Cost Breakdown Table */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
          Itemized Post-Harvest Cost Breakdown
        </h4>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 font-semibold text-zinc-700 dark:text-zinc-300">
              <tr>
                <th className="py-2.5 pl-4 pr-3 text-left">Cost Component</th>
                <th className="px-3 py-2.5 text-left hidden sm:table-cell">Basis / Description</th>
                <th className="px-3 py-2.5 text-right">% of Gross</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
              {result.costs.map((cost) => (
                <tr key={cost.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-2 pl-4 pr-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {cost.label}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                    {cost.description}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500 dark:text-zinc-400 font-mono">
                    {cost.percentOfGross}%
                  </td>
                  <td className="py-2 pl-3 pr-4 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatINR(cost.amount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-zinc-50 dark:bg-zinc-800/40 font-bold border-t-2 border-zinc-200 dark:border-zinc-700">
                <td className="py-2.5 pl-4 pr-3">Total Deductions</td>
                <td className="px-3 py-2.5 hidden sm:table-cell text-zinc-500">Sum of intermediary & transport charges</td>
                <td className="px-3 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                  {result.grossRevenue > 0 ? ((result.totalPostHarvestDeductions / result.grossRevenue) * 100).toFixed(1) : 0}%
                </td>
                <td className="py-2.5 pl-3 pr-4 text-right text-rose-600 dark:text-rose-400">
                  {formatINR(result.totalPostHarvestDeductions)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Assumptions & Compliance Audit Box */}
      <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700/80 space-y-2">
        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
          <span>📋</span>
          <span>Engine Assumptions & Audit Record</span>
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {result.assumptions.map((item) => (
            <div key={item.code} className="bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">{item.label}</span>
              <span className="text-zinc-600 dark:text-zinc-400 text-[11px] block">{item.note}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic pt-1 border-t border-zinc-200 dark:border-zinc-800">
          {result.disclaimer}
        </p>
      </div>
    </div>
  );
}
