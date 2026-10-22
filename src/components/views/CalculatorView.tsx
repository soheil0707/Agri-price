'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { CalculatorForm } from '../CalculatorForm';
import { ResultsDisplay } from '../ResultsDisplay';
import { ChannelComparison } from '../ChannelComparison';
import { ListingCard } from '../ListingCard';
import { convertToKg, formatINR, formatWeight } from '../../lib/calculator/decimal';
import { verifySnapshotReproducibility } from '../../lib/supabase/snapshots';
import type { CalculationInput, CalculationResult, SellingChannelOption } from '../../lib/calculator/types';

interface CalculatorViewProps {
  calcInput: CalculationInput;
  onChangeInput: (updated: Partial<CalculationInput>) => void;
  onResetDefaults: (customInput?: Partial<CalculationInput>) => void;
  calculationResult: CalculationResult | null;
  calculationError: string | null;
  onApplyChannel: (channel: SellingChannelOption) => void;
}

export function CalculatorView({
  calcInput,
  onChangeInput,
  onResetDefaults,
  calculationResult,
  calculationError,
  onApplyChannel,
}: CalculatorViewProps) {
  const { saveSnapshot, userSnapshots } = useMarketplace();
  const [subTab, setSubTab] = useState<'calculator' | 'channels'>('calculator');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);
  const [lastSavedSnapshotResult, setLastSavedSnapshotResult] = useState<{
    success: boolean;
    message: string;
    snapshotId?: string;
    isLiveDatabaseRecord?: boolean;
  } | null>(null);

  const currentKg = convertToKg(calcInput.quantity, calcInput.quantityUnit);

  const handleSaveSnapshot = async () => {
    if (!calculationResult) return;
    setIsSavingSnapshot(true);
    try {
      const res = await saveSnapshot(calcInput, calculationResult);
      setLastSavedSnapshotResult(res);
    } catch (err: unknown) {
      setLastSavedSnapshotResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to save snapshot.',
      });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Subtab Switcher */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🧮</span>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Deterministic Net Proceeds Realization Engine
            </h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Evaluate exact take-home farm proceeds after transit shrinkage, mandi fees, logistics, and commissions
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 bg-zinc-50 dark:bg-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('calculator')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              subTab === 'calculator'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Calculator & Breakdown
          </button>
          <button
            type="button"
            onClick={() => setSubTab('channels')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              subTab === 'channels'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Multi-Channel Comparison
          </button>
        </div>
      </div>

      {subTab === 'calculator' ? (
        <div className="space-y-6">
          {/* Produce Batch Card */}
          <ListingCard onLoadListingDefaults={onResetDefaults} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Levers and Inputs (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <CalculatorForm
                input={calcInput}
                onChange={onChangeInput}
                onReset={() => onResetDefaults()}
              />
            </div>

            {/* Right Column: Results & Itemized Breakdown (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <ResultsDisplay
                result={calculationResult}
                error={calculationError}
                onSaveSnapshot={handleSaveSnapshot}
                isSavingSnapshot={isSavingSnapshot}
                lastSavedSnapshotResult={lastSavedSnapshotResult}
              />

              {/* Direct Compare Promo Card */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Compare Selling Options Side-by-Side?
                  </h4>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                    Evaluate this {currentKg.toLocaleString('en-IN')} kg batch across Mandi, Food Processor, and FPO channels.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab('channels')}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  Compare Channels →
                </button>
              </div>

              {/* Saved Snapshots Audit History */}
              {userSnapshots.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                        <span>📸</span>
                        <span>Saved Calculation Snapshots ({userSnapshots.length})</span>
                      </h4>
                      <p className="text-xs text-zinc-500">
                        Historical deterministic audit records with reproducible parameters
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                      Audited
                    </span>
                  </div>

                  <div className="space-y-3">
                    {userSnapshots.slice(0, 3).map((snapshot) => {
                      const rep = verifySnapshotReproducibility(snapshot);
                      return (
                        <div
                          key={snapshot.id}
                          className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 text-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                              {snapshot.id.slice(0, 16)}...
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {new Date(snapshot.createdAt).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                            <div>
                              <span className="text-zinc-400 block">Quantity:</span>
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                {formatWeight(snapshot.originalQuantityKg, 'kg')}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-400 block">Gross Revenue:</span>
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                {formatINR(snapshot.grossRevenue)}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-400 block">Est. Net Proceeds:</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {formatINR(snapshot.estimatedNetProceeds)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50">
                            <span
                              className={`text-[10px] font-mono ${
                                rep.isReproducible
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {rep.isReproducible
                                ? '✓ Reproducibility Verified (0 drift)'
                                : '⚠️ Slight engine parameter divergence'}
                            </span>
                            <button
                              type="button"
                              onClick={() => onChangeInput(snapshot.inputPayload)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 hover:border-emerald-500 text-zinc-800 dark:text-zinc-100 transition-colors cursor-pointer"
                            >
                              Reload Inputs
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <ChannelComparison
          quantityKg={currentKg}
          onApplyChannel={(ch) => {
            onApplyChannel(ch);
            setSubTab('calculator');
          }}
        />
      )}
    </div>
  );
}
