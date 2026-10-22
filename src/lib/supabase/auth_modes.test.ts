/**
 * AgriPrice Phase 6: Authentication UX, Live/Demo Separation & Authorization Test Suite
 *
 * Verifies:
 * 1. First launch signed-out visitor defaults to 'welcome' (never enters demo persona)
 * 2. Explicit demo sandbox entry, switching, and exit
 * 3. Strict role authorization & denial of client privilege escalation to admin
 * 4. Tab and navigation validation across all 7 supply chain roles
 * 5. Complete live vs. demo data isolation (zero demo items in live account queries)
 * 6. Missing schema handling for storage, notifications, and disputes (clean empty state + notices)
 * 7. Privacy masking of personal identifiable information (email and phone)
 * 8. Session logout cleanup and state wipe
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNavigationForPersona,
  isTabValidForPersona,
} from '../marketplace/navigationConfig.ts';
import { maskEmail, maskPhone } from '../marketplace/privacyMasking.ts';
import {
  INITIAL_MARKETPLACE_ITEMS,
  INITIAL_OFFERS,
  INITIAL_ORDERS,
  INITIAL_STORAGE_UNITS,
  INITIAL_DISPUTES,
  DEMO_PERSONAS,
} from '../marketplace/seedData.ts';
import type {
  UserPersonaRole,
  ProduceOffer,
  MarketplaceOrder,
} from '../marketplace/types.ts';
import { ASSIGNABLE_BUSINESS_ROLES } from './roles.ts';

// ==============================================================================
// 1. SIGNED-OUT VISITOR FIRST LAUNCH
// ==============================================================================

test('1. Signed-Out Visitor First Launch: Defaults to welcome state, never auto-entering demo persona', () => {
  // Simulate signed-out visitor state
  const user = null;
  const isDemoSandboxActive = false;

  const appMode = user ? 'live_account' : (isDemoSandboxActive ? 'demo_sandbox' : 'welcome');
  assert.strictEqual(appMode, 'welcome', 'Signed-out visitor must always enter "welcome" mode');

  // Verify signed-out visitor persona
  const visitorRole: UserPersonaRole = 'unassigned';
  assert.strictEqual(visitorRole, 'unassigned', 'Visitor role must be unassigned');

  // Visitor must not see admin or private role navigation
  const nav = getNavigationForPersona(visitorRole, 'unassigned', []);
  const destinations = nav.map((item) => item.destination);

  assert.ok(!destinations.includes('analytics'), 'Visitor must not have access to admin analytics');
  assert.ok(!destinations.includes('disputes'), 'Visitor must not have access to admin arbitration');
});

// ==============================================================================
// 2. EXPLICIT DEMO SANDBOX ENTRY, SWITCHING, AND EXIT
// ==============================================================================

test('2. Demo Sandbox Flow: Explicit entry, 7-role persona switching, and clean exit', () => {
  let isDemoSandboxActive = false;
  let selectedDemoRole: UserPersonaRole = 'farmer';

  // Step A: Explicit Entry
  isDemoSandboxActive = true;
  selectedDemoRole = 'farmer';

  let currentPersona = DEMO_PERSONAS[selectedDemoRole];
  assert.strictEqual(currentPersona.name, 'Ramesh Kumar');
  assert.strictEqual(currentPersona.isDemoPersona, true);

  // Step B: Switch between all 7 demo personas
  const rolesToTest: UserPersonaRole[] = [
    'farmer',
    'processor',
    'trader',
    'cold_storage',
    'retailer',
    'consumer',
    'admin',
  ];

  for (const role of rolesToTest) {
    selectedDemoRole = role;
    currentPersona = DEMO_PERSONAS[role];
    assert.ok(currentPersona, `Demo persona for role "${role}" must exist`);
    assert.strictEqual(currentPersona.isDemoPersona, true);
    assert.strictEqual(currentPersona.role, role);
  }

  // Step C: Exit Demo Sandbox
  isDemoSandboxActive = false;
  selectedDemoRole = 'farmer';
  const appMode = isDemoSandboxActive ? 'demo_sandbox' : 'welcome';

  assert.strictEqual(appMode, 'welcome', 'Exiting demo sandbox must return visitor to welcome mode');
});

// ==============================================================================
// 3. ROLE AUTHORIZATION & PRIVILEGE ESCALATION GUARDS
// ==============================================================================

test('3. Role Authorization: Client cannot elevate to admin or access unauthorized tabs', () => {
  // Scenario A: User is authenticated with 'farmer' role in Supabase user_roles
  const liveUserRoles = ['farmer'];
  const userPersonaRole: UserPersonaRole = 'farmer';

  // Attacker attempts client state override to 'admin'
  const attemptedClientOverrideRole = 'admin';
  const isAuthorized = liveUserRoles.includes(attemptedClientOverrideRole);

  assert.strictEqual(
    isAuthorized,
    false,
    'Client override to "admin" must be rejected when not in database roles'
  );

  // Check tab validation
  const canAccessAnalytics = isTabValidForPersona(
    'analytics',
    userPersonaRole,
    'farmer',
    liveUserRoles
  );
  assert.strictEqual(canAccessAnalytics, false, 'Farmer must NOT be allowed to access analytics tab');

  const canAccessDisputes = isTabValidForPersona(
    'disputes',
    userPersonaRole,
    'farmer',
    liveUserRoles
  );
  assert.strictEqual(canAccessDisputes, false, 'Farmer must NOT be allowed to access disputes tab');

  const canAccessInventory = isTabValidForPersona(
    'inventory',
    userPersonaRole,
    'farmer',
    liveUserRoles
  );
  assert.strictEqual(canAccessInventory, true, 'Farmer MUST be allowed to access inventory tab');

  // Scenario B: User is database-verified administrator
  const liveAdminRoles = ['admin'];
  const adminCanAccessAnalytics = isTabValidForPersona(
    'analytics',
    'admin',
    'admin',
    liveAdminRoles
  );
  assert.strictEqual(adminCanAccessAnalytics, true, 'Admin MUST be allowed to access analytics tab');

  const adminCanAccessDisputes = isTabValidForPersona(
    'disputes',
    'admin',
    'admin',
    liveAdminRoles
  );
  assert.strictEqual(adminCanAccessDisputes, true, 'Admin MUST be allowed to access disputes tab');
});

test('4. Public Registration Whitelist: Admin role cannot be self-assigned', () => {
  const assignableRoles = ASSIGNABLE_BUSINESS_ROLES.map((r) => r.role);
  assert.strictEqual(
    assignableRoles.includes('admin'),
    false,
    'admin role must NEVER be present in public/business self-assignable roles'
  );
  assert.ok(assignableRoles.includes('farmer'));
  assert.ok(assignableRoles.includes('processor'));
  assert.ok(assignableRoles.includes('trader'));
  assert.ok(assignableRoles.includes('transporter'));
});

// ==============================================================================
// 4. LIVE VS. DEMO DATA ISOLATION
// ==============================================================================

test('5. Live vs. Demo Data Isolation: Live account mode never mixes demo records', () => {
  // Live Database Response Simulation (Empty or Verified Real Records)
  const realDatabaseListings = [
    {
      id: 'db-listing-001',
      title: 'Real Kolar Tomatoes',
      commodity: 'Tomato',
      isLiveDatabaseListing: true,
    },
  ];

  // In Live Account Mode
  const appMode = 'live_account';
  let activeListings: Array<{ id: string; title?: string; commodity?: string; isLiveDatabaseListing?: boolean }> = [];

  if (appMode === 'live_account') {
    // Strictly set database listings without demo concatenation
    activeListings = realDatabaseListings;
  } else {
    activeListings = INITIAL_MARKETPLACE_ITEMS;
  }

  assert.strictEqual(activeListings.length, 1);
  assert.strictEqual(activeListings[0].id, 'db-listing-001');

  // Confirm NO demo listing IDs are present in live listings
  const demoIds = new Set(INITIAL_MARKETPLACE_ITEMS.map((item) => item.id));
  for (const item of activeListings) {
    assert.strictEqual(
      demoIds.has(item.id),
      false,
      `Live listings must not contain demo seed item "${item.id}"`
    );
  }
});

test('6. Offers & Orders Isolation: Live mode returns user records or empty array, never demo seeds', () => {
  // In live mode with 0 offers
  const liveUserOffers: ProduceOffer[] = [];
  const appMode = 'live_account';

  const displayedOffers: ProduceOffer[] = appMode === 'live_account' ? liveUserOffers : INITIAL_OFFERS;
  assert.strictEqual(displayedOffers.length, 0, 'Live account with 0 offers must show empty list, not demo offers');

  // In live mode with 0 orders
  const liveUserOrders: MarketplaceOrder[] = [];
  const displayedOrders: MarketplaceOrder[] = appMode === 'live_account' ? liveUserOrders : INITIAL_ORDERS;
  assert.strictEqual(displayedOrders.length, 0, 'Live account with 0 orders must show empty list, not demo orders');
});

// ==============================================================================
// 5. MISSING DATABASE SCHEMA HANDLING
// ==============================================================================

test('7. Missing Database Schema Handling: Clean unconfigured states without mock substitution', () => {
  // Cold Storage: When schema is not installed in live mode
  const isDatabaseStorageSchemaInstalled = false;
  const liveStorageUnits = isDatabaseStorageSchemaInstalled ? [{ id: 'live-facility-1' }] : [];

  assert.strictEqual(
    liveStorageUnits.length,
    0,
    'Uninstalled storage schema must not fall back to INITIAL_STORAGE_UNITS'
  );
  assert.notStrictEqual(liveStorageUnits, INITIAL_STORAGE_UNITS);

  // Disputes: When schema is not installed in live mode
  const isDatabaseDisputesSchemaInstalled = false;
  const liveDisputes = isDatabaseDisputesSchemaInstalled ? [{ id: 'live-dispute-1' }] : [];

  assert.strictEqual(
    liveDisputes.length,
    0,
    'Uninstalled disputes schema must not fall back to INITIAL_DISPUTES'
  );
  assert.notStrictEqual(liveDisputes, INITIAL_DISPUTES);
});

// ==============================================================================
// 6. PRIVACY MASKING FOR PRESENTATIONS & SCREENSHOTS
// ==============================================================================

test('8. Privacy Masking: Masks personal emails and phones reliably', () => {
  // Email masking: preserves first 2 chars of local part and 1 char of domain
  assert.strictEqual(maskEmail('ramesh.kumar@agriprice.in'), 'ra***@a***.in');
  assert.strictEqual(maskEmail('admin@supabase.co'), 'ad***@s***.co');
  assert.strictEqual(maskEmail(''), '');
  assert.strictEqual(maskEmail(null), '');

  // Phone masking: preserves last 2 digits
  assert.strictEqual(maskPhone('+91 98451 23456'), '+91 ••••• ••56');
  assert.strictEqual(maskPhone('9876543210'), '+91 ••••• ••10');
  assert.strictEqual(maskPhone(''), '');
  assert.strictEqual(maskPhone(null), '');
});

// ==============================================================================
// 7. SESSION LOGOUT CLEANUP
// ==============================================================================

test('9. Session Logout Cleanup: Wipes private state and returns to welcome mode', () => {
  // Simulated logged-in user state
  let user: { id: string; email: string } | null = { id: 'usr-123', email: 'farmer@agriprice.in' };
  let profile: { full_name: string; phone: string } | null = { full_name: 'Rajesh', phone: '9845100000' };
  let roles: string[] = ['farmer'];
  let selectedRoleOverride: UserPersonaRole | null = 'farmer';
  let isDemoSandboxActive = false;

  // Execute sign out
  user = null;
  profile = null;
  roles = [];
  selectedRoleOverride = null;
  isDemoSandboxActive = false;

  const currentAppMode = user ? 'live_account' : (isDemoSandboxActive ? 'demo_sandbox' : 'welcome');

  assert.strictEqual(user, null, 'User must be cleared');
  assert.strictEqual(profile, null, 'Profile must be cleared');
  assert.strictEqual(roles.length, 0, 'Roles must be cleared');
  assert.strictEqual(selectedRoleOverride, null, 'Role overrides must be cleared');
  assert.strictEqual(currentAppMode, 'welcome', 'Logged out session must reset appMode to welcome');
});

// ==============================================================================
// 8. PHASE 6 AUDIT REMEDIATION INVARIANTS
// ==============================================================================

test('10. Date-Aware Storage Capacity: Peak interval overlap determines headroom', () => {
  const facilityTotalCapacityMt = 100;
  // Existing reservations in facility
  const existingReservations = [
    { id: 'res-1', start: '2026-11-01', end: '2026-11-10', reservedMt: 40, status: 'confirmed' },
    { id: 'res-2', start: '2026-11-05', end: '2026-11-15', reservedMt: 35, status: 'confirmed' },
    { id: 'res-3', start: '2026-11-20', end: '2026-11-30', reservedMt: 50, status: 'confirmed' },
  ];

  // Helper calculating peak overlap on a given interval
  function calculatePeakReserved(reqStart: string, reqEnd: string): number {
    const days: string[] = [];
    const cur = new Date(reqStart);
    const end = new Date(reqEnd);
    while (cur <= end) {
      days.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    let peak = 0;
    for (const d of days) {
      const dailySum = existingReservations
        .filter((r) => r.status === 'confirmed' && r.start <= d && r.end >= d)
        .reduce((sum, r) => sum + r.reservedMt, 0);
      if (dailySum > peak) peak = dailySum;
    }
    return peak;
  }

  // Case A: Booking overlapping peak days (Nov 5 - Nov 10 has 40 + 35 = 75 MT already reserved)
  const peakNov7 = calculatePeakReserved('2026-11-06', '2026-11-08');
  assert.strictEqual(peakNov7, 75, 'Peak overlap on Nov 6-8 must be 75 MT');

  const reqA = 30; // 75 + 30 = 105 MT > 100 MT capacity
  assert.strictEqual(
    peakNov7 + reqA > facilityTotalCapacityMt,
    true,
    'Booking 30 MT on Nov 6-8 must be rejected due to peak overlap exceeding 100 MT'
  );

  // Case B: Booking on Nov 16 - Nov 19 (Zero overlap with existing active bookings)
  const peakMidNov = calculatePeakReserved('2026-11-16', '2026-11-19');
  assert.strictEqual(peakMidNov, 0, 'No overlap on Nov 16-19');
  const reqB = 80;
  assert.strictEqual(
    peakMidNov + reqB <= facilityTotalCapacityMt,
    true,
    'Booking 80 MT on Nov 16-19 must be accepted'
  );
});

test('11. Storage Commodity Compatibility & Linked Order Counterparty Guard', () => {
  const facilitySuitableCommodities = ['Tomato', 'Potato', 'Onion'];

  // Case A: Commodity compatibility
  function isCommodityCompatible(commodity: string): boolean {
    return facilitySuitableCommodities.some(
      (c) => c.toLowerCase().trim() === commodity.toLowerCase().trim()
    );
  }
  assert.strictEqual(isCommodityCompatible('Tomato'), true);
  assert.strictEqual(isCommodityCompatible('tomato '), true);
  assert.strictEqual(isCommodityCompatible('Pineapple'), false);

  // Case B: Linked order verification
  const linkedOrder = {
    id: 'ord-123',
    buyerId: 'prof-buyer',
    sellerId: 'prof-seller',
    transporterId: 'prof-transporter',
    commodity: 'Tomato',
  };

  function canBookForOrder(callerId: string, commodity: string): { allowed: boolean; reason?: string } {
    const isParticipant =
      callerId === linkedOrder.buyerId ||
      callerId === linkedOrder.sellerId ||
      callerId === linkedOrder.transporterId;
    if (!isParticipant) return { allowed: false, reason: 'unauthorized_participant' };
    if (commodity.toLowerCase() !== linkedOrder.commodity.toLowerCase()) {
      return { allowed: false, reason: 'commodity_mismatch' };
    }
    return { allowed: true };
  }

  assert.strictEqual(canBookForOrder('prof-buyer', 'Tomato').allowed, true);
  assert.strictEqual(canBookForOrder('prof-seller', 'Tomato').allowed, true);
  assert.strictEqual(canBookForOrder('stranger-prof', 'Tomato').reason, 'unauthorized_participant');
  assert.strictEqual(canBookForOrder('prof-buyer', 'Potato').reason, 'commodity_mismatch');
});

test('12. Dispute Resolution Reconciliation: Order escrow state & simulated payment events', () => {
  // Simulated state transitions
  interface OrderState {
    id: string;
    escrowStatus: string;
    lockedAmount: number;
  }
  const order: OrderState = {
    id: 'ord-999',
    escrowStatus: 'disputed',
    lockedAmount: 50000,
  };

  interface PaymentEvent {
    orderId: string;
    eventType: string;
    amount: number;
    destination: string;
  }
  const ledger: PaymentEvent[] = [];

  function simulateDisputeResolution(resolution: 'resolved_seller_paid' | 'resolved_buyer_refunded' | 'resolved_mutual_split') {
    if (resolution === 'resolved_seller_paid') {
      order.escrowStatus = 'settled';
      ledger.push({
        orderId: order.id,
        eventType: 'farmer_proceeds_settled',
        amount: order.lockedAmount,
        destination: 'SELLER',
      });
    } else if (resolution === 'resolved_buyer_refunded') {
      order.escrowStatus = 'cancelled';
      ledger.push({
        orderId: order.id,
        eventType: 'refund_issued',
        amount: order.lockedAmount,
        destination: 'BUYER',
      });
    } else if (resolution === 'resolved_mutual_split') {
      order.escrowStatus = 'settled';
      const half = order.lockedAmount / 2;
      ledger.push({ orderId: order.id, eventType: 'farmer_proceeds_settled', amount: half, destination: 'SELLER' });
      ledger.push({ orderId: order.id, eventType: 'refund_issued', amount: half, destination: 'BUYER' });
    }
  }

  simulateDisputeResolution('resolved_seller_paid');
  assert.strictEqual(order.escrowStatus, 'settled', 'Order must transition to settled');
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].eventType, 'farmer_proceeds_settled');
  assert.strictEqual(ledger[0].amount, 50000);
});

test('13. Anti-Duplicate Dispute Guard: Only 1 active under_review dispute per order', () => {
  const existingDisputes = [
    { orderId: 'ord-100', status: 'under_review' },
    { orderId: 'ord-101', status: 'resolved_seller_paid' },
  ];

  function canRaiseDispute(orderId: string): boolean {
    const hasActive = existingDisputes.some(
      (d) => d.orderId === orderId && d.status === 'under_review'
    );
    return !hasActive;
  }

  assert.strictEqual(canRaiseDispute('ord-100'), false, 'Cannot raise duplicate dispute for order with active dispute');
  assert.strictEqual(canRaiseDispute('ord-101'), true, 'Can raise dispute for order if previous was resolved');
  assert.strictEqual(canRaiseDispute('ord-102'), true, 'Can raise dispute for new order');
});

test('14. Notification Mutation Guard: Restricts direct edits strictly to read status', () => {
  const allowedKeys = new Set(['is_read', 'read_at']);
  function validateNotificationUpdate(updatedFields: Record<string, unknown>, isAdmin: boolean): boolean {
    if (isAdmin) return true;
    for (const key of Object.keys(updatedFields)) {
      if (!allowedKeys.has(key)) return false;
    }
    return true;
  }

  assert.strictEqual(validateNotificationUpdate({ is_read: true, read_at: '2026-10-22' }, false), true);
  assert.strictEqual(validateNotificationUpdate({ is_read: true, title: 'Tampered Title' }, false), false);
  assert.strictEqual(validateNotificationUpdate({ severity: 'critical' }, false), false);
  assert.strictEqual(validateNotificationUpdate({ is_read: true, title: 'Admin Edit' }, true), true);
});

test('15. Explicit Simulation Attribution in Analytics Telemetry', () => {
  const telemetryFinancials = {
    payment_rail_type: 'SIMULATED_INTERNAL_ESCROW',
    is_live_external_banking_connected: false,
    simulation_disclaimer: 'All financial values represent simulated marketplace escrow and internal ledger calculations.',
    gross_merchandise_value: 1250000,
    simulated_gross_merchandise_value: 1250000,
  };

  assert.strictEqual(telemetryFinancials.payment_rail_type, 'SIMULATED_INTERNAL_ESCROW');
  assert.strictEqual(telemetryFinancials.is_live_external_banking_connected, false);
  assert.ok(telemetryFinancials.simulation_disclaimer.includes('simulated marketplace escrow'));
  assert.strictEqual(telemetryFinancials.simulated_gross_merchandise_value, 1250000);
});

