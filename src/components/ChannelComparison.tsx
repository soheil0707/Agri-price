'use client';

import React from 'react';
import { DEMO_SELLING_CHANNELS } from '../lib/calculator/demoData.ts';
import { calculateNetProceeds } from '../lib/calculator/engine.ts';
import { formatINR } from '../lib/calculator/decimal.ts';
import type { SellingChannelOption } from '../lib/calculator/types.ts';

interface ChannelComparisonProps {
  quantityKg: number;
  onApplyChannel: (channel: SellingChannelOption) => void;
}

export function ChannelComparison({ quantityKg, onApplyChannel }: ChannelComparisonProps) {
  // Compute deterministic realization for each channel based on quantityKg
  const evaluations = DEMO_SELLING_CHANNELS.map((channel) => {
    const input = {
      quantity: quantityKg,
      quantityUnit: 'kg' as const,
      pricePerUnit: channel.quotedPricePerKg,
      priceUnit: 'kg' as const,
      expectedLossPercent: channel.lossPercent,
      transportCost: channel.transportCostRate,
      handlingCost: channel.handlingCostRate,
      commissionPercent: channel.commissionPercent,
      storageCost: channel.storageCost,
      packagingCost: channel.packagingCost,
      otherFees: channel.otherFees,
    };

    const result = calculateNetProceeds(input);
    return {
      channel,
      result,
    };
  });

  // Find channel with highest net proceeds
  const highestProceeds = Math.max(...evaluations.map((e) => e.result.estimatedNetProceeds));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Comparative Realization Matrix
            </span>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Mandi vs. Processor vs. FPO Channels
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Simulated deterministic comparison for {quantityKg.toLocaleString('en-IN')} kg of produce across distinct commercial routes
            </p>
          </div>
          <span className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg">
            ⚠️ Simulated Models • Offline Data
          </span>
        </div>

        {/* Channels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
          {evaluations.map(({ channel, result }) => {
            const isBest = result.estimatedNetProceeds === highestProceeds;

            return (
              <div
                key={channel.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  isBest
                    ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {channel.badge}
                      </span>
                      <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                        {channel.channelName}
                      </h4>
                    </div>
                    {isBest && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                        ★ Highest Net Realization
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {channel.description}
                  </p>

                  {/* Channel Pricing Levers */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/80 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Offered Price:</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">₹{channel.quotedPricePerKg}/kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Transit/Sorting Loss:</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{channel.lossPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Commission Fee:</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{channel.commissionPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Freight & Handling:</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {channel.transportCostRate === 0 ? 'Free (Buyer Pickup)' : `₹${channel.transportCostRate + channel.handlingCostRate}`}
                      </span>
                    </div>
                  </div>

                  {/* Financial Outputs */}
                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">Gross Realization:</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatINR(result.grossRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">Total Deductions:</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">- {formatINR(result.totalPostHarvestDeductions)}</span>
                    </div>

                    <div className="bg-zinc-100/80 dark:bg-zinc-800/80 p-3 rounded-xl">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block font-medium">Estimated Net Proceeds</span>
                      <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                        {formatINR(result.estimatedNetProceeds)}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-300 font-medium mt-0.5">
                        Realization: <strong>{formatINR(result.netProceedsPerKg)} / kg</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Terms: {channel.paymentTerms}
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyChannel(channel)}
                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-emerald-600 dark:hover:bg-emerald-400 hover:text-white transition-colors"
                  >
                    Apply Parameters to Calculator
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
