'use client';

import React from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../lib/calculator/decimal';

export function PaymentsView() {
  const {
    payments,
    orders,
    activeRole,
    isLoadingPayments,
    isDatabasePaymentsConnected,
    databasePaymentsCount,
    databasePaymentsError,
    refreshPayments,
  } = useMarketplace();

  const totalDisbursed = payments
    .filter((p) => p.eventType === 'farmer_proceeds_settled' || p.eventType === 'dispatch_advance_released')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalInEscrow = orders
    .filter((o) => o.escrowStatus !== 'settled' && o.escrowStatus !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAgreedAmount, 0);

  const getEventTypeBadgeClass = (eventType: string) => {
    switch (eventType) {
      case 'escrow_hold_authorized':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700';
      case 'dispatch_advance_released':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700';
      case 'quality_acceptance_confirmed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-700';
      case 'farmer_proceeds_settled':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700';
      default:
        return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Real Supabase vs Demo Sandbox Banner */}
      {activeRole === 'authenticated' ? (
        databasePaymentsError ? (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-900 dark:text-red-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">⚠️</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Supabase Payment Ledger Sync Error</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-200 dark:bg-red-900 text-red-950 dark:text-red-100 font-bold">
                    DATABASE ERROR
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-red-800 dark:text-red-300">
                  {databasePaymentsError}
                </p>
                <p className="text-[10px] text-red-700 dark:text-red-400">
                  CRITICAL: Real database errors are never masked with mock demo data.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshPayments()}
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
                  <span>Supabase Simulated Payments Ledger Connected</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-100 font-bold">
                    POSTGRESQL AUDIT TRAIL
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                  Showing {databasePaymentsCount} persisted payment event(s) recorded in <code>public.simulated_payment_events</code>. Each event is guarded by unique SHA-256 idempotency and server-side role validation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshPayments()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-700 shrink-0 cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
        )
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-xs">
          <span className="text-xl mt-0.5">ℹ️</span>
          <div className="space-y-1">
            <div className="font-bold flex items-center space-x-2">
              <span>Simulated Payments &amp; Settlement Sandbox</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                SIMULATION — In-Memory Demonstration
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              The transaction events below demonstrate SHA-256 idempotency validation and milestone disbursement in memory. They have not been committed to the database <code>public.simulated_payment_events</code> table.
            </p>
          </div>
        </div>
      )}

      {/* Strict Security Disclaimer */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-300 flex items-start space-x-3 shadow-xs">
        <span className="text-xl mt-0.5">🛡️</span>
        <div className="space-y-1">
          <div className="font-bold text-zinc-900 dark:text-zinc-100">
            Payment Simulation &amp; Escrow Security Protocol
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            AgriPrice simulated payments persist immutable escrow milestone records with SHA-256 cryptographic hashes in PostgreSQL. <strong>Real banking credentials, debit/credit cards, and actual fiat transactions are strictly never collected, handled, or transmitted.</strong> Simulated disbursements model contractual escrow releases.
          </p>
        </div>
      </div>

      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Simulated Payments &amp; Escrow Settlement Ledger
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Immutable transaction event log: Trust escrow holds, 40% dispatch advances, quality acceptance, and final net farmer proceeds
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activeRole === 'authenticated' && isDatabasePaymentsConnected ? (
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
              🟢 Live PostgreSQL Ledger
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold">
              🎭 Simulated Escrow Sandbox
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Modeled Farmer Proceeds</span>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono mt-1">
            {formatINR(totalDisbursed)}
          </div>
          <span className="text-[11px] text-zinc-400">Total simulated advances and settlements recorded</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Locked in Trust Escrow (Simulated)</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
            {formatINR(totalInEscrow)}
          </div>
          <span className="text-[11px] text-zinc-400">Escrow commitment pending delivery and quality inspection</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <span className="text-zinc-500 dark:text-zinc-400 block font-medium">Ledger State</span>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1 flex items-center space-x-1">
            {activeRole === 'authenticated' && isDatabasePaymentsConnected ? (
              <>
                <span className="text-lg">PostgreSQL</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                  RLS Live
                </span>
              </>
            ) : (
              <>
                <span className="text-lg">In-Memory</span>
                <span className="text-xs font-bold text-amber-600 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                  Demo Mode
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-zinc-400">Cryptographic SHA-256 idempotency verified</span>
        </div>
      </div>

      {/* Payment Events Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">📜</span>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Payment Events &amp; Audit Trail
            </h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {payments.length} ledger entries
          </span>
        </div>

        {isLoadingPayments ? (
          <div className="p-8 text-center text-xs text-zinc-500 animate-pulse space-y-2">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mx-auto" />
            <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3 mx-auto" />
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
            <div className="text-2xl">📋</div>
            <div className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
              No Payment Events Recorded
            </div>
            <p className="max-w-md mx-auto">
              {activeRole === 'authenticated'
                ? 'No simulated payments have been logged for your authenticated account yet. When escrow deposits, advances, or settlements are initiated on your orders, cryptographic records will appear here.'
                : 'No demo payment events are currently loaded in this sandbox.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Event / Order</th>
                  <th className="py-3 px-4 font-semibold">Event Type</th>
                  <th className="py-3 px-4 font-semibold">Amount</th>
                  <th className="py-3 px-4 font-semibold">Routing Accounts</th>
                  <th className="py-3 px-4 font-semibold">Idempotency &amp; Payload Hash</th>
                  <th className="py-3 px-4 font-semibold">Ledger State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {payments.map((evt) => (
                  <tr key={evt.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5 flex-wrap gap-1">
                        <span>{evt.eventTitle}</span>
                        {evt.isLiveDatabasePayment ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            🟢 Live Supabase Ledger
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                            🎭 Demo Simulation
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                        Order: {evt.orderNumber} • ID: {evt.id.slice(0, 12)}
                        {evt.recordedAt && (
                          <span className="text-zinc-400 ml-2">
                            {new Date(evt.recordedAt).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border ${getEventTypeBadgeClass(evt.eventType)}`}>
                        {evt.eventType.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                      {formatINR(evt.amount)}
                    </td>

                    <td className="py-3.5 px-4 text-[11px]">
                      <div className="text-zinc-500">
                        From: <span className="text-zinc-800 dark:text-zinc-200 font-medium">{evt.sourceAccount}</span>
                      </div>
                      <div className="text-zinc-500">
                        To: <span className="text-zinc-800 dark:text-zinc-200 font-medium">{evt.destinationAccount}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[10px] text-zinc-400 max-w-[220px]">
                      <div className="truncate" title={evt.idempotencyKey}>
                        Key: <span className="text-zinc-600 dark:text-zinc-300">{evt.idempotencyKey}</span>
                      </div>
                      <div className="truncate text-emerald-700 dark:text-emerald-400" title={evt.payloadHash}>
                        Hash: {evt.payloadHash.slice(0, 20)}...
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓ {evt.ledgerState}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
