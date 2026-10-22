'use client';

import React from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../lib/calculator/decimal';
import { formatPriceUnit, isLiveMarketFeed } from '../../lib/supabase/marketPrices';
import type { CalculationInput } from '../../lib/calculator/types';

interface PricesViewProps {
  onLoadListingIntoCalculator: (customInput?: Partial<CalculationInput>) => void;
}

export function PricesView({ onLoadListingIntoCalculator }: PricesViewProps) {
  const {
    marketPrices,
    isLiveMarketPrices,
    marketPricesSourceDescription,
    isLoadingMarketPrices,
    refreshMarketPrices,
    setActiveTab,
  } = useMarketplace();

  const handleModelCommodity = (commodity: string, modalPrice: number) => {
    onLoadListingIntoCalculator({
      quantity: 5000,
      quantityUnit: 'kg',
      pricePerUnit: modalPrice,
      priceUnit: 'kg',
    });
    setActiveTab('calculator');
  };

  return (
    <div className="space-y-6">
      {/* Sourcing Transparency & Verification Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex items-start space-x-3 transition-colors ${
          isLiveMarketPrices
            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
        }`}
      >
        <span className="text-xl mt-0.5">{isLiveMarketPrices ? '🟢' : '🏛️'}</span>
        <div className="space-y-1.5 flex-1">
          <div className="font-bold flex flex-wrap items-center gap-2">
            <span>Regional Mandi Market Intelligence &amp; Benchmarks</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isLiveMarketPrices
                  ? 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100'
                  : 'bg-amber-200/90 text-amber-950 dark:bg-amber-900 dark:text-amber-100'
              }`}
            >
              {isLiveMarketPrices
                ? 'LIVE DATABASE — public.market_price_benchmarks'
                : 'REFERENCE DATA — Agmarknet APMC Model Benchmarks'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed opacity-90">
            {marketPricesSourceDescription}
          </p>
          <div className="text-[10px] opacity-80 pt-1 border-t border-current/20 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>🛡️ Truthful Pricing Standard: Zero unverified AI predictions or fabricated tickers.</span>
            <span>📍 Regional physical mandi yards only.</span>
          </div>
        </div>
      </div>

      {/* Top Banner & Control Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Regional APMC Mandi Market Prices &amp; Benchmarks
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Wholesale arrival volumes, modal price bands, and verified regional mandi discovery
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => refreshMarketPrices()}
            disabled={isLoadingMarketPrices}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>🔄</span>
            <span>{isLoadingMarketPrices ? 'Fetching...' : 'Refresh Benchmarks'}</span>
          </button>
        </div>
      </div>

      {/* Price Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {marketPrices.map((price) => {
          const isVerifiedLive = isLiveMarketFeed(price);

          return (
            <div
              key={`${price.commodity}-${price.marketCenter}`}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      {price.commodity}
                    </h3>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        isVerifiedLive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {isVerifiedLive ? 'Live Feed' : 'Reference Model'}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {price.variety} • {price.grade || 'Grade-A/Standard'}
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    price.trend === 'up'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {price.trend === 'up' ? '▲' : '▼'} {price.dayChangePercent}%
                </span>
              </div>

              {/* Price Metrics */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-500">Modal Rate:</span>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                    {formatPriceUnit(price.modalPricePerKg, 'kg')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
                  <span>
                    Range: {formatINR(price.minPricePerKg)} - {formatINR(price.maxPricePerKg)}
                  </span>
                  <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatPriceUnit(price.modalPricePerKg, 'quintal')}
                  </span>
                </div>
              </div>

              {/* Yard Details & Sourcing Attribution */}
              <div className="text-xs space-y-1.5 text-zinc-600 dark:text-zinc-400">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Primary Mandi:</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {price.marketCenter}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Location:</span>
                  <span>
                    {price.district}, {price.state}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Recorded Timestamp:</span>
                  <span className="text-[11px] font-mono">{price.updatedAt}</span>
                </div>
                <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 truncate">
                  Source: <span className="text-zinc-600 dark:text-zinc-300">{price.sourceAttribution}</span>
                </div>
              </div>

              {/* Action */}
              <button
                type="button"
                onClick={() => handleModelCommodity(price.commodity, price.modalPricePerKg)}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>🧮</span>
                <span>Model Net Proceeds ({formatPriceUnit(price.modalPricePerKg, 'kg')})</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
