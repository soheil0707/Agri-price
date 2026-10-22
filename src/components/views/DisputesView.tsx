'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { formatINR } from '../../lib/calculator/decimal';

import { useAuth } from '../AuthContext';
import type { MarketplaceDispute } from '../../lib/marketplace/types';

export function DisputesView() {
  const {
    appMode,
    disputes,
    isLoadingDisputes,
    isDatabaseDisputesSchemaInstalled,
    databaseDisputesError,
    refreshDisputes,
    resolveDispute,
    raiseDispute,
    orders,
    activeRole,
    setActiveTab,
  } = useMarketplace();

  const { roles } = useAuth();
  // Server/DB verified admin check in live account mode; demo admin simulation permitted only in demo sandbox
  const isAdmin =
    appMode === 'live_account'
      ? roles.some((r) => String(r).toLowerCase() === 'admin')
      : activeRole === 'admin';

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // New dispute filing state
  const [showFilingModal, setShowFilingModal] = useState<boolean>(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [disputeReason, setDisputeReason] = useState<string>('');
  const [evidenceSummary, setEvidenceSummary] = useState<string>('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState<boolean>(false);

  // Eligible orders for raising a dispute
  const eligibleOrders = orders.filter((o) =>
    ['awaiting_escrow', 'escrow_funded', 'in_transit', 'delivered_inspected'].includes(o.escrowStatus)
  );

  const handleResolve = async (
    dispute: MarketplaceDispute,
    action: 'release_seller' | 'refund_buyer' | 'split_5050'
  ) => {
    if (!isAdmin && activeRole === 'authenticated') {
      setErrorMessage('Authorization Violation: Only platform administrators are permitted to arbitrate and resolve disputes.');
      return;
    }

    setActionLoadingId(dispute.id);
    setErrorMessage(null);
    setFeedback(null);

    const resolutionStatus =
      action === 'release_seller'
        ? 'resolved_seller_paid'
        : action === 'refund_buyer'
        ? 'resolved_buyer_refunded'
        : 'resolved_mutual_split';

    const resolutionNotes =
      action === 'release_seller'
        ? 'Escrow released to seller after quality review.'
        : action === 'refund_buyer'
        ? 'Escrow refunded to buyer following verified damage or defect.'
        : 'Mutual resolution determination: 50% escrow released to farmer, 50% refunded to buyer.';

    const res = await resolveDispute({
      disputeId: dispute.id,
      resolutionStatus,
      resolutionNotes,
    });

    setActionLoadingId(null);

    if (res.success) {
      setFeedback(`✓ Dispute ${dispute.id} arbitrated: ${res.message}`);
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setErrorMessage(res.message || 'Arbitration operation failed.');
    }
  };

  const handleFilingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) {
      setErrorMessage('Please select an active order to dispute.');
      return;
    }
    if (disputeReason.trim().length < 10) {
      setErrorMessage('Dispute reason must be at least 10 characters.');
      return;
    }
    if (evidenceSummary.trim().length < 10) {
      setErrorMessage('Evidence summary must be at least 10 characters.');
      return;
    }

    setIsSubmittingDispute(true);
    setErrorMessage(null);

    const res = await raiseDispute({
      orderId: selectedOrderId,
      disputeReason: disputeReason.trim(),
      evidenceSummary: evidenceSummary.trim(),
    });

    setIsSubmittingDispute(false);

    if (res.success) {
      setFeedback(`✓ ${res.message}`);
      setShowFilingModal(false);
      setSelectedOrderId('');
      setDisputeReason('');
      setEvidenceSummary('');
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setErrorMessage(res.message || 'Failed to file dispute.');
    }
  };

  const pendingCount = disputes.filter((d) => d.status === 'under_review').length;
  const resolvedCount = disputes.filter((d) => d.status !== 'under_review').length;

  return (
    <div className="space-y-6">
      {/* Schema / Error Notice */}
      {databaseDisputesError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span><strong>Dispute Database Notice:</strong> {databaseDisputesError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshDisputes()}
            className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {appMode === 'live_account' && !isDatabaseDisputesSchemaInstalled && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="flex items-center space-x-2 font-bold">
            <span className="text-base">ℹ️</span>
            <span>Database Table public.order_disputes Pending DBA Application</span>
          </div>
          <p className="leading-relaxed">
            Live database table <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">order_disputes</code> and arbitration procedure are not yet applied to Supabase. Review <code className="font-mono font-semibold">docs/migration-phase6-unified-audit.sql</code> for the reviewed additive migration candidate.
          </p>
        </div>
      )}

      {/* Mode Notice */}
      <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3">
        <span className="text-xl mt-0.5">⚖️</span>
        <div className="space-y-1">
          <div className="font-bold flex items-center space-x-2">
            <span>Platform Escrow Arbitration &amp; Dispute Resolution</span>
            {appMode === 'live_account' ? (
              isDatabaseDisputesSchemaInstalled ? (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 font-bold">
                  🟢 Live DB Queue (RLS Enforced)
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                  ⚠️ Schema Not Installed
                </span>
              )
            ) : (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200/80 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold">
                🎭 In-Memory Demo Sandbox
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            Platform administrators arbitrate quality claims, moisture discrepancies, transit delays, and delivery disputes. 
            All escrow adjustments preserve strict double-entry integrity before updating settlement state.
          </p>
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center space-x-2">
            <span>Active Marketplace Disputes Queue</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300">
                {pendingCount} Pending Action
              </span>
            )}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Review quality inspection certificates, weighbridge tickets, and arbitrate locked escrow payouts.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <button
            type="button"
            onClick={() => setShowFilingModal(true)}
            className="px-3 py-1.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer flex items-center space-x-1.5"
          >
            <span>⚖️</span>
            <span>Raise Commercial Dispute</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className="px-3 py-1.5 rounded-xl font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
          >
            Audit Escrow Ledger →
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-red-100 dark:bg-red-950/60 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-800 animate-in fade-in flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-950 dark:text-red-300 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filing Modal */}
      {showFilingModal && (
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-rose-300 dark:border-rose-900/60 shadow-lg space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>⚖️</span>
                <span>File Commercial Dispute &amp; Freeze Escrow</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Freezes order status to &quot;disputed&quot; in the state machine, preventing fund release until arbitrated.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFilingModal(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold"
            >
              ✕ Cancel
            </button>
          </div>

          <form onSubmit={handleFilingSubmit} className="space-y-4 text-xs">
            <div>
              <label htmlFor="dispute-order-select" className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Select Order to Dispute *
              </label>
              {eligibleOrders.length === 0 ? (
                <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                  No active orders available in an eligible escrow status for filing disputes.
                </div>
              ) : (
                <select
                  id="dispute-order-select"
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  required
                >
                  <option value="">-- Choose an active order --</option>
                  {eligibleOrders.map((ord) => (
                    <option key={ord.id} value={ord.id}>
                      {ord.orderNumber} — {ord.commodity} ({ord.lockedQuantityKg} kg) — Escrow: {ord.escrowStatus}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="dispute-reason-input" className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Dispute Reason (min 10 characters) *
              </label>
              <textarea
                id="dispute-reason-input"
                rows={2}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="E.g., Grade specification discrepancy (Brix < 4.8°), moisture level in excess of agreed APMC grade..."
                className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>

            <div>
              <label htmlFor="dispute-evidence-input" className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Evidence Summary (Lab reports, weighbridge slips, photo logs) *
              </label>
              <textarea
                id="dispute-evidence-input"
                rows={2}
                value={evidenceSummary}
                onChange={(e) => setEvidenceSummary(e.target.value)}
                placeholder="E.g., Refractometer calibration certificate attached. 3 samples tested at factory intake gate..."
                className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowFilingModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingDispute || eligibleOrders.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs disabled:opacity-50"
              >
                {isSubmittingDispute ? 'Submitting Dispute...' : 'Confirm & Freeze Escrow'}
              </button>
            </div>
          </form>
        </div>
      )}

      {feedback && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 animate-in fade-in flex items-center space-x-2">
          <span>✓</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* Disputes Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Open Claims
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
            {pendingCount}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Requires admin determination</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Disputed Escrow Value
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1 font-mono">
            {formatINR(
              disputes
                .filter((d) => d.status === 'under_review')
                .reduce((sum, d) => sum + d.escrowLockedAmount, 0)
            )}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Currently locked in trust account</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Arbitrated & Resolved
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
            {resolvedCount}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Resolved within 24h SLA target</div>
        </div>
      </div>

      {/* Disputes List */}
      <div className="space-y-4">
        {isLoadingDisputes ? (
          <div className="p-12 text-center text-xs text-zinc-400 space-y-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="animate-spin text-2xl mx-auto">↻</div>
            <div>Querying dispute arbitration records...</div>
          </div>
        ) : disputes.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2">
            <span className="text-2xl block">⚖️</span>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">
              {isDatabaseDisputesSchemaInstalled
                ? 'No active or historical disputes recorded.'
                : 'Dispute Arbitration Table Not Configured in Database'}
            </div>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
              {isDatabaseDisputesSchemaInstalled
                ? 'All agricultural orders are currently progressing normally without unresolved arbitration claims.'
                : 'Table public.order_disputes has not yet been applied to Supabase. Review docs/migration-phase6-unified-audit.sql for schema definition.'}
            </p>
          </div>
        ) : (
          disputes.map((dispute) => {
            const isPending = dispute.status === 'under_review';

          return (
            <div
              key={dispute.id}
              className={`bg-white dark:bg-zinc-900 rounded-2xl border p-5 shadow-xs space-y-4 transition-all ${
                isPending
                  ? 'border-amber-300 dark:border-amber-800/80 ring-1 ring-amber-200 dark:ring-amber-900/40'
                  : 'border-zinc-200 dark:border-zinc-800 opacity-90'
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {dispute.id}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">
                    ref: {dispute.orderNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      isPending
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {isPending ? 'Under Review' : 'Resolved'}
                  </span>
                  {dispute.isLiveDatabaseRecord ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      🟢 Live DB
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                      🎭 Demo Dispute
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {formatINR(dispute.escrowLockedAmount)} Escrow Locked
                  </span>
                  <div className="text-[10px] text-zinc-400 font-mono">Filed: {dispute.filedAt}</div>
                </div>
              </div>

              {/* Dispute Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-500">Parties Involved:</span>
                    <div className="text-zinc-800 dark:text-zinc-200 mt-0.5">
                      <strong>Claimant:</strong> {dispute.claimant} ({dispute.claimantRole})
                    </div>
                    <div className="text-zinc-800 dark:text-zinc-200 mt-0.5">
                      <strong>Respondent:</strong> {dispute.respondent}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-zinc-500">Produce Details:</span>
                    <div className="text-zinc-800 dark:text-zinc-200 mt-0.5">
                      {dispute.commodity} • {dispute.quantityKg.toLocaleString('en-IN')} kg
                    </div>
                  </div>
                </div>

                <div className="space-y-2 bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/40">
                  <div>
                    <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                      Dispute Claim Statement:
                    </span>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      {dispute.disputeReason}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                      Field Evidence / Inspection Log:
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 italic">
                      {dispute.evidenceSummary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Resolution Info or Actions */}
              {dispute.resolutionNotes ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 space-y-0.5">
                  <div className="font-bold flex items-center space-x-1.5">
                    <span>✓</span>
                    <span>Arbitration Ruling Documented</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    {dispute.resolutionNotes}
                  </p>
                </div>
              ) : (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Select binding arbitrator action:
                    </span>
                    {activeRole === 'authenticated' && !isAdmin && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 font-semibold">
                        Requires Admin Role
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={actionLoadingId === dispute.id || (activeRole === 'authenticated' && !isAdmin)}
                      onClick={() => handleResolve(dispute, 'release_seller')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs cursor-pointer"
                    >
                      {actionLoadingId === dispute.id ? 'Arbitrating...' : 'Release Escrow to Seller'}
                    </button>
                    <button
                      type="button"
                      disabled={actionLoadingId === dispute.id || (activeRole === 'authenticated' && !isAdmin)}
                      onClick={() => handleResolve(dispute, 'split_5050')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs cursor-pointer"
                    >
                      Arbitrate 50/50 Split
                    </button>
                    <button
                      type="button"
                      disabled={actionLoadingId === dispute.id || (activeRole === 'authenticated' && !isAdmin)}
                      onClick={() => handleResolve(dispute, 'refund_buyer')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-800 dark:text-zinc-200 cursor-pointer"
                    >
                      Refund Escrow to Buyer
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
      </div>
    </div>
  );
}
