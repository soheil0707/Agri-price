'use client';

import React from 'react';

export function FutureIntegrations() {
  const roadmapItems = [
    {
      title: 'Real-Time Agmarknet & e-NAM Mandi Sync',
      badge: 'Planned — Phase 2',
      tag: 'Live Mandi Feeds',
      status: 'Awaiting Official API Keys',
      description:
        'Automated daily ingestion of modal and maximum prices from 2,800+ APMC mandis via official Ministry of Agriculture open APIs (Data.gov.in).',
      notes:
        'Currently operating on verified simulated regional benchmarks. No unauthenticated web scraping or synthetic price fabrication is performed.',
    },
    {
      title: 'Digital Escrow & Instant UPI Settlement',
      badge: 'Planned — Phase 2',
      tag: 'Financial Infrastructure',
      status: 'Architecture Drafted',
      description:
        'Automated buyer payment lock upon order acceptance, with multi-sig release of net proceeds directly to farmer bank accounts upon verified delivery.',
      notes:
        'No real or fake payments are executed in this foundation slice. All payment models are represented purely as simulated schema proposals.',
    },
    {
      title: 'Verified Cold-Chain & Transporter Network',
      badge: 'Planned — Phase 3',
      tag: 'Logistics Aggregation',
      status: 'Research Phase',
      description:
        'Integration with regional refrigerated truck fleets and return-load freight aggregators to reduce per-kg transport overhead for high-perishables like tomato.',
      notes:
        'Transport deductions in this foundation slice are deterministic user-configurable levers.',
    },
    {
      title: 'Supabase Multi-Role Auth & KYC Verification',
      badge: 'Planned — Phase 2',
      tag: 'Security & Access',
      status: 'Schema & RLS Ready',
      description:
        'Aadhaar / Farmer ID authentication via DigiLocker, multi-factor login, and strict Row-Level Security for multi-tenant isolation.',
      notes:
        'Full RLS matrix and migration scripts are prepared in `docs/database-schema-proposal.sql`. No external Supabase project has been created.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <div className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Roadmap & Boundary Clarity
          </span>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Upcoming Platform Integrations
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            AgriPrice maintains strict honesty: only fully tested foundation features are operational in this slice.
            Future integrations are documented below and are not presented as active.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
          {roadmapItems.map((item) => (
            <div
              key={item.title}
              className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-5 border border-zinc-200 dark:border-zinc-700/80 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                    {item.tag}
                  </span>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">
                    {item.title}
                  </h4>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {item.badge}
                </span>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {item.description}
              </p>

              <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Foundation Slice Status: </span>
                {item.notes}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
