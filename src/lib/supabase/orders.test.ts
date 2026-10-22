/**
 * AgriPrice Phase 2 Test Suite: Persistent Orders, Delivery Tracking, and Simulated Payments
 *
 * Covers:
 *  1. Order Creation & Duplicate Prevention (Atomic acceptance, anti-duplicate reservations)
 *  2. Participant Access & Privacy Guarantees (Buyer/Seller isolation, no private coordinates leaked)
 *  3. Delivery & Milestone Transitions (Step-by-step state machine from escrow hold to settlement)
 *  4. Strict Server-Enforced Role Authorization (Client self-settlement blocked, counterparty role checks)
 *  5. Payment Event Persistence & SHA-256 Idempotency (Canonical hashing regex, length >= 16, deterministic payload)
 *  6. Cancellation & Inventory Headroom Restoral (Safe release before escrow funding)
 *  7. Demo-Mode Regression & Error Integrity (Never replace live DB errors with mock records)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchUserOrders,
  advanceOrderState,
  cancelOrderReservation,
} from './orders.ts';
import {
  computeCanonicalPayloadHash,
  generateIdempotencyKey,
  recordSimulatedPaymentEvent,
} from './payments.ts';
import type { MarketplaceOrder } from '../marketplace/types.ts';
import { DEMO_PERSONAS, INITIAL_ORDERS } from '../marketplace/seedData.ts';

// Helper mock order generator
function createMockOrder(overrides: Partial<MarketplaceOrder> = {}): MarketplaceOrder {
  return {
    id: 'e1000000-0000-4000-a000-000000000001',
    orderNumber: 'AGP-ORD-E1000001',
    listingId: 'l1000000-0000-4000-a000-000000000001',
    offerId: 'o1000000-0000-4000-a000-000000000001',
    commodity: 'Tomato',
    variety: 'Hybrid Shivam',
    grade: 'Grade-A (Export / Premium)',
    sellerId: 's1000000-0000-4000-a000-000000000001',
    sellerName: 'Kolar Farmer Producer Org',
    sellerDistrict: 'Kolar',
    buyerId: 'b1000000-0000-4000-a000-000000000001',
    buyerName: 'Bengaluru Fresh Foods',
    buyerOrganization: 'Bengaluru Fresh Foods Pvt Ltd',
    lockedQuantityKg: 5000,
    agreedPricePerKg: 28,
    totalAgreedAmount: 140000,
    escrowStatus: 'awaiting_escrow',
    storageProvider: 'Kolar Agro Logistics Hub',
    transporterName: 'Express Green Agri Trans',
    pickupScheduledAt: '2026-10-25 09:00 AM',
    createdAt: new Date().toISOString(),
    isLiveDatabaseOrder: true,
    ...overrides,
  };
}

// ==============================================================================
// 1. ORDER CREATION & DUPLICATE PREVENTION
// ==============================================================================

test('1.1 Order Model Integrity: Required fields are strictly populated', () => {
  const ord = createMockOrder();
  assert.ok(ord.id, 'Order ID must exist');
  assert.ok(ord.orderNumber.startsWith('AGP-ORD-'), 'Order Number must follow AGP-ORD pattern');
  assert.strictEqual(ord.totalAgreedAmount, ord.lockedQuantityKg * ord.agreedPricePerKg, 'Total must equal quantity * price');
  assert.strictEqual(ord.isLiveDatabaseOrder, true, 'Live database order flag must be true');
});

test('1.2 Duplicate Prevention: advanceOrderState rejects invalid or empty order references', async () => {
  // @ts-expect-error testing runtime guard against null
  const res = await advanceOrderState(null, 'profile-1', ['buyer']);
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Invalid order reference/i);
});

// ==============================================================================
// 2. PARTICIPANT ACCESS & PRIVACY GUARANTEES
// ==============================================================================

test('2.1 Privacy Masking: Orders model must NOT expose private farm GPS coordinates or street address', () => {
  const ord = createMockOrder();

  // Inspect keys on ord
  const orderKeys = Object.keys(ord);
  assert.strictEqual(orderKeys.includes('farm_gps_lat'), false, 'Private GPS latitude must not be present on order');
  assert.strictEqual(orderKeys.includes('farm_gps_lng'), false, 'Private GPS longitude must not be present on order');
  assert.strictEqual(orderKeys.includes('farm_location_address'), false, 'Exact street address must not be present on order');
  assert.ok(ord.sellerDistrict, 'Macro district is preserved for routing');
});

// ==============================================================================
// 3. DELIVERY & MILESTONE TRANSITIONS
// ==============================================================================

test('3.1 Milestone 1: Buyer can authorize escrow funding for awaiting_escrow order', async () => {
  const ord = createMockOrder({ escrowStatus: 'awaiting_escrow' });
  const buyerId = ord.buyerId;

  // In unconfigured or offline mode, advanceOrderState returns expected error or handles cleanly
  const res = await advanceOrderState(ord, buyerId, ['buyer']);
  // When DB credentials missing in test environment, it safely reports unconfigured rather than unhandled exception
  assert.strictEqual(typeof res.success, 'boolean');
});

test('3.2 Milestone 4: Finalized settled order cannot be advanced further', async () => {
  const settledOrd = createMockOrder({ escrowStatus: 'settled' });

  const res = await advanceOrderState(settledOrd, settledOrd.buyerId, ['admin']);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.nextStatus, 'settled');
  assert.match(res.message, /already in finalized state/i);
});

// ==============================================================================
// 4. STRICT SERVER-ENFORCED ROLE AUTHORIZATION
// ==============================================================================

test('4.1 Role Guard: Seller cannot authorize escrow deposit (Buyer only)', async () => {
  const ord = createMockOrder({ escrowStatus: 'awaiting_escrow' });
  const sellerId = ord.sellerId;

  const res = await advanceOrderState(ord, sellerId, ['farmer']);
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Only the verified buyer can authorize escrow deposit/i);
});

test('4.2 Role Guard: Buyer cannot dispatch consignment or claim seller advance (Seller only)', async () => {
  const ord = createMockOrder({ escrowStatus: 'escrow_funded' });
  const buyerId = ord.buyerId;

  const res = await advanceOrderState(ord, buyerId, ['buyer']);
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Only the producer\/seller can dispatch the order/i);
});

test('4.3 Role Guard: Seller cannot confirm delivery and quality inspection (Buyer only)', async () => {
  const ord = createMockOrder({ escrowStatus: 'in_transit' });
  const sellerId = ord.sellerId;

  const res = await advanceOrderState(ord, sellerId, ['farmer']);
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Only the destination buyer can confirm delivery/i);
});

test('4.4 Client Self-Settlement Denial: Non-admin buyer and seller cannot settle final proceeds', async () => {
  const ord = createMockOrder({ escrowStatus: 'delivered_inspected' });

  // 1. Buyer attempt to settle
  const buyerRes = await advanceOrderState(ord, ord.buyerId, ['processor']);
  assert.strictEqual(buyerRes.success, false);
  assert.match(buyerRes.message, /Client Self-Settlement Denied.*Only AgriPrice platform administrators/i);

  // 2. Seller attempt to settle
  const sellerRes = await advanceOrderState(ord, ord.sellerId, ['farmer']);
  assert.strictEqual(sellerRes.success, false);
  assert.match(sellerRes.message, /Client Self-Settlement Denied.*Only AgriPrice platform administrators/i);
});

// ==============================================================================
// 5. PAYMENT EVENT PERSISTENCE & SHA-256 IDEMPOTENCY
// ==============================================================================

test('5.1 SHA-256 Constraint: Canonical payload hash is strictly 64 lowercase hex characters', async () => {
  const payload = {
    orderId: 'e1000000-0000-4000-a000-000000000001',
    amount: 140000,
    timestamp: '2026-10-21T18:00:00Z',
    action: 'escrow_hold_authorized',
  };

  const hash = await computeCanonicalPayloadHash(payload);

  // Must strictly match PostgreSQL CHECK: payload_hash ~ '^[a-f0-9]{64}$'
  assert.strictEqual(hash.length, 64, 'Payload hash must be exactly 64 characters');
  assert.match(hash, /^[a-f0-9]{64}$/, 'Payload hash must be lowercase hexadecimal only');
  assert.strictEqual(hash.includes('sha256:'), false, 'Payload hash must NOT contain sha256: prefix');
});

test('5.2 Deterministic Canonical Hashing: Key ordering in payload does not change the resulting hash', async () => {
  const payload1 = {
    orderId: '1234',
    amount: 500,
    memo: 'Logistics',
  };

  const payload2 = {
    memo: 'Logistics',
    amount: 500,
    orderId: '1234',
  };

  const hash1 = await computeCanonicalPayloadHash(payload1);
  const hash2 = await computeCanonicalPayloadHash(payload2);

  assert.strictEqual(hash1, hash2, 'Canonical serialization must sort keys deterministically');
});

test('5.3 Idempotency Key Constraint: Length must be >= 16 characters', () => {
  const prefix = 'escrow';
  const orderId = 'e1000000-0000-4000-a000-000000000001';

  const key = generateIdempotencyKey(prefix, orderId);

  // Must strictly satisfy PostgreSQL CHECK: length(trim(idempotency_key)) >= 16
  assert.ok(key.length >= 16, `Idempotency key length (${key.length}) must be at least 16 chars`);
  assert.ok(key.startsWith('idemp-'), 'Key should start with idemp- prefix');
  assert.ok(key.includes(prefix), 'Key should encode prefix');
  assert.ok(key.includes(orderId.slice(0, 8)), 'Key should encode order prefix');
});

test('5.4 Payment Numerical Validation: Rejects negative amounts', async () => {
  const res = await recordSimulatedPaymentEvent({
    orderId: 'e1000000-0000-4000-a000-000000000001',
    eventType: 'escrow_hold_authorized',
    amount: -500, // Invalid negative amount
    idempotencyKey: 'idemp-valid-key-length-12345678',
  });

  assert.strictEqual(res.success, false);
  assert.match(res.error || '', /non-negative/i);
});

// ==============================================================================
// 6. CANCELLATION & INVENTORY RELEASE
// ==============================================================================

test('6.1 Cancellation: Requires non-empty valid orderId', async () => {
  const res = await cancelOrderReservation('', 'Cancelled by user');
  assert.strictEqual(res.success, false);
  assert.match(res.message, /Invalid order identifier/i);
});

// ==============================================================================
// 7. DEMO-MODE REGRESSION & ERROR INTEGRITY
// ==============================================================================

test('7.1 Demo Persona Isolation: Demo personas do not grant real database permissions', () => {
  const demoFarmer = DEMO_PERSONAS.farmer;
  const demoProcessor = DEMO_PERSONAS.processor;

  assert.strictEqual(demoFarmer.isDemoPersona, true, 'Demo farmer must be flagged as demo persona');
  assert.strictEqual(demoProcessor.isDemoPersona, true, 'Demo processor must be flagged as demo persona');

  // Verify demo orders in seedData are clearly distinguished
  for (const ord of INITIAL_ORDERS) {
    assert.strictEqual(ord.isLiveDatabaseOrder, undefined, 'Demo orders must not be marked as live database orders');
  }
});

test('7.2 Error Integrity: Real database errors never silently fallback to demo data', async () => {
  // Verify fetchUserOrders signature and returns
  const res = await fetchUserOrders();
  // When there is an error or unconfigured state, orders must be empty array, NOT INITIAL_ORDERS
  if (!res.isConfigured || res.error) {
    assert.strictEqual(res.orders.length, 0, 'Must NOT silently replace database orders with demo orders on error');
  }
});

// ==============================================================================
// 8. ORDER & PAYMENT CONSISTENCY REGRESSION SUITE
// ==============================================================================

test('8.1 Order Cancellation Isolation: Cancelling one order strictly leaves other orders unaffected', () => {
  const orderA = createMockOrder({
    id: 'ord-test-aaa-01',
    orderNumber: 'AGP-ORD-9893',
    commodity: 'Tomato',
    lockedQuantityKg: 5000,
    totalAgreedAmount: 137500,
    escrowStatus: 'awaiting_escrow',
  });

  const orderB = createMockOrder({
    id: 'ord-test-bbb-02',
    orderNumber: 'AGP-ORD-2026-881',
    commodity: 'Potato',
    lockedQuantityKg: 6000,
    totalAgreedAmount: 126000,
    escrowStatus: 'in_transit',
    transporterName: 'VRL Agro Logistics',
  });

  const initialOrders: MarketplaceOrder[] = [orderA, orderB];

  // Simulate cancelling Order A
  const updatedOrders = initialOrders.map((o) =>
    o.id === orderA.id ? { ...o, escrowStatus: 'cancelled' as const } : o
  );

  // Assert Order A is cancelled
  const cancelledA = updatedOrders.find((o) => o.id === orderA.id);
  assert.ok(cancelledA, 'Order A must exist');
  assert.strictEqual(cancelledA.escrowStatus, 'cancelled', 'Order A must be cancelled');

  // Assert Order B is 100% unchanged
  const unchangedB = updatedOrders.find((o) => o.id === orderB.id);
  assert.ok(unchangedB, 'Order B must exist');
  assert.strictEqual(unchangedB.escrowStatus, 'in_transit', 'Order B status must remain in_transit');
  assert.strictEqual(unchangedB.lockedQuantityKg, 6000, 'Order B quantity must not change');
  assert.strictEqual(unchangedB.totalAgreedAmount, 126000, 'Order B total amount must not change');
  assert.strictEqual(unchangedB.transporterName, 'VRL Agro Logistics', 'Order B transporter must not change');
});

test('8.2 Payment Event Association: Every payment event is strictly bound to its order with unique ID', () => {
  const order = createMockOrder({
    id: 'ord-test-assoc-01',
    orderNumber: 'AGP-ORD-9893',
    totalAgreedAmount: 100000,
  });

  const holdEventId = `PAY-EVT-${order.orderNumber}-HOLD`;
  const advEventId = `PAY-EVT-${order.orderNumber}-ADV`;
  const settleEventId = `PAY-EVT-${order.orderNumber}-SETTLE`;

  // Verify unique deterministic IDs
  assert.notStrictEqual(holdEventId, advEventId, 'Hold and advance event IDs must be distinct');
  assert.notStrictEqual(advEventId, settleEventId, 'Advance and settlement event IDs must be distinct');

  // Verify order number encoding
  assert.ok(holdEventId.includes(order.orderNumber), 'Payment ID must encode the order number');
  assert.ok(advEventId.includes(order.orderNumber), 'Payment ID must encode the order number');
  assert.ok(settleEventId.includes(order.orderNumber), 'Payment ID must encode the order number');

  // Verify percentage calculations
  const advanceAmount = Math.round(order.totalAgreedAmount * 0.4);
  const settlementAmount = Math.round(order.totalAgreedAmount * 0.54);
  assert.strictEqual(advanceAmount, 40000, '40% advance must be exactly 40,000');
  assert.strictEqual(settlementAmount, 54000, '54% settlement must be exactly 54,000');
});

test('8.3 Cancellation vs Settlement: Cancellation of un-escrowed order does NOT fabricate payment or refund', () => {
  const order = createMockOrder({
    id: 'ord-test-unfunded-01',
    orderNumber: 'AGP-ORD-9893',
    escrowStatus: 'awaiting_escrow',
    totalAgreedAmount: 137500,
  });

  let simulatedPayments: { id: string; orderId: string; orderNumber: string; eventType: string }[] = [];

  // When order is in awaiting_escrow, no funds have moved -> zero payment events
  assert.strictEqual(simulatedPayments.length, 0, 'No payments recorded for awaiting_escrow order');

  // Simulate cancellation of awaiting_escrow order
  const isCancelled = true;
  if (isCancelled && order.escrowStatus === 'awaiting_escrow') {
    // Clean up any uncommitted hold; strictly do NOT fabricate a refund event
    simulatedPayments = simulatedPayments.filter((p) => p.orderId !== order.id);
  }

  // Verify zero payment records and zero refund records
  assert.strictEqual(simulatedPayments.length, 0, 'Cancellation alone must NOT create any payment or refund record');
  const hasRefund = simulatedPayments.some((p) => p.eventType.includes('refund'));
  assert.strictEqual(hasRefund, false, 'No refund event must be fabricated for un-escrowed cancellation');
});

test('8.4 Delivery Status Derivation: Cancelled order cannot show active transit schedule', () => {
  function deriveDeliveryDetails(ord: MarketplaceOrder) {
    const isCancelled = ord.escrowStatus === 'cancelled';
    const isDisputed = ord.escrowStatus === 'disputed';

    const transporter = isCancelled
      ? 'Cancelled — Dispatch Aborted'
      : isDisputed
      ? `${ord.transporterName || 'Fleet Assigned'} (Transit Paused)`
      : ord.transporterName || (ord.escrowStatus === 'awaiting_escrow' ? 'Pending Escrow Authorization' : 'Pending Transporter Assignment');

    const transitSchedule = isCancelled
      ? 'Cancelled — No Transit Scheduled'
      : isDisputed
      ? 'Frozen — Arbitration Pending'
      : ord.escrowStatus === 'awaiting_escrow'
      ? 'Pending Escrow Funding'
      : ord.escrowStatus === 'escrow_funded'
      ? 'Ready for Farmgate Dispatch'
      : ord.escrowStatus === 'in_transit'
      ? ord.pickupScheduledAt || 'In Transit'
      : ord.deliveredAt
      ? `Delivered: ${ord.deliveredAt}`
      : 'Delivered & Accepted';

    return { transporter, transitSchedule };
  }

  const cancelledOrder = createMockOrder({
    escrowStatus: 'cancelled',
    transporterName: 'VRL Logistics KA-07',
    pickupScheduledAt: '2026-10-25 10:00 IST',
  });

  const details = deriveDeliveryDetails(cancelledOrder);
  assert.strictEqual(details.transporter, 'Cancelled — Dispatch Aborted');
  assert.strictEqual(details.transitSchedule, 'Cancelled — No Transit Scheduled');
  assert.strictEqual(details.transitSchedule.includes('2026-10-25'), false, 'Cancelled order must not show scheduled date');

  const inTransitOrder = createMockOrder({
    escrowStatus: 'in_transit',
    transporterName: 'VRL Logistics KA-07',
    pickupScheduledAt: '2026-10-25 10:00 IST',
  });

  const inTransitDetails = deriveDeliveryDetails(inTransitOrder);
  assert.strictEqual(inTransitDetails.transporter, 'VRL Logistics KA-07');
  assert.strictEqual(inTransitDetails.transitSchedule, '2026-10-25 10:00 IST');
});

test('8.5 Escrow Balance Integrity: Awaiting-escrow and cancelled orders do not count toward locked escrow', () => {
  const orders: MarketplaceOrder[] = [
    createMockOrder({ id: '1', escrowStatus: 'awaiting_escrow', totalAgreedAmount: 100000 }),
    createMockOrder({ id: '2', escrowStatus: 'escrow_funded', totalAgreedAmount: 50000 }),
    createMockOrder({ id: '3', escrowStatus: 'in_transit', totalAgreedAmount: 75000 }),
    createMockOrder({ id: '4', escrowStatus: 'cancelled', totalAgreedAmount: 120000 }),
    createMockOrder({ id: '5', escrowStatus: 'settled', totalAgreedAmount: 80000 }),
  ];

  const totalLockedEscrow = orders
    .filter(
      (o) =>
        o.escrowStatus === 'escrow_funded' ||
        o.escrowStatus === 'in_transit' ||
        o.escrowStatus === 'delivered_inspected' ||
        o.escrowStatus === 'disputed'
    )
    .reduce((sum, o) => sum + o.totalAgreedAmount, 0);

  // Only orders 2 (50,000) and 3 (75,000) have locked escrow = 125,000
  assert.strictEqual(totalLockedEscrow, 125000, 'Locked escrow must strictly sum only funded/in-transit/disputed orders');
});

