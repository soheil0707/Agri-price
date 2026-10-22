'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { useMarketplace } from '../lib/marketplace/MarketplaceContext';
import { getNavigationForPersona } from '../lib/marketplace/navigationConfig';

interface HeaderProps {
  onToggleSidebar?: () => void;
  onOpenNewListingModal?: () => void;
}

export function Header({ onToggleSidebar, onOpenNewListingModal }: HeaderProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const { user, profile, roles, signOut } = useAuth();
  const {
    appMode,
    enterDemoSandbox,
    exitDemoSandbox,
    activeTab,
    setActiveTab,
    currentPersona,
    activeRole,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    isRealDatabaseConnected,
    databaseListingCount,
    databaseError,
    isPrivacyMasked,
    togglePrivacyMasking,
    maskEmail,
  } = useMarketplace();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const tabTitles: Record<string, { title: string; subtitle: string; icon: string }> = {
    overview: {
      title:
        currentPersona.role === 'processor'
          ? 'Factory Procurement Overview'
          : currentPersona.role === 'trader'
          ? 'Mandi Wholesale Arbitrage Terminal'
          : currentPersona.role === 'cold_storage'
          ? 'Cold Storage Logistics & Fleet Hub'
          : currentPersona.role === 'retailer'
          ? 'Retail Sourcing & Replenishment Hub'
          : currentPersona.role === 'consumer'
          ? 'Fair-Trade Consumer & Collective Hub'
          : currentPersona.role === 'admin'
          ? 'Platform Operations & Escrow Oversight'
          : 'Marketplace Harvest Operations Hub',
      subtitle:
        currentPersona.role === 'processor'
          ? 'Industrial batch procurement, quality specs, and inbound factory deliveries'
          : currentPersona.role === 'trader'
          ? 'Regional APMC mandi price spreads, bulk lot bidding, and consignment trades'
          : currentPersona.role === 'cold_storage'
          ? 'Multi-chamber atmosphere telemetry, capacity utilization, and bay scheduling'
          : currentPersona.role === 'retailer'
          ? 'Grade-A produce replenishment, on-time dock deliveries, and category fill rates'
          : currentPersona.role === 'consumer'
          ? 'Direct farmgate harvests, fair-trade transparency, and pooled society orders'
          : currentPersona.role === 'admin'
          ? 'User KYC moderation, zero-trust escrow audits, and platform GMV oversight'
          : 'Farmgate harvest inventory, deterministic net proceeds, and buyer offers',
      icon:
        currentPersona.role === 'processor'
          ? '🏭'
          : currentPersona.role === 'trader'
          ? '🏢'
          : currentPersona.role === 'cold_storage'
          ? '❄️'
          : currentPersona.role === 'retailer'
          ? '🏪'
          : currentPersona.role === 'consumer'
          ? '🛒'
          : currentPersona.role === 'admin'
          ? '🛡️'
          : '👨‍🌾',
    },
    marketplace: {
      title: 'Produce Discovery & Marketplace',
      subtitle: 'Discover farmgate harvest batches with verified quality and location',
      icon: '🛒',
    },
    inventory: {
      title: currentPersona.role === 'farmer' ? 'My Produce & Inventory' : 'Produce Catalog',
      subtitle: 'Manage harvest quantities, shelf life, and reserve allocation',
      icon: '📦',
    },
    prices: {
      title: 'APMC Market Prices & Mandi Trends',
      subtitle: 'Regional modal prices, benchmark rates, and daily price movements',
      icon: '📈',
    },
    calculator: {
      title: 'Net Proceeds Calculator',
      subtitle: 'Deterministic net proceeds realization engine with itemized cost deductions',
      icon: '🧮',
    },
    offers: {
      title: 'Offers & Negotiations',
      subtitle: 'Bid review, counter-offers, and bilateral contract negotiation',
      icon: '🤝',
    },
    orders: {
      title: 'Orders, Escrow & Deliveries',
      subtitle: 'Escrow-backed agricultural orders with transit milestones',
      icon: '🚚',
    },
    storage: {
      title: 'Cold Storage & Logistics Hub',
      subtitle: 'Search WDRA-certified warehouses, cold chain units, and booking requests',
      icon: '❄️',
    },
    payments: {
      title: 'Payments, Escrow & Realized Proceeds',
      subtitle: 'Real-time audit trail of advance releases and farmer settlement payouts',
      icon: '💳',
    },
    disputes: {
      title: 'Disputes & Escrow Arbitration Queue',
      subtitle: 'Arbitrate produce quality claims, moisture discrepancies, and escrow splits',
      icon: '⚖️',
    },
    analytics: {
      title: 'Platform Marketplace Analytics & Liquidity',
      subtitle: 'Gross merchandise volume, traded crop tonnage, and escrow smart contract telemetry',
      icon: '📊',
    },
    activity: {
      title: 'Activity Feed & Audit Log',
      subtitle: 'Chronological events across listings, offers, orders, and settlements',
      icon: '🔔',
    },
    profile: {
      title: 'User Profile & Verification',
      subtitle: 'Account details, verified roles, and KYC credentials',
      icon: '👤',
    },
    settings: {
      title: 'Settings & Compliance',
      subtitle: 'Platform parameters, notification preferences, and privacy rules',
      icon: '⚙️',
    },
  };

  const navItems = getNavigationForPersona(currentPersona.role, activeRole, roles);
  const activeNavItem = navItems.find((item) => item.destination === activeTab || item.id === activeTab);

  const defaultMeta = tabTitles[activeTab] || tabTitles.overview;
  const currentMeta = {
    title: activeTab === 'overview' ? defaultMeta.title : (activeNavItem?.label || defaultMeta.title),
    subtitle: defaultMeta.subtitle,
    icon: activeTab === 'overview' ? defaultMeta.icon : (activeNavItem?.icon || defaultMeta.icon),
  };

  return (
    <>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Mode Banners */}
      {appMode === 'demo_sandbox' && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-4 sm:px-6 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 shadow-xs z-40 relative">
          <div className="flex items-center space-x-2 min-w-0 flex-1 overflow-hidden mr-2">
            <span className="bg-amber-950/70 border border-amber-400/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 flex items-center space-x-1">
              <span>🎭</span>
              <span>DEMO SANDBOX MODE</span>
            </span>
            <span className="truncate min-w-0 text-[11px] sm:text-xs">
              Simulated prototype data active. Changes are isolated and temporary.
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => exitDemoSandbox()}
                className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                Return to Live Account ({roles.length > 0 ? roles.join(', ').toUpperCase() : 'Standard'}) →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Sign In to Live Account
                </button>
                <button
                  type="button"
                  onClick={() => exitDemoSandbox()}
                  className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition-colors cursor-pointer"
                >
                  Exit Demo Mode
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {appMode === 'live_account' && (
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white px-4 sm:px-6 py-1.5 text-xs font-medium flex items-center justify-between shadow-2xs z-40 relative">
          <div className="flex items-center space-x-2 min-w-0 flex-1 overflow-hidden">
            <span className="bg-emerald-950/60 border border-emerald-400/30 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
              🟢 LIVE ACCOUNT
            </span>
            <span className="truncate text-[11px]">
              Connected to Supabase PostgreSQL • Verified Role: <strong>{roles.length > 0 ? roles.join(', ').toUpperCase() : 'STANDARD (NO ASSIGNED ROLES)'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => enterDemoSandbox()}
            className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer shrink-0 ml-2"
          >
            Explore Demo Sandbox →
          </button>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            {/* Left: Mobile hamburger & Active Tab Title */}
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {onToggleSidebar && (
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className="lg:hidden p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                  aria-label="Toggle Navigation"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}

              {/* Mobile Branding Logo */}
              <div className="lg:hidden bg-white p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/80 shadow-2xs inline-flex items-center justify-center shrink-0">
                <Image
                  src="/agriprice-logo.png"
                  alt="AgriPrice"
                  width={110}
                  height={61}
                  className="h-7 w-auto max-w-[105px] object-contain"
                  priority
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-xl shrink-0">{currentMeta.icon}</span>
                    <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight truncate">
                      {currentMeta.title}
                    </h1>
                  </div>
                  {appMode === 'live_account' ? (
                    databaseError ? (
                      <span
                        className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shrink-0"
                        title={databaseError}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1 shrink-0" />
                        <span>Database Query Issue: {databaseError}</span>
                      </span>
                    ) : isRealDatabaseConnected && databaseListingCount > 0 ? (
                      <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse shrink-0" />
                        <span>Supabase Live · {databaseListingCount} listing{databaseListingCount > 1 ? 's' : ''}</span>
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1 shrink-0" />
                        <span>Supabase Live · 0 listings</span>
                      </span>
                    )
                  ) : (
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                      <span>Demo Mode · Prototype Dataset</span>
                    </span>
                  )}
                </div>
                <p className="hidden md:block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {currentMeta.subtitle}
                </p>
              </div>
            </div>

            {/* Right: Quick actions, notifications, user auth */}
            <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
              {/* Quick Action Button: Create Listing for farmers or when on inventory */}
              {(currentPersona.role === 'farmer' || activeTab === 'inventory') && onOpenNewListingModal && (
                <button
                  type="button"
                  onClick={onOpenNewListingModal}
                  className="inline-flex items-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors shrink-0"
                >
                  <span className="mr-1 text-sm">+</span>
                  <span className="hidden xl:inline">Post Produce Listing</span>
                  <span className="hidden sm:inline xl:hidden">Post Listing</span>
                  <span className="sm:hidden">Post</span>
                </button>
              )}

              {/* Presentation / Demo-Safe Privacy Masking Toggle */}
              <button
                type="button"
                onClick={togglePrivacyMasking}
                className={`p-1.5 sm:px-2 sm:py-1 rounded-xl text-xs font-semibold flex items-center space-x-1 border transition-all cursor-pointer shrink-0 ${
                  isPrivacyMasked
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
                title={
                  isPrivacyMasked
                    ? 'Presentation Masking Active: Personal email and phone are masked for safe screenshots (click to unmask)'
                    : 'Presentation Masking: Click to mask personal email and phone for safe screenshots'
                }
                aria-label="Toggle Presentation Privacy Masking"
              >
                <span className="text-sm">{isPrivacyMasked ? '🕶️' : '👁️'}</span>
                <span className="hidden lg:inline text-[10px] font-bold">
                  {isPrivacyMasked ? 'PII Masked' : 'Mask PII'}
                </span>
              </button>

              {/* Notification Bell Dropdown */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNotifDropdownOpen((prev) => !prev)}
                  className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 relative transition-colors"
                  aria-label="View notifications"
                >
                  <span className="text-lg">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                          Activity & Alerts
                        </span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={markAllNotificationsAsRead}
                        className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>

                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto py-1">
                      {notifications.length === 0 ? (
                        <div className="text-center py-6 text-xs text-zinc-500">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.slice(0, 5).map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationAsRead(n.id);
                              if (n.actionUrlTab) setActiveTab(n.actionUrlTab);
                              setIsNotifDropdownOpen(false);
                            }}
                            className={`p-2.5 text-xs rounded-xl cursor-pointer transition-colors ${
                              !n.read
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/30'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                              <span className="font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                {n.category}
                              </span>
                              <span>{n.timestamp}</span>
                            </div>
                            <div className="font-bold text-zinc-800 dark:text-zinc-200">
                              {n.title}
                            </div>
                            <div className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5 line-clamp-2">
                              {n.description}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('activity');
                          setIsNotifDropdownOpen(false);
                        }}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View Full Activity Audit Feed →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Supabase Authentication Button / Profile Status */}
              {user ? (
                <div className="flex items-center space-x-1.5 sm:space-x-2 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2 sm:px-2.5 py-1 rounded-xl text-xs shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${profile ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
                    title={profile ? 'Profile Complete (Database Verified)' : 'Profile Incomplete'}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1.5 text-left min-w-0">
                    <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">Real:</span>
                    <span
                      className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono text-[11px] max-w-[105px] sm:max-w-[130px] md:max-w-[150px] truncate"
                      title={user.email || ''}
                    >
                      {isPrivacyMasked ? maskEmail(user.email) : user.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('profile')}
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold transition-colors shrink-0 ${
                        profile
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 hover:bg-emerald-200'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 hover:bg-amber-200'
                      }`}
                      title="Click to view or complete profile in Supabase"
                    >
                      {profile ? '✓ Complete' : '⚠️ Incomplete'}
                    </button>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-bold hidden xl:inline shrink-0" title="Real Authenticated Database Role">
                    {roles.length > 0 ? `DB: ${roles.join(', ')}` : 'DB: None'}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="text-zinc-400 hover:text-rose-600 text-xs font-bold pl-1 cursor-pointer shrink-0"
                    title="Sign Out"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-zinc-800 dark:text-zinc-200 shadow-2xs transition-colors shrink-0"
                >
                  <span className="mr-1.5">👤</span>
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
