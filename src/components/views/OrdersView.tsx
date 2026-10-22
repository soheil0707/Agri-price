'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';
import { formatINR } from '../../lib/calculator/decimal';
import type { MarketplaceOrder } from '../../lib/marketplace/types';
import { isEligibleDisputeOrder } from '../../lib/supabase/disputes';

export function OrdersView() {
  const {
    orders,
    advanceOrderStatus,
    cancelOrder,
    raiseDispute,
    setActiveTab,
    activeRole,
    isLoadingOrders,
    isDatabaseOrdersConnected,
    databaseOrdersCount,
    databaseOrdersError,
    refreshOrders,
  } = useMarketplace();

  const { user, profile, roles } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Dispute filing modal state
  const [disputeModalOrder, setDisputeModalOrder] = useState<MarketplaceOrder | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [isFilingDispute, setIsFilingDispute] = useState(false);
  const [disputeFormError, setDisputeFormError] = useState<string | null>(null);

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalOrder) return;
    if (disputeReason.trim().length < 10) {
      setDisputeFormError('Dispute reason must be at least 10 characters.');
      return;
    }
    if (evidenceSummary.trim().length < 10) {
      setDisputeFormError('Evidence summary must be at least 10 characters.');
      return;
    }

    setIsFilingDispute(true);
    setDisputeFormError(null);

    const res = await raiseDispute({
      orderId: disputeModalOrder.id,
      disputeReason: disputeReason.trim(),
      evidenceSummary: evidenceSummary.trim(),
    });

    setIsFilingDispute(false);

    if (res.success) {
      setFeedback(`✓ ${res.message}`);
      setDisputeModalOrder(null);
      setDisputeReason('');
      setEvidenceSummary('');
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setDisputeFormError(res.message || 'Failed to file dispute.');
    }
  };

  const handleAdvance = async (order: MarketplaceOrder) => {
    setActionLoadingId(order.id);
    setErrorMessage(null);
    setFeedback(null);

    const res = await advanceOrderStatus(order.id);
    setActionLoadingId(null);

    if (res.success) {
      setFeedback(res.message);
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setErrorMessage(res.message || 'Operation failed.');
    }
  };

  const handleCancel = async (order: MarketplaceOrder) => {
    if (!window.confirm(`Are you sure you want to cancel Order ${order.orderNumber}? This will release the reserved inventory.`)) {
      return;
    }

    setActionLoadingId(order.id);
    setErrorMessage(null);
    setFeedback(null);

    const res = await cancelOrder(order.id, 'Cancelled by user before escrow lock');
    setActionLoadingId(null);

    if (res.success) {
      setFeedback(res.message);
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setErrorMessage(res.message || 'Cancellation failed.');
    }
  };

  const steps = [
    { key: 'awaiting_escrow', label: '1. Escrow Deposit' },
    { key: 'escrow_funded', label: '2. Escrow Locked' },
    { key: 'in_transit', label: '3. Dispatched & Advance' },
    { key: 'delivered_inspected', label: '4. Quality Inspected' },
    { key: 'settled', label: '5. Settled & Paid' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'awaiting_escrow':
        return 0;
      case 'escrow_funded':
        return 1;
      case 'in_transit':
        return 2;
      case 'delivered_inspected':
        return 3;
      case 'settled':
        return 4;
      case 'cancelled':
        return -1;
      case 'disputed':
        return -2;
      default:
        return 0;
    }
  };

  const getStepActionLabel = (ord: MarketplaceOrder) => {
    if (ord.isLiveDatabaseOrder) {
      switch (ord.escrowStatus) {
        case 'awaiting_escrow':
          return 'Authorize Escrow Deposit (Buyer)';
        case 'escrow_funded':
          return 'Dispatch Produce & Claim 40% Advance (Seller)';
        case 'in_transit':
          return 'Confirm Inspection & Delivery (Buyer)';
        case 'delivered_inspected':
          return 'Disburse Final Settlement (Admin Only)';
        default:
          return 'Advance Milestone';
      }
    }

    switch (ord.escrowStatus) {
      case 'awaiting_escrow':
        return 'Simulate Escrow Deposit (Buyer Demo)';
      case 'escrow_funded':
        return 'Simulate Dispatch & 40% Advance (Demo)';
      case 'in_transit':
        return 'Simulate Delivery & Quality Acceptance (Demo)';
      case 'delivered_inspected':
        return 'Simulate Final Net Proceeds Settlement (Demo)';
      default:
        return 'Advance Milestone';
    }
  };

  return (
    <div className="space-y-6">
      {/* Real Supabase vs Demo Sandbox Banner */}
      {activeRole === 'authenticated' ? (
        databaseOrdersError ? (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-900 dark:text-red-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">⚠️</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Supabase Orders &amp; Reservations Sync Error</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-200 dark:bg-red-900 text-red-950 dark:text-red-100 font-bold">
                    DATABASE ERROR
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-red-800 dark:text-red-300">
                  {databaseOrdersError}
                </p>
                <p className="text-[10px] text-red-700 dark:text-red-400">
                  CRITICAL: Real database errors are never masked with mock demo data.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshOrders()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shrink-0 cursor-pointer shadow-xs"
            >
              Retry Connection
            </button>
          </div>
        ) : isDatabaseOrdersConnected ? (
          <div className="p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start space-x-3">
              <span className="text-xl mt-0.5">🟢</span>
              <div className="space-y-1">
                <div className="font-bold flex items-center space-x-2">
                  <span>Supabase Reservations &amp; Orders Live</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-200/80 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-100 font-bold">
                    POSTGRESQL RLS ENFORCED
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                  Authenticated as <strong>{profile?.full_name || user?.email}</strong> ({roles.join(', ') || 'user'}). Showing {databaseOrdersCount} order(s) governed by row-level security on <code>public.reservations_orders</code>. Milestone transitions trigger cryptographic simulated payment entries.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshOrders()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:hover:bg-emerald-800 text-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-700 shrink-0 cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
        ) : null
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-xs">
          <span className="text-xl mt-0.5">ℹ️</span>
          <div className="space-y-1">
            <div className="font-bold flex items-center space-x-2">
              <span>Simulated Escrow Orders Sandbox</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                SIMULATION — In-Memory Demonstration
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              The orders below simulate lifecycle milestone state transitions in browser memory. To interact with live database reservations and atomic inventory locking, sign into an authenticated account.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Escrow-Protected Orders &amp; Delivery Milestones
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Cryptographic milestone progression: Escrow funding → Dispatch advance → Quality verification → Final proceeds settlement
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer"
        >
          View Payments &amp; Settlement Ledger →
        </button>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 animate-in fade-in flex items-center space-x-2 shadow-xs">
          <span>✓</span>
          <span>{feedback}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-800 animate-in fade-in flex items-center space-x-2 shadow-xs">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoadingOrders ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
              <div className="h-3 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-8 w-full bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        /* Empty State */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center shadow-xs space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl mx-auto">
            📦
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              No Orders Found
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {activeRole === 'authenticated'
                ? 'You do not have any active or settled orders in Supabase yet. When an offer you make or receive is accepted, it will securely generate an escrow order here.'
                : 'No demo orders currently available in this sandbox view.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
            >
              Review Active Offers →
            </button>
          </div>
        </div>
      ) : (
        /* Orders List */
        <div className="space-y-6">
          {orders.map((ord) => {
            const currentStep = getStepIndex(ord.escrowStatus);
            const isCancelled = ord.escrowStatus === 'cancelled';
            const isDisputed = ord.escrowStatus === 'disputed';
            const isProcessing = actionLoadingId === ord.id;

            return (
              <div
                key={ord.id}
                className={`bg-white dark:bg-zinc-900 rounded-2xl border ${
                  isCancelled
                    ? 'border-zinc-200 dark:border-zinc-800 opacity-75'
                    : 'border-zinc-200 dark:border-zinc-800'
                } p-6 shadow-xs space-y-5`}
              >
                {/* Order Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                        {ord.orderNumber}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {ord.commodity} ({ord.variety})
                      </span>
                      {ord.isLiveDatabaseOrder ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                          🟢 Live Database Order (PostgreSQL RLS)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                          🎭 Simulated Demo Order
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Buyer: <strong className="text-zinc-700 dark:text-zinc-300">{ord.buyerOrganization || ord.buyerName}</strong> • Seller: <strong className="text-zinc-700 dark:text-zinc-300">{ord.sellerName}</strong> ({ord.sellerDistrict})
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-zinc-500">Agreed Escrow Total</div>
                    <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                      {formatINR(ord.totalAgreedAmount)}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono">
                      {ord.lockedQuantityKg.toLocaleString('en-IN')} kg @ ₹{ord.agreedPricePerKg}/kg
                    </div>
                  </div>
                </div>

                {/* Progress Milestones Visual Bar */}
                {isCancelled ? (
                  <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 flex items-center space-x-2 font-mono">
                    <span>✕</span>
                    <span>This reservation order was cancelled. Reserved inventory has been restored.</span>
                  </div>
                ) : isDisputed ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-base">⚖️</span>
                      <span>
                        <strong>Active Dispute Under Review:</strong> Escrow funds of {formatINR(ord.totalAgreedAmount)} are frozen. Milestone progression is paused pending administrative ruling.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('disputes')}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer shrink-0 text-xs shadow-xs"
                    >
                      View in Disputes →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Escrow &amp; Logistics State Machine
                      </span>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 capitalize">
                        Current: {ord.escrowStatus.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {steps.map((st, idx) => {
                        const isPassed = idx <= currentStep;
                        const isCurrent = idx === currentStep;

                        return (
                          <div key={st.key} className="space-y-1">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                isPassed
                                  ? 'bg-emerald-600'
                                  : 'bg-zinc-200 dark:bg-zinc-800'
                              } ${isCurrent ? 'ring-2 ring-emerald-400 dark:ring-emerald-600' : ''}`}
                            />
                            <span
                              className={`text-[10px] block font-medium truncate ${
                                isPassed
                                  ? 'text-zinc-800 dark:text-zinc-200 font-semibold'
                                  : 'text-zinc-400 dark:text-zinc-600'
                              }`}
                            >
                              {st.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Logistics & Transit Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Cold Storage / Hub</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {ord.storageProvider || 'Direct Farmgate Loading'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block">Logistics Transporter</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {isCancelled
                        ? 'Cancelled — Dispatch Aborted'
                        : isDisputed
                        ? `${ord.transporterName || 'Fleet Assigned'} (Transit Paused)`
                        : ord.transporterName || (ord.escrowStatus === 'awaiting_escrow' ? 'Pending Escrow Authorization' : 'Pending Transporter Assignment')}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-500 block">Pickup &amp; Transit Schedule</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {isCancelled
                        ? 'Cancelled — No Transit Scheduled'
                        : isDisputed
                        ? 'Frozen — Arbitration Pending'
                        : ord.escrowStatus === 'awaiting_escrow'
                        ? 'Pending Escrow Funding'
                        : ord.escrowStatus === 'escrow_funded'
                        ? 'Ready for Farmgate Dispatch'
                        : ord.escrowStatus === 'in_transit'
                        ? ord.pickupScheduledAt || 'In Transit'
                        : ord.deliveredAt
                        ? `Delivered: ${ord.deliveredAt}`
                        : 'Delivered & Accepted'}
                    </span>
                  </div>
                </div>

                {/* Action Progression Controls */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500 max-w-lg">
                    {ord.isLiveDatabaseOrder ? (
                      isDisputed
                        ? 'Arbitration Active: Order status is frozen in PostgreSQL database until an authorized administrator arbitrates.'
                        : ord.escrowStatus === 'awaiting_escrow'
                        ? 'Next Step: Buyer deposits agreed funds to lock escrow. Server-enforced via PostgreSQL RPC.'
                        : ord.escrowStatus === 'escrow_funded'
                        ? 'Next Step: Producer/Seller dispatches cargo and claims 40% advance via dispatch_order_advance.'
                        : ord.escrowStatus === 'in_transit'
                        ? 'Next Step: Buyer confirms arrival and Grade-A quality inspection.'
                        : ord.escrowStatus === 'delivered_inspected'
                        ? 'Next Step: Platform Administrator settles final net farmer proceeds via record_simulated_payment_event.'
                        : ord.escrowStatus === 'settled'
                        ? '✓ Full transaction lifecycle completed and audited in PostgreSQL ledger.'
                        : 'Order status: ' + ord.escrowStatus
                    ) : (
                      isDisputed
                        ? 'Disputed in demo sandbox: Escrow is simulated-locked until arbitrated in the Disputes module.'
                        : ord.escrowStatus === 'awaiting_escrow'
                        ? 'Simulated state: Buyer must deposit agreed funds into trust escrow account.'
                        : ord.escrowStatus === 'escrow_funded'
                        ? 'Escrow verified in simulation. Ready for farmer dispatch and advance release.'
                        : ord.escrowStatus === 'in_transit'
                        ? 'Consignment moving with simulated transporter. Awaiting mock destination inspection.'
                        : ord.escrowStatus === 'delivered_inspected'
                        ? 'Quality confirmed in demo workflow. Ready for simulated final payout.'
                        : ord.escrowStatus === 'settled'
                        ? '✓ Full simulated transaction lifecycle complete. Modeled proceeds settled in demo ledger.'
                        : 'Order status: ' + ord.escrowStatus
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Cancellation option if awaiting escrow */}
                    {ord.escrowStatus === 'awaiting_escrow' && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleCancel(ord)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isProcessing ? 'Processing...' : 'Cancel Reservation'}
                      </button>
                    )}

                    {/* Dispute option if eligible and not already disputed */}
                    {isEligibleDisputeOrder(ord.escrowStatus) && !isDisputed && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => {
                          setDisputeModalOrder(ord);
                          setDisputeReason('');
                          setEvidenceSummary('');
                          setDisputeFormError(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        ⚖️ Raise Dispute
                      </button>
                    )}

                    {/* View in Disputes button if currently disputed */}
                    {isDisputed && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('disputes')}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors cursor-pointer"
                      >
                        ⚖️ View Dispute Arbitration
                      </button>
                    )}

                    {!isDisputed && ord.escrowStatus !== 'settled' && ord.escrowStatus !== 'cancelled' && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAdvance(ord)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <>
                            <span className="animate-spin text-sm">↻</span>
                            <span>Updating Database...</span>
                          </>
                        ) : (
                          <>
                            <span>▶</span>
                            <span>{getStepActionLabel(ord)}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dispute Filing Modal */}
      {disputeModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <span>⚖️ Raise Formal Order Dispute</span>
                </h3>
                <p className="text-xs text-zinc-500 font-mono">
                  Ref Order: {disputeModalOrder.orderNumber} • Escrow: {formatINR(disputeModalOrder.totalAgreedAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDisputeModalOrder(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <span>⚠️</span>
                <span>Binding Escrow Freeze Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Raising a dispute immediately freezes all escrow funds associated with this consignment. Order progress is locked until resolved by platform arbitration.
              </p>
            </div>

            {disputeFormError && (
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-800 text-xs font-semibold">
                ⚠️ {disputeFormError}
              </div>
            )}

            <form onSubmit={handleDisputeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Dispute Reason / Claim Statement *
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the defect, transit delay, weight discrepancy, or breach of agreed specification..."
                  className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[10px] text-zinc-400">Minimum 10 characters</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Field Evidence Summary / Inspection Log *
                </label>
                <textarea
                  rows={3}
                  required
                  value={evidenceSummary}
                  onChange={(e) => setEvidenceSummary(e.target.value)}
                  placeholder="Detail laboratory test results, gate weighbridge tickets, moisture meter readings, or unboxing inspection logs..."
                  className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-zinc-900 dark:text-zinc-100"
                />
                <span className="text-[10px] text-zinc-400">Minimum 10 characters</span>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDisputeModalOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isFilingDispute}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isFilingDispute ? (
                    <>
                      <span className="animate-spin text-sm">↻</span>
                      <span>Filing Dispute...</span>
                    </>
                  ) : (
                    <span>Submit &amp; Freeze Escrow</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
