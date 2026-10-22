'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useMarketplace } from '../lib/marketplace/MarketplaceContext';
import { useAuth } from './AuthContext';
import type { UserPersonaRole } from '../lib/marketplace/types';
import {
  getNavigationForPersona,
  resetMainContentScroll,
  resetSidebarNavScroll,
  type PersonaNavItem,
} from '../lib/marketplace/navigationConfig';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, profile, roles } = useAuth();
  const {
    appMode,
    enterDemoSandbox,
    exitDemoSandbox,
    activeTab,
    setActiveTab,
    currentPersona,
    activeRole,
    setPersonaRole,
    offers,
    orders,
    notifications,
    isPrivacyMasked,
    maskEmail,
  } = useMarketplace();

  const pendingOffersCount = offers.filter((o) => o.status === 'pending').length;
  const activeOrdersCount = orders.filter((o) => o.escrowStatus !== 'settled' && o.escrowStatus !== 'cancelled').length;
  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [prevRole, setPrevRole] = useState<UserPersonaRole>(activeRole);
  const prevSidebarPersonaIdRef = useRef<string>(currentPersona.id);
  const navRef = useRef<HTMLElement>(null);

  // Derive persona-specific navigation configuration, resolving real roles for authenticated accounts
  const navItems = getNavigationForPersona(currentPersona.role, activeRole, roles);

  // Synchronize active navigation item:
  // 1. If user clicked a specific nav item in this sidebar, and that item's destination matches activeTab, keep it active.
  // 2. Otherwise (e.g. navigated via internal dashboard button, notification, or persona switch),
  //    match the first nav item for the current activeTab destination.
  const matchingItems = navItems.filter((n) => n.destination === activeTab || n.id === activeTab);
  const selectedItemMatchesTab = selectedItemId && matchingItems.some((n) => n.id === selectedItemId);
  const activeItemId = selectedItemMatchesTab ? selectedItemId : (matchingItems[0]?.id ?? null);

  // React-idiomatic state adjustment during render when activeRole changes
  if (prevRole !== activeRole) {
    setPrevRole(activeRole);
    setSelectedItemId(null);
  }

  // Reset independently scrollable sidebar to the top whenever active persona changes
  // Runs after the new persona dashboard has rendered in the DOM
  useEffect(() => {
    if (prevSidebarPersonaIdRef.current !== currentPersona.id) {
      prevSidebarPersonaIdRef.current = currentPersona.id;
      resetSidebarNavScroll(navRef.current);
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          resetSidebarNavScroll(navRef.current);
        });
      }
    }
  }, [currentPersona.id]);

  const handlePersonaChange = (newRole: UserPersonaRole) => {
    setSelectedItemId(null);
    setPersonaRole(newRole);
    resetSidebarNavScroll(navRef.current);
  };

  const getBadgeCount = (item: PersonaNavItem) => {
    if (item.badgeKey === 'offers') return pendingOffersCount > 0 ? pendingOffersCount : undefined;
    if (item.badgeKey === 'orders') return activeOrdersCount > 0 ? activeOrdersCount : undefined;
    if (item.badgeKey === 'notifications') return unreadNotifsCount > 0 ? unreadNotifsCount : undefined;
    return undefined;
  };

  const handleSelectTab = (item: PersonaNavItem) => {
    setSelectedItemId(item.id);
    setActiveTab(item.destination);
    resetMainContentScroll();
    if (onClose) onClose();
  };

  const displayedUserEmail = user?.email
    ? isPrivacyMasked
      ? maskEmail(user.email)
      : user.email
    : '';

  const displayedUserName = profile?.full_name
    ? isPrivacyMasked
      ? `${profile.full_name.slice(0, 1)}*** (Masked)`
      : profile.full_name
    : displayedUserEmail;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-80 max-w-[85vw] lg:max-w-none bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header - Fixed */}
        <div className="relative shrink-0 pt-3 pb-2.5 px-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col items-center">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden absolute top-2 right-2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 z-10 transition-colors"
              aria-label="Close navigation sidebar"
            >
              ✕
            </button>
          )}

          {/* Official Combined Brand Asset */}
          <div className="flex items-center justify-center w-full max-w-[292px]">
            <Image
              src="/agriprice-brand.png"
              alt="AgriPrice — From Produce to Profit"
              width={292}
              height={109}
              className="w-full h-auto max-w-[292px] object-contain select-none"
              style={{ height: 'auto' }}
              priority
            />
          </div>
        </div>

        {/* Real Authenticated Account Identity - Fixed */}
        {user ? (
          <div className="shrink-0 p-3 mx-3 my-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                <span>Signed-In Supabase Account</span>
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-emerald-200/70 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 font-bold">
                {roles.length > 0 ? `DB: ${roles.join(', ')}` : 'No DB Role'}
              </span>
            </div>
            <div className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {displayedUserName}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
              <span>KYC: {profile?.kyc_verified ? 'Verified' : 'Unverified'}</span>
              <span>Bank: {profile?.bank_account_verified ? 'Verified' : 'Unverified'}</span>
            </div>
          </div>
        ) : null}

        {/* Role & Mode Switcher - Fixed */}
        {appMode === 'live_account' ? (
          <div className="shrink-0 p-3 mx-3 mb-2 rounded-xl border text-[11px] space-y-1.5 bg-zinc-50 dark:bg-zinc-850 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Verified Role
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                LIVE ACCOUNT
              </span>
            </div>

            {roles.length > 1 ? (
              <select
                id="persona-selector"
                value={activeRole}
                onChange={(e) => handlePersonaChange(e.target.value as UserPersonaRole)}
                className="w-full text-xs font-semibold py-1.5 px-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              >
                <option value="authenticated">👤 Primary View ({roles.join(', ')})</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r === 'farmer'
                      ? '👨‍🌾 Farmer Role'
                      : r === 'processor'
                      ? '🏭 Factory Buyer Role'
                      : r === 'cold_storage'
                      ? '❄️ Cold Storage Role'
                      : r === 'trader'
                      ? '🏢 Mandi Trader Role'
                      : r === 'retailer'
                      ? '🏪 Retailer Role'
                      : r === 'consumer'
                      ? '🛒 Consumer Role'
                      : r === 'admin'
                      ? '🛡️ Admin Role'
                      : `Role: ${r}`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                <span>{roles.length === 1 ? `Role: ${roles[0].toUpperCase()}` : 'Standard Account'}</span>
                <span className="text-[10px] text-emerald-600 font-normal">DB Verified</span>
              </div>
            )}

            <div className="pt-1 flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-700/60">
              <button
                type="button"
                onClick={() => enterDemoSandbox()}
                className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <span>🎭 Explore Demo Sandbox</span>
                <span>→</span>
              </button>
              <span className="text-[9px] text-zinc-400">PostgreSQL RLS</span>
            </div>
          </div>
        ) : (
          <div className="shrink-0 p-3 mx-3 mb-2 rounded-xl border text-[11px] space-y-1.5 bg-amber-50/70 dark:bg-amber-950/30 border-amber-300/80 dark:border-amber-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                Simulated Persona
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                DEMO SANDBOX
              </span>
            </div>

            <select
              id="persona-selector"
              value={activeRole}
              onChange={(e) => handlePersonaChange(e.target.value as UserPersonaRole)}
              className="w-full text-xs font-semibold py-1.5 px-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            >
              <option value="farmer">👨‍🌾 Farmer: Ramesh Kumar</option>
              <option value="processor">🏭 Factory Buyer: AgroPure Foods</option>
              <option value="trader">🏢 Mandi Trader: Lalwani Traders</option>
              <option value="cold_storage">❄️ Cold Storage: Kolar CoolChain</option>
              <option value="retailer">🏪 Retail Buyer: FreshBite</option>
              <option value="consumer">🛒 Consumer: Society Buyer</option>
              <option value="admin">🛡️ Platform Admin: Audit Lead</option>
            </select>

            <div className="pt-1 flex items-center justify-between border-t border-amber-200/60 dark:border-amber-800/60">
              <button
                type="button"
                onClick={() => exitDemoSandbox()}
                className="text-[10px] text-amber-800 dark:text-amber-300 font-bold hover:underline cursor-pointer"
              >
                ← Exit Demo Sandbox
              </button>
              <span className="text-[9px] text-amber-600 dark:text-amber-400">Isolated In-Memory</span>
            </div>
          </div>
        )}

        {/* Navigation links - Independently scrollable */}
        <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1 pb-6">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Marketplace Modules
          </div>

          {navItems.map((item) => {
            const badgeCount = getBadgeCount(item);
            const isActive = item.id === activeItemId;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 font-semibold'
                    : item.highlight
                    ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </div>

                {badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive
                        ? 'bg-white text-emerald-700'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick User Footer - Fixed */}
        <div className="shrink-0 p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          {activeRole === 'authenticated' && user ? (
            <div className="flex items-center space-x-2.5 p-2 rounded-xl bg-white dark:bg-zinc-800/60 border border-emerald-300 dark:border-emerald-800">
              <span className="text-2xl">{currentPersona.avatarEmoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                  {displayedUserName}
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block truncate font-mono">
                  {roles.length > 0 ? `Role: ${roles.join(', ')}` : 'Real Account (No DB Role)'}
                </span>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  profile?.kyc_verified
                    ? 'bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950'
                    : 'bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-950'
                }`}
                title={profile?.kyc_verified ? 'KYC Verified' : 'KYC Pending'}
              />
            </div>
          ) : (
            <div className="flex items-center space-x-2.5 p-2 rounded-xl bg-white dark:bg-zinc-800/60 border border-amber-300 dark:border-amber-800">
              <span className="text-2xl">{currentPersona.avatarEmoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                    {currentPersona.name}
                  </span>
                  <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    SIM
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate font-medium">
                  {currentPersona.organization || `${currentPersona.district}, ${currentPersona.state}`}
                </span>
                <span className="text-[9px] text-amber-700 dark:text-amber-400 block font-medium">
                  Simulation Only · No DB Access
                </span>
              </div>
              <span
                className="w-2.5 h-2.5 rounded-full bg-amber-400"
                title="Simulated Demo Persona — No Database Permissions"
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
