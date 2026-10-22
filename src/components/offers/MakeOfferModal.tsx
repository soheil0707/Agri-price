'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';
import type { MarketplaceProduceItem } from '../../lib/marketplace/types';

interface MakeOfferModalProps {
  listing: MarketplaceProduceItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MakeOfferModal({ listing, isOpen, onClose }: MakeOfferModalProps) {
  const { createOffer, currentPersona, setActiveTab } = useMarketplace();
  const { user, profile } = useAuth();

  const isLiveAuthUser = Boolean(!currentPersona.isDemoPersona && user && profile);

  const [offeredPrice, setOfferedPrice] = useState<number>(listing?.targetPricePerKg ?? 25.0);
  const [offeredQuantity, setOfferedQuantity] = useState<number>(
    listing ? Math.min(listing.availableQuantityKg, 5000) : 1000
  );
  const [deliveryTerms, setDeliveryTerms] = useState<
    'Ex-Farmgate (Buyer Arranges Transport)' | 'Delivered to Factory (Seller Arranges Transport)' | 'Warehouse Drop-off'
  >('Ex-Farmgate (Buyer Arranges Transport)');
  const [transportBorneBy, setTransportBorneBy] = useState<'buyer' | 'seller' | 'shared'>('buyer');
  const [notes, setNotes] = useState<string>('Standard quality inspection on dispatch. Immediate escrow authorization.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !listing) return null;

  const isZeroStock = listing.availableQuantityKg <= 0 || listing.status !== 'active';
  const totalOfferValue = isZeroStock ? 0 : (offeredPrice || 0) * (offeredQuantity || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isZeroStock) {
      setErrorMsg('Cannot submit an offer on a listing with zero available stock.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await createOffer({
      listingId: listing.id,
      offeredPricePerKg: offeredPrice,
      offeredQuantityKg: offeredQuantity,
      deliveryTerms,
      transportBorneBy,
      notes,
    });

    setIsSubmitting(false);

    if (result.success) {
      onClose();
      setActiveTab('offers');
    } else {
      setErrorMsg(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🤝</span>
            <div>
              <h3 className="font-bold text-base">Submit Purchase Offer</h3>
              <p className="text-xs text-emerald-100">
                Buyer: {currentPersona.name} ({currentPersona.organization})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Listing Summary Tile */}
        <div className="bg-zinc-50 dark:bg-zinc-800/60 p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div>
            <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
              {listing.title}
            </div>
            <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
              Seller: {listing.sellerName} • {listing.sellerDistrict}, {listing.sellerState}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              ₹{listing.targetPricePerKg}/kg
            </div>
            <div className={`text-[11px] font-semibold ${isZeroStock ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500'}`}>
              {listing.availableQuantityKg.toLocaleString('en-IN')} kg available
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isLiveAuthUser ? (
            <div className="p-2.5 rounded-xl text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold">Live Database Persistence</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">public.offers_negotiations</span>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>🎭</span>
                <span className="font-semibold">Interactive Demo Simulation</span>
              </div>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">In-Memory Mock Offer</span>
            </div>
          )}

          {isZeroStock && (
            <div className="p-3.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-start space-x-2">
              <span className="text-base mt-0.5">⚠️</span>
              <div>
                <div className="font-bold">Zero Stock Available</div>
                <div className="text-[11px] font-normal mt-0.5">
                  This listing is currently fully reserved or out of stock (0 kg available). In accordance with platform integrity rules, new offers cannot be placed.
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Offered Price (₹ / kg)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                required
                disabled={isZeroStock}
                value={offeredPrice}
                onChange={(e) => setOfferedPrice(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-800"
              />
              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                Seller target: ₹{listing.targetPricePerKg}/kg
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Requested Quantity (kg)
              </label>
              <input
                type="number"
                min={isZeroStock ? 0 : 100}
                max={listing.availableQuantityKg}
                step="100"
                required
                disabled={isZeroStock}
                value={offeredQuantity}
                onChange={(e) => setOfferedQuantity(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-800"
              />
              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                Max available: {listing.availableQuantityKg.toLocaleString('en-IN')} kg
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Logistics & Delivery Terms
            </label>
            <select
              value={deliveryTerms}
              onChange={(e) => setDeliveryTerms(e.target.value as typeof deliveryTerms)}
              className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="Ex-Farmgate (Buyer Arranges Transport)">
                Ex-Farmgate (Buyer Arranges & Dispatches Transport)
              </option>
              <option value="Delivered to Factory (Seller Arranges Transport)">
                Delivered to Factory (Seller Arranges Transport)
              </option>
              <option value="Warehouse Drop-off">Warehouse Drop-off (AgriPrice Cold Hub)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Freight Expense Borne By
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['buyer', 'seller', 'shared'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTransportBorneBy(mode)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg capitalize border transition-colors ${
                    transportBorneBy === mode
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Inspection & Special Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              placeholder="e.g. Moisture limit < 12%, Crates provided by buyer"
            />
          </div>

          {/* Offer Total Breakdown */}
          <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between text-xs">
            <div>
              <span className="text-zinc-600 dark:text-zinc-400 block">Total Escrow Commitment:</span>
              <span className="font-extrabold text-base text-emerald-800 dark:text-emerald-300 font-mono">
                ₹{totalOfferValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 text-right">
              Funds locked into trust upon seller acceptance
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isZeroStock || offeredQuantity <= 0 || offeredPrice <= 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Submitting...'
                : isZeroStock
                ? 'Listing Out of Stock'
                : 'Submit Offer to Grower'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
