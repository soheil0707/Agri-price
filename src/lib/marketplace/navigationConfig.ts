/**
 * AgriPrice Role-Based Navigation Configuration
 *
 * Defines complete, strongly-typed navigation options for each of the seven demo personas:
 * 1. Farmer
 * 2. Food Processor
 * 3. Mandi Trader
 * 4. Cold Storage Provider
 * 5. Retail Buyer
 * 6. Consumer
 * 7. Platform Admin
 *
 * Every navigation item maps to a real view destination.
 */

import type { UserPersonaRole } from './types';

export interface PersonaNavItem {
  id: string;
  label: string;
  icon: string;
  destination: string; // The activeTab destination in AgriPrice
  badgeKey?: 'offers' | 'orders' | 'notifications';
  highlight?: boolean;
}

/**
 * Resolves the appropriate navigation items for either:
 * - A real authenticated account (resolving to their actual database roles)
 * - Or a simulated demo persona (resolving to the persona's role view)
 */
export function getNavigationForPersona(
  currentPersonaRole: UserPersonaRole,
  activeRole: UserPersonaRole,
  realRoles: string[] = []
): PersonaNavItem[] {
  if (activeRole === 'authenticated') {
    const roleStrings = realRoles.map(String);
    if (roleStrings.includes('admin')) {
      return PERSONA_NAVIGATION.admin;
    }
    if (roleStrings.includes('processor')) {
      return PERSONA_NAVIGATION.processor;
    }
    if (roleStrings.includes('trader')) {
      return PERSONA_NAVIGATION.trader;
    }
    if (roleStrings.includes('cold_storage') || roleStrings.includes('transporter')) {
      return PERSONA_NAVIGATION.cold_storage;
    }
    if (roleStrings.includes('retailer')) {
      return PERSONA_NAVIGATION.retailer;
    }
    if (roleStrings.includes('consumer')) {
      return PERSONA_NAVIGATION.consumer;
    }
    if (roleStrings.includes('fpo_admin') || roleStrings.includes('farmer')) {
      return PERSONA_NAVIGATION.farmer;
    }
    return PERSONA_NAVIGATION.unassigned;
  }

  // Demo Sandbox Mode: resolve navigation by persona role
  const roleKey = currentPersonaRole in PERSONA_NAVIGATION ? currentPersonaRole : 'farmer';
  return PERSONA_NAVIGATION[roleKey] || PERSONA_NAVIGATION.farmer;
}

/**
 * Validates whether a tab destination is allowed for the active persona/role.
 * Prevents persona cross-contamination and invalid tab leaking.
 * 'overview' is universally valid for every persona.
 * 'activity' is universally accessible via the system notification feed.
 */
export function isTabValidForPersona(
  destination: string,
  currentPersonaRole: UserPersonaRole,
  activeRole: UserPersonaRole,
  realRoles: string[] = []
): boolean {
  if (destination === 'overview' || destination === 'activity') {
    return true;
  }
  const roleStrings = realRoles.map(String);
  if (destination === 'profile' && (activeRole === 'authenticated' || roleStrings.length > 0)) {
    return true;
  }

  // Security guard: In authenticated mode, analytics is strictly reserved for database-verified administrators
  if (activeRole === 'authenticated' && destination === 'analytics' && !roleStrings.includes('admin')) {
    return false;
  }

  const items = getNavigationForPersona(currentPersonaRole, activeRole, realRoles);
  return items.some((item) => item.destination === destination || item.id === destination);
}

/**
 * Target scroll container interface supporting mock elements and HTML elements.
 */
export interface ScrollContainerTarget {
  scrollTop: number;
  scrollTo?: (options: { top: number; left?: number; behavior?: 'instant' | 'smooth' | 'auto' }) => void;
}

/**
 * Resets the main content container and window scroll positions to the top.
 * Handles window, document.documentElement, document.body, document.scrollingElement,
 * and any provided/discovered main content element.
 */
