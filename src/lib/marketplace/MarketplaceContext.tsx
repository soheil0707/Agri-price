'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../components/AuthContext';
import { fetchPublicProduceListings } from '../supabase/listings';
import { createClient as createBrowserClient, isSupabaseConfigured } from '../supabase/client';
import type { WeightUnit } from '../calculator/types';
import type {
  UserPersona,
  UserPersonaRole,
  MarketplaceProduceItem,
  ProduceOffer,
  MarketplaceOrder,
  OrderProgressState,
  ColdStorageUnit,
  SimulatedPaymentRecord,
  ActivityNotification,
  MarketplaceDispute,
  RegionalMarketPrice,
} from './types';
import {
  DEMO_PERSONAS,
  INITIAL_MARKETPLACE_ITEMS,
  INITIAL_OFFERS,
  INITIAL_ORDERS,
  INITIAL_STORAGE_UNITS,
  INITIAL_PAYMENTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_DISPUTES,
  REGIONAL_MARKET_PRICES,
} from './seedData';
import { isTabValidForPersona, resetMainContentScroll } from './navigationConfig';
import {
  fetchUserOffers,
  createBuyerOffer,
  acceptOfferWithReservation,
  rejectSellerOffer,
  cancelBuyerOffer,
} from '../supabase/offers';
import {
  fetchUserOrders,
  advanceOrderState,
  cancelOrderReservation,
} from '../supabase/orders';
import {
  fetchUserPaymentEvents,
} from '../supabase/payments';
import {
  fetchColdStorageFacilities,
  bookStorageCapacity,
  fetchLogisticsShipments,
  type LogisticsShipmentRecord,
} from '../supabase/storage';
import {
  fetchUserNotifications,
  markNotificationAsRead as persistMarkNotificationAsRead,
  markAllUserNotificationsAsRead as persistMarkAllUserNotificationsAsRead,
  createPersistentNotification,
} from '../supabase/notifications';
import {
  fetchOrderDisputes,
  raiseOrderDispute as persistRaiseOrderDispute,
  resolveOrderDispute as persistResolveOrderDispute,
  type RaiseDisputeParams,
  type ResolveDisputeParams,
  type DisputeActionResult,
} from '../supabase/disputes';
import {
  fetchMarketPriceBenchmarks,
} from '../supabase/marketPrices';
import {
  saveCalculationSnapshot,
  fetchUserCalculationSnapshots,
  type CalculationSnapshotRecord,
  type SaveSnapshotResult,
} from '../supabase/snapshots';
import {
  fetchLiveAdminAnalytics,
  getDemoPlatformTelemetry,
  type PlatformTelemetry,
} from '../supabase/adminAnalytics';
import type { CalculationInput, CalculationResult } from '../calculator/types';

export interface NewListingFormData {
  title: string;
  commodity: string;
  variety: string;
  grade: 'Grade-A (Export / Premium)' | 'Grade-B (Commercial)' | 'Grade-C (Processing)';
  harvestQuantity: number;
  quantityUnit: WeightUnit;
  targetPricePerKg: number;
  harvestDate: string;
  expectedShelfLifeDays: number;
  farmDistrict: string;
  farmState: string;
}

export interface NewOfferFormData {
  listingId: string;
  offeredPricePerKg: number;
  offeredQuantityKg: number;
  deliveryTerms: 'Ex-Farmgate (Buyer Arranges Transport)' | 'Delivered to Factory (Seller Arranges Transport)' | 'Warehouse Drop-off' | string;
  transportBorneBy: 'buyer' | 'seller' | 'shared';
  notes?: string;
}

export type AppMode = 'welcome' | 'live_account' | 'demo_sandbox';

interface MarketplaceContextType {
  // Application Mode & Live/Demo Isolation
  appMode: AppMode;
  isDemoSandboxActive: boolean;
  enterDemoSandbox: (role?: UserPersonaRole) => void;
  exitDemoSandbox: () => void;

  // Personas & Active Role
  currentPersona: UserPersona;
  activeRole: UserPersonaRole;
  setPersonaRole: (role: UserPersonaRole) => void;
  availablePersonas: Record<string, UserPersona>;
  isRealDatabaseConnected: boolean;
  databaseListingCount: number;
  databaseError: string | null;
  databaseStatusLabel: string;

  // Privacy Masking for Presentations / Demos
  isPrivacyMasked: boolean;
  togglePrivacyMasking: () => void;
  maskEmail: (email: string | null | undefined) => string;
  maskPhone: (phone: string | null | undefined) => string;

  // Marketplace Listings
  listings: MarketplaceProduceItem[];
  isLoadingListings: boolean;
  refreshListings: () => Promise<void>;
  createListing: (data: NewListingFormData) => Promise<{
    success: boolean;
    isSavedToDatabase: boolean;
    message: string;
    item?: MarketplaceProduceItem;
  }>;

  // Offers & Negotiations
  offers: ProduceOffer[];
  isLoadingOffers: boolean;
  isDatabaseOffersConnected: boolean;
  databaseOffersCount: number;
  databaseOffersError: string | null;
  refreshOffers: () => Promise<void>;
  createOffer: (data: NewOfferFormData) => Promise<{
    success: boolean;
    message: string;
    isSavedToDatabase?: boolean;
  }>;
  acceptOffer: (offerId: string) => Promise<{ success: boolean; orderId?: string; message: string }>;
  counterOffer: (offerId: string, counterPricePerKg: number) => Promise<{ success: boolean; message: string }>;
  rejectOffer: (offerId: string) => Promise<{ success: boolean; message: string }>;
  cancelOffer: (offerId: string) => Promise<{ success: boolean; message: string }>;

  // Orders & Shipments
  orders: MarketplaceOrder[];
  isLoadingOrders: boolean;
  isDatabaseOrdersConnected: boolean;
  databaseOrdersCount: number;
  databaseOrdersError: string | null;
  refreshOrders: () => Promise<void>;
  advanceOrderStatus: (orderId: string) => Promise<{ success: boolean; nextStatus: string; message: string }>;
  cancelOrder: (orderId: string, reason?: string) => Promise<{ success: boolean; message: string }>;

  // Cold Storage & Logistics
  storageUnits: ColdStorageUnit[];
  isLoadingStorage: boolean;
  isDatabaseStorageConnected: boolean;
  isDatabaseStorageSchemaInstalled: boolean;
  databaseStorageError: string | null;
  refreshStorage: () => Promise<void>;
  bookStorage: (storageId: string, requestedMt: number) => Promise<{ success: boolean; message: string }>;
  logisticsShipments: LogisticsShipmentRecord[];
  isLoadingLogistics: boolean;
  refreshLogistics: () => Promise<void>;

  // Simulated Payments
  payments: SimulatedPaymentRecord[];
  isLoadingPayments: boolean;
  isDatabasePaymentsConnected: boolean;
  databasePaymentsCount: number;
  databasePaymentsError: string | null;
  refreshPayments: () => Promise<void>;

  // Activity & Notifications
  notifications: ActivityNotification[];
  isLoadingNotifications: boolean;
  isDatabaseNotificationsSchemaInstalled: boolean;
  databaseNotificationsError: string | null;
  refreshNotifications: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;

  // Disputes & Arbitration
  disputes: MarketplaceDispute[];
  isLoadingDisputes: boolean;
  isDatabaseDisputesSchemaInstalled: boolean;
  databaseDisputesError: string | null;
  refreshDisputes: () => Promise<void>;
  raiseDispute: (params: RaiseDisputeParams) => Promise<DisputeActionResult>;
  resolveDispute: (params: ResolveDisputeParams) => Promise<DisputeActionResult>;

  // Market Prices & APMC Mandi Benchmarks
  marketPrices: RegionalMarketPrice[];
  isLiveMarketPrices: boolean;
  marketPricesSourceDescription: string;
  isLoadingMarketPrices: boolean;
  refreshMarketPrices: () => Promise<void>;

  // Calculation Snapshots (Audit Trail)
  userSnapshots: CalculationSnapshotRecord[];
  isLoadingSnapshots: boolean;
  refreshSnapshots: () => Promise<void>;
  saveSnapshot: (
    input: CalculationInput,
    result: CalculationResult,
    listingId?: string
  ) => Promise<SaveSnapshotResult>;

  // Live Admin Platform Telemetry
  platformTelemetry: PlatformTelemetry;
  isLoadingTelemetry: boolean;
  telemetryError: string | null;
  refreshTelemetry: () => Promise<void>;

