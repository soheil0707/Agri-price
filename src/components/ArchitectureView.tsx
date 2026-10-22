'use client';

import React, { useState } from 'react';

export function ArchitectureView() {
  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'rls' | 'ledger'>('tables');

  const tables = [
    {
      name: 'profiles',
      description: 'Farmer, trader, processor, and transporter account metadata with verified KYC and bank details.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'auth_user_id -> auth.users(id)',
    },
    {
      name: 'user_roles',
      description: 'Multi-role RBAC mapping (farmer, trader, processor, fpo_admin, transporter, admin).',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'profile_id -> profiles(id)',
    },
    {
      name: 'produce_listings',
      description: 'Physical commodity batches with harvest date, shelf life, origin coordinates, and target price.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'seller_profile_id -> profiles(id)',
    },
    {
      name: 'market_price_benchmarks',
      description: 'Regional historical and simulated APMC modal prices with source attribution and audit trail.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'None (Reference Catalog)',
    },
    {
      name: 'calculation_snapshots',
      description: 'Immutable record of deterministic net-proceeds calculations executed by farmers or buyers.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'created_by_profile_id -> profiles(id), listing_id -> produce_listings(id)',
    },
    {
      name: 'offers_negotiations',
      description: 'Buyer bids, price-per-kg proposals, transport allocation terms, and expiration timestamps.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'listing_id -> produce_listings(id), buyer_profile_id -> profiles(id)',
    },
    {
      name: 'reservations_orders',
      description: 'Locked inventory contract post-negotiation, escrow states, and assigned transporter.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'seller_profile_id, buyer_profile_id, assigned_transporter_id -> profiles(id)',
    },
    {
      name: 'simulated_payment_events',
      description: 'Append-only financial event ledger with idempotency keys and state transition audits.',
      primaryKeys: 'id (UUID)',
      foreignKeys: 'order_id -> reservations_orders(id)',
    },
  ];

  const rlsMatrix = [
    {
      table: 'profiles',
      select: 'Authenticated users can view verified profiles; self can view full profile',
      insert: 'Self only on auth registration',
      update: 'Self only (role escalation blocked)',
      delete: 'Self or Admin only',
    },
    {
      table: 'user_roles',
      select: 'User can view own assigned roles',
      insert: 'Admin only',
      update: 'Admin only',
      delete: 'Admin only',
    },
    {
      table: 'produce_listings',
      select: 'Public read for active listings; seller can view draft/archived',
      insert: 'Farmers and FPO Admins only',
      update: 'Owner only while in draft/active state',
      delete: 'Owner soft-delete only',
    },
    {
      table: 'market_price_benchmarks',
      select: 'Public read for all users',
      insert: 'Ingestion Cron / Admin only',
      update: 'Admin only',
      delete: 'Admin only',
    },
    {
      table: 'calculation_snapshots',
      select: 'Owner who calculated and linked buyer in offer',
      insert: 'Creator only (strictly immutable)',
      update: 'Disallowed (Immutable Audit)',
      delete: 'Disallowed',
    },
    {
      table: 'offers_negotiations',
      select: 'Buyer and Seller involved in negotiation',
      insert: 'Verified Traders and Processors',
      update: 'Active parties while pending/countered',
      delete: 'Disallowed once submitted',
    },
    {
      table: 'reservations_orders',
      select: 'Order buyer, seller, assigned transporter, admin',
      insert: 'System function upon offer acceptance',
      update: 'Parties based on state machine',
      delete: 'Disallowed',
    },
    {
      table: 'simulated_payment_events',
      select: 'Buyer, Seller, Platform Admin',
      insert: 'Secure ledger RPC only',
      update: 'Disallowed (Append-only ledger)',
      delete: 'Disallowed',
    },
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            System Architecture Proposal
          </span>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            PostgreSQL / Supabase Schema & Security Matrix
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Complete database design specification for multi-role isolation, calculation snapshots, and idempotent event ledgers
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            docs/database-schema-proposal.sql
          </span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveSubTab('tables')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === 'tables'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          🗂️ Proposed Tables (8 Core Entities)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('rls')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === 'rls'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          🛡️ Row-Level Security (RLS) Matrix
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('ledger')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === 'ledger'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          ⚡ Idempotent Payment & Escrow Design
        </button>
      </div>

      {/* Tab Content */}
      {activeSubTab === 'tables' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 font-semibold text-zinc-700 dark:text-zinc-300">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 text-left">Entity Name</th>
                  <th className="px-3 py-2.5 text-left">Description & Scope</th>
                  <th className="px-3 py-2.5 text-left">Primary Key</th>
                  <th className="py-2.5 pl-3 pr-4 text-left">Key Relationships</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {tables.map((t) => (
                  <tr key={t.name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {t.name}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {t.description}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-500">
                      {t.primaryKeys}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 font-mono text-zinc-500">
                      {t.foreignKeys}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'rls' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 font-semibold text-zinc-700 dark:text-zinc-300">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 text-left">Table</th>
                  <th className="px-3 py-2.5 text-left">SELECT (Read) Policy</th>
                  <th className="px-3 py-2.5 text-left">INSERT Policy</th>
                  <th className="px-3 py-2.5 text-left">UPDATE Policy</th>
                  <th className="py-2.5 pl-3 pr-4 text-left">DELETE Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {rlsMatrix.map((r) => (
                  <tr key={r.table} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {r.table}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{r.select}</td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{r.insert}</td>
                    <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">{r.update}</td>
                    <td className="py-2.5 pl-3 pr-4 text-zinc-600 dark:text-zinc-400">{r.delete}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'ledger' && (
        <div className="bg-zinc-50 dark:bg-zinc-800/40 p-5 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-4 text-xs">
          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>🛡️</span>
            <span>Simulated Escrow & Financial Event Safeguards</span>
          </h4>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            To strictly ensure no simulated payments or fake transactions are presented to users as real financial operations,
            the database schema adopts an <strong>Append-Only Financial Event Ledger</strong> model:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">1. Idempotency Keys</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Every event contains a client-generated UUID or hash, ensuring network retries cannot duplicate transactions.
              </span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">2. Immutable Records</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                UPDATE and DELETE policies on `simulated_payment_events` are strictly denied. Corrections require compensating events.
              </span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">3. State Machine</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Transitions from awaiting_escrow &rarr; escrow_funded &rarr; in_transit &rarr; settled strictly require signed event payloads.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span>📄</span>
          <span>Full SQL Migration File ready in <code className="font-mono bg-emerald-100 dark:bg-emerald-900 px-1 py-0.5 rounded">docs/database-schema-proposal.sql</code></span>
        </div>
        <span className="font-semibold text-emerald-800 dark:text-emerald-300">Ready for Future Supabase / Postgres Deploy</span>
      </div>
    </div>
  );
}