export function resetMainContentScroll(container?: ScrollContainerTarget | null): void {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
  }

  if (container) {
    container.scrollTop = 0;
    if (typeof container.scrollTo === 'function') {
      try {
        container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch {
        // Fallback already satisfied by container.scrollTop = 0
      }
    }
  }

  if (typeof document !== 'undefined') {
    const mainEl = document.getElementById('main-content') as ScrollContainerTarget | null;
    if (mainEl && mainEl !== container) {
      mainEl.scrollTop = 0;
      if (typeof mainEl.scrollTo === 'function') {
        try {
          mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch {
          // Fallback already satisfied by mainEl.scrollTop = 0
        }
      }
    }
  }
}

/**
 * Resets the independently scrollable sidebar navigation container to the top.
 */
export function resetSidebarNavScroll(navElement?: ScrollContainerTarget | null): void {
  if (navElement) {
    navElement.scrollTop = 0;
    if (typeof navElement.scrollTo === 'function') {
      try {
        navElement.scrollTo({ top: 0, behavior: 'instant' });
      } catch {
        // Fallback already satisfied by navElement.scrollTop = 0
      }
    }
  }

  if (typeof document !== 'undefined') {
    const navEl = document.querySelector('nav') as ScrollContainerTarget | null;
    if (navEl && navEl !== navElement) {
      navEl.scrollTop = 0;
      if (typeof navEl.scrollTo === 'function') {
        try {
          navEl.scrollTo({ top: 0, behavior: 'instant' });
        } catch {
          // Fallback already satisfied by navEl.scrollTop = 0
        }
      }
    }
  }
}

export const PERSONA_NAVIGATION: Record<UserPersonaRole, PersonaNavItem[]> = {
  // 1. Farmer / Producer
  farmer: [
    {
      id: 'farmer_overview',
      label: 'Harvest Overview',
      icon: '👨‍🌾',
      destination: 'overview',
    },
    {
      id: 'farmer_marketplace',
      label: 'Explore Marketplace',
      icon: '🛒',
      destination: 'marketplace',
    },
    {
      id: 'farmer_inventory',
      label: 'My Produce / Inventory',
      icon: '📦',
      destination: 'inventory',
    },
    {
      id: 'farmer_prices',
      label: 'Market Prices',
      icon: '📈',
      destination: 'prices',
    },
    {
      id: 'farmer_calculator',
      label: 'Net Proceeds Calculator',
      icon: '🧮',
      destination: 'calculator',
      highlight: true,
    },
    {
      id: 'farmer_offers',
      label: 'Offers & Negotiations',
      icon: '🤝',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'farmer_orders',
      label: 'Orders & Deliveries',
      icon: '🚚',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'farmer_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 2. Food Processor / Industrial Factory Buyer
  processor: [
    {
      id: 'processor_overview',
      label: 'Factory Overview',
      icon: '🏭',
      destination: 'overview',
    },
    {
      id: 'processor_marketplace',
      label: 'Source Farmgate Lots',
      icon: '🛒',
      destination: 'marketplace',
      highlight: true,
    },
    {
      id: 'processor_catalog',
      label: 'Produce Catalog',
      icon: '📦',
      destination: 'inventory',
    },
    {
      id: 'processor_offers',
      label: 'Procurement Offers',
      icon: '🤝',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'processor_inbound',
      label: 'Inbound Shipments',
      icon: '🚛',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'processor_storage',
      label: 'Cold Buffer Inventory',
      icon: '❄️',
      destination: 'storage',
    },
    {
      id: 'processor_orders',
      label: 'Orders & Deliveries',
      icon: '🚚',
      destination: 'orders',
    },
    {
      id: 'processor_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 3. Mandi Commission Trader / Bulk Wholesaler
  trader: [
    {
      id: 'trader_overview',
      label: 'Arbitrage Overview',
      icon: '🏢',
      destination: 'overview',
    },
    {
      id: 'trader_marketplace',
      label: 'Available Bulk Lots',
      icon: '🛒',
      destination: 'marketplace',
    },
    {
      id: 'trader_prices',
      label: 'APMC Price Spreads',
      icon: '📈',
      destination: 'prices',
      highlight: true,
    },
    {
      id: 'trader_calculator',
      label: 'Net Proceeds Calculator',
      icon: '🧮',
      destination: 'calculator',
    },
    {
      id: 'trader_trading_book',
      label: 'Trading Book',
      icon: '🤝',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'trader_orders',
      label: 'Orders & Deliveries',
      icon: '🚚',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'trader_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 4. Cold Storage & Fleet Logistics Provider
  cold_storage: [
    {
      id: 'cold_overview',
      label: 'Facility Overview',
      icon: '❄️',
      destination: 'overview',
    },
    {
      id: 'cold_storage_capacity',
      label: 'Storage Capacity',
      icon: '🏬',
      destination: 'storage',
      highlight: true,
    },
    {
      id: 'cold_batches',
      label: 'Inbound / Outbound Batches',
      icon: '🚛',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'cold_marketplace',
      label: 'Available Produce',
      icon: '🛒',
      destination: 'marketplace',
    },
    {
      id: 'cold_reservations',
      label: 'Reservations',
      icon: '📋',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'cold_orders',
      label: 'Orders & Deliveries',
      icon: '🚚',
      destination: 'orders',
    },
    {
      id: 'cold_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 5. Retail Supermarket Buyer
  retailer: [
    {
      id: 'retail_overview',
      label: 'Retail Overview',
      icon: '🏪',
      destination: 'overview',
    },
    {
      id: 'retail_marketplace',
      label: 'Source Grade-A Lots',
      icon: '🛒',
      destination: 'marketplace',
      highlight: true,
    },
    {
      id: 'retail_catalog',
      label: 'Produce Catalog',
      icon: '📦',
      destination: 'inventory',
    },
    {
      id: 'retail_contracts',
      label: 'Direct Farmer Contracts',
      icon: '🤝',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'retail_deliveries',
      label: 'Store Deliveries',
      icon: '🚚',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'retail_prices',
      label: 'Market Prices',
      icon: '📈',
      destination: 'prices',
    },
    {
      id: 'retail_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 6. Direct Consumer / Residential Society Buyer
  consumer: [
    {
      id: 'consumer_overview',
      label: 'Consumer Hub',
      icon: '🛒',
      destination: 'overview',
    },
    {
      id: 'consumer_marketplace',
      label: 'Fresh Farm Harvests',
      icon: '🥗',
      destination: 'marketplace',
      highlight: true,
    },
    {
      id: 'consumer_prices',
      label: 'Price Transparency',
      icon: '📈',
      destination: 'prices',
    },
    {
      id: 'consumer_household_orders',
      label: 'Household Orders',
      icon: '📦',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'consumer_deliveries',
      label: 'Track Deliveries',
      icon: '🚚',
      destination: 'orders',
    },
    {
      id: 'consumer_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // 7. Platform Operations & Escrow Admin
  admin: [
    {
      id: 'admin_overview',
      label: 'Operations Overview',
      icon: '🛡️',
      destination: 'overview',
    },
    {
      id: 'admin_kyc',
      label: 'User & KYC Verification',
      icon: '👤',
      destination: 'profile',
    },
    {
      id: 'admin_moderation',
      label: 'Produce Moderation',
      icon: '🔍',
      destination: 'marketplace',
    },
    {
      id: 'admin_audit',
      label: 'Transaction & Escrow Audit',
      icon: '💳',
      destination: 'payments',
    },
    {
      id: 'admin_disputes',
      label: 'Disputes',
      icon: '⚖️',
      destination: 'disputes',
    },
    {
      id: 'admin_analytics',
      label: 'Platform Analytics',
      icon: '📊',
      destination: 'analytics',
    },
    {
      id: 'admin_settings',
      label: 'Settings & Compliance',
      icon: '⚙️',
      destination: 'settings',
    },
  ],

  // Fallback / Authenticated default mapping
  authenticated: [
    {
      id: 'auth_overview',
      label: 'Harvest Overview',
      icon: '👨‍🌾',
      destination: 'overview',
    },
    {
      id: 'auth_marketplace',
      label: 'Explore Marketplace',
      icon: '🛒',
      destination: 'marketplace',
    },
    {
      id: 'auth_inventory',
      label: 'My Produce / Inventory',
      icon: '📦',
      destination: 'inventory',
    },
    {
      id: 'auth_prices',
      label: 'Market Prices',
      icon: '📈',
      destination: 'prices',
    },
    {
      id: 'auth_calculator',
      label: 'Net Proceeds Calculator',
      icon: '🧮',
      destination: 'calculator',
    },
    {
      id: 'auth_offers',
      label: 'Offers & Negotiations',
      icon: '🤝',
      destination: 'offers',
      badgeKey: 'offers',
    },
    {
      id: 'auth_orders',
      label: 'Orders & Deliveries',
      icon: '🚚',
      destination: 'orders',
      badgeKey: 'orders',
    },
    {
      id: 'auth_payments',
      label: 'Payments',
      icon: '💳',
      destination: 'payments',
    },
  ],

  // Unassigned user default
  unassigned: [
    {
      id: 'unassigned_overview',
      label: 'Marketplace Overview',
      icon: '🌱',
      destination: 'overview',
    },
    {
      id: 'unassigned_marketplace',
      label: 'Explore Marketplace',
      icon: '🛒',
      destination: 'marketplace',
    },
    {
      id: 'unassigned_prices',
      label: 'Market Prices',
      icon: '📈',
      destination: 'prices',
    },
    {
      id: 'unassigned_calculator',
      label: 'Net Proceeds Calculator',
      icon: '🧮',
      destination: 'calculator',
    },
    {
      id: 'unassigned_profile',
      label: 'Complete Profile',
      icon: '👤',
      destination: 'profile',
    },
  ],
};
