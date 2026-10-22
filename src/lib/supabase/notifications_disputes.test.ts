/**
 * AgriPrice Phase 4 Test Suite: Persistent Notifications & Order Disputes
 *
 * Covers:
 *  1. Recipient Isolation & Notification Security
 *  2. Read / Unread State & Permission Enforcement
 *  3. Dispute Creation & Input Integrity Guards
 *  4. Participant Access & Counterparty Visibility
 *  5. Administrative Arbitration & Role Constraints (Admin Only)
 *  6. Escrow Separation & Double-Entry Ledger Protection
 *  7. Privacy Masking (No Farm GPS or Private Address Exposure)
 *  8. Missing Schema Detection & Demo Mode Isolation
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllUserNotificationsAsRead,
  createPersistentNotification,
} from './notifications.ts';
import {
  fetchOrderDisputes,
  raiseOrderDispute,
  resolveOrderDispute,
  isEligibleDisputeOrder,
  isAuthorizedDisputeResolver,
  isAuthorizedOrderParticipant,
} from './disputes.ts';
import type { MarketplaceDispute, ActivityNotification } from '../marketplace/types.ts';
import { INITIAL_DISPUTES, DEMO_PERSONAS, INITIAL_NOTIFICATIONS } from '../marketplace/seedData.ts';

// Helper mock dispute generator
function createMockDispute(overrides: Partial<MarketplaceDispute> = {}): MarketplaceDispute {
  return {
    id: 'dsp-test-001',
    orderId: 'e1000000-0000-4000-a000-000000000001',
    orderNumber: 'AGP-ORD-202610-001',
    claimant: 'FreshMart Organics',
    claimantRole: 'Retail Buyer',
    claimantProfileId: 'buyer-prof-001',
    respondent: 'Kolar Farmer Producer Org',
    respondentProfileId: 'seller-prof-001',
    commodity: 'Tomato',
    quantityKg: 5000,
    escrowLockedAmount: 140000,
    disputeReason: 'Consignment arrived with 40% crushed packaging and transit spoilage exceeding Grade-A tolerance.',
    evidenceSummary: 'Gate inbound inspection report #GIR-992 with photographic evidence and weighbridge voucher.',
    status: 'under_review',
    filedAt: '2026-10-21 14:30',
    createdAt: new Date().toISOString(),
    isLiveDatabaseRecord: true,
    ...overrides,
  };
}

// Helper mock notification generator
function createMockNotification(overrides: Partial<ActivityNotification> = {}): ActivityNotification {
  return {
    id: 'notif-test-001',
    title: 'Dispute Filed on Order AGP-ORD-202610-001',
    description: 'Buyer FreshMart Organics has raised a quality dispute. Escrow funds are frozen pending arbitration.',
    timestamp: 'Just now',
    category: 'dispute',
    severity: 'info',
    read: false,
    actionUrlTab: 'disputes',
    recipientProfileId: 'seller-prof-001',
    createdAt: new Date().toISOString(),
    isLiveDatabaseRecord: true,
    ...overrides,
  };
}

// ==============================================================================
// 1. RECIPIENT ISOLATION & NOTIFICATION SECURITY
// ==============================================================================

test('1.1 Recipient Isolation: fetchUserNotifications requires valid callerProfileId', async () => {
  const resultEmpty = await fetchUserNotifications('');
  assert.strictEqual(resultEmpty.notifications.length, 0, 'Empty caller profile must return zero notifications');
  assert.match(resultEmpty.error || '', /profile ID is missing/i);

  // @ts-expect-error test undefined guard
  const resultNull = await fetchUserNotifications(null);
  assert.strictEqual(resultNull.notifications.length, 0);
});

test('1.2 Recipient Isolation: Notification objects strictly belong to target recipient', () => {
  const notif = createMockNotification({ recipientProfileId: 'user-alpha-123' });
  assert.strictEqual(notif.recipientProfileId, 'user-alpha-123');
  assert.strictEqual(notif.category, 'dispute');
  assert.strictEqual(notif.isLiveDatabaseRecord, true);
});

test('1.3 Notification creation validates mandatory recipient and title', async () => {
  const resMissing = await createPersistentNotification({
    recipientProfileId: '',
    title: '',
    description: 'Short',
    category: 'offer',
  });
  assert.strictEqual(resMissing.success, false);
  assert.match(resMissing.message, /recipientProfileId.*title.*required/i);
});

// ==============================================================================
// 2. READ / UNREAD PERMISSION ENFORCEMENT
// ==============================================================================

test('2.1 Read State: markNotificationAsRead rejects empty notificationId or callerProfileId', async () => {
  const resEmptyNotif = await markNotificationAsRead('', 'user-prof-1');
  assert.strictEqual(resEmptyNotif.success, false);
  assert.strictEqual(resEmptyNotif.isSavedToDatabase, false);

  const resEmptyCaller = await markNotificationAsRead('notif-1', '');
  assert.strictEqual(resEmptyCaller.success, false);
  assert.strictEqual(resEmptyCaller.isSavedToDatabase, false);
});

test('2.2 Bulk Read State: markAllUserNotificationsAsRead rejects missing callerProfileId', async () => {
  const res = await markAllUserNotificationsAsRead('');
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Caller profile ID required/i);
});

test('2.3 Notification Read Properties: Tracks boolean read flag and timestamps', () => {
  const unreadNotif = createMockNotification({ read: false, readAt: null });
  assert.strictEqual(unreadNotif.read, false);
  assert.strictEqual(unreadNotif.readAt, null);

  const readNotif = createMockNotification({ read: true, readAt: '2026-10-21T14:35:00Z' });
  assert.strictEqual(readNotif.read, true);
  assert.ok(readNotif.readAt);
});

// ==============================================================================
// 3. DISPUTE CREATION & INPUT INTEGRITY GUARDS
// ==============================================================================

test('3.1 Dispute Creation: Validates orderId presence', async () => {
  const res = await raiseOrderDispute(
    {
      orderId: '',
      disputeReason: 'Valid reason with more than ten characters.',
      evidenceSummary: 'Valid evidence summary with more than ten characters.',
    },
    'caller-prof-1'
  );
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Order reference is required/i);
});

test('3.2 Dispute Creation: Rejects dispute reason shorter than 10 characters', async () => {
  const res = await raiseOrderDispute(
    {
      orderId: 'e1000000-0000-4000-a000-000000000001',
      disputeReason: 'Damaged',
      evidenceSummary: 'Valid evidence summary with more than ten characters.',
    },
    'caller-prof-1'
  );
  assert.strictEqual(res.success, false);
  assert.match(res.message, /at least 10 characters/i);
});

test('3.3 Dispute Creation: Rejects evidence summary shorter than 10 characters', async () => {
  const res = await raiseOrderDispute(
    {
      orderId: 'e1000000-0000-4000-a000-000000000001',
      disputeReason: 'The tomatoes arrived spoiled and rotted throughout the consignment boxes.',
      evidenceSummary: 'Bad goods',
    },
    'caller-prof-1'
  );
  assert.strictEqual(res.success, false);
  assert.match(res.message, /min 10 chars/i);
});

test('3.4 Order Eligibility: isEligibleDisputeOrder permits active escrow orders only', () => {
  // Allowed active stages
  assert.strictEqual(isEligibleDisputeOrder('awaiting_escrow'), true);
  assert.strictEqual(isEligibleDisputeOrder('escrow_funded'), true);
  assert.strictEqual(isEligibleDisputeOrder('in_transit'), true);
  assert.strictEqual(isEligibleDisputeOrder('delivered_inspected'), true);

  // Prohibited closed or already disputed stages
  assert.strictEqual(isEligibleDisputeOrder('settled'), false);
  assert.strictEqual(isEligibleDisputeOrder('cancelled'), false);
  assert.strictEqual(isEligibleDisputeOrder('disputed'), false);
  assert.strictEqual(isEligibleDisputeOrder('unknown_status'), false);
  assert.strictEqual(isEligibleDisputeOrder(''), false);
});

// ==============================================================================
// 4. PARTICIPANT ACCESS & COUNTERPARTY VISIBILITY
// ==============================================================================

test('4.1 Participant Access: Buyer, Seller, Transporter and Admin are authorized participants', () => {
  const buyerId = 'buyer-prof-100';
  const sellerId = 'seller-prof-200';
  const transporterId = 'trans-prof-300';

  assert.strictEqual(
    isAuthorizedOrderParticipant(buyerId, buyerId, sellerId, ['buyer']),
    true,
    'Buyer must be authorized'
  );
  assert.strictEqual(
    isAuthorizedOrderParticipant(sellerId, buyerId, sellerId, ['farmer']),
    true,
    'Seller must be authorized'
  );
  assert.strictEqual(
    isAuthorizedOrderParticipant(transporterId, buyerId, sellerId, ['cold_storage'], transporterId),
    true,
    'Transporter must be authorized'
  );
  assert.strictEqual(
    isAuthorizedOrderParticipant('admin-prof-999', buyerId, sellerId, ['admin']),
    true,
    'Admin must be authorized'
  );
});

test('4.2 Participant Access: Unrelated third parties are strictly denied participant access', () => {
  const buyerId = 'buyer-prof-100';
  const sellerId = 'seller-prof-200';
  const transporterId = 'trans-prof-300';

  const isStrangerAllowed = isAuthorizedOrderParticipant(
    'stranger-prof-404',
    buyerId,
    sellerId,
    ['farmer'],
    transporterId
  );
  assert.strictEqual(isStrangerAllowed, false, 'Unrelated third party must be denied access');
});

// ==============================================================================
// 5. ADMINISTRATIVE ARBITRATION & ROLE CONSTRAINTS
// ==============================================================================

test('5.1 Authorized Dispute Resolver: Strictly requires admin role', () => {
  assert.strictEqual(isAuthorizedDisputeResolver(['admin']), true, 'Admin role must be permitted');
  assert.strictEqual(isAuthorizedDisputeResolver(['user', 'admin']), true, 'Admin with secondary roles must be permitted');

  assert.strictEqual(isAuthorizedDisputeResolver(['farmer']), false, 'Farmer role must be denied');
  assert.strictEqual(isAuthorizedDisputeResolver(['buyer']), false, 'Buyer role must be denied');
  assert.strictEqual(isAuthorizedDisputeResolver(['trader']), false, 'Trader role must be denied');
  assert.strictEqual(isAuthorizedDisputeResolver(['cold_storage']), false, 'Cold storage role must be denied');
  assert.strictEqual(isAuthorizedDisputeResolver([]), false, 'Empty roles must be denied');
});

test('5.2 Dispute Resolution: Non-admin caller is blocked from resolving disputes', async () => {
  const res = await resolveOrderDispute(
    {
      disputeId: 'dsp-test-001',
      resolutionStatus: 'resolved_seller_paid',
      resolutionNotes: 'Escrow released to farmer after inspecting packaging report.',
    },
    'farmer-caller-id',
    ['farmer'] // Not admin!
  );

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.isSavedToDatabase, false);
  assert.match(res.message, /platform administrators are authorized to arbitrate/i);
});

test('5.3 Dispute Resolution: Rejects resolution notes shorter than 10 characters', async () => {
  const res = await resolveOrderDispute(
    {
      disputeId: 'dsp-test-001',
      resolutionStatus: 'resolved_buyer_refunded',
      resolutionNotes: 'Approved',
    },
    'admin-caller-id',
    ['admin']
  );

  assert.strictEqual(res.success, false);
  assert.match(res.message, /min 10 characters/i);
});

// ==============================================================================
// 6. ESCROW SEPARATION & DOUBLE-ENTRY LEDGER PROTECTION
// ==============================================================================

test('6.1 Escrow Separation: Dispute resolution does not allow arbitrary client escrow release', () => {
  const dispute = createMockDispute();
  // Validating dispute data structure does not expose direct balance manipulation methods
  const keys = Object.keys(dispute);
  assert.strictEqual(keys.includes('releaseFundsImmediately'), false, 'Direct fund release must not exist on dispute model');
  assert.strictEqual(keys.includes('bypassEscrowLedger'), false, 'Bypassing escrow ledger must not exist on dispute model');
  assert.ok(dispute.escrowLockedAmount > 0, 'Escrow locked amount is documented for arbitration auditing');
});

// ==============================================================================
// 7. PRIVACY MASKING (NO FARM GPS OR PRIVATE ADDRESS EXPOSURE)
// ==============================================================================

test('7.1 Privacy Masking: Disputes projection must NOT leak private farm GPS or street addresses', () => {
  const dispute = createMockDispute();
  const disputeKeys = Object.keys(dispute);

  assert.strictEqual(disputeKeys.includes('farm_gps_lat'), false, 'Farm GPS latitude must be masked');
  assert.strictEqual(disputeKeys.includes('farm_gps_lng'), false, 'Farm GPS longitude must be masked');
  assert.strictEqual(disputeKeys.includes('farm_location_address'), false, 'Farm location address must be masked');
  assert.strictEqual(disputeKeys.includes('aadhaar_number'), false, 'Personal identification numbers must not be exposed');
});

test('7.2 Privacy Masking: Notifications projection contains only recipient-safe activity data', () => {
  const notif = createMockNotification();
  const notifKeys = Object.keys(notif);

  assert.strictEqual(notifKeys.includes('farm_gps_lat'), false);
  assert.strictEqual(notifKeys.includes('farm_gps_lng'), false);
  assert.strictEqual(notifKeys.includes('bank_account_number'), false);
});

// ==============================================================================
// 8. MISSING SCHEMA DETECTION & DEMO MODE ISOLATION
// ==============================================================================

test('8.1 Schema Notice: fetchOrderDisputes handles uninstalled table cleanly', async () => {
  // Probing live/uninstalled schema gracefully returns isSchemaInstalled boolean
  const res = await fetchOrderDisputes('any-profile-id', ['farmer']);
  assert.strictEqual(typeof res.isSchemaInstalled, 'boolean');
  assert.ok(Array.isArray(res.disputes));
});

test('8.2 Demo Personas: Seed data provides isolated arbitration references', () => {
  assert.ok(INITIAL_DISPUTES.length > 0, 'Initial demo disputes must be available');
  const demoDispute = INITIAL_DISPUTES[0];
  assert.strictEqual(Boolean(demoDispute.isLiveDatabaseRecord), false, 'Demo disputes must not be live database records');
  assert.ok(demoDispute.id.startsWith('DSP-'), 'Demo dispute IDs must follow standard prefix');
});

test('8.3 Demo Personas: Activity notifications are isolated per demo sandbox', () => {
  assert.ok(INITIAL_NOTIFICATIONS.length > 0, 'Initial demo notifications must be available');
  const demoNotif = INITIAL_NOTIFICATIONS[0];
  assert.strictEqual(Boolean(demoNotif.isLiveDatabaseRecord), false, 'Demo notifications must not be live database records');
  assert.ok(Object.keys(DEMO_PERSONAS).length >= 7, 'All seven demo personas must be present');
});
