'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';
import { formatINR } from '../../lib/calculator/decimal';

export function OffersView() {
  const {
    offers,
    isLoadingOffers,
    isDatabaseOffersConnected,
    databaseOffersCount,
    databaseOffersError,
    refreshOffers,
    acceptOffer,
    counterOffer,
    rejectOffer,
    cancelOffer,
    currentPersona,
    activeRole,
    setActiveTab,
  } = useMarketplace();

  const { user, profile } = useAuth();

  const [counterPriceMap, setCounterPriceMap] = useState<Record<string, number>>({});
  const [activeCounterOfferId, setActiveCounterOfferId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingOfferId, setProcessingOfferId] = useState<string | null>(null);

  const isLiveMode = activeRole === 'authenticated' && Boolean(user && profile);

  const handleAccept = async (offerId: string) => {
    setProcessingOfferId(offerId);
    setActionFeedback(null);
    setActionError(null);

    const result = await acceptOffer(offerId);
    setProcessingOfferId(null);

    if (result.success) {
      setActionFeedback(result.message);
      setTimeout(() => setActionFeedback(null), 5000);
    } else {
      setActionError(result.message);
    }
  };

  const handleCounter = async (offerId: string) => {
    const price = counterPriceMap[offerId];
    if (!price || price <= 0) return;

    setProcessingOfferId(offerId);
    setActionFeedback(null);
    setActionError(null);

    const result = await counterOffer(offerId, price);
    setProcessingOfferId(null);

    if (result.success) {
      setActiveCounterOfferId(null);
      setActionFeedback(result.message);
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionError(result.message);
    }
  };

  const handleReject = async (offerId: string) => {
    setProcessingOfferId(offerId);
    setActionFeedback(null);
    setActionError(null);

    const result = await rejectOffer(offerId);
    setProcessingOfferId(null);

    if (result.success) {
      setActionFeedback(result.message);
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionError(result.message);
    }
  };

  const handleCancel = async (offerId: string) => {
    setProcessingOfferId(offerId);
    setActionFeedback(null);
    setActionError(null);

    const result = await cancelOffer(offerId);
    setProcessingOfferId(null);

    if (result.success) {
      setActionFeedback(result.message);
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionError(result.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Status Banner: Database Connected vs Error vs Demo Mode */}
      {databaseOffersError ? (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <div className="font-bold text-sm">Database Communication Error</div>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-1 leading-relaxed">
                {databaseOffersError}
              </p>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-400 mt-0.5">
                In accordance with platform security rules, demo data is not silently substituted for database errors.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refreshOffers()}
            className="px-3 py-1.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 text-xs shadow-xs transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : isLiveMode && isDatabaseOffersConnected ? (
        <div className="p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <div>
              <span className="font-bold">Live Supabase Database Connected</span>
              <span className="mx-2 text-emerald-400">•</span>
              <span className="font-mono text-emerald-800 dark:text-emerald-300">
                {databaseOffersCount} active record{databaseOffersCount === 1 ? '' : 's'} in public.offers_negotiations
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refreshOffers()}
            disabled={isLoadingOffers}
            className="px-3 py-1 rounded-xl font-semibold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-100 text-xs transition-colors disabled:opacity-50"
          >
            {isLoadingOffers ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-xs">
          <span className="text-xl mt-0.5">ℹ️</span>
          <div className="space-y-1">
            <div className="font-bold flex items-center space-x-2">
              <span>Interactive Demonstration Sandbox</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                Persona: {currentPersona.name} ({currentPersona.role.toUpperCase()})
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              You are currently navigating with a demo presentation persona. Negotiation actions are tested in-memory. Persistent database offers require signing in as an authenticated account with an authorized buyer or seller role.
            </p>
          </div>
        </div>
      )}

      {/* 2. Top Header Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Offers & Bilateral Contract Negotiations
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Review buyer procurement bids, enforce atomic inventory locks, and execute settlement reservations
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          View Active Escrow Orders →
        </button>
      </div>

      {/* 3. Action Feedback / Error Banners */}
      {actionFeedback && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 animate-in fade-in flex items-center space-x-2">
          <span>✓</span>
          <span>{actionFeedback}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-800 animate-in fade-in flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Loading Skeleton */}
      {isLoadingOffers ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs animate-pulse space-y-4"
            >
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3"></div>
              <div className="grid grid-cols-4 gap-3">
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : offers.length === 0 ? (
        /* 5. Empty State */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center text-xs text-zinc-500 space-y-3">
          <div className="text-3xl">🤝</div>
          <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
            No Active Negotiation Offers Found
          </div>
          <p className="max-w-md mx-auto text-zinc-500 dark:text-zinc-400">
            {isLiveMode
              ? 'You have not submitted any purchase offers, and no offers have been submitted on your produce listings yet.'
              : 'Browse the produce marketplace to submit purchase offers, or create new listings to receive bids from verified buyers.'}
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('produce_catalog')}
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          >
            Explore Produce Marketplace →
          </button>
        </div>
      ) : (
        /* 6. Offers Cards List */
        <div className="space-y-4">
          {offers.map((offer) => {
            const isPending = offer.status === 'pending';
            const isCountered = offer.status === 'countered';
            const isAccepted = offer.status === 'accepted';
            const isRejected = offer.status === 'rejected';
            const isCancelled = offer.status === 'cancelled';

            const totalCommitment = offer.offeredPricePerKg * offer.offeredQuantityKg;
            const isBusy = processingOfferId === offer.id;

            // Determine if the current authenticated caller is seller or buyer on this offer
            const isCallerSeller = isLiveMode && profile ? profile.id === offer.sellerId : true;
            const isCallerBuyer = isLiveMode && profile ? profile.id === offer.buyerId : true;

            return (
              <div
                key={offer.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4 transition-all"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-zinc-500">
                      {offer.id.slice(0, 12)}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {offer.listingTitle}
                    </span>
                    {offer.isLiveDatabaseOffer ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                        🟢 Live Database Record
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                        🎭 Simulated Demo Offer
                      </span>
                    )}
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isAccepted
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : isCountered
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : isRejected
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : isCancelled
                        ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {offer.status}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Buyer / Counterparty</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {offer.buyerOrganization || offer.buyerName}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">{offer.buyerName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block">Offered Quantity</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                      {offer.offeredQuantityKg.toLocaleString('en-IN')} kg
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {(offer.offeredQuantityKg / 100).toFixed(1)} quintals
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block">Offered Price</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm">
                      ₹{offer.offeredPricePerKg}/kg
                    </span>
                    {offer.counterPricePerKg && (
                      <span className="text-[10px] text-blue-600 block">
                        Counter: ₹{offer.counterPricePerKg}/kg
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block">Total Escrow Value</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-sm">
                      {formatINR(totalCommitment)}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">Full lot commitment</span>
                  </div>
                </div>

                {/* Logistics & Delivery Terms */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/80 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                      Logistics: {offer.deliveryTerms}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Freight expense: <strong className="capitalize">{offer.transportBorneBy}</strong>
                      {offer.notes && ` • Notes: "${offer.notes}"`}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center space-x-2 pt-2 sm:pt-0 shrink-0">
                    {/* Seller Actions: Accept and Decline */}
                    {(isPending || isCountered) && isCallerSeller && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAccept(offer.id)}
                          className="py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isBusy ? 'Processing...' : '✓ Accept & Reserve'}
                        </button>

                        {!offer.isLiveDatabaseOffer && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setActiveCounterOfferId(
                                activeCounterOfferId === offer.id ? null : offer.id
                              )
                            }
                            className="py-1.5 px-3 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-700 dark:text-zinc-300"
                          >
                            Counter
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReject(offer.id)}
                          className="py-1.5 px-3 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {/* Buyer Action: Cancel Pending Offer */}
                    {isPending && isCallerBuyer && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCancel(offer.id)}
                        className="py-1.5 px-3 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50"
                      >
                        ✕ Cancel Offer
                      </button>
                    )}

                    {isAccepted && (
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center space-x-1">
                        <span>✓ Accepted • Escrow Reservation Created</span>
                      </div>
                    )}

                    {isRejected && (
                      <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center space-x-1">
                        <span>✕ Offer Rejected by Seller</span>
                      </div>
                    )}

                    {isCancelled && (
                      <div className="text-xs font-semibold text-zinc-500 flex items-center space-x-1">
                        <span>Cancelled by Buyer</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Counter Proposal Form (Simulation) */}
                {activeCounterOfferId === offer.id && (
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 flex items-center space-x-3 text-xs">
                    <span className="font-semibold text-blue-900 dark:text-blue-200">
                      Propose Counter Rate:
                    </span>
                    <div className="flex items-center space-x-1">
                      <span>₹</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        placeholder="e.g. 29.50"
                        value={counterPriceMap[offer.id] || ''}
                        onChange={(e) =>
                          setCounterPriceMap({
                            ...counterPriceMap,
                            [offer.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-24 py-1 px-2 rounded-lg border border-blue-300 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      />
                      <span>/ kg</span>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCounter(offer.id)}
                      className="px-3 py-1 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      Send Counter
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCounterOfferId(null)}
                      className="px-2 py-1 text-zinc-500 hover:text-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
