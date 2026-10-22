'use client';

import React, { useState } from 'react';
import { useMarketplace, type NewListingFormData } from '../../lib/marketplace/MarketplaceContext';
import type { WeightUnit } from '../../lib/calculator/types';

interface NewListingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewListingModal({ isOpen, onClose }: NewListingModalProps) {
  const { createListing, currentPersona } = useMarketplace();

  const [formData, setFormData] = useState<NewListingFormData>({
    title: 'Fresh Field Harvested Tomatoes — 5,000 kg',
    commodity: 'Tomato',
    variety: 'Hybrid Roma / Shivam',
    grade: 'Grade-A (Export / Premium)',
    harvestQuantity: 5000,
    quantityUnit: 'kg',
    targetPricePerKg: 28.0,
    harvestDate: '2026-10-17',
    expectedShelfLifeDays: 5,
    farmDistrict: currentPersona.district || 'Kolar',
    farmState: currentPersona.state || 'Karnataka',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<{
    text: string;
    isDb: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResultMessage(null);

    const result = await createListing(formData);
    setIsSubmitting(false);

    if (result.success) {
      setResultMessage({
        text: result.message,
        isDb: result.isSavedToDatabase,
      });

      setTimeout(() => {
        onClose();
        setResultMessage(null);
      }, 2000);
    } else {
      setResultMessage({
        text: result.message,
        isDb: false,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-xl w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🌱</span>
            <div>
              <h3 className="font-bold text-base">Publish Harvest Produce Listing</h3>
              <p className="text-xs text-emerald-100">
                Seller: {currentPersona.name} ({currentPersona.organization})
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

        {/* Security & Zero-Knowledge notice */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/60 px-6 py-2.5 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="font-semibold uppercase tracking-wider text-[10px] bg-emerald-200 dark:bg-emerald-900/80 px-1.5 py-0.5 rounded">
              Privacy Guard
            </span>
            <span>Only macro-location ({formData.farmDistrict}, {formData.farmState}) is published. Exact address & GPS are kept confidential.</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {resultMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                resultMessage.isDb
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              <span>{resultMessage.isDb ? '✓' : 'ℹ'}</span>
              <span>{resultMessage.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Listing Title
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Fresh Field Harvested Tomatoes — 5,000 kg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Commodity
              </label>
              <select
                value={formData.commodity}
                onChange={(e) => setFormData({ ...formData, commodity: e.target.value })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="Tomato">🍅 Tomato</option>
                <option value="Onion">🧅 Onion</option>
                <option value="Potato">🥔 Potato</option>
                <option value="Banana">🍌 Banana</option>
                <option value="Chilli">🌶️ Chilli</option>
                <option value="Carrot">🥕 Carrot</option>
                <option value="Mango">🥭 Mango</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Variety
              </label>
              <input
                type="text"
                required
                value={formData.variety}
                onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                placeholder="e.g. Hybrid Roma"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Grade
              </label>
              <select
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value as NewListingFormData['grade'] })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="Grade-A (Export / Premium)">Grade-A (Export/Premium)</option>
                <option value="Grade-B (Commercial)">Grade-B (Commercial)</option>
                <option value="Grade-C (Processing)">Grade-C (Processing)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Harvest Volume
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={formData.harvestQuantity}
                onChange={(e) =>
                  setFormData({ ...formData, harvestQuantity: parseFloat(e.target.value) || 0 })
                }
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Unit
              </label>
              <select
                value={formData.quantityUnit}
                onChange={(e) => setFormData({ ...formData, quantityUnit: e.target.value as WeightUnit })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="quintal">Quintals (100 kg)</option>
                <option value="tonne">Tonnes (1,000 kg)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Target Price (₹ / kg)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                required
                value={formData.targetPricePerKg}
                onChange={(e) =>
                  setFormData({ ...formData, targetPricePerKg: parseFloat(e.target.value) || 0 })
                }
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Harvest Date
              </label>
              <input
                type="date"
                required
                value={formData.harvestDate}
                onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Expected Shelf Life (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                required
                value={formData.expectedShelfLifeDays}
                onChange={(e) =>
                  setFormData({ ...formData, expectedShelfLifeDays: parseInt(e.target.value, 10) || 1 })
                }
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Farm District
              </label>
              <input
                type="text"
                required
                value={formData.farmDistrict}
                onChange={(e) => setFormData({ ...formData, farmDistrict: e.target.value })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                placeholder="e.g. Kolar"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Farm State
              </label>
              <input
                type="text"
                required
                value={formData.farmState}
                onChange={(e) => setFormData({ ...formData, farmState: e.target.value })}
                className="w-full text-xs font-medium py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                placeholder="e.g. Karnataka"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Validating...' : 'Publish Listing'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
