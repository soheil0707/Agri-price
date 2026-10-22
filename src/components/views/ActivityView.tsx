'use client';

import React, { useState } from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';

export function ActivityView() {
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    setActiveTab,
    activeRole,
    isLoadingNotifications,
    isDatabaseNotificationsSchemaInstalled,
    databaseNotificationsError,
    refreshNotifications,
  } = useMarketplace();
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filtered = notifications.filter((n) => {
    if (filterCategory === 'all') return true;
    return n.category === filterCategory;
  });

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'offer':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
      case 'order':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
      case 'payment':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      case 'storage':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300';
      case 'dispute':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
      default:
        return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Schema / Error Notice */}
      {databaseNotificationsError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span><strong>Notification Database Notice:</strong> {databaseNotificationsError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshNotifications()}
            className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {activeRole === 'authenticated' && !isDatabaseNotificationsSchemaInstalled && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="flex items-center space-x-2 font-bold">
            <span className="text-base">ℹ️</span>
            <span>Database Table public.user_notifications Pending DBA Review</span>
          </div>
          <p className="leading-relaxed">
            Live database table <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">user_notifications</code> is not yet applied to Supabase. Review <code className="font-mono font-semibold">docs/hotfix-phase4-notifications-disputes.sql</code> to deploy RLS-protected notification tables. Displaying session activity stream.
          </p>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Activity Feed &amp; Transaction Audit Trail
            </h2>
            {activeRole === 'authenticated' && isDatabaseNotificationsSchemaInstalled ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                🟢 Live DB Stream (RLS Enforced)
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                🎭 Simulated Feed (Prototype Mode)
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Chronological audit log across farmgate listings, negotiations, logistics milestones, and payments.
          </p>
        </div>

        <button
          type="button"
          onClick={() => markAllNotificationsAsRead()}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
        >
          ✓ Mark All Read
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {['all', 'listing', 'offer', 'order', 'payment', 'storage', 'dispute', 'system'].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-xl font-semibold capitalize transition-colors ${
              filterCategory === cat
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs divide-y divide-zinc-100 dark:divide-zinc-800">
        {isLoadingNotifications ? (
          <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
            <div className="animate-spin text-2xl mx-auto">↻</div>
            <div>Querying authenticated notifications stream...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            No events found in this category.
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.read) {
                  void markNotificationAsRead(item.id);
                }
                if (item.actionUrlTab) {
                  setActiveTab(item.actionUrlTab);
                }
              }}
              className={`py-4 first:pt-0 last:pb-0 flex items-start space-x-3 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 rounded-xl px-2 transition-colors ${
                !item.read ? 'bg-cyan-50/30 dark:bg-cyan-950/20' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base shrink-0 mt-0.5">
                {item.category === 'payment'
                  ? '💳'
                  : item.category === 'offer'
                  ? '🤝'
                  : item.category === 'order'
                  ? '🚚'
                  : item.category === 'storage'
                  ? '❄️'
                  : item.category === 'dispute'
                  ? '⚖️'
                  : '🌱'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getCategoryBadge(
                        item.category
                      )}`}
                    >
                      {item.category}
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </span>
                    {item.isLiveDatabaseRecord ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                        Live DB
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Demo
                      </span>
                    )}
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse" title="Unread" />
                    )}
                  </div>

                  <span className="text-[11px] text-zinc-400 font-mono">
                    {item.timestamp}
                  </span>
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
