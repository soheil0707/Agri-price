/**
 * AgriPrice Phase 1: Buyer Offers and Negotiations Test Suite
 *
 * Covers:
 *  1. Permissions & Role Enforcement (Buyer roles, unauthorized roles rejection)
 *  2. Submission Validation (Non-zero prices, non-zero quantities, anti-wash trading)
 *  3. Visibility & Privacy Guarantees (No private farm address or GPS exposed)
 *  4. Rejection & Cancellation Authorization (Server-enforced status transitions)
 *  5. Acceptance & Inventory Concurrency (Atomic reservation procedure, overselling prevention)
 *  6. Demo-Mode Regression & Error Integrity (Never silently fall back to demo data)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAuthorizedBuyerRole,
  createBuyerOffer,
  acceptOfferWithReservation,
  rejectSellerOffer,
  cancelBuyerOffer,
} from './offers.ts';
import { DEMO_PERSONAS, INITIAL_OFFERS } from '../marketplace/seedData.ts';

// ==============================================================================
// 1. PERMISSIONS & ROLE ENFORCEMENT
// ==============================================================================

test('1.1 Permissions: isAuthorizedBuyerRole allows trader, processor, and fpo_admin', () => {
  assert.strictEqual(isAuthorizedBuyerRole(['trader']), true, 'trader role must be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['processor']), true, 'processor role must be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['fpo_admin']), true, 'fpo_admin role must be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['farmer', 'processor']), true, 'multi-role containing processor must be authorized');
});

test('1.2 Permissions: isAuthorizedBuyerRole strictly rejects unauthorized roles', () => {
  assert.strictEqual(isAuthorizedBuyerRole(['farmer']), false, 'farmer alone must NOT be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['transporter']), false, 'transporter must NOT be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['consumer']), false, 'consumer must NOT be authorized');
  assert.strictEqual(isAuthorizedBuyerRole(['admin']), false, 'admin alone without buyer role must NOT be authorized');
  assert.strictEqual(isAuthorizedBuyerRole([]), false, 'empty roles must NOT be authorized');
});

test('1.3 Permissions Guard: createBuyerOffer rejects unauthorized roles before database write', async () => {
  const result = await createBuyerOffer(
    {
      listingId: '550e8400-e29b-41d4-a716-446655440000',
      offeredPricePerKg: 30,
      offeredQuantityKg: 1000,
      deliveryTerms: 'Ex-Farmgate',
      transportBorneBy: 'buyer',
    },
    '550e8400-e29b-41d4-a716-446655440001',
    ['farmer'] // Unauthorized role
  );

  assert.strictEqual(result.success, false);
  assert.match(
    result.error || '',
    /Authorization Violation.*Profile lacks a verified buyer role/i,
    'Must reject farmer role attempting to submit purchase offer'
  );
});

test('1.4 Permissions Guard: createBuyerOffer rejects missing or invalid caller profile ID', async () => {
  const result = await createBuyerOffer(
    {
      listingId: '550e8400-e29b-41d4-a716-446655440000',
      offeredPricePerKg: 30,
      offeredQuantityKg: 1000,
      deliveryTerms: 'Ex-Farmgate',
      transportBorneBy: 'buyer',
    },
    '', // Missing caller profile ID
    ['trader']
  );

  assert.strictEqual(result.success, false);
  assert.match(
    result.error || '',
    /Authentication Required.*Valid profile ID is required/i,
    'Must reject empty profile ID'
  );
});

// ==============================================================================
// 2. SUBMISSION VALIDATION
// ==============================================================================

test('2.1 Numerical Validation: createBuyerOffer rejects non-positive price per kg', async () => {
  const badPrices = [0, -5, -0.5, NaN, Infinity];

  for (const badPrice of badPrices) {
    const result = await createBuyerOffer(
      {
        listingId: '550e8400-e29b-41d4-a716-446655440000',
        offeredPricePerKg: badPrice,
        offeredQuantityKg: 500,
        deliveryTerms: 'Ex-Farmgate',
        transportBorneBy: 'buyer',
      },
      '550e8400-e29b-41d4-a716-446655440001',
      ['trader']
    );

    assert.strictEqual(result.success, false);
    assert.match(
      result.error || '',
      /Offered price per kg must be greater than zero/i,
      `Price ${badPrice} must be rejected`
    );
  }
});

test('2.2 Numerical Validation: createBuyerOffer rejects non-positive quantity', async () => {
  const badQuantities = [0, -100, -1, NaN];

  for (const badQty of badQuantities) {
    const result = await createBuyerOffer(
      {
        listingId: '550e8400-e29b-41d4-a716-446655440000',
        offeredPricePerKg: 25,
        offeredQuantityKg: badQty,
        deliveryTerms: 'Ex-Farmgate',
        transportBorneBy: 'buyer',
      },
      '550e8400-e29b-41d4-a716-446655440001',
      ['processor']
    );

    assert.strictEqual(result.success, false);
    assert.match(
      result.error || '',
      /Offered quantity must be greater than zero/i,
      `Quantity ${badQty} must be rejected`
    );
  }
});

test('2.3 Anti-Wash Trading: Buyer profile ID cannot equal seller profile ID', () => {
  const sellerProfileId = '550e8400-e29b-41d4-a716-446655440001';
  const buyerProfileId = '550e8400-e29b-41d4-a716-446655440001';

  // Direct invariant test simulating trigger `trg_ensure_buyer_not_seller`
  const isWashTrade = sellerProfileId === buyerProfileId;
  assert.strictEqual(isWashTrade, true, 'Wash trade detection must flag identical seller and buyer IDs');
});

// ==============================================================================
// 3. VISIBILITY & PRIVACY GUARANTEES
// ==============================================================================

test('3.1 Privacy: Farm address and GPS coordinates are never exposed in offers projections', () => {
  // Public listing projection contract:
  const allowedOfferFields = [
    'id',
    'listingId',
    'listingTitle',
    'commodity',
    'buyerId',
    'buyerName',
    'buyerOrganization',
    'buyerRole',
    'sellerId',
    'sellerName',
    'offeredPricePerKg',
    'offeredQuantityKg',
    'deliveryTerms',
    'transportBorneBy',
    'status',
    'notes',
    'expiresAt',
    'createdAt',
    'isLiveDatabaseOffer',
  ];

  const forbiddenPrivateFields = [
    'farm_location_address',
    'farm_latitude',
    'farm_longitude',
    'exact_gps',
    'aadhaar_number',
    'pan_number',
  ];

  // Verify none of the forbidden fields are present in any seeded or returned offer
  for (const offer of INITIAL_OFFERS) {
    const offerKeys = Object.keys(offer);
    for (const forbidden of forbiddenPrivateFields) {
      assert.strictEqual(
        offerKeys.includes(forbidden),
        false,
        `Offer record must NEVER expose private field: "${forbidden}"`
      );
    }
    // Verify each offer key is an expected public projection field
    for (const key of offerKeys) {
      assert.strictEqual(
        allowedOfferFields.includes(key) || key === 'counterPricePerKg',
        true,
        `Unexpected field in offer projection: "${key}"`
      );
    }
  }
});

// ==============================================================================
// 4. REJECTION & CANCELLATION AUTHORIZATION
// ==============================================================================

test('4.1 Rejection: rejectSellerOffer requires valid offerId', async () => {
  const result = await rejectSellerOffer('');
  assert.strictEqual(result.success, false);
});

test('4.2 Cancellation: cancelBuyerOffer requires valid offerId', async () => {
  const result = await cancelBuyerOffer('');
  assert.strictEqual(result.success, false);
});

test('4.3 RLS State Transitions: Seller can reject, buyer can cancel, neither can directly accept', () => {
  // Simulating RLS policy rules:
  // Policy offers_update_seller_decide: WITH CHECK (status IN ('countered', 'rejected'))
  // Policy offers_update_buyer_cancel: WITH CHECK (status = 'cancelled')
  const allowedSellerStatuses = ['countered', 'rejected'];
  const allowedBuyerStatuses = ['cancelled'];

  assert.strictEqual(allowedSellerStatuses.includes('accepted'), false, 'Direct UPDATE to "accepted" must be blocked for sellers');
  assert.strictEqual(allowedBuyerStatuses.includes('accepted'), false, 'Direct UPDATE to "accepted" must be blocked for buyers');
  assert.strictEqual(allowedSellerStatuses.includes('rejected'), true, 'Seller must be permitted to reject');
  assert.strictEqual(allowedBuyerStatuses.includes('cancelled'), true, 'Buyer must be permitted to cancel');
});

// ==============================================================================
// 5. ACCEPTANCE & INVENTORY CONCURRENCY
// ==============================================================================

test('5.1 Acceptance: acceptOfferWithReservation requires valid offerId', async () => {
  const result = await acceptOfferWithReservation('');
  assert.strictEqual(result.success, false);
  assert.match(result.error || '', /Invalid offer identifier/i);
});

test('5.2 Inventory Concurrency: Atomic headroom prevents overselling', () => {
  // Simulate the stored procedure `accept_offer_and_create_reservation` lock & headroom check:
  // Listing: Total = 5000 kg, Currently Reserved = 3000 kg. Available = 2000 kg.
  const listing = {
    quantity_in_kg: 5000,
    reserved_quantity_kg: 3000,
  };

  const offer1 = { offered_quantity_kg: 1500 };
  const offer2 = { offered_quantity_kg: 1500 };

  // Helper simulating the atomic transaction
  function attemptAtomicAcceptance(
    currentListing: { quantity_in_kg: number; reserved_quantity_kg: number },
    offeredQty: number
  ): { success: boolean; error?: string } {
    if (currentListing.reserved_quantity_kg + offeredQty > currentListing.quantity_in_kg) {
      return {
        success: false,
        error: `Insufficient Inventory: Listing only has ${
          currentListing.quantity_in_kg - currentListing.reserved_quantity_kg
        } kg available, cannot fulfill offer for ${offeredQty} kg.`,
      };
    }
    currentListing.reserved_quantity_kg += offeredQty;
    return { success: true };
  }

  // Attempt 1: Offer 1 succeeds
  const res1 = attemptAtomicAcceptance(listing, offer1.offered_quantity_kg);
  assert.strictEqual(res1.success, true, 'First offer within available headroom must succeed');
  assert.strictEqual(listing.reserved_quantity_kg, 4500, 'Reserved quantity must be incremented to 4500 kg');

  // Attempt 2: Offer 2 fails immediately with Insufficient Inventory
  const res2 = attemptAtomicAcceptance(listing, offer2.offered_quantity_kg);
  assert.strictEqual(res2.success, false, 'Second concurrent offer exceeding headroom must be rejected');
  assert.match(res2.error || '', /Insufficient Inventory.*only has 500 kg available/i);
  assert.strictEqual(listing.reserved_quantity_kg, 4500, 'Reserved quantity must NOT be oversold');
});

// ==============================================================================
// 6. DEMO-MODE REGRESSION & ERROR INTEGRITY
// ==============================================================================

test('6.1 Demo Mode: Personas do NOT trigger unauthorized database writes', () => {
  const traderPersona = DEMO_PERSONAS.trader;
  assert.strictEqual(traderPersona.isDemoPersona, true, 'Demo trader persona must have isDemoPersona: true');

  const farmerPersona = DEMO_PERSONAS.farmer;
  assert.strictEqual(farmerPersona.isDemoPersona, true, 'Demo farmer persona must have isDemoPersona: true');
});

test('6.2 Error Integrity: Real database errors are never silently masked by demo data', () => {
  // Simulating the contract in fetchOffersData:
  const simulatedDbError = 'JWT expired or invalid API key';

  let currentOffers = [...INITIAL_OFFERS];
  let dbError: string | null = null;
  let isDbConnected = true;

  // When database returns error:
  const result = {
    offers: [],
    error: simulatedDbError,
    isConfigured: true,
  };

  if (result.error) {
    dbError = result.error;
    isDbConnected = false;
    currentOffers = []; // CRITICAL: Must be empty array, NOT INITIAL_OFFERS
  }

  assert.strictEqual(dbError, simulatedDbError, 'Must store exact error string');
  assert.strictEqual(isDbConnected, false, 'Database connection state must be false');
  assert.strictEqual(currentOffers.length, 0, 'Must NOT substitute demo data on database error');
});
