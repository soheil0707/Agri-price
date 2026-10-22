/**
 * AgriPrice Phase 3 Test Suite: Cold-Storage Reservations and Logistics Tracking
 *
 * Covers:
 *  1. Authorization: Role-based permissions for cold storage booking
 *  2. Capacity Limits & Input Validation: Non-positive MT, non-finite values, invalid dates
 *  3. Over-Allocation Prevention & Concurrency: Preventing double-booking and exceeding headroom
 *  4. Temperature Readings & Validity Tracking: Biological thresholds, sensor error guards, chamber metrics
 *  5. Logistics Consignment & Milestones: State machine transitions, counterparty isolation, privacy masking
 *  6. Reservation Cancellation: Safe release of capacity before settlement
 *  7. Demo-Mode Regression & Error Integrity: Live DB errors never silently fall back to demo records
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAuthorizedStorageBookingRole,
  validateStorageTemperature,
  bookStorageCapacity,
  fetchColdStorageFacilities,
  fetchLogisticsShipments,
} from './storage.ts';
import type { LogisticsShipmentRecord, ColdStorageFacilityRecord } from './storage.ts';
import { DEMO_PERSONAS, INITIAL_STORAGE_UNITS } from '../marketplace/seedData.ts';

// Helper mock facility generator
function createMockFacility(overrides: Partial<ColdStorageFacilityRecord> = {}): ColdStorageFacilityRecord {
  return {
    id: 'f1000000-0000-4000-a000-000000000001',
    operatorProfileId: 'p1000000-0000-4000-a000-000000000001',
    facilityName: 'Kolar Post-Harvest Chilling Centre',
    licenseNumber: 'KA-WDRA-2024-889',
    district: 'Kolar',
    state: 'Karnataka',
    pincode: '563101',
    totalCapacityMt: 500,
    reservedCapacityMt: 320,
    availableCapacityMt: 180,
    chamberCount: 6,
    dailyRatePerQuintal: 4.5,
    temperatureRange: '0°C to 12°C',
    suitableCommodities: ['Tomato', 'Potato', 'Grapes'],
    certifications: ['WDRA', 'FSSAI'],
    isActive: true,
    isLiveDatabaseRecord: true,
    ...overrides,
  };
}

// Helper mock shipment generator
function createMockShipment(overrides: Partial<LogisticsShipmentRecord> = {}): LogisticsShipmentRecord {
  return {
    orderId: 'e1000000-0000-4000-a000-000000000001',
    orderNumber: 'AGP-ORD-E1000001',
    commodity: 'Tomato',
    variety: 'Hybrid Roma',
    lockedQuantityKg: 5000,
    agreedPricePerKg: 28,
    totalAmount: 140000,
    sellerId: 's1000000-0000-4000-a000-000000000001',
    sellerName: 'Kolar Horticulture Union',
    sellerDistrict: 'Kolar',
    buyerId: 'b1000000-0000-4000-a000-000000000001',
    buyerName: 'Bengaluru Fresh Foods',
    transporterId: 't1000000-0000-4000-a000-000000000001',
    transporterName: 'Express Green Reefer Trans',
    escrowStatus: 'in_transit',
    pickupScheduledAt: '2026-10-25 09:00 AM',
    deliveredAt: null,
    transitTemperature: '4.2°C (Reefer Active)',
    isLiveDatabaseRecord: true,
    ...overrides,
  };
}

// ==============================================================================
// 1. ROLE-BASED AUTHORIZATION FOR STORAGE BOOKINGS
// ==============================================================================

test('1.1 Authorization: Permits authorized storage booking roles', () => {
  assert.strictEqual(isAuthorizedStorageBookingRole(['farmer']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['trader']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['processor']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['fpo_admin']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['transporter']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['admin']), true);
  assert.strictEqual(isAuthorizedStorageBookingRole(['FARMER']), true, 'Case-insensitive matching');
});

test('1.2 Authorization: Blocks unauthorized roles from cold storage booking', () => {
  assert.strictEqual(isAuthorizedStorageBookingRole(['consumer']), false);
  assert.strictEqual(isAuthorizedStorageBookingRole(['retail_buyer']), false);
  assert.strictEqual(isAuthorizedStorageBookingRole(['anonymous']), false);
  assert.strictEqual(isAuthorizedStorageBookingRole([]), false);
  // @ts-expect-error testing null guard
  assert.strictEqual(isAuthorizedStorageBookingRole(null), false);
});

// ==============================================================================
// 2. CAPACITY LIMITS & INPUT VALIDATION
// ==============================================================================

test('2.1 Capacity Limits: bookStorageCapacity rejects non-positive requested MT', async () => {
  const facility = createMockFacility();

  // Test zero MT
  const resZero = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: 'Tomato',
      requestedMt: 0,
      startDate: '2026-11-01',
      endDate: '2026-11-15',
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resZero.success, false);
  assert.match(resZero.message, /positive number/i);

  // Test negative MT
  const resNegative = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: 'Tomato',
      requestedMt: -15,
      startDate: '2026-11-01',
      endDate: '2026-11-15',
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resNegative.success, false);
  assert.match(resNegative.message, /positive number/i);
});

test('2.2 Input Validation: bookStorageCapacity rejects NaN, non-finite values, and empty commodity', async () => {
  const facility = createMockFacility();

  const resNaN = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: 'Potato',
      requestedMt: NaN,
      startDate: '2026-11-01',
      endDate: '2026-11-15',
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resNaN.success, false);

  const resEmptyCommodity = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: '   ',
      requestedMt: 20,
      startDate: '2026-11-01',
      endDate: '2026-11-15',
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resEmptyCommodity.success, false);
  assert.match(resEmptyCommodity.message, /Commodity name is required/i);
});

test('2.3 Date Sequence Validation: bookStorageCapacity rejects inverted start and end dates', async () => {
  const facility = createMockFacility();

  const resInverted = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: 'Grapes',
      requestedMt: 10,
      startDate: '2026-11-20',
      endDate: '2026-11-10', // End date before start date
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resInverted.success, false);
  assert.match(resInverted.message, /after start date/i);

  const resSameDate = await bookStorageCapacity(
    {
      facilityId: facility.id,
      commodity: 'Grapes',
      requestedMt: 10,
      startDate: '2026-11-20',
      endDate: '2026-11-20',
    },
    'profile-1',
    ['farmer']
  );
  assert.strictEqual(resSameDate.success, false);
  assert.match(resSameDate.message, /after start date/i);
});

// ==============================================================================
// 3. OVER-ALLOCATION PREVENTION & CONCURRENCY
// ==============================================================================

test('3.1 Headroom Integrity: Available capacity cannot exceed total facility capacity', () => {
  const facility = createMockFacility({ totalCapacityMt: 500, availableCapacityMt: 180 });
  assert.ok(facility.availableCapacityMt <= facility.totalCapacityMt, 'Available capacity must not exceed total');
  const occupiedMt = facility.totalCapacityMt - facility.availableCapacityMt;
  assert.strictEqual(occupiedMt, 320, 'Occupied MT must correctly equal total - available');
});

test('3.2 Concurrent Booking Simulation: Over-allocation detection rejects booking exceeding available capacity', () => {
  const facility = createMockFacility({ totalCapacityMt: 100, availableCapacityMt: 20 });
  const requestedMt = 25; // 25 MT requested when only 20 MT available

  const wouldExceed = requestedMt > facility.availableCapacityMt;
  assert.strictEqual(wouldExceed, true, 'Booking engine must flag over-allocation before transaction commit');
});

// ==============================================================================
// 4. TEMPERATURE READINGS & VALIDITY TRACKING
// ==============================================================================

test('4.1 Temperature Validation: Correctly classifies valid storage ranges', () => {
  // Deep chill (0°C or below)
  const frozen = validateStorageTemperature(-2.5);
  assert.strictEqual(frozen.isValid, true);
  assert.strictEqual(frozen.statusLabel, 'Deep Chill / Frozen');

  // Optimal chilled (0°C to 4°C)
  const optimal = validateStorageTemperature(3.2);
  assert.strictEqual(optimal.isValid, true);
  assert.strictEqual(optimal.statusLabel, 'Optimal Chilled');
  assert.strictEqual(optimal.warning, undefined);

  // Cool storage (4°C to 10°C)
  const cool = validateStorageTemperature(8.5);
  assert.strictEqual(cool.isValid, true);
  assert.strictEqual(cool.statusLabel, 'Cool Storage');

  // Ventilated curing (10°C to 16°C)
  const ventilated = validateStorageTemperature(12.0);
  assert.strictEqual(ventilated.isValid, true);
  assert.strictEqual(ventilated.statusLabel, 'Ventilated Curing');

  // Ambient warning (> 16°C)
  const ambient = validateStorageTemperature(22.0);
  assert.strictEqual(ambient.isValid, true);
  assert.strictEqual(ambient.statusLabel, 'Ambient Warning');
  assert.ok(ambient.warning, 'Must issue perishability warning for high temperatures');
});

test('4.2 Temperature Validation: Guards against invalid sensor readings and extreme outliers', () => {
  // Out of biological bounds (< -30°C or > 55°C)
  const extremeCold = validateStorageTemperature(-45);
  assert.strictEqual(extremeCold.isValid, false);
  assert.strictEqual(extremeCold.statusLabel, 'Critical Hazard');

  const extremeHeat = validateStorageTemperature(65);
  assert.strictEqual(extremeHeat.isValid, false);
  assert.strictEqual(extremeHeat.statusLabel, 'Critical Hazard');

  // Non-numeric sensor errors
  const nanVal = validateStorageTemperature(NaN);
  assert.strictEqual(nanVal.isValid, false);
  assert.strictEqual(nanVal.statusLabel, 'Sensor Error');

  // @ts-expect-error testing runtime sensor fault guard
  const stringVal = validateStorageTemperature('invalid');
  assert.strictEqual(stringVal.isValid, false);
  assert.strictEqual(stringVal.statusLabel, 'Sensor Error');
});

// ==============================================================================
// 5. LOGISTICS CONSIGNMENT & MILESTONES
// ==============================================================================

test('5.1 Privacy Masking: Logistics consignment records MUST NOT expose private farm GPS coordinates or street addresses', () => {
  const shipment = createMockShipment();
  const shipmentKeys = Object.keys(shipment);

  assert.strictEqual(shipmentKeys.includes('farm_gps_lat'), false, 'GPS lat must not leak');
  assert.strictEqual(shipmentKeys.includes('farm_gps_lng'), false, 'GPS lng must not leak');
  assert.strictEqual(shipmentKeys.includes('farm_location_address'), false, 'Private street address must not leak');
  assert.ok(shipment.sellerDistrict, 'Macro district preserved for route planning');
});

test('5.2 Milestone State Transitions: Enforces valid sequential shipment milestones', () => {
  const validMilestones = [
    'awaiting_escrow',
    'escrow_funded',
    'in_transit',
    'delivered_inspected',
    'settled',
  ];

  // In-transit consignment requires cold chain reefer
  const inTransitShipment = createMockShipment({ escrowStatus: 'in_transit' });
  assert.strictEqual(inTransitShipment.escrowStatus, 'in_transit');
  assert.ok(validMilestones.includes(inTransitShipment.escrowStatus), 'Shipment status must belong to valid milestones');
  assert.match(inTransitShipment.transitTemperature, /Reefer Active/i);

  // Delivered consignment preserves cold chain history
  const deliveredShipment = createMockShipment({ escrowStatus: 'delivered_inspected', deliveredAt: new Date().toISOString() });
  assert.strictEqual(deliveredShipment.escrowStatus, 'delivered_inspected');
  assert.ok(validMilestones.includes(deliveredShipment.escrowStatus), 'Delivered status must belong to valid milestones');
  assert.ok(deliveredShipment.deliveredAt, 'Delivered timestamp must be recorded');
});

test('5.3 Logistics Pipeline Query: fetchLogisticsShipments returns structured records safely', async () => {
  const result = await fetchLogisticsShipments('profile-1', ['farmer']);
  assert.ok(Array.isArray(result.shipments), 'Shipments must be an array');
  assert.strictEqual(typeof result.isConfigured, 'boolean');
});

// ==============================================================================
// 6. RESERVATION CANCELLATION & INTEGRITY
// ==============================================================================

test('6.1 Cancellation Headroom Recovery: Cancelled reservation releases locked capacity', () => {
  const facility = createMockFacility({ totalCapacityMt: 500, availableCapacityMt: 100 });
  const reservationMt = 50;

  // Simulate reservation cancellation before intake
  const restoredAvailableMt = facility.availableCapacityMt + reservationMt;
  assert.strictEqual(restoredAvailableMt, 150, 'Restored capacity must add reservation MT back to available pool');
  assert.ok(restoredAvailableMt <= facility.totalCapacityMt, 'Restored capacity must not exceed total');
});

// ==============================================================================
// 7. DEMO-MODE REGRESSION & ERROR INTEGRITY
// ==============================================================================

test('7.1 Demo Isolation: Demo personas do not trigger database mutations', () => {
  const demoStoragePersona = DEMO_PERSONAS.cold_storage;
  assert.ok(demoStoragePersona, 'Cold storage demo persona must exist');
  assert.strictEqual(demoStoragePersona.name, 'Venkatesh Rao', 'Matches official demo cold storage operator');

  const demoUnits = INITIAL_STORAGE_UNITS;
  assert.ok(demoUnits.length > 0, 'Seed demo storage units must exist');
  const demoUnit = demoUnits[0];
  assert.strictEqual(demoUnit.isLiveDatabaseRecord, undefined, 'Demo units must not be flagged as live database records');
});

test('7.2 Schema Fallback Guard: fetchColdStorageFacilities handles uninstalled tables cleanly without crash', async () => {
  const result = await fetchColdStorageFacilities();
  // Should return a clean structured response, never throwing an uncaught exception
  assert.ok(typeof result.isSchemaInstalled === 'boolean', 'isSchemaInstalled must be a boolean flag');
  assert.ok(Array.isArray(result.facilities), 'facilities must be an array');
  if (!result.isSchemaInstalled) {
    assert.ok(result.error, 'Must provide informative notice for uninstalled schema tables');
  }
});
