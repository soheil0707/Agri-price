'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MarketplaceProvider, useMarketplace } from '../lib/marketplace/MarketplaceContext';
import { resetMainContentScroll } from '../lib/marketplace/navigationConfig';
import type { UserPersonaRole } from '../lib/marketplace/types';
import { useAuth } from '../components/AuthContext';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { NewListingModal } from '../components/inventory/NewListingModal';
import { WelcomeView } from '../components/WelcomeView';
import { AuthModal } from '../components/AuthModal';

// Views
import { OverviewView } from '../components/views/OverviewView';
import { MarketplaceView } from '../components/views/MarketplaceView';
import { InventoryView } from '../components/views/InventoryView';
import { PricesView } from '../components/views/PricesView';
import { CalculatorView } from '../components/views/CalculatorView';
import { OffersView } from '../components/views/OffersView';
import { OrdersView } from '../components/views/OrdersView';
import { StorageView } from '../components/views/StorageView';
import { PaymentsView } from '../components/views/PaymentsView';
import { DisputesView } from '../components/views/DisputesView';
import { AnalyticsView } from '../components/views/AnalyticsView';
import { ActivityView } from '../components/views/ActivityView';
import { ProfileView } from '../components/views/ProfileView';
import { SettingsView } from '../components/views/SettingsView';

import { DEMO_TOMATO_LISTING } from '../lib/calculator/demoData';
import { calculateNetProceeds } from '../lib/calculator/engine';
import type { CalculationInput, SellingChannelOption } from '../lib/calculator/types';

function DashboardContent() {
  const { activeTab, currentPersona } = useMarketplace();
  const { saveProfile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNewListingModalOpen, setIsNewListingModalOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  // Automatically reset dashboard scroll position to the top whenever active tab or persona changes
  // Runs after the new module / persona view has rendered in the DOM
  useEffect(() => {
    resetMainContentScroll(mainContentRef.current);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        resetMainContentScroll(mainContentRef.current);
      });
    }
  }, [activeTab, currentPersona.id]);

  // Net Proceeds Calculator state (preserves deterministic calculations & tests)
  const [calcInput, setCalcInput] = useState<CalculationInput>(
    DEMO_TOMATO_LISTING.defaultCalculationInput
  );
  const [notification, setNotification] = useState<string | null>(null);

  const { result: calculationResult, error: calculationError } = useMemo(() => {
    try {
      const res = calculateNetProceeds(calcInput);
      return { result: res, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid calculation parameters';
      return { result: null, error: msg };
    }
  }, [calcInput]);

  const handleInputChange = (updated: Partial<CalculationInput>) => {
    setCalcInput((prev) => ({ ...prev, ...updated }));
  };

  const handleLoadListing = (customInput?: Partial<CalculationInput>) => {
    if (customInput) {
      setCalcInput((prev) => ({
        ...prev,
        ...customInput,
      }));
      showNotice(
        `Loaded lot into calculator: ${customInput.quantity?.toLocaleString('en-IN')} ${
          customInput.quantityUnit ?? 'kg'
        } @ ₹${customInput.pricePerUnit}/${customInput.priceUnit ?? 'kg'}`
      );
    } else {
      setCalcInput(DEMO_TOMATO_LISTING.defaultCalculationInput);
      showNotice('Reset to 5,000 kg Tomato Baseline Parameters');
    }
  };

  const handleApplyChannel = (channel: SellingChannelOption) => {
    setCalcInput((prev) => ({
      ...prev,
      pricePerUnit: channel.quotedPricePerKg,
      priceUnit: 'kg',
      expectedLossPercent: channel.lossPercent,
      transportCost: channel.transportCostRate,
      handlingCost: channel.handlingCostRate,
      commissionPercent: channel.commissionPercent,
      storageCost: channel.storageCost,
      packagingCost: channel.packagingCost,
      otherFees: channel.otherFees,
    }));
    showNotice(`Applied "${channel.channelName}" parameters to calculator`);
  };

  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col lg:pl-80">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Top Header */}
      <Header
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onOpenNewListingModal={() => setIsNewListingModalOpen(true)}
      />

      {/* New Listing Modal */}
      <NewListingModal
        isOpen={isNewListingModalOpen}
        onClose={() => setIsNewListingModalOpen(false)}
      />

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 animate-bounce">
          <span>✓</span>
          <span>{notification}</span>
        </div>
      )}

      {/* Main Module Content */}
      <main id="main-content" ref={mainContentRef} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewView onOpenNewListingModal={() => setIsNewListingModalOpen(true)} />
        )}

        {activeTab === 'marketplace' && (
          <MarketplaceView onLoadListingIntoCalculator={handleLoadListing} />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            onOpenNewListingModal={() => setIsNewListingModalOpen(true)}
            onLoadListingIntoCalculator={handleLoadListing}
          />
        )}

        {activeTab === 'prices' && (
          <PricesView onLoadListingIntoCalculator={handleLoadListing} />
        )}

        {activeTab === 'calculator' && (
          <CalculatorView
            calcInput={calcInput}
            onChangeInput={handleInputChange}
            onResetDefaults={handleLoadListing}
            calculationResult={calculationResult}
            calculationError={calculationError}
            onApplyChannel={handleApplyChannel}
          />
        )}

        {activeTab === 'offers' && <OffersView />}

        {activeTab === 'orders' && <OrdersView />}

        {activeTab === 'storage' && <StorageView />}

        {activeTab === 'payments' && <PaymentsView />}

        {activeTab === 'disputes' && <DisputesView />}

        {activeTab === 'analytics' && <AnalyticsView />}

        {activeTab === 'activity' && <ActivityView />}

        {activeTab === 'profile' && <ProfileView onSave={saveProfile} />}

        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Professional Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-6 text-xs text-zinc-500 dark:text-zinc-400 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">AgriPrice</span>
            <span>•</span>
            <span>From Produce to Profit Agriculture Marketplace</span>
            <span>•</span>
            <span className="font-mono text-[11px]">v1.0.0-pro</span>
          </div>
          <div className="text-center sm:text-right text-[11px] space-y-0.5">
            <p>
              Supabase connected • Decimal-safe financial models • Trust escrow architecture
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AppShell() {
  const { appMode, enterDemoSandbox } = useMarketplace();
  const { isLoading, isConfigured } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');

  // Loading state during session restoration
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl animate-pulse">
            🌱
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white tracking-tight">AgriPrice Enterprise</h2>
            <p className="text-xs text-zinc-400">Verifying authenticated database session...</p>
          </div>
          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Signed-out visitor welcome landing page
  if (appMode === 'welcome') {
    return (
      <>
        <WelcomeView
          onOpenSignIn={() => {
            setAuthModalMode('signin');
            setIsAuthModalOpen(true);
          }}
          onOpenSignUp={() => {
            setAuthModalMode('signup');
            setIsAuthModalOpen(true);
          }}
          onEnterDemoSandbox={(role) => enterDemoSandbox(role as UserPersonaRole | undefined)}
          isConfigured={isConfigured}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </>
    );
  }

  // Dashboard for live account or demo sandbox
  return <DashboardContent />;
}

export default function Home() {
  return (
    <MarketplaceProvider>
      <AppShell />
    </MarketplaceProvider>
  );
}
