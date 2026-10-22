'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';

export function StorageView() {
  const {
    appMode,
    storageUnits,
    bookStorage,
    isLoadingStorage,
    isDatabaseStorageSchemaInstalled,
    databaseStorageError,
    refreshStorage,
  } = useMarketplace();

  const { user, profile } = useAuth();
  const [bookingUnitId, setBookingUnitId] = useState<string | null>(null);
  const [requestedMt, setRequestedMt] = useState<number>(25);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleBook = async (storageId: string) => {
    if (requestedMt <= 0 || isNaN(requestedMt)) {
      setErrorMessage('Requested capacity must be strictly greater than 0 MT.');
      return;
    }

    const unit = storageUnits.find((u) => u.id === storageId);
    if (unit && requestedMt > unit.availableCapacityMt) {
      setErrorMessage(`Cannot exceed available space: Maximum booking at this facility is ${unit.availableCapacityMt} MT.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setBookingFeedback(null);

    const res = await bookStorage(storageId, requestedMt);
    setIsSubmitting(false);

    if (res.success) {
      setBookingUnitId(null);
      setBookingFeedback(res.message);
      setTimeout(() => setBookingFeedback(null), 5000);
    } else {
      setErrorMessage(res.message);
    }
  };

  const totalCapacity = storageUnits.reduce((sum, u) => sum + u.totalCapacityMt, 0);
  const totalAvailable = storageUnits.reduce((sum, u) => sum + u.availableCapacityMt, 0);

  return (
    <div className="space-y-6">
      {/* Real Database vs Demo Mode Banner */}
      {appMode === 'live_account' ? (
        !isDatabaseStorageSchemaInstalled ? (
          <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">ℹ️</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Supabase Cold-Storage Schema Status</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                    MIGRATION PENDING
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Authenticated as <strong>{profile?.full_name || user?.email}</strong>. Dedicated table <code>public.cold_storage_facilities</code> is pending administrator application in <code>docs/migration-phase6-unified-audit.sql</code>. Live storage records unavailable until schema is deployed.
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Note: Active shipment and logistics transit milestones continue to persist in <code>public.reservations_orders</code>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshStorage()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-100 hover:bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 shrink-0 cursor-pointer"
            >
              ↻ Probe Schema
            </button>
          </div>
        ) : databaseStorageError ? (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-900 dark:text-red-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">⚠️</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Cold Storage Query Error</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-200 dark:bg-red-900 text-red-950 dark:text-red-100 font-bold">
                    DATABASE ERROR
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-red-800 dark:text-red-300">
                  {databaseStorageError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshStorage()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shrink-0 cursor-pointer shadow-xs"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">🟢</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Supabase Cold Storage Directory Live</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-100 font-bold">
                    POSTGRESQL RLS ENFORCED
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                  Showing {storageUnits.length} active cold-storage facilities from <code>public.cold_storage_facilities</code>. Capacity reservations lock allocations via atomic database stored procedures.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshStorage()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-700 shrink-0 cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
        )
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-xs">
          <span className="text-xl mt-0.5">❄️</span>
          <div className="space-y-1">
            <div className="font-bold flex items-center space-x-2">
              <span>Cold Storage Capacity &amp; Logistics Hub</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                SIMULATION — In-Memory Directory
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              WDRA-registered multi-chamber cold storage facilities with capacity allocation and reefer booking models. Data shown is an interactive demonstration directory.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Cold Storage &amp; Regional Logistics Hubs
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            WDRA specification profiles with real-time chamber monitoring and atomic capacity reservation
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold">
            ❄️ Total Available: {totalAvailable.toLocaleString('en-IN')} / {totalCapacity.toLocaleString('en-IN')} MT
          </div>
        </div>
      </div>

      {bookingFeedback && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 animate-in fade-in flex items-center space-x-2 shadow-xs">
          <span>✓</span>
          <span>{bookingFeedback}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-800 animate-in fade-in flex items-center space-x-2 shadow-xs">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Facilities Grid */}
      {isLoadingStorage ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs animate-pulse space-y-4">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
              <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : storageUnits.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
          <span className="text-3xl block">❄️</span>
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {isDatabaseStorageSchemaInstalled
                ? 'No Active Facilities Available'
                : 'Cold Storage Database Schema Not Yet Applied'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              {isDatabaseStorageSchemaInstalled
                ? 'There are currently no active cold storage facilities registered in your district.'
                : 'Live table public.cold_storage_facilities has not been applied to Supabase. Review docs/migration-phase6-unified-audit.sql for the additive migration candidate.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {storageUnits.map((unit) => {
            const occupancyPercent = Math.round(
              ((unit.totalCapacityMt - unit.availableCapacityMt) / unit.totalCapacityMt) * 100
            );

            return (
              <div
                key={unit.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col overflow-hidden"
              >
                {/* Header */}
                <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-500">{unit.district}, {unit.state}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">★ {unit.rating}</span>
                  </div>
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {unit.facilityName}
                    </h3>
                    {unit.isLiveDatabaseRecord ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                        🟢 Live DB
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Reference Hub
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Operator: {unit.operatorName} • {unit.chamberCount} Chambers
                  </div>
                </div>

                {/* Body */}
                <div className="p-5 flex-1 space-y-4 text-xs">
                  {/* Capacity Occupancy Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">Capacity Occupancy</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {unit.availableCapacityMt} MT Available ({occupancyPercent}% full)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          occupancyPercent > 80 ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${occupancyPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block">Temperature Zone</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {unit.temperatureRange}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Daily Tariff</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                        ₹{unit.dailyRatePerQuintal}/quintal/day
                      </span>
                    </div>
                  </div>

                  {/* Suitable commodities */}
                  <div>
                    <span className="text-[11px] text-zinc-500 font-medium block mb-1">
                      Suitable Crops
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {unit.suitableCommodities.map((crop) => (
                        <span
                          key={crop}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        >
                          {crop}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Certifications */}
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {unit.certifications.map((c) => (
                      <span
                        key={c}
                        className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold"
                      >
                        ✓ {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40">
                  {bookingUnitId === unit.id ? (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-zinc-600 dark:text-zinc-400 font-medium text-[11px]">Reserve MT:</span>
                        <input
                          type="number"
                          min="1"
                          max={unit.availableCapacityMt}
                          value={requestedMt}
                          onChange={(e) => setRequestedMt(parseFloat(e.target.value) || 0)}
                          className="w-20 py-1 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                        />
                        <button
                          type="button"
                          disabled={isSubmitting || requestedMt <= 0 || requestedMt > unit.availableCapacityMt}
                          onClick={() => handleBook(unit.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          {isSubmitting ? 'Allocating...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setBookingUnitId(null)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      {requestedMt > unit.availableCapacityMt && (
                        <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                          Capacity over-allocation prevented: Available headroom is {unit.availableCapacityMt} MT.
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={unit.availableCapacityMt === 0}
                      onClick={() => {
                        setBookingUnitId(unit.id);
                        setRequestedMt(Math.min(25, unit.availableCapacityMt));
                        setErrorMessage(null);
                      }}
                      className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white shadow-xs transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>❄️</span>
                      <span>{unit.availableCapacityMt === 0 ? 'Facility Full' : 'Book Cold Storage Space'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
