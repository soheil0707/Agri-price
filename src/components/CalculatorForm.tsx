'use client';

import React from 'react';
import type { CalculationInput, WeightUnit } from '../lib/calculator/types.ts';

interface CalculatorFormProps {
  input: CalculationInput;
  onChange: (updated: Partial<CalculationInput>) => void;
  onReset: () => void;
}

export function CalculatorForm({ input, onChange, onReset }: CalculatorFormProps) {
  const handleNumberChange = (field: keyof CalculationInput, val: string) => {
    const parsed = parseFloat(val);
    onChange({ [field]: isNaN(parsed) ? 0 : parsed });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center space-x-2">
            <span>⚙️</span>
            <span>Realization Levers & Cost Inputs</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Adjust produce quantity, benchmark price, transit loss, and intermediary deductions
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-md transition-colors"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-5">
        {/* Row 1: Quantity and Unit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Harvest Volume Available
            </label>
            <div className="flex rounded-lg shadow-xs">
              <input
                type="number"
                min="0.1"
                step="any"
                value={input.quantity || ''}
                onChange={(e) => handleNumberChange('quantity', e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-lg border border-r-0 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                placeholder="e.g. 5000"
              />
              <select
                value={input.quantityUnit}
                onChange={(e) => onChange({ quantityUnit: e.target.value as WeightUnit })}
                className="inline-flex items-center px-3 rounded-r-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="quintal">Quintals (100 kg)</option>
                <option value="tonne">Tonnes (1,000 kg)</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Total gross harvest prior to transit or sorting.</p>
          </div>

          {/* Market Price and Price Unit */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Quoted Market Benchmark Price
            </label>
            <div className="flex rounded-lg shadow-xs">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-sm">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={input.pricePerUnit || ''}
                onChange={(e) => handleNumberChange('pricePerUnit', e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 border-y border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                placeholder="28.0"
              />
              <select
                value={input.priceUnit}
                onChange={(e) => onChange({ priceUnit: e.target.value as WeightUnit })}
                className="inline-flex items-center px-3 rounded-r-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                <option value="kg">per kg</option>
                <option value="quintal">per quintal</option>
                <option value="tonne">per tonne</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Simulated wholesale or contract quote.</p>
          </div>
        </div>

        {/* Expected Post-Harvest / Transit Loss */}
        <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/40">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
              <span>📉</span>
              <span>Expected Post-Harvest & Transit Loss</span>
            </label>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
              {input.expectedLossPercent}%
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={input.expectedLossPercent}
              onChange={(e) => handleNumberChange('expectedLossPercent', e.target.value)}
              className="w-full accent-amber-600 dark:accent-amber-500 cursor-pointer"
            />
            <div className="w-20">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={input.expectedLossPercent}
                onChange={(e) => handleNumberChange('expectedLossPercent', e.target.value)}
                className="w-full px-2 py-1 text-xs text-center font-bold border border-amber-300 dark:border-amber-800 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300/80">
            Accounts for transit shrinkage, handling bruising, and sorting culls prior to buyer weighment.
          </p>
        </div>

        {/* Intermediary Deductions Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Logistics & Intermediary Charges
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Transport Cost */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Transportation & Haulage (₹)
              </label>
              <div className="relative rounded-lg shadow-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={input.transportCost}
                  onChange={(e) => handleNumberChange('transportCost', e.target.value)}
                  className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Handling Labor */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Handling & Loading Labor (₹)
              </label>
              <div className="relative rounded-lg shadow-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={input.handlingCost}
                  onChange={(e) => handleNumberChange('handlingCost', e.target.value)}
                  className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Mandi Commission Agent % */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Mandi Commission (% of Gross)
                </label>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {input.commissionPercent}%
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={input.commissionPercent}
                onChange={(e) => handleNumberChange('commissionPercent', e.target.value)}
                className="block w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[10px] text-zinc-400 mt-0.5">Typically 4% - 8% in APMC yards; 0% for direct farmgate buyers.</p>
            </div>

            {/* Packaging Costs */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Packaging & Crates (₹)
              </label>
              <div className="relative rounded-lg shadow-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={input.packagingCost}
                  onChange={(e) => handleNumberChange('packagingCost', e.target.value)}
                  className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Storage Costs */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Cold Storage / Holding Rent (₹)
              </label>
              <div className="relative rounded-lg shadow-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={input.storageCost}
                  onChange={(e) => handleNumberChange('storageCost', e.target.value)}
                  className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Statutory Cess & Weighbridge */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Statutory Cess & Weighbridge (₹)
              </label>
              <div className="relative rounded-lg shadow-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={input.otherFees}
                  onChange={(e) => handleNumberChange('otherFees', e.target.value)}
                  className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Optional Cultivation Cost Guard */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40">
            <div className="flex items-start justify-between">
              <div>
                <label className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center space-x-1.5">
                  <span>🌱</span>
                  <span>Pre-Harvest Cultivation Expenses (Optional)</span>
                </label>
                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5 leading-relaxed">
                  <strong>Strict Transparency Guard:</strong> Net proceeds represents post-harvest market payout.
                  If cultivation costs (seeds, fertilizer, diesel, irrigation) are excluded, AgriPrice strictly labels proceeds as <em>Estimated Net Proceeds</em> and never as <em>Net Profit</em>.
                </p>
              </div>
            </div>
            <div className="mt-3 relative rounded-lg shadow-xs max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 text-xs">₹</span>
              <input
                type="number"
                min="0"
                step="500"
                value={input.cultivationCost || ''}
                onChange={(e) => handleNumberChange('cultivationCost', e.target.value)}
                placeholder="Optional, e.g. 42000"
                className="block w-full pl-7 pr-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
