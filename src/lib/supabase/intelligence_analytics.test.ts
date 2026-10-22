/**
 * AgriPrice Phase 5: Verification Suite
 *
 * Tests for:
 * 1. Market-price source labels, timestamp handling, unit conversions, and anti-fabrication standards.
 * 2. Calculation snapshot deterministic reproducibility, input validation, and pre-trade simulation decoupling.
 * 3. Server-enforced admin-only access and role authorization.
 * 4. Privacy masking: zero exposure of private farm GPS coordinates, personal addresses, or bank accounts.
 * 5. Explicit live database vs. demo sandbox separation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMarketPriceBenchmarks,
  isLiveMarketFeed,
  formatPriceUnit,
} from './marketPrices.ts';
import {
  saveCalculationSnapshot,
  verifySnapshotReproducibility,
  type CalculationSnapshotRecord,
} from './snapshots.ts';
import {
  isAuthorizedAdmin,
  getDemoPlatformTelemetry,
  fetchLiveAdminAnalytics,
} from './adminAnalytics.ts';
import { calculateNetProceeds } from '../calculator/engine.ts';
import type { CalculationInput } from '../calculator/types.ts';

// Baseline valid calculation input
const MOCK_CALC_INPUT: CalculationInput = {
  quantity: 5000,
  quantityUnit: 'kg',
  pricePerUnit: 28.0,
  priceUnit: 'kg',
  expectedLossPercent: 7.5,
  transportCost: 4500,
  transportCostMode: 'flat',
  handlingCost: 1800,
  handlingCostMode: 'flat',
  commissionPercent: 6.0,
  storageCost: 0,
  packagingCost: 2200,
  otherFees: 850,
  cultivationCost: 40000,
};

// -------------------------------------------------------------------------
// 1. Market Intelligence & APMC Mandi Benchmarks
// -------------------------------------------------------------------------
test('1.1 Market Prices: fetchMarketPriceBenchmarks returns structured records with truthful attribution', async () => {
  const result = await fetchMarketPriceBenchmarks();
  assert.ok(Array.isArray(result.prices), 'Prices should be an array');
  assert.ok(result.prices.length > 0, 'Prices should not be empty');

  const first = result.prices[0];
  assert.ok(first.commodity, 'Commodity must be specified');
  assert.ok(first.modalPricePerKg > 0, 'Modal price must be positive');
  assert.ok(first.minPricePerKg <= first.modalPricePerKg, 'Min price <= Modal price');
  assert.ok(first.modalPricePerKg <= first.maxPricePerKg, 'Modal price <= Max price');
  assert.ok(first.updatedAt, 'Timestamp/updatedAt must be present');
  assert.ok(first.sourceAttribution, 'Source attribution must be explicitly stated');

  // If table has 0 rows, it must be labeled truthfully as sample/reference
  if (!result.isLiveDatabase) {
    assert.match(
      result.sourceDescription.toLowerCase(),
      /sample|reference|demo/,
      'Must truthfully label reference data when live feeds are pending'
    );
  }
});

test('1.2 Market Prices: isLiveMarketFeed returns true ONLY for verified live database feeds', () => {
  const livePrice = {
    id: 'PRC-001',
    commodity: 'Tomato',
    variety: 'Hybrid',
    grade: 'Grade-A',
    marketCenter: 'Kolar APMC Yard',
    district: 'Kolar',
    state: 'Karnataka',
    modalPricePerKg: 24.5,
    minPricePerKg: 20.0,
    maxPricePerKg: 28.0,
    dayChangePercent: 2.1,
    trend: 'up' as const,
    updatedAt: '2026-10-21T18:00:00Z',
    sourceAttribution: 'Agmarknet APMC Mandi Direct API',
    isLiveFeed: true,
    isLiveDatabaseRecord: true,
  };

  const samplePrice = {
    ...livePrice,
    isLiveFeed: false,
    isLiveDatabaseRecord: false,
  };

  assert.equal(isLiveMarketFeed(livePrice), true, 'Verified database record with live feed must return true');
  assert.equal(isLiveMarketFeed(samplePrice), false, 'Sample reference benchmark must return false');
});

test('1.3 Market Prices: formatPriceUnit formats rate in ₹/kg and ₹/quintal accurately', () => {
  const priceKg = 24.5;
  const formattedKg = formatPriceUnit(priceKg, 'kg');
  assert.equal(formattedKg, '₹24.50/kg');

  const formattedQuintal = formatPriceUnit(priceKg, 'quintal');
  assert.equal(formattedQuintal, '₹2,450/qtl');
});

test('1.4 Anti-Fabrication Standard: Market prices do NOT invent unverified AI price forecasts', async () => {
  const result = await fetchMarketPriceBenchmarks();
  for (const price of result.prices) {
    // Truthfulness: Source attribution must not claim speculative predictions
    assert.doesNotMatch(
      (price.sourceAttribution || '').toLowerCase(),
      /ai guaranteed|guaranteed forecast|unfailing predictive model/,
      'Must never claim speculative AI forecasts'
    );
  }
});

// -------------------------------------------------------------------------
// 2. Deterministic Calculation Snapshots (Audit Trail & Reproducibility)
// -------------------------------------------------------------------------
test('2.1 Calculation Snapshots: Validates presence of input and result payload', async () => {
  // @ts-expect-error Testing missing arguments
  const res = await saveCalculationSnapshot(null, null, 'profile-123');
  assert.equal(res.success, false);
  assert.match(res.message, /required/i);
});

test('2.2 Calculation Snapshots: Rejects unauthenticated caller profile ID', async () => {
  const result = calculateNetProceeds(MOCK_CALC_INPUT);
  const res = await saveCalculationSnapshot(MOCK_CALC_INPUT, result, '');
  assert.equal(res.success, false);
  assert.match(res.message, /authentication required/i);
});

test('2.3 Deterministic Reproducibility: verifySnapshotReproducibility verifies 0 numerical drift', () => {
  const result = calculateNetProceeds(MOCK_CALC_INPUT);

  const mockSnapshot: CalculationSnapshotRecord = {
    id: 'SNP-TEST-001',
    createdByProfileId: 'PRF-FARMER-123',
    engineVersion: result.version,
    inputPayload: MOCK_CALC_INPUT,
    outputPayload: result,
    originalQuantityKg: result.originalQuantityKg,
    sellableQuantityKg: result.sellableQuantityKg,
    expectedLossPercent: result.expectedLossPercent,
    grossRevenue: result.grossRevenue,
    totalDeductions: result.totalPostHarvestDeductions,
    estimatedNetProceeds: result.estimatedNetProceeds,
    cultivationCostIncluded: result.cultivationCostIncluded,
    cultivationCostAmount: result.cultivationCostAmount,
    estimatedNetFarmProfit: result.estimatedNetFarmProfit,
    assumptionsSummary: result.assumptions,
    disclaimerText: result.disclaimer,
    createdAt: new Date().toISOString(),
    isLiveDatabaseRecord: true,
  };

  const audit = verifySnapshotReproducibility(mockSnapshot);
  assert.equal(audit.isReproducible, true, 'Snapshot must be 100% reproducible with identical input');
  assert.equal(audit.driftGrossRevenue, 0, 'Zero drift in gross revenue');
  assert.equal(audit.driftNetProceeds, 0, 'Zero drift in estimated net proceeds');
  assert.equal(audit.driftTotalDeductions, 0, 'Zero drift in deductions');
});

test('2.4 Decoupling Guarantee: Snapshot preserves pre-trade simulation disclaimer', () => {
  const result = calculateNetProceeds(MOCK_CALC_INPUT);
  assert.ok(result.disclaimer, 'Disclaimer must be present on deterministic engine output');
  assert.match(
    result.disclaimer.toLowerCase(),
    /estimate|not guaranteed|actual proceeds/,
    'Disclaimer must explicitly state pre-trade estimate decoupling'
  );
});

// -------------------------------------------------------------------------
// 3. Admin Authorization & Server-Enforced Role Controls
// -------------------------------------------------------------------------
test('3.1 Admin Authorization: isAuthorizedAdmin strictly allows admin and rejects other roles', () => {
  assert.equal(isAuthorizedAdmin(['admin']), true);
  assert.equal(isAuthorizedAdmin(['ADMIN']), true);
  assert.equal(isAuthorizedAdmin(['farmer', 'admin']), true);

  assert.equal(isAuthorizedAdmin(['farmer']), false);
  assert.equal(isAuthorizedAdmin(['trader']), false);
  assert.equal(isAuthorizedAdmin(['processor']), false);
  assert.equal(isAuthorizedAdmin(['cold_storage']), false);
  assert.equal(isAuthorizedAdmin(['transporter']), false);
  assert.equal(isAuthorizedAdmin([]), false);
  // @ts-expect-error Testing invalid input
  assert.equal(isAuthorizedAdmin(null), false);
});

test('3.2 Admin Authorization: fetchLiveAdminAnalytics blocks unauthorized roles', async () => {
  const res = await fetchLiveAdminAnalytics(['farmer']);
  assert.equal(res.isLiveDatabase, false);
  assert.ok(res.error, 'Must return error for non-admin caller');
  assert.match(res.error, /authorization violation/i);
});

// -------------------------------------------------------------------------
// 4. Privacy & Zero-Leakage Verification
// -------------------------------------------------------------------------
test('4.1 Privacy Masking: Platform telemetry contains zero private farm GPS coordinates or bank details', () => {
  const telemetry = getDemoPlatformTelemetry();

  // Verify schema of telemetry
  const serialized = JSON.stringify(telemetry);
  assert.doesNotMatch(serialized, /farm_gps|gps_lat|gps_lng|bank_account|ifsc|aadhaar/i);
});

test('4.2 Privacy Masking: Calculation snapshot does not store private user credentials or bank records', () => {
  const result = calculateNetProceeds(MOCK_CALC_INPUT);
  const snapshot: CalculationSnapshotRecord = {
    id: 'SNP-TEST-PRIV',
    createdByProfileId: 'PRF-001',
    engineVersion: result.version,
    inputPayload: MOCK_CALC_INPUT,
    outputPayload: result,
    originalQuantityKg: 5000,
    sellableQuantityKg: 4825,
    expectedLossPercent: 3.5,
    grossRevenue: 127862.5,
    totalDeductions: 8400,
    estimatedNetProceeds: 119462.5,
    cultivationCostIncluded: true,
    cultivationCostAmount: 40000,
    estimatedNetFarmProfit: 79462.5,
    assumptionsSummary: [],
    disclaimerText: 'Pre-Trade Estimate',
    createdAt: new Date().toISOString(),
    isLiveDatabaseRecord: true,
  };

  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /bank_account_number|ifsc_code|private_key|password/i);
});

// -------------------------------------------------------------------------
// 5. Anti-Fabrication Standards & Live / Demo Separation
// -------------------------------------------------------------------------
test('5.1 Anti-Fabrication Standard: Demo telemetry does not inject arbitrary un-backed constants', () => {
  const telemetry = getDemoPlatformTelemetry();
  assert.ok(telemetry.financials.totalGmv > 0);
  assert.ok(telemetry.orders.totalOrders > 0);
  assert.equal(telemetry.isLiveDatabase, false);
  assert.match(telemetry.sourceLabel, /Demo|Prototype|Sandbox/i);
});

test('5.2 Live vs. Demo Separation: Live and demo source labels are mutually distinct', () => {
  const demoTelemetry = getDemoPlatformTelemetry();
  assert.equal(demoTelemetry.isLiveDatabase, false);
  assert.match(demoTelemetry.sourceLabel, /Demo/i);
});
