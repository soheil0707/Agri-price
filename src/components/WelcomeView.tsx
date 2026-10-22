'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface WelcomeViewProps {
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onEnterDemoSandbox: (role?: string) => void;
  isConfigured: boolean;
}

export function WelcomeView({
  onOpenSignIn,
  onOpenSignUp,
  onEnterDemoSandbox,
  isConfigured,
}: WelcomeViewProps) {
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>('farmer');

  const rolesList = [
    {
      id: 'farmer',
      title: 'Farmer / Producer',
      icon: '👨‍🌾',
      badge: 'Harvest Monetization',
      color: 'emerald',
      description:
        'Create verified farmgate harvest listings, discover direct buyers without middlemen commission deductions, calculate deterministic net proceeds, and receive secure milestone payouts.',
      features: [
        'Deterministic Net Proceeds Calculator (itemizes transport, commission & handling)',
        'Direct bilateral counter-offers & contract negotiation with buyers',
        'Milestone-gated escrow with upfront dispatch advance settlement',
        'Direct access to WDRA-certified cold storage facilities',
      ],
    },
    {
      id: 'processor',
      title: 'Food-Processing Factory',
      icon: '🏭',
      badge: 'Industrial Procurement',
      color: 'amber',
      description:
        'Procure commercial and export-grade agricultural raw materials in bulk with strict moisture, Brix, and quality specifications directly from producer clusters.',
      features: [
        'Bulk specification bidding on active harvest batches',
        'Automated escrow funding with inspection-conditional release',
        'Multi-lot scheduling for continuous processing plant intake',
        'Quality variance claim filing through audited dispute ledger',
      ],
    },
    {
      id: 'cold_storage',
      title: 'Cold-Storage Provider',
      icon: '❄️',
      badge: 'Cold Chain Logistics',
      color: 'sky',
      description:
        'Monetize WDRA-registered warehouse capacity, track multi-chamber atmosphere telemetry in real time, and eliminate over-allocation through atomic reservations.',
      features: [
        'Atomic capacity booking engine preventing chamber double-booking',
        'Real-time IoT temperature and humidity telemetry monitoring',
        'Automated warehouse receipt allocation for trade financing',
        'Integrated fleet logistics dispatch and milestone tracking',
      ],
    },
    {
      id: 'trader',
      title: 'Wholesale Mandi Trader',
      icon: '🏢',
      badge: 'Wholesale Arbitrage',
      color: 'blue',
      description:
        'Execute multi-district APMC mandi arbitrage, aggregate farmgate lots for inter-state transit, and negotiate bilateral trade terms with locked escrow protection.',
      features: [
        'Real-time regional APMC market price spread discovery',
        'Bulk lot bidding with flexible transport allocation (buyer/seller/shared)',
        'Audit-logged counter-offer bilateral negotiation engine',
        'Cryptographic payment idempotency across high-value volume trades',
      ],
    },
    {
      id: 'retailer',
      title: 'Modern Retailer',
      icon: '🏪',
      badge: 'Direct Sourcing',
      color: 'teal',
      description:
        'Source Grade-A fresh produce directly from verified farmers, lock scheduled dock replenishment times, and maintain full farm-to-shelf traceability.',
      features: [
        'Grade-A premium quality produce catalog discovery',
        'Scheduled recurring delivery windows and dock intake confirmation',
        'Quality assurance verification prior to escrow disbursement',
        'Direct farmgate origin transparency for retail branding',
      ],
    },
    {
      id: 'consumer',
      title: 'Consumer Society / Collective',
      icon: '🛒',
      badge: 'Fair Trade Sourcing',
      color: 'rose',
      description:
        'Organize housing society bulk buying collectives, secure transparent wholesale pricing, and support farmer livelihoods through zero-leakage fair trade.',
      features: [
        'Collective order pooling for residential communities',
        'Transparent price breakdown showing exact farmer realizations',
        'Direct harvest freshness delivered within hours of farm sorting',
        'Zero hidden intermediary commissions or markups',
      ],
    },
    {
      id: 'admin',
      title: 'Platform Operations & Escrow Lead',
      icon: '🛡️',
      badge: 'Zero-Trust Oversight',
      color: 'purple',
      description:
        'Oversee marketplace liquidity, arbitrate quality disputes, verify identity credentials, and monitor platform gross merchandise volume under strict database authorization.',
      features: [
        'Server-side verified platform analytics & transaction telemetry',
        'Zero-trust dispute arbitration with binding escrow split determinations',
        'Administrative business role onboarding and KYC credential review',
        'Non-tamperable audit log tracking every trade milestone',
      ],
    },
  ];

  const currentRole = rolesList.find((r) => r.id === selectedRoleTab) || rolesList[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo / Brand */}
          <div className="flex items-center space-x-3">
            <div className="bg-white p-1.5 rounded-xl border border-zinc-700/80 shadow-xs inline-flex items-center justify-center">
              <Image
                src="/agriprice-logo.png"
                alt="AgriPrice"
                width={120}
                height={34}
                className="h-7 w-auto object-contain"
                priority
              />
            </div>
            <span className="hidden sm:inline-block font-extrabold text-xs tracking-wider uppercase text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
              Enterprise v1.0
            </span>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 text-xs">
            {/* Demo Sandbox Entry */}
            <button
              type="button"
              id="welcome-enter-demo-btn"
              onClick={() => onEnterDemoSandbox('farmer')}
              className="px-3 py-1.5 rounded-xl font-semibold text-amber-300 bg-amber-950/50 border border-amber-700/60 hover:bg-amber-900/40 transition-colors flex items-center space-x-1.5"
            >
              <span>🎭</span>
              <span className="hidden sm:inline">Explore</span>
              <span>Demo Sandbox</span>
            </button>

            {/* Sign In Button */}
            <button
              type="button"
              id="welcome-signin-btn"
              onClick={onOpenSignIn}
              className="px-3.5 py-1.5 rounded-xl font-bold text-zinc-200 bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 transition-colors shadow-2xs"
            >
              Sign In
            </button>

            {/* Create Account Button */}
            <button
              type="button"
              id="welcome-signup-btn"
              onClick={onOpenSignUp}
              className="px-3.5 py-1.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-600/30"
            >
              Create Account
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-zinc-800/60">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-emerald-900/20 via-teal-900/10 to-transparent blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-8 text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Zero-Trust Agricultural Marketplace &amp; Escrow Clearinghouse</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-tight">
            From Produce to Profit.
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              Fair Trade. Verified Quality. Guaranteed Settlement.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Eliminate predatory intermediary margins with India&apos;s first deterministic agricultural trade platform.
            Connecting verified farmers, industrial food factories, cold-storage operators, wholesale buyers, and retailers through smart escrow.
          </p>

          {/* Primary Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onOpenSignUp}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2"
            >
              <span>Get Started — Register Profile</span>
              <span>→</span>
            </button>

            <button
              type="button"
              onClick={onOpenSignIn}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-sm text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-all flex items-center justify-center space-x-2"
            >
              <span>Sign In to Live Account</span>
            </button>

            <button
              type="button"
              onClick={() => onEnterDemoSandbox('farmer')}
              className="w-full sm:w-auto px-5 py-3.5 rounded-xl font-semibold text-sm text-amber-300 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/60 transition-all flex items-center justify-center space-x-2"
            >
              <span>🎭 Explore Demo Sandbox</span>
            </button>
          </div>

          {!isConfigured && (
            <div className="pt-2 text-xs text-amber-400/90 font-mono">
              ⚠️ Running in local sandbox preview mode. Configure Supabase credentials to enable live PostgreSQL transactions.
            </div>
          )}
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="py-12 border-b border-zinc-800/60 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-emerald-600/50 transition-all space-y-2">
              <div className="text-2xl">🧮</div>
              <h3 className="font-bold text-sm text-zinc-100">Deterministic Net Proceeds</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Itemizes transport, commission, handling, packaging, and shelf-life degradation before accepting any offer.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-emerald-600/50 transition-all space-y-2">
              <div className="text-2xl">🔒</div>
              <h3 className="font-bold text-sm text-zinc-100">Milestone-Gated Escrow</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Buyer funds are locked in escrow upon offer acceptance. Advance releases at dispatch; final settlement upon quality inspection.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-emerald-600/50 transition-all space-y-2">
              <div className="text-2xl">❄️</div>
              <h3 className="font-bold text-sm text-zinc-100">WDRA Cold Chain Hub</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Atomic capacity booking prevents double-allocation. Live IoT multi-chamber atmosphere telemetry guarantees freshness.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-emerald-600/50 transition-all space-y-2">
              <div className="text-2xl">📈</div>
              <h3 className="font-bold text-sm text-zinc-100">APMC Mandi Benchmarks</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Direct benchmark pricing from regional APMC arrival bulletins provides complete price transparency across wholesale markets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Role Ecosystem Interactive Showcase */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-8 w-full flex-1">
        <div className="text-center space-y-2 mb-10">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
            Multi-Stakeholder Agricultural Trade Ecosystem
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tailored Experiences Across All Seven Key Industry Roles
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Select a role below to explore how AgriPrice safeguards trade for each participant in the agricultural supply chain.
          </p>
        </div>

        {/* Role Selection Tabs */}
        <div className="flex items-center justify-start sm:justify-center overflow-x-auto pb-4 gap-2 no-scrollbar">
          {rolesList.map((role) => {
            const isSelected = role.id === selectedRoleTab;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleTab(role.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-2 border shrink-0 ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-850 hover:text-white'
                }`}
              >
                <span>{role.icon}</span>
                <span>{role.title.split('/')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Role Deep Dive Card */}
        <div className="mt-6 p-6 sm:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-zinc-800">
            <div className="flex items-center space-x-4">
              <span className="text-4xl p-3 bg-zinc-800/80 rounded-2xl border border-zinc-700/60">
                {currentRole.icon}
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xl font-bold text-white">{currentRole.title}</h3>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {currentRole.badge}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  {currentRole.description}
                </p>
              </div>
            </div>

            {/* Launch Demo as this role */}
            <button
              type="button"
              onClick={() => onEnterDemoSandbox(currentRole.id)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800 transition-colors shrink-0 flex items-center space-x-2"
            >
              <span>Launch Demo as {currentRole.title.split('/')[0].trim()}</span>
              <span>→</span>
            </button>
          </div>

          <div className="pt-6">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 mb-3">
              Role Capabilities &amp; Database Guarantees:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentRole.features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start space-x-2.5 p-3 rounded-xl bg-zinc-950/50 border border-zinc-850 text-xs text-zinc-300"
                >
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security & Compliance Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-8 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="font-bold text-zinc-300">AgriPrice Enterprise Platform</span>
            <span>•</span>
            <span>PostgreSQL 15+ Row-Level Security</span>
            <span>•</span>
            <span>Cryptographic Payment Replay Defense</span>
          </div>

          <div className="flex items-center space-x-4 text-[11px]">
            <button
              type="button"
              onClick={onOpenSignIn}
              className="text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              Sign In
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={onOpenSignUp}
              className="text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              Register Profile
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onEnterDemoSandbox('farmer')}
              className="text-zinc-400 hover:text-amber-400 transition-colors"
            >
              Interactive Demo Sandbox
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