  // Navigation tab state
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

import { maskEmail, maskPhone, formatDatabaseStatus } from './privacyMasking';
export { maskEmail, maskPhone, formatDatabaseStatus };

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, roles } = useAuth();
  const [isDemoSandboxActive, setIsDemoSandboxActive] = useState<boolean>(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<UserPersonaRole>('farmer');
  const [selectedRoleOverride, setSelectedRoleOverride] = useState<UserPersonaRole | null>(null);

  const appMode: AppMode = user ? 'live_account' : (isDemoSandboxActive ? 'demo_sandbox' : 'welcome');

  // Strict role authorization: in live mode, role override must be in roles; otherwise 'authenticated'
  const activeRole: UserPersonaRole = user
    ? (selectedRoleOverride && roles.map(String).includes(selectedRoleOverride) ? selectedRoleOverride : 'authenticated')
    : (isDemoSandboxActive ? selectedDemoRole : 'unassigned');

  const [rawActiveTab, setRawActiveTab] = useState<string>('overview');
  const [isPrivacyMasked, setIsPrivacyMasked] = useState<boolean>(false);

  const togglePrivacyMasking = useCallback(() => {
    setIsPrivacyMasked((prev) => !prev);
  }, []);

  const enterDemoSandbox = useCallback((role?: UserPersonaRole) => {
    setIsDemoSandboxActive(true);
    if (role && role !== 'authenticated' && role !== 'unassigned') {
      setSelectedDemoRole(role);
    } else {
      setSelectedDemoRole('farmer');
    }
    setRawActiveTab('overview');
    resetMainContentScroll();
  }, []);

  const exitDemoSandbox = useCallback(() => {
    setIsDemoSandboxActive(false);
    setSelectedDemoRole('farmer');
    setSelectedRoleOverride(null);
    setRawActiveTab('overview');
    resetMainContentScroll();
  }, []);

  const setPersonaRole = useCallback((newRole: UserPersonaRole) => {
    if (user) {
      // In Live Account Mode, client cannot elevate to admin or switch to unauthorized roles
      const permittedRoles = roles.map(String);
      if (newRole === 'authenticated') {
        setSelectedRoleOverride('authenticated');
      } else if (permittedRoles.includes(newRole)) {
        setSelectedRoleOverride(newRole);
      } else {
        console.warn(`[Security Alert] Unauthorized role switch to "${newRole}" rejected. Authorized roles: [${permittedRoles.join(', ')}]`);
        return;
      }
    } else if (isDemoSandboxActive) {
      if (newRole !== 'authenticated' && newRole !== 'unassigned') {
        setSelectedDemoRole(newRole);
      }
    }
    setRawActiveTab('overview');
    resetMainContentScroll();
  }, [user, roles, isDemoSandboxActive]);

  // Unified State (Clean initial state for signed-out visitors; populated via appMode effect)
  const [listings, setListings] = useState<MarketplaceProduceItem[]>([]);
  const [offers, setOffers] = useState<ProduceOffer[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [storageUnits, setStorageUnits] = useState<ColdStorageUnit[]>([]);
  const [payments, setPayments] = useState<SimulatedPaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [disputes, setDisputes] = useState<MarketplaceDispute[]>([]);
  const [marketPrices, setMarketPrices] = useState<RegionalMarketPrice[]>(REGIONAL_MARKET_PRICES);
  const [isLiveMarketPrices, setIsLiveMarketPrices] = useState<boolean>(false);
  const [marketPricesSourceDescription, setMarketPricesSourceDescription] = useState<string>(
    'Sample / Reference Benchmark Data (Agmarknet APMC Model)'
  );
  const [isLoadingMarketPrices, setIsLoadingMarketPrices] = useState<boolean>(false);

  const [userSnapshots, setUserSnapshots] = useState<CalculationSnapshotRecord[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);

  const [platformTelemetry, setPlatformTelemetry] = useState<PlatformTelemetry>(getDemoPlatformTelemetry());
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const [isLoadingNotifications, setIsLoadingNotifications] = useState<boolean>(false);
  const [isDatabaseNotificationsSchemaInstalled, setIsDatabaseNotificationsSchemaInstalled] = useState<boolean>(true);
  const [databaseNotificationsError, setDatabaseNotificationsError] = useState<string | null>(null);

  const [isLoadingDisputes, setIsLoadingDisputes] = useState<boolean>(false);
  const [isDatabaseDisputesSchemaInstalled, setIsDatabaseDisputesSchemaInstalled] = useState<boolean>(true);
  const [databaseDisputesError, setDatabaseDisputesError] = useState<string | null>(null);

  const [isLoadingListings, setIsLoadingListings] = useState<boolean>(true);
  const [isRealDatabaseConnected, setIsRealDatabaseConnected] = useState<boolean>(false);
  const [databaseListingCount, setDatabaseListingCount] = useState<number>(0);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const [isLoadingOffers, setIsLoadingOffers] = useState<boolean>(false);
  const [isDatabaseOffersConnected, setIsDatabaseOffersConnected] = useState<boolean>(false);
  const [databaseOffersCount, setDatabaseOffersCount] = useState<number>(0);
  const [databaseOffersError, setDatabaseOffersError] = useState<string | null>(null);

  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [isDatabaseOrdersConnected, setIsDatabaseOrdersConnected] = useState<boolean>(false);
  const [databaseOrdersCount, setDatabaseOrdersCount] = useState<number>(0);
  const [databaseOrdersError, setDatabaseOrdersError] = useState<string | null>(null);

  const [isLoadingPayments, setIsLoadingPayments] = useState<boolean>(false);
  const [isDatabasePaymentsConnected, setIsDatabasePaymentsConnected] = useState<boolean>(false);
  const [databasePaymentsCount, setDatabasePaymentsCount] = useState<number>(0);
  const [databasePaymentsError, setDatabasePaymentsError] = useState<string | null>(null);

  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(false);
  const [isDatabaseStorageConnected, setIsDatabaseStorageConnected] = useState<boolean>(false);
  const [isDatabaseStorageSchemaInstalled, setIsDatabaseStorageSchemaInstalled] = useState<boolean>(false);
  const [databaseStorageError, setDatabaseStorageError] = useState<string | null>(null);

  const [logisticsShipments, setLogisticsShipments] = useState<LogisticsShipmentRecord[]>([]);
  const [isLoadingLogistics, setIsLoadingLogistics] = useState<boolean>(false);

  const databaseStatusLabel = useMemo(() => {
    return formatDatabaseStatus(isRealDatabaseConnected, databaseListingCount, databaseError);
  }, [databaseError, isRealDatabaseConnected, databaseListingCount]);

  // Determine current active persona
  const currentPersona = useMemo<UserPersona>(() => {
    // If Live Account Mode
    if (appMode === 'live_account' && user) {
      const roleStrings = roles.map(String);
      let userPrimaryRole: UserPersonaRole = 'unassigned';
      if (roleStrings.includes('admin')) {
        userPrimaryRole = 'admin';
      } else if (roleStrings.includes('processor')) {
        userPrimaryRole = 'processor';
      } else if (roleStrings.includes('trader')) {
        userPrimaryRole = 'trader';
      } else if (roleStrings.includes('transporter') || roleStrings.includes('cold_storage')) {
        userPrimaryRole = 'cold_storage';
      } else if (roleStrings.includes('retailer')) {
        userPrimaryRole = 'retailer';
      } else if (roleStrings.includes('consumer')) {
        userPrimaryRole = 'consumer';
      } else if (roleStrings.includes('farmer') || roleStrings.includes('fpo_admin')) {
        userPrimaryRole = 'farmer';
      }

      // If user selected an authorized override role
      if (selectedRoleOverride && roleStrings.includes(selectedRoleOverride)) {
        userPrimaryRole = selectedRoleOverride;
      }

      if (profile) {
        const userOrg =
          (user.user_metadata?.organization as string) ||
          (profile.district ? `${profile.district} Regional Member` : 'Standard User Account');

        return {
          id: profile.id,
          name: profile.full_name,
          role: userPrimaryRole,
          roleLabel:
            roles.length > 0
              ? `Live Account (${roles.join(', ').toUpperCase()})`
              : 'Live Account (Pending DB Role Assignment)',
          organization: userOrg,
          district: profile.district,
          state: profile.state,
          phone: profile.phone_number,
          email: profile.email || user.email || '',
          kycStatus: profile.kyc_verified ? 'verified' : 'unverified',
          bankAccountVerified: Boolean(profile.bank_account_verified),
          avatarEmoji:
            userPrimaryRole === 'admin'
              ? '🛡️'
              : userPrimaryRole === 'processor'
              ? '🏭'
              : userPrimaryRole === 'trader'
              ? '🏢'
              : userPrimaryRole === 'cold_storage'
              ? '❄️'
              : userPrimaryRole === 'retailer'
              ? '🏪'
              : userPrimaryRole === 'consumer'
              ? '🛒'
              : userPrimaryRole === 'farmer'
              ? '👨‍🌾'
              : '👤',
          badge: profile.kyc_verified ? 'KYC Verified (Admin)' : 'KYC Pending Verification',
          isDemoPersona: false,
        };
      }

      // User logged in but profile row does not exist in DB yet
      return {
        id: user.id,
        name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Authenticated User',
        role: userPrimaryRole,
        roleLabel: roles.length > 0
          ? `Live Account (${roles.join(', ').toUpperCase()} - Profile Incomplete)`
          : 'Live Account (Profile Incomplete)',
        organization: (user.user_metadata?.organization as string) || 'Profile Incomplete',
        district: (user.user_metadata?.district as string) || 'Not set',
        state: (user.user_metadata?.state as string) || 'Not set',
        phone: (user.user_metadata?.phone_number as string) || 'Not set',
        email: user.email || '',
        kycStatus: 'unverified',
        bankAccountVerified: false,
        avatarEmoji: userPrimaryRole === 'admin' ? '🛡️' : '👤',
        badge: 'Incomplete Profile (Setup Required)',
        isDemoPersona: false,
      };
    }

    // In demo_sandbox mode
    if (appMode === 'demo_sandbox') {
      return DEMO_PERSONAS[selectedDemoRole] || DEMO_PERSONAS.farmer;
    }

    // Default when in welcome or signed out
    return {
      id: 'public-visitor',
      name: 'Signed-Out Visitor',
      role: 'unassigned',
      roleLabel: 'Signed-Out Visitor',
      organization: 'AgriPrice Public Access',
      district: 'All India',
      state: 'National',
      phone: '',
      email: '',
      kycStatus: 'unverified',
      bankAccountVerified: false,
      avatarEmoji: '👤',
      badge: 'Public Visitor',
      isDemoPersona: true,
    };
  }, [appMode, user, profile, roles, selectedRoleOverride, selectedDemoRole]);

  // Pure Derived State: Guarantee activeTab is always strictly valid for the current persona.
  // If an invalid or foreign tab is requested, automatically resolve to 'overview' with zero cascading renders.
  const activeTab = useMemo(() => {
    return isTabValidForPersona(rawActiveTab, currentPersona.role, activeRole, roles)
      ? rawActiveTab
      : 'overview';
  }, [rawActiveTab, currentPersona.role, activeRole, roles]);

  // Guard setActiveTab against foreign tab leaking across personas
  const setActiveTab = useCallback((tab: string) => {
    if (isTabValidForPersona(tab, currentPersona.role, activeRole, roles)) {
      setRawActiveTab(tab);
    } else {
      setRawActiveTab('overview');
    }
    resetMainContentScroll();
  }, [currentPersona.role, activeRole, roles]);

  // Load listings from Supabase view `public.public_produce_listings`
  const fetchListingsData = useCallback(async () => {
    if (appMode === 'demo_sandbox') {
      setIsRealDatabaseConnected(false);
      setDatabaseListingCount(INITIAL_MARKETPLACE_ITEMS.length);
      setDatabaseError(null);
      setListings(INITIAL_MARKETPLACE_ITEMS);
      setIsLoadingListings(false);
      return;
    }

    if (appMode === 'welcome') {
      setIsRealDatabaseConnected(false);
      setDatabaseListingCount(0);
      setDatabaseError(null);
      setListings([]);
      setIsLoadingListings(false);
      return;
    }

    // appMode === 'live_account'
    const result = await fetchPublicProduceListings();

    if (result.error) {
      setDatabaseError(result.error);
      setIsRealDatabaseConnected(false);
      setDatabaseListingCount(0);
      setListings([]);
    } else if (result.listings.length > 0) {
      setDatabaseError(null);
      setIsRealDatabaseConnected(true);
      setDatabaseListingCount(result.listings.length);

      // Map Supabase listings into MarketplaceProduceItem format
      const mappedDbListings: MarketplaceProduceItem[] = result.listings.map((l) => ({
        id: l.id,
        sellerId: l.seller_profile_id,
        sellerName: `Producer (${l.farm_district})`,
        sellerDistrict: l.farm_district,
        sellerState: l.farm_state,
        sellerKycVerified: true,
        title: l.title,
        commodity: l.commodity,
        variety: l.variety,
        grade: (l.grade as MarketplaceProduceItem['grade']) || 'Grade-A (Export / Premium)',
        totalQuantityKg: l.quantity_in_kg,
        reservedQuantityKg: l.reserved_quantity_kg,
        availableQuantityKg: l.available_quantity_kg,
        quantityUnit: l.quantity_unit,
        targetPricePerKg: l.target_price_per_kg ?? 25.0,
        harvestDate: l.harvest_date,
        expectedShelfLifeDays: l.expected_shelf_life_days,
        status: (l.status === 'reserved' ? 'reserved' : 'active') as MarketplaceProduceItem['status'],
        isLiveDatabaseListing: true,
        tags: ['Live Database', 'Verified View'],
        emoji: l.commodity.toLowerCase().includes('tomato') ? '🍅' : '🌱',
        createdAt: l.created_at,
      }));

      // In live account mode, show strictly real database listings (no demo mixing)
      setListings(mappedDbListings);
    } else {
      setDatabaseError(null);
      setIsRealDatabaseConnected(result.isConfigured);
      setDatabaseListingCount(0);
      setListings([]);
    }

    setIsLoadingListings(false);
  }, [appMode]);

  const refreshListings = useCallback(async () => {
    setIsLoadingListings(true);
    await fetchListingsData();
  }, [fetchListingsData]);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      await fetchListingsData();
      if (!isMounted) return;
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [fetchListingsData]);

  // Load offers from Supabase `public.offers_negotiations`
  const fetchOffersData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingOffers(true);
      const result = await fetchUserOffers();
      if (result.error) {
        setDatabaseOffersError(result.error);
        setIsDatabaseOffersConnected(false);
        setDatabaseOffersCount(0);
        setOffers([]); // CRITICAL: Never silently fall back to demo data after a real database error!
      } else {
        setDatabaseOffersError(null);
        setIsDatabaseOffersConnected(result.isConfigured);
        setDatabaseOffersCount(result.offers.length);
        setOffers(result.offers);
      }
      setIsLoadingOffers(false);
    } else if (appMode === 'demo_sandbox') {
      // In demo persona mode, keep interactive demo offers
      setDatabaseOffersError(null);
      setIsDatabaseOffersConnected(false);
      setDatabaseOffersCount(0);
      setOffers(INITIAL_OFFERS);
      setIsLoadingOffers(false);
    } else {
      setDatabaseOffersError(null);
      setIsDatabaseOffersConnected(false);
      setDatabaseOffersCount(0);
      setOffers([]);
      setIsLoadingOffers(false);
    }
  }, [appMode, user, profile]);

  const refreshOffers = useCallback(async () => {
    await fetchOffersData();
  }, [fetchOffersData]);

  useEffect(() => {
    let isMounted = true;
    async function initOffers() {
      await fetchOffersData();
      if (!isMounted) return;
    }
    initOffers();
    return () => {
      isMounted = false;
    };
  }, [fetchOffersData]);

  // Load orders from Supabase `public.reservations_orders`
  const fetchOrdersData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingOrders(true);
      const result = await fetchUserOrders();
      if (result.error) {
        setDatabaseOrdersError(result.error);
        setIsDatabaseOrdersConnected(false);
        setDatabaseOrdersCount(0);
        setOrders([]); // CRITICAL: Never silently fall back to demo data after a real database error!
      } else {
        setDatabaseOrdersError(null);
        setIsDatabaseOrdersConnected(result.isConfigured);
        setDatabaseOrdersCount(result.orders.length);
        setOrders(result.orders);
      }
      setIsLoadingOrders(false);
    } else if (appMode === 'demo_sandbox') {
      setDatabaseOrdersError(null);
      setIsDatabaseOrdersConnected(false);
      setDatabaseOrdersCount(0);
      setOrders(INITIAL_ORDERS);
      setIsLoadingOrders(false);
    } else {
      setDatabaseOrdersError(null);
      setIsDatabaseOrdersConnected(false);
      setDatabaseOrdersCount(0);
      setOrders([]);
      setIsLoadingOrders(false);
    }
  }, [appMode, user, profile]);

  const refreshOrders = useCallback(async () => {
    await fetchOrdersData();
  }, [fetchOrdersData]);

  useEffect(() => {
    let isMounted = true;
    async function initOrders() {
      await fetchOrdersData();
      if (!isMounted) return;
    }
    initOrders();
    return () => {
      isMounted = false;
    };
  }, [fetchOrdersData]);

  // Load payment events from Supabase `public.simulated_payment_events`
  const fetchPaymentsData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingPayments(true);
      const result = await fetchUserPaymentEvents();
      if (result.error) {
        setDatabasePaymentsError(result.error);
        setIsDatabasePaymentsConnected(false);
        setDatabasePaymentsCount(0);
        setPayments([]); // CRITICAL: Never silently fall back to demo data after a real database error!
      } else {
        setDatabasePaymentsError(null);
        setIsDatabasePaymentsConnected(result.isConfigured);
        setDatabasePaymentsCount(result.payments.length);
        setPayments(result.payments);
      }
      setIsLoadingPayments(false);
    } else if (appMode === 'demo_sandbox') {
      setDatabasePaymentsError(null);
      setIsDatabasePaymentsConnected(false);
      setDatabasePaymentsCount(0);
      setPayments(INITIAL_PAYMENTS);
      setIsLoadingPayments(false);
    } else {
      setDatabasePaymentsError(null);
      setIsDatabasePaymentsConnected(false);
      setDatabasePaymentsCount(0);
      setPayments([]);
      setIsLoadingPayments(false);
    }
  }, [appMode, user, profile]);

  const refreshPayments = useCallback(async () => {
    await fetchPaymentsData();
  }, [fetchPaymentsData]);

  useEffect(() => {
    let isMounted = true;
    async function initPayments() {
      await fetchPaymentsData();
      if (!isMounted) return;
    }
    initPayments();
    return () => {
      isMounted = false;
    };
  }, [fetchPaymentsData]);

  // Load cold storage facilities
  const fetchStorageData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingStorage(true);
      const res = await fetchColdStorageFacilities();
      setIsDatabaseStorageSchemaInstalled(res.isSchemaInstalled);

      if (res.error) {
        setDatabaseStorageError(res.error);
        setIsDatabaseStorageConnected(false);
        setStorageUnits([]); // Strict isolation: never show demo units in live mode
      } else if (res.facilities.length > 0) {
        setDatabaseStorageError(null);
        setIsDatabaseStorageConnected(true);
        const mapped: ColdStorageUnit[] = res.facilities.map((f) => ({
          id: f.id,
          facilityName: f.facilityName,
          operatorName: `Operator (${f.district})`,
          district: f.district,
          state: f.state,
          totalCapacityMt: f.totalCapacityMt,
          availableCapacityMt: f.availableCapacityMt,
          temperatureRange: f.temperatureRange,
          suitableCommodities: f.suitableCommodities,
          dailyRatePerQuintal: f.dailyRatePerQuintal,
          chamberCount: f.chamberCount,
          rating: 4.8,
          certifications: f.certifications,
          isLiveDatabaseRecord: true,
        }));
        setStorageUnits(mapped);
      } else {
        setDatabaseStorageError(null);
        setIsDatabaseStorageConnected(true);
        setStorageUnits([]);
      }
      setIsLoadingStorage(false);
    } else if (appMode === 'demo_sandbox') {
      setDatabaseStorageError(null);
      setIsDatabaseStorageConnected(false);
      setIsDatabaseStorageSchemaInstalled(false);
      setStorageUnits(INITIAL_STORAGE_UNITS);
      setIsLoadingStorage(false);
    } else {
      setDatabaseStorageError(null);
      setIsDatabaseStorageConnected(false);
      setIsDatabaseStorageSchemaInstalled(false);
      setStorageUnits([]);
      setIsLoadingStorage(false);
    }
  }, [appMode, user, profile]);

  const refreshStorage = useCallback(async () => {
    await fetchStorageData();
  }, [fetchStorageData]);

  useEffect(() => {
    let isMounted = true;
    async function initStorage() {
      await fetchStorageData();
      if (!isMounted) return;
    }
    initStorage();
    return () => {
      isMounted = false;
    };
  }, [fetchStorageData]);

  // Load logistics shipments from live reservations_orders
  const fetchLogisticsData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingLogistics(true);
      const res = await fetchLogisticsShipments(profile.id, roles.map(String));
      if (!res.error) {
        setLogisticsShipments(res.shipments);
      } else {
        setLogisticsShipments([]);
      }
      setIsLoadingLogistics(false);
    } else {
      setLogisticsShipments([]);
      setIsLoadingLogistics(false);
    }
  }, [appMode, user, profile, roles]);

  const refreshLogistics = useCallback(async () => {
    await fetchLogisticsData();
  }, [fetchLogisticsData]);

  useEffect(() => {
    let isMounted = true;
    async function initLogistics() {
      await fetchLogisticsData();
      if (!isMounted) return;
    }
    initLogistics();
    return () => {
      isMounted = false;
    };
  }, [fetchLogisticsData]);

  // Load user notifications from Supabase
  const fetchNotificationsData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingNotifications(true);
      const res = await fetchUserNotifications(profile.id);
      setIsDatabaseNotificationsSchemaInstalled(res.isSchemaInstalled);

      if (res.error) {
        setDatabaseNotificationsError(res.error);
        setNotifications([]); // Strict isolation: never show demo notifications in live mode
      } else if (res.notifications.length > 0) {
        setDatabaseNotificationsError(null);
        setNotifications(res.notifications);
      } else {
        setDatabaseNotificationsError(null);
        setNotifications([]);
      }
      setIsLoadingNotifications(false);
    } else if (appMode === 'demo_sandbox') {
      setDatabaseNotificationsError(null);
      setIsDatabaseNotificationsSchemaInstalled(false);
      setNotifications(INITIAL_NOTIFICATIONS);
      setIsLoadingNotifications(false);
    } else {
      setDatabaseNotificationsError(null);
      setIsDatabaseNotificationsSchemaInstalled(false);
      setNotifications([]);
      setIsLoadingNotifications(false);
    }
  }, [appMode, user, profile]);

  const refreshNotifications = useCallback(async () => {
    await fetchNotificationsData();
  }, [fetchNotificationsData]);

  useEffect(() => {
    let isMounted = true;
    async function initNotifications() {
      await fetchNotificationsData();
      if (!isMounted) return;
    }
    initNotifications();
    return () => {
      isMounted = false;
    };
  }, [fetchNotificationsData]);

  // Load order disputes from Supabase
  const fetchDisputesData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingDisputes(true);
      const res = await fetchOrderDisputes(profile.id, roles.map(String));
      setIsDatabaseDisputesSchemaInstalled(res.isSchemaInstalled);

      if (res.error) {
        setDatabaseDisputesError(res.error);
        setDisputes([]); // Strict isolation: never show demo disputes in live mode
      } else if (res.disputes.length > 0) {
        setDatabaseDisputesError(null);
        setDisputes(
          res.disputes.map((d) => ({
            id: d.id,
            orderNumber: d.orderNumber,
            orderId: d.orderId,
            claimant: d.claimantName,
            claimantRole: d.claimantRole,
            claimantProfileId: d.claimantProfileId,
            respondent: d.respondentName,
            respondentProfileId: d.respondentProfileId,
            commodity: d.commodity,
            quantityKg: d.quantityKg,
            escrowLockedAmount: d.escrowLockedAmount,
            disputeReason: d.disputeReason,
            evidenceSummary: d.evidenceSummary,
            filedAt: d.filedAt,
            status: d.status,
            resolutionNotes: d.resolutionNotes,
            isLiveDatabaseRecord: true,
          }))
        );
      } else {
        setDatabaseDisputesError(null);
        setDisputes([]);
      }
      setIsLoadingDisputes(false);
    } else if (appMode === 'demo_sandbox') {
      setDatabaseDisputesError(null);
      setIsDatabaseDisputesSchemaInstalled(false);
      setDisputes(INITIAL_DISPUTES);
      setIsLoadingDisputes(false);
    } else {
      setDatabaseDisputesError(null);
      setIsDatabaseDisputesSchemaInstalled(false);
      setDisputes([]);
      setIsLoadingDisputes(false);
    }
  }, [appMode, user, profile, roles]);

  const refreshDisputes = useCallback(async () => {
    await fetchDisputesData();
  }, [fetchDisputesData]);

  useEffect(() => {
    let isMounted = true;
    async function initDisputes() {
      await fetchDisputesData();
      if (!isMounted) return;
    }
    initDisputes();
    return () => {
      isMounted = false;
    };
  }, [fetchDisputesData]);

  // --- Phase 5: Market Intelligence & APMC Mandi Benchmarks ---
  const fetchMarketPricesData = useCallback(async () => {
    setIsLoadingMarketPrices(true);
    const res = await fetchMarketPriceBenchmarks();
    setMarketPrices(res.prices);
    setIsLiveMarketPrices(res.isLiveDatabase);
    setMarketPricesSourceDescription(res.sourceDescription);
    setIsLoadingMarketPrices(false);
  }, []);

  const refreshMarketPrices = useCallback(async () => {
    await fetchMarketPricesData();
  }, [fetchMarketPricesData]);

  useEffect(() => {
    let isMounted = true;
    async function initMarketPrices() {
      await fetchMarketPricesData();
      if (!isMounted) return;
    }
    initMarketPrices();
    return () => {
      isMounted = false;
    };
  }, [fetchMarketPricesData]);

  // --- Phase 5: Deterministic Calculation Snapshots ---
  const fetchSnapshotsData = useCallback(async () => {
    if (appMode === 'live_account' && user && profile) {
      setIsLoadingSnapshots(true);
      const res = await fetchUserCalculationSnapshots(profile.id);
      if (!res.error) {
        setUserSnapshots(res.snapshots);
      } else {
        setUserSnapshots([]);
      }
      setIsLoadingSnapshots(false);
    } else {
      setUserSnapshots([]);
      setIsLoadingSnapshots(false);
    }
  }, [appMode, user, profile]);

  const refreshSnapshots = useCallback(async () => {
    await fetchSnapshotsData();
  }, [fetchSnapshotsData]);

  useEffect(() => {
    let isMounted = true;
    async function initSnapshots() {
      await fetchSnapshotsData();
      if (!isMounted) return;
    }
    initSnapshots();
    return () => {
      isMounted = false;
    };
  }, [fetchSnapshotsData]);

  const saveSnapshot = useCallback(
    async (
      input: CalculationInput,
      result: CalculationResult,
      listingId?: string
    ): Promise<SaveSnapshotResult> => {
      const callerId = activeRole === 'authenticated' && profile?.id ? profile.id : (user?.id || 'demo-profile-snapshot');
      const res = await saveCalculationSnapshot(input, result, callerId, listingId);
      if (res.success && activeRole === 'authenticated' && profile?.id) {
        await refreshSnapshots();
      }
      return res;
    },
    [activeRole, profile, user, refreshSnapshots]
  );

  // --- Phase 5: Admin Platform Analytics & Telemetry ---
  const fetchTelemetryData = useCallback(async () => {
    setIsLoadingTelemetry(true);
    const callerRoles = roles.map(String);
    const res = await fetchLiveAdminAnalytics(callerRoles);
    setPlatformTelemetry(res.telemetry);
    setTelemetryError(res.error);
    setIsLoadingTelemetry(false);
  }, [roles]);

  const refreshTelemetry = useCallback(async () => {
    await fetchTelemetryData();
  }, [fetchTelemetryData]);

  useEffect(() => {
    let isMounted = true;
    async function initTelemetry() {
      await fetchTelemetryData();
      if (!isMounted) return;
    }
    initTelemetry();
    return () => {
      isMounted = false;
    };
  }, [fetchTelemetryData]);

  // Helper to add a notification
  const addNotification = (
    title: string,
    description: string,
    category: ActivityNotification['category'],
    severity: ActivityNotification['severity'] = 'info',
    actionUrlTab?: string
  ) => {
    const newNotif: ActivityNotification = {
      id: `NOTIF-${Date.now()}`,
      timestamp: 'Just now',
      title,
      description,
      category,
      severity,
      actionUrlTab,
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    if (activeRole === 'authenticated' && profile?.id) {
      void createPersistentNotification(
        {
          recipientProfileId: profile.id,
          category,
          severity,
          title,
          description,
          actionUrlTab,
        },
        profile.id
      );
    }
  };

  // 1. Create Listing
  const createListing = async (data: NewListingFormData) => {
    let isSavedToDatabase = false;
    let dbErrorMsg: string | null = null;

    // Check if user is authenticated and can write to Supabase
    if (isSupabaseConfigured() && user && profile) {
      try {
        const supabase = createBrowserClient();
        // Check if user has farmer role in user_roles table
        const hasFarmerRole = roles.includes('farmer') || roles.includes('fpo_admin');

        if (hasFarmerRole) {
          const { data: dbData, error } = await supabase
            .from('produce_listings')
            .insert({
              seller_profile_id: profile.id,
              title: data.title.trim(),
              commodity: data.commodity.trim(),
              variety: data.variety.trim(),
              grade: data.grade,
              harvest_quantity: data.harvestQuantity,
              quantity_unit: data.quantityUnit,
              quantity_in_kg:
                data.quantityUnit === 'quintal'
                  ? data.harvestQuantity * 100
                  : data.quantityUnit === 'tonne'
                  ? data.harvestQuantity * 1000
                  : data.harvestQuantity,
              harvest_date: data.harvestDate,
              expected_shelf_life_days: data.expectedShelfLifeDays,
              farm_district: data.farmDistrict.trim(),
              farm_state: data.farmState.trim(),
              farm_location_address: 'Verified Farm Production Zone',
              farm_pincode: profile.pincode || '563101',
              target_price_per_kg: data.targetPricePerKg,
              status: 'active',
            })
            .select()
            .single();

          if (!error && dbData) {
            isSavedToDatabase = true;
          } else {
            dbErrorMsg = error?.message || 'Database insert rejected';
          }
        } else {
          dbErrorMsg =
            'Database RLS Guard (listings_insert_producers): Authenticated profile lacks verified farmer role in public.user_roles. Saved to interactive demo session.';
        }
      } catch (err: unknown) {
        dbErrorMsg = err instanceof Error ? err.message : 'Database error';
      }
    }

    const calculatedKg =
      data.quantityUnit === 'quintal'
        ? data.harvestQuantity * 100
        : data.quantityUnit === 'tonne'
        ? data.harvestQuantity * 1000
        : data.harvestQuantity;

    const newItem: MarketplaceProduceItem = {
      id: `LIST-${Date.now().toString().slice(-6)}`,
      sellerId: currentPersona.id,
      sellerName: `${currentPersona.name} (${currentPersona.organization})`,
      sellerDistrict: data.farmDistrict,
      sellerState: data.farmState,
      sellerKycVerified: currentPersona.kycStatus === 'verified',
      title: data.title,
      commodity: data.commodity,
      variety: data.variety,
      grade: data.grade,
      totalQuantityKg: calculatedKg,
      reservedQuantityKg: 0,
      availableQuantityKg: calculatedKg,
      quantityUnit: data.quantityUnit,
      targetPricePerKg: data.targetPricePerKg,
      harvestDate: data.harvestDate,
      expectedShelfLifeDays: data.expectedShelfLifeDays,
      status: 'active',
      isLiveDatabaseListing: isSavedToDatabase,
      tags: ['Fresh Listing', data.commodity],
      emoji: data.commodity.toLowerCase().includes('tomato') ? '🍅' : '🌾',
      createdAt: new Date().toISOString(),
    };

    if (isSavedToDatabase) {
      // Refresh the real database listings view to display the newly committed row from public_produce_listings
      await refreshListings();
      addNotification(
        'Live Database Listing Published',
        `Published "${newItem.title}" (${newItem.availableQuantityKg.toLocaleString('en-IN')} kg @ ₹${newItem.targetPricePerKg}/kg). (Committed to Supabase database)`,
        'listing',
        'success',
        'inventory'
      );
      return {
        success: true,
        isSavedToDatabase: true,
        message: 'Listing committed to Supabase produce_listings table and live view refreshed.',
        item: newItem,
      };
    } else if (appMode === 'demo_sandbox') {
      // In demo mode, add to interactive presentation inventory
      setListings((prev) => [newItem, ...prev]);
      addNotification(
        'New Produce Listing Created (Demo)',
        `Published "${newItem.title}" (${newItem.availableQuantityKg.toLocaleString('en-IN')} kg @ ₹${newItem.targetPricePerKg}/kg).`,
        'listing',
        'success',
        'inventory'
      );
      return {
        success: true,
        isSavedToDatabase: false,
        message: 'Listing created in interactive demonstration sandbox.',
        item: newItem,
      };
    } else {
      // In live mode with rejected write, or welcome mode: do NOT add to listings state
      return {
        success: false,
        isSavedToDatabase: false,
        message: dbErrorMsg || 'Listing rejected: Active farmer role required in Supabase database.',
        item: undefined,
      };
    }
  };

  // 2. Create Offer
  const createOffer = async (data: NewOfferFormData) => {
    const targetListing = listings.find((l) => l.id === data.listingId);
    if (!targetListing) {
      return { success: false, message: 'Target listing not found' };
    }

    if (targetListing.availableQuantityKg <= 0 || targetListing.status !== 'active') {
      return {
        success: false,
        message: 'Cannot make an offer on a listing with zero available stock or inactive status.',
      };
    }

    if (data.offeredQuantityKg <= 0) {
      return {
        success: false,
        message: 'Offered quantity must be greater than 0 kg.',
      };
    }

    if (data.offeredQuantityKg > targetListing.availableQuantityKg) {
      return {
        success: false,
        message: `Offered quantity (${data.offeredQuantityKg} kg) exceeds available batch volume (${targetListing.availableQuantityKg} kg).`,
      };
    }

    // Live Database Submission branch:
    if (appMode === 'live_account') {
      if (!user || !profile || !isSupabaseConfigured()) {
        return {
          success: false,
          isSavedToDatabase: false,
          message: 'Authenticated profile required to submit a verified offer.',
        };
      }

      const dbResult = await createBuyerOffer(
        {
          listingId: targetListing.id,
          offeredPricePerKg: data.offeredPricePerKg,
          offeredQuantityKg: data.offeredQuantityKg,
          deliveryTerms: data.deliveryTerms,
          transportBorneBy: data.transportBorneBy,
          notes: data.notes,
        },
        profile.id,
        roles
      );

      if (!dbResult.success) {
        // Return clear error message to caller without falling back to demo state
        return {
          success: false,
          isSavedToDatabase: false,
          message: dbResult.error || 'Failed to submit offer to Supabase.',
        };
      }

      await refreshOffers();

      addNotification(
        'Live Purchase Offer Submitted',
        `Offer of ₹${data.offeredPricePerKg}/kg for ${data.offeredQuantityKg.toLocaleString('en-IN')} kg of ${targetListing.commodity} committed to Supabase.`,
        'offer',
        'success',
        'offers'
      );

      return {
        success: true,
        isSavedToDatabase: true,
        message: 'Offer successfully submitted and recorded in Supabase database.',
      };
    }

    if (appMode === 'demo_sandbox') {
      // In demo persona mode, keep interactive in-memory demo offer
    const newOffer: ProduceOffer = {
      id: `OFFER-${Date.now().toString().slice(-5)}`,
      listingId: targetListing.id,
      listingTitle: targetListing.title,
      commodity: targetListing.commodity,
      buyerId: currentPersona.id,
      buyerName: currentPersona.name,
      buyerOrganization: currentPersona.organization,
      buyerRole: currentPersona.role,
      sellerId: targetListing.sellerId,
      sellerName: targetListing.sellerName,
      offeredPricePerKg: data.offeredPricePerKg,
      offeredQuantityKg: data.offeredQuantityKg,
      deliveryTerms: data.deliveryTerms,
      transportBorneBy: data.transportBorneBy,
      status: 'pending',
      notes: data.notes,
      expiresAt: new Date(Date.now() + 3600000 * 48).toISOString(),
      createdAt: new Date().toISOString(),
      isLiveDatabaseOffer: false,
    };

    setOffers((prev) => [newOffer, ...prev]);

    addNotification(
      'Purchase Offer Submitted (Demo)',
      `${currentPersona.organization} placed an offer of ₹${data.offeredPricePerKg}/kg for ${data.offeredQuantityKg.toLocaleString('en-IN')} kg of ${targetListing.commodity}.`,
      'offer',
      'info',
      'offers'
    );

      return { success: true, isSavedToDatabase: false, message: 'Offer submitted in interactive demo mode.' };
    }

    return {
      success: false,
      isSavedToDatabase: false,
      message: 'Please sign in or enter demo sandbox to submit an offer.',
    };
  };

  // 3. Accept Offer -> Reserves inventory & generates order in awaiting_escrow
  const acceptOffer = async (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return { success: false, message: 'Offer not found' };

    // Live Database Branch:
    if (offer.isLiveDatabaseOffer) {
      if (!user || !profile) {
        return {
          success: false,
          message: 'Authentication Required: You must be signed in to accept live database offers.',
        };
      }

      const res = await acceptOfferWithReservation(offerId);
      if (!res.success) {
        return {
          success: false,
          message: res.error || 'Database transaction rejected offer acceptance.',
        };
      }

      await refreshOffers();
      await refreshListings();
      await refreshOrders();
      await refreshPayments();

      addNotification(
        'Offer Accepted & Inventory Reserved',
        `Offer ${offer.id} accepted. Atomic reservation created in database.`,
        'order',
        'success',
        'orders'
      );

      return {
        success: true,
        orderId: res.orderId,
        message: 'Offer accepted! Inventory reserved and order recorded in Supabase.',
      };
    }

    // In-memory demo flow:
    const targetListing = listings.find((l) => l.id === offer.listingId);
    if (!targetListing) return { success: false, message: 'Associated listing not found' };

    if (offer.offeredQuantityKg > targetListing.availableQuantityKg) {
      return {
        success: false,
        message: `Cannot accept offer: Available stock (${targetListing.availableQuantityKg} kg) is insufficient for offer volume (${offer.offeredQuantityKg} kg).`,
      };
    }

    // 1. Update Offer Status
    setOffers((prev) =>
      prev.map((o) => (o.id === offerId ? { ...o, status: 'accepted' } : o))
    );

    // 2. Atomically Reserve Inventory
    const newReserved = targetListing.reservedQuantityKg + offer.offeredQuantityKg;
    const newAvailable = targetListing.totalQuantityKg - newReserved;
    const newListingStatus = newAvailable === 0 ? 'reserved' : 'active';

    setListings((prev) =>
      prev.map((l) =>
        l.id === targetListing.id
          ? {
              ...l,
              reservedQuantityKg: newReserved,
              availableQuantityKg: newAvailable,
              status: newListingStatus,
            }
          : l
      )
    );

    // 3. Create Escrow-Protected Order
    const newOrderNumber = `AGP-ORD-${Date.now().toString().slice(-4)}`;
    const totalAgreed = offer.offeredPricePerKg * offer.offeredQuantityKg;

    const newOrder: MarketplaceOrder = {
      id: `ORD-${Date.now().toString().slice(-5)}`,
      orderNumber: newOrderNumber,
      listingId: targetListing.id,
      offerId: offer.id,
      commodity: targetListing.commodity,
      variety: targetListing.variety,
      grade: targetListing.grade,
      sellerId: targetListing.sellerId,
      sellerName: targetListing.sellerName,
      sellerDistrict: targetListing.sellerDistrict,
      buyerId: offer.buyerId,
      buyerName: offer.buyerName,
      buyerOrganization: offer.buyerOrganization,
      lockedQuantityKg: offer.offeredQuantityKg,
      agreedPricePerKg: offer.offeredPricePerKg,
      totalAgreedAmount: totalAgreed,
      escrowStatus: 'awaiting_escrow',
      storageProvider: 'Kolar CoolChain Hub A',
      transporterName: 'Assigned upon Escrow Authorization',
      createdAt: new Date().toISOString(),
    };

    setOrders((prev) => [newOrder, ...prev]);

    // 4. Log Simulated Escrow Payment Authorization
    const paymentRecord: SimulatedPaymentRecord = {
      id: `PAY-EVT-${Date.now().toString().slice(-4)}`,
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      eventType: 'escrow_hold_authorized',
      eventTitle: `Escrow Hold Authorized for ${newOrder.orderNumber}`,
      amount: totalAgreed,
      currency: 'INR',
      idempotencyKey: `idemp-hold-${newOrder.id}-${Date.now()}`,
      payloadHash: `sha256:sim-${Math.random().toString(36).substring(2, 15)}`,
      sourceAccount: `${offer.buyerOrganization} Settlement A/C`,
      destinationAccount: 'AgriPrice Escrow Trust Vault',
      ledgerState: 'COMMITTED',
      recordedAt: new Date().toISOString(),
    };

    setPayments((prev) => [paymentRecord, ...prev]);

    addNotification(
      'Offer Accepted & Inventory Reserved (Demo)',
      `Offer ${offer.id} accepted. Reserved ${offer.offeredQuantityKg.toLocaleString('en-IN')} kg. Order ${newOrderNumber} created in escrow pipeline.`,
      'order',
      'success',
      'orders'
    );

    return {
      success: true,
      orderId: newOrder.id,
      message: `Offer accepted! Reserved ${offer.offeredQuantityKg} kg and generated Order ${newOrderNumber}.`,
    };
  };

  // 4. Counter Offer
  const counterOffer = async (offerId: string, counterPricePerKg: number) => {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              status: 'countered',
              counterPricePerKg,
            }
          : o
      )
    );

    addNotification(
      'Counter Offer Proposed',
      `Counter proposal sent for ₹${counterPricePerKg}/kg. Awaiting buyer response.`,
      'offer',
      'info',
      'offers'
    );

    return { success: true, message: `Counter-offer of ₹${counterPricePerKg}/kg submitted.` };
  };

  // 5. Reject Offer
  const rejectOffer = async (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);

    if (offer?.isLiveDatabaseOffer) {
      if (!user || !profile) {
        return {
          success: false,
          message: 'Authentication Required: You must be signed in to reject database offers.',
        };
      }

      const res = await rejectSellerOffer(offerId);
      if (!res.success) {
        return {
          success: false,
          message: res.error || 'Failed to reject offer in database.',
        };
      }

      await refreshOffers();
      addNotification('Offer Declined in Supabase', `Offer was declined in database.`, 'offer', 'info');
      return { success: true, message: 'Offer declined in Supabase.' };
    }

    setOffers((prev) =>
      prev.map((o) => (o.id === offerId ? { ...o, status: 'rejected' } : o))
    );
    addNotification('Offer Declined', `Offer ${offerId} was declined by producer.`, 'offer', 'info');
    return { success: true, message: 'Offer declined.' };
  };

  // 6. Cancel Offer (Buyer action)
  const cancelOffer = async (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);

    if (offer?.isLiveDatabaseOffer) {
      if (!user || !profile) {
        return {
          success: false,
          message: 'Authentication Required: You must be signed in to cancel database offers.',
        };
      }

      const res = await cancelBuyerOffer(offerId);
      if (!res.success) {
        return {
          success: false,
          message: res.error || 'Failed to cancel offer in database.',
        };
      }

      await refreshOffers();
      addNotification('Offer Cancelled in Supabase', `Offer was cancelled in database.`, 'offer', 'info');
      return { success: true, message: 'Offer cancelled in Supabase.' };
    }

    setOffers((prev) =>
      prev.map((o) => (o.id === offerId ? { ...o, status: 'cancelled' } : o))
    );
    addNotification('Offer Cancelled', `Offer ${offerId} was cancelled.`, 'offer', 'info');
    return { success: true, message: 'Offer cancelled.' };
  };

  // 6. Advance Order Status through defined state machine
  const advanceOrderStatus = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return { success: false, nextStatus: '', message: 'Order not found' };

    // Real Supabase Order workflow
    if (order.isLiveDatabaseOrder) {
      if (!user || !profile) {
        return {
          success: false,
          nextStatus: order.escrowStatus,
          message: 'Authentication Required: You must be signed in to advance database orders.',
        };
      }

      const res = await advanceOrderState(order, profile.id, roles.map(String));
      if (!res.success) {
        return {
          success: false,
          nextStatus: order.escrowStatus,
          message: res.message || res.error || 'Failed to update order milestone in database.',
        };
      }

      await refreshOrders();
      await refreshPayments();

      addNotification(
        'Order Milestone Updated in Supabase',
        `Order ${order.orderNumber} advanced to ${res.nextStatus}. Real database event persisted.`,
        'order',
        'success',
        'orders'
      );

      return {
        success: true,
        nextStatus: res.nextStatus,
        message: res.message,
      };
    }

    // In-memory demo workflow
    let nextStatus: OrderProgressState = order.escrowStatus;
    let paymentEvent: SimulatedPaymentRecord | null = null;
    let message = '';

    if (order.escrowStatus === 'awaiting_escrow') {
      nextStatus = 'escrow_funded';
      message = 'Escrow deposit fully verified and locked in trust account.';
      addNotification(
        'Escrow Deposit Locked (Demo)',
        `Buyer funded ₹${order.totalAgreedAmount.toLocaleString('en-IN')} into escrow trust for ${order.orderNumber}. Dispatch authorization issued.`,
        'payment',
        'success',
        'orders'
      );
    } else if (order.escrowStatus === 'escrow_funded') {
      nextStatus = 'in_transit';
      message = 'Produce dispatched and logistics advance released to farmer/transporter.';
      // Log 40% dispatch advance payment
      const advanceAmount = Math.round(order.totalAgreedAmount * 0.4);
      paymentEvent = {
        id: `PAY-EVT-${Date.now().toString().slice(-4)}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        eventType: 'dispatch_advance_released',
        eventTitle: `Dispatch Advance Released (40% of ${order.orderNumber})`,
        amount: advanceAmount,
        currency: 'INR',
        idempotencyKey: `idemp-adv-${order.id}-${Date.now()}`,
        payloadHash: `sha256:sim-${Math.random().toString(36).substring(2, 15)}`,
        sourceAccount: 'AgriPrice Escrow Trust Vault',
        destinationAccount: `${order.sellerName} Bank A/C`,
        ledgerState: 'COMMITTED',
        recordedAt: new Date().toISOString(),
      };
      addNotification(
        'Produce Dispatched & Advance Released (Demo)',
        `₹${advanceAmount.toLocaleString('en-IN')} logistics advance transferred to grower. Consignment is now in transit.`,
        'payment',
        'success',
        'payments'
      );
    } else if (order.escrowStatus === 'in_transit') {
      nextStatus = 'delivered_inspected';
      message = 'Consignment arrived at destination facility and passed Grade-A quality inspection.';
      addNotification(
        'Delivery & Quality Inspection Confirmed (Demo)',
        `Consignment ${order.orderNumber} delivered to ${order.buyerOrganization}. Quality accepted. Final settlement ready.`,
        'order',
        'success',
        'orders'
      );
    } else if (order.escrowStatus === 'delivered_inspected') {
      nextStatus = 'settled';
      message = 'Order completed! Final net proceeds settled to farmer bank account.';
      const finalSettlementAmount = Math.round(order.totalAgreedAmount * 0.54); // remaining after deductions
      paymentEvent = {
        id: `PAY-EVT-${Date.now().toString().slice(-4)}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        eventType: 'farmer_proceeds_settled',
        eventTitle: `Final Farmer Proceeds Settlement for ${order.orderNumber}`,
        amount: finalSettlementAmount,
        currency: 'INR',
        idempotencyKey: `idemp-settle-${order.id}-${Date.now()}`,
        payloadHash: `sha256:sim-${Math.random().toString(36).substring(2, 15)}`,
        sourceAccount: 'AgriPrice Escrow Trust Vault',
        destinationAccount: `${order.sellerName} Bank A/C`,
        ledgerState: 'COMMITTED',
        recordedAt: new Date().toISOString(),
      };
      addNotification(
        'Final Order Settlement Complete (Demo)',
        `₹${finalSettlementAmount.toLocaleString('en-IN')} final settlement credited to farmer account for ${order.orderNumber}.`,
        'payment',
        'success',
        'payments'
      );
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, escrowStatus: nextStatus } : o))
    );

    if (paymentEvent) {
      setPayments((prev) => [paymentEvent!, ...prev]);
    }

    return { success: true, nextStatus, message };
  };

  // 7. Cancel Order Reservation
  const cancelOrder = async (orderId: string, reason = 'Cancelled by participant') => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Order not found' };

    if (order.isLiveDatabaseOrder) {
      if (!user || !profile) {
        return {
          success: false,
          message: 'Authentication Required: You must be signed in to cancel database orders.',
        };
      }

      const res = await cancelOrderReservation(orderId, reason);
      if (!res.success) {
        return {
          success: false,
          message: res.error || res.message || 'Failed to cancel order in database.',
        };
      }

      await refreshOrders();
      await refreshListings();
      await refreshPayments();

      addNotification(
        'Order Reservation Cancelled',
        `Order ${order.orderNumber} cancelled and reserved inventory released back to listing in Supabase.`,
        'order',
        'info',
        'orders'
      );

      return {
        success: true,
        message: res.message,
      };
    }

    // In-memory demo flow:
    if (order.escrowStatus !== 'awaiting_escrow') {
      return {
        success: false,
        message: `Orders in ${order.escrowStatus} status cannot be cancelled directly. Contact platform admin.`,
      };
    }

    // Release demo reserved quantity
    setListings((prev) =>
      prev.map((l) => {
        if (l.id === order.listingId) {
          const newReserved = Math.max(0, l.reservedQuantityKg - order.lockedQuantityKg);
          const newAvailable = l.totalQuantityKg - newReserved;
          return {
            ...l,
            reservedQuantityKg: newReserved,
            availableQuantityKg: newAvailable,
            status: 'active',
          };
        }
        return l;
      })
    );

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, escrowStatus: 'cancelled' } : o))
    );

    addNotification(
      'Order Cancelled (Demo)',
      `Order ${order.orderNumber} was cancelled and inventory restored.`,
      'order',
      'info',
      'orders'
    );

    return {
      success: true,
      message: 'Demo order cancelled and inventory returned to stock.',
    };
  };

  // 8. Book Cold Storage
  const bookStorage = async (storageId: string, requestedMt: number) => {
    const unit = storageUnits.find((u) => u.id === storageId);
    if (!unit) return { success: false, message: 'Facility not found' };

    // Numerical validation
    if (requestedMt <= 0 || isNaN(requestedMt)) {
      return {
        success: false,
        message: 'Requested capacity must be strictly greater than 0 MT.',
      };
    }

    // Capacity limit validation
    if (requestedMt > unit.availableCapacityMt) {
      return {
        success: false,
        message: `Requested capacity (${requestedMt} MT) exceeds available space (${unit.availableCapacityMt} MT at ${unit.facilityName}).`,
      };
    }

    if (activeRole === 'authenticated' && user && profile) {
      const res = await bookStorageCapacity(
        {
          facilityId: storageId,
          commodity: unit.suitableCommodities[0] || 'Agricultural Produce',
          requestedMt,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        profile.id,
        roles.map(String)
      );

      if (res.isSavedToDatabase) {
        await fetchStorageData();
        addNotification(
          'Cold Storage Capacity Allocated in Supabase',
          `Reserved ${requestedMt} MT at ${unit.facilityName} via atomic database transaction.`,
          'storage',
          'success',
          'storage'
        );
        return {
          success: true,
          message: res.message,
        };
      }

      // If schema table is uninstalled or error returned
      return {
        success: false,
        message: res.message,
      };
    }

    // In-memory demo flow:
    setStorageUnits((prev) =>
      prev.map((u) =>
        u.id === storageId
          ? { ...u, availableCapacityMt: u.availableCapacityMt - requestedMt }
          : u
      )
    );

    addNotification(
      'Cold Storage Capacity Reserved (Demo)',
      `Reserved ${requestedMt} MT at ${unit.facilityName} (${unit.temperatureRange}). Rate: ₹${unit.dailyRatePerQuintal}/quintal/day.`,
      'storage',
      'success',
      'storage'
    );

    return {
      success: true,
      message: `Successfully reserved ${requestedMt} MT capacity at ${unit.facilityName} in demo session.`,
    };
  };

  const markNotificationAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (activeRole === 'authenticated' && profile?.id) {
      await persistMarkNotificationAsRead(id, profile.id);
    }
  };

  const markAllNotificationsAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (activeRole === 'authenticated' && profile?.id) {
      await persistMarkAllUserNotificationsAsRead(profile.id);
    }
  };

  const raiseDispute = async (params: RaiseDisputeParams): Promise<DisputeActionResult> => {
    if (activeRole === 'authenticated' && user && profile) {
      const res = await persistRaiseOrderDispute(params, profile.id, roles.map(String));
      if (res.isSavedToDatabase) {
        await fetchDisputesData();
        await fetchOrdersData();
        addNotification(
          'Commercial Dispute Raised in Database',
          res.message,
          'dispute',
          'warning',
          'disputes'
        );
      }
      return res;
    }

    // In-memory demo flow:
    const targetOrder = orders.find((o) => o.id === params.orderId || o.orderNumber === params.orderId);
    const newDemoDispute: MarketplaceDispute = {
      id: `DSP-DEMO-${Date.now().toString().slice(-4)}`,
      orderNumber: targetOrder ? targetOrder.orderNumber : params.orderId,
      orderId: params.orderId,
      claimant: currentPersona.name,
      claimantRole: currentPersona.roleLabel,
      respondent: targetOrder ? (currentPersona.name === targetOrder.buyerName ? targetOrder.sellerName : targetOrder.buyerName) : 'Counterparty',
      commodity: targetOrder ? targetOrder.commodity : 'Produce Consignment',
      quantityKg: targetOrder ? targetOrder.lockedQuantityKg : 0,
      escrowLockedAmount: targetOrder ? targetOrder.totalAgreedAmount : 0,
      disputeReason: params.disputeReason,
      evidenceSummary: params.evidenceSummary,
      filedAt: 'Just now',
      status: 'under_review',
    };

    setDisputes((prev) => [newDemoDispute, ...prev]);

    // Freeze simulated order status
    if (targetOrder) {
      setOrders((prev) =>
        prev.map((o) => (o.id === targetOrder.id ? { ...o, escrowStatus: 'disputed' } : o))
      );
    }

    addNotification(
      'Dispute Raised (Demo Session)',
      `Commercial dispute filed on Order ${newDemoDispute.orderNumber}. Order escrow state is frozen.`,
      'dispute',
      'warning',
      'disputes'
    );

    return {
      success: true,
      disputeId: newDemoDispute.id,
      message: `Simulated dispute ${newDemoDispute.id} filed. Escrow state frozen for administrative arbitration.`,
      isSavedToDatabase: false,
    };
  };

  const resolveDispute = async (params: ResolveDisputeParams): Promise<DisputeActionResult> => {
    if (activeRole === 'authenticated' && user && profile) {
      const res = await persistResolveOrderDispute(params, profile.id, roles.map(String));
      if (res.isSavedToDatabase) {
        await fetchDisputesData();
        await fetchOrdersData();
        addNotification(
          'Dispute Arbitrated in Database',
          res.message,
          'dispute',
          'info',
          'disputes'
        );
      }
      return res;
    }

    // In-memory demo flow:
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === params.disputeId
          ? {
              ...d,
              status: params.resolutionStatus,
              resolutionNotes: params.resolutionNotes,
            }
          : d
      )
    );

    addNotification(
      'Dispute Arbitrated (Demo Session)',
      `Dispute ${params.disputeId} determined as "${params.resolutionStatus}".`,
      'dispute',
      'info',
      'disputes'
    );

    return {
      success: true,
      message: `Simulated dispute ${params.disputeId} arbitrated in demo session.`,
      isSavedToDatabase: false,
    };
  };

  return (
    <MarketplaceContext.Provider
      value={{
        appMode,
        isDemoSandboxActive,
        enterDemoSandbox,
        exitDemoSandbox,
        currentPersona,
        activeRole,
        setPersonaRole,
        availablePersonas: DEMO_PERSONAS,
        isRealDatabaseConnected,
        databaseListingCount,
        databaseError,
        databaseStatusLabel,
        isPrivacyMasked,
        togglePrivacyMasking,
        maskEmail,
        maskPhone,
        listings,
        isLoadingListings,
        refreshListings,
        createListing,
        offers,
        isLoadingOffers,
        isDatabaseOffersConnected,
        databaseOffersCount,
        databaseOffersError,
        refreshOffers,
        createOffer,
        acceptOffer,
        counterOffer,
        rejectOffer,
        cancelOffer,
        orders,
        isLoadingOrders,
        isDatabaseOrdersConnected,
        databaseOrdersCount,
        databaseOrdersError,
        refreshOrders,
        advanceOrderStatus,
        cancelOrder,
        storageUnits,
        isLoadingStorage,
        isDatabaseStorageConnected,
        isDatabaseStorageSchemaInstalled,
        databaseStorageError,
        refreshStorage,
        bookStorage,
        logisticsShipments,
        isLoadingLogistics,
        refreshLogistics,
        payments,
        isLoadingPayments,
        isDatabasePaymentsConnected,
        databasePaymentsCount,
        databasePaymentsError,
        refreshPayments,
        notifications,
        isLoadingNotifications,
        isDatabaseNotificationsSchemaInstalled,
        databaseNotificationsError,
        refreshNotifications,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        disputes,
        isLoadingDisputes,
        isDatabaseDisputesSchemaInstalled,
        databaseDisputesError,
        refreshDisputes,
        raiseDispute,
        resolveDispute,
        marketPrices,
        isLiveMarketPrices,
        marketPricesSourceDescription,
        isLoadingMarketPrices,
        refreshMarketPrices,
        userSnapshots,
        isLoadingSnapshots,
        refreshSnapshots,
        saveSnapshot,
        platformTelemetry,
        isLoadingTelemetry,
        telemetryError,
        refreshTelemetry,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return context;
}
