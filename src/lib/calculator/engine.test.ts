/**
 * Automated Unit Test Suite for AgriPrice Calculation Engine
 *
 * Verifies:
 * 1. Normal calculations & baseline tomato model
 * 2. Unit conversions (kg, quintal, tonne)
 * 3. Invalid inputs & validation errors
 * 4. Boundary condition: Zero loss (0%)
 * 5. Boundary condition: Full loss (100%)
 * 6. Financial rounding and decimal precision
 * 7. Profit disclaimer guards (cultivation cost exclusion)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNetProceeds, validateCalculationInput, ENGINE_VERSION } from './engine.ts';
import type { CalculationInput } from './types.ts';
import {
  convertToKg,
  convertFromKg,
  normalizePriceToPerKg,
  roundTo2Decimals,
  safePercent,
  safeMultiply,
} from './decimal.ts';

test('1. Normal Calculation: Baseline 5,000 kg Tomato Listing', () => {
  const input: CalculationInput = {
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
  };

  const result = calculateNetProceeds(input);

  // Assert version and timestamp
  assert.strictEqual(result.version, ENGINE_VERSION);
  assert.ok(result.calculatedAt);

  // Quantities
  assert.strictEqual(result.originalQuantityKg, 5000);
  assert.strictEqual(result.expectedLossPercent, 7.5);
  assert.strictEqual(result.expectedLossKg, 375); // 5000 * 0.075 = 375 kg
  assert.strictEqual(result.sellableQuantityKg, 4625); // 5000 - 375 = 4625 kg

  // Financials
  assert.strictEqual(result.pricePerKg, 28.0);
  // Gross Revenue = 4625 * 28 = 129,500.00
  assert.strictEqual(result.grossRevenue, 129500);

  // Commission = 129,500 * 0.06 = 7,770.00
  const commissionCost = result.costs.find((c) => c.category === 'commission');
  assert.ok(commissionCost);
  assert.strictEqual(commissionCost.amount, 7770);
  assert.strictEqual(commissionCost.percentOfGross, 6.0);

  // Total deductions = 4500 (trans) + 1800 (hand) + 7770 (comm) + 2200 (pack) + 850 (other) = 17,120.00
  assert.strictEqual(result.totalPostHarvestDeductions, 17120);

  // Estimated Net Proceeds = 129,500 - 17,120 = 112,380.00
  assert.strictEqual(result.estimatedNetProceeds, 112380);

  // Net Proceeds per kg = 112,380 / 4625 = 24.30
  assert.strictEqual(result.netProceedsPerKg, 24.3);

  // Guard: cultivation cost excluded, so net farm profit MUST be null
  assert.strictEqual(result.cultivationCostIncluded, false);
  assert.strictEqual(result.estimatedNetFarmProfit, null);
  assert.ok(result.disclaimer.includes('Do not treat Net Proceeds as Net Profit'));
});

test('2. Unit Conversions: Quintals and Tonnes produce equivalent outcomes', () => {
  // 50 quintals = 5,000 kg. Price = ₹2,800/quintal = ₹28/kg.
  const quintalInput: CalculationInput = {
    quantity: 50,
    quantityUnit: 'quintal',
    pricePerUnit: 2800,
    priceUnit: 'quintal',
    expectedLossPercent: 7.5,
    transportCost: 4500,
    handlingCost: 1800,
    commissionPercent: 6.0,
    storageCost: 0,
    packagingCost: 2200,
    otherFees: 850,
  };

  const quintalResult = calculateNetProceeds(quintalInput);
  assert.strictEqual(quintalResult.originalQuantityKg, 5000);
  assert.strictEqual(quintalResult.sellableQuantityKg, 4625);
  assert.strictEqual(quintalResult.grossRevenue, 129500);
  assert.strictEqual(quintalResult.estimatedNetProceeds, 112380);

  // 5 tonnes = 5,000 kg. Price = ₹28,000/tonne = ₹28/kg.
  const tonneInput: CalculationInput = {
    quantity: 5,
    quantityUnit: 'tonne',
    pricePerUnit: 28000,
    priceUnit: 'tonne',
    expectedLossPercent: 7.5,
    transportCost: 4500,
    handlingCost: 1800,
    commissionPercent: 6.0,
    storageCost: 0,
    packagingCost: 2200,
    otherFees: 850,
  };

  const tonneResult = calculateNetProceeds(tonneInput);
  assert.strictEqual(tonneResult.originalQuantityKg, 5000);
  assert.strictEqual(tonneResult.sellableQuantityKg, 4625);
  assert.strictEqual(tonneResult.grossRevenue, 129500);
  assert.strictEqual(tonneResult.estimatedNetProceeds, 112380);

  // Conversion helpers direct test
  assert.strictEqual(convertToKg(1, 'kg'), 1);
  assert.strictEqual(convertToKg(1, 'quintal'), 100);
  assert.strictEqual(convertToKg(1, 'tonne'), 1000);
  assert.strictEqual(convertFromKg(500, 'quintal'), 5);
  assert.strictEqual(convertFromKg(5000, 'tonne'), 5);
  assert.strictEqual(normalizePriceToPerKg(3000, 'quintal'), 30);
  assert.strictEqual(normalizePriceToPerKg(30000, 'tonne'), 30);
});

test('3. Invalid Inputs: Validation triggers informative error messages', () => {
  const baseValid: CalculationInput = {
    quantity: 100,
    quantityUnit: 'kg',
    pricePerUnit: 20,
    priceUnit: 'kg',
    expectedLossPercent: 5,
    transportCost: 100,
    handlingCost: 50,
    commissionPercent: 5,
    storageCost: 0,
    packagingCost: 50,
    otherFees: 10,
  };

  // Negative quantity
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, quantity: -10 }),
    /quantity: Produce quantity must be a strictly positive number/
  );

  // Zero quantity
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, quantity: 0 }),
    /quantity: Produce quantity must be a strictly positive number/
  );

  // Negative price
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, pricePerUnit: -5 }),
    /pricePerUnit: Market price per unit must be a non-negative number/
  );

  // Loss < 0%
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, expectedLossPercent: -1 }),
    /expectedLossPercent: Expected post-harvest loss must be between 0% and 100%/
  );

  // Loss > 100%
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, expectedLossPercent: 101 }),
    /expectedLossPercent: Expected post-harvest loss must be between 0% and 100%/
  );

  // Negative transport cost
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, transportCost: -50 }),
    /transportCost must be a non-negative number/
  );

  // Commission > 100%
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, commissionPercent: 120 }),
    /Commission fee cannot exceed 100%/
  );

  // Negative cultivation cost
  assert.throws(
    () => calculateNetProceeds({ ...baseValid, cultivationCost: -500 }),
    /Cultivation cost must be a non-negative number/
  );

  // Validation function returns valid=false with array of errors
  const valResult = validateCalculationInput({ ...baseValid, quantity: -1 });
  assert.strictEqual(valResult.valid, false);
  assert.ok(valResult.errors.length > 0);
});

test('4. Boundary Condition: Zero Loss (0%)', () => {
  const input: CalculationInput = {
    quantity: 2000,
    quantityUnit: 'kg',
    pricePerUnit: 25.0,
    priceUnit: 'kg',
    expectedLossPercent: 0,
    transportCost: 1500,
    handlingCost: 500,
    commissionPercent: 5.0,
    storageCost: 0,
    packagingCost: 800,
    otherFees: 200,
  };

  const result = calculateNetProceeds(input);

  assert.strictEqual(result.expectedLossKg, 0);
  assert.strictEqual(result.sellableQuantityKg, 2000);
  // Gross revenue = 2000 * 25 = 50,000.00
  assert.strictEqual(result.grossRevenue, 50000);
  // Commission 5% = 2,500.00
  // Total deductions = 1500 + 500 + 2500 + 0 + 800 + 200 = 5,500.00
  assert.strictEqual(result.totalPostHarvestDeductions, 5500);
  assert.strictEqual(result.estimatedNetProceeds, 44500);
  assert.strictEqual(result.netProceedsPerKg, 22.25);
});

test('5. Boundary Condition: Full Loss (100% transit/spoilage disaster)', () => {
  const input: CalculationInput = {
    quantity: 5000,
    quantityUnit: 'kg',
    pricePerUnit: 30.0,
    priceUnit: 'kg',
    expectedLossPercent: 100, // Complete loss
    transportCost: 4000,
    handlingCost: 1500,
    commissionPercent: 5.0,
    storageCost: 0,
    packagingCost: 2000,
    otherFees: 500,
  };

  const result = calculateNetProceeds(input);

  assert.strictEqual(result.expectedLossKg, 5000);
  assert.strictEqual(result.sellableQuantityKg, 0);
  assert.strictEqual(result.grossRevenue, 0);

  // Commission on 0 revenue must be 0
  const comm = result.costs.find((c) => c.category === 'commission');
  assert.strictEqual(comm?.amount, 0);

  // Non-refundable logistics & packaging expenses still incurred: 4000 + 1500 + 2000 + 500 = 8000
  assert.strictEqual(result.totalPostHarvestDeductions, 8000);

  // Net proceeds is negative: -8000.00
  assert.strictEqual(result.estimatedNetProceeds, -8000);
  assert.strictEqual(result.netProceedsPerKg, 0);
});

test('6. Financial Rounding and Safe Decimal Arithmetic', () => {
  // Test fractional inputs that cause floating point noise in IEEE 754
  const input: CalculationInput = {
    quantity: 1234.56,
    quantityUnit: 'kg',
    pricePerUnit: 19.99,
    priceUnit: 'kg',
    expectedLossPercent: 3.33,
    transportCost: 1111.11,
    handlingCost: 222.22,
    commissionPercent: 4.75,
    storageCost: 55.55,
    packagingCost: 333.33,
    otherFees: 44.44,
  };

  const result = calculateNetProceeds(input);

  // Check that currency numbers do not contain fractional decimals beyond 2
  const checkTwoDecimals = (n: number) => {
    const str = n.toString();
    if (str.includes('.')) {
      assert.ok(str.split('.')[1].length <= 2, `Value ${n} exceeds 2 decimal precision`);
    }
  };

  checkTwoDecimals(result.grossRevenue);
  checkTwoDecimals(result.totalPostHarvestDeductions);
  checkTwoDecimals(result.estimatedNetProceeds);
  checkTwoDecimals(result.netProceedsPerKg);

  for (const cost of result.costs) {
    checkTwoDecimals(cost.amount);
    checkTwoDecimals(cost.percentOfGross);
  }

  // Check safeMultiply helper
  assert.strictEqual(roundTo2Decimals(0.1 + 0.2), 0.3);
  assert.strictEqual(safeMultiply(19.99, 100), 1999);
});

test('7. Profit vs Net Proceeds Terminology Guard', () => {
  // Case A: Cultivation Cost NOT provided -> profit must be null
  const withoutCultivation: CalculationInput = {
    quantity: 1000,
    quantityUnit: 'kg',
    pricePerUnit: 20,
    priceUnit: 'kg',
    expectedLossPercent: 5,
    transportCost: 1000,
    handlingCost: 500,
    commissionPercent: 5,
    storageCost: 0,
    packagingCost: 500,
    otherFees: 200,
  };

  const resA = calculateNetProceeds(withoutCultivation);
  assert.strictEqual(resA.cultivationCostIncluded, false);
  assert.strictEqual(resA.cultivationCostAmount, 0);
  assert.strictEqual(resA.estimatedNetFarmProfit, null);

  // Case B: Cultivation Cost PROVIDED -> profit can be computed
  const withCultivation: CalculationInput = {
    ...withoutCultivation,
    cultivationCost: 12000,
  };

  const resB = calculateNetProceeds(withCultivation);
  assert.strictEqual(resB.cultivationCostIncluded, true);
  assert.strictEqual(resB.cultivationCostAmount, 12000);
  // Net proceeds = (950 * 20 = 19000) - (1000+500+950+500+200 = 3150) = 15,850
  assert.strictEqual(resB.estimatedNetProceeds, 15850);
  // Estimated Net Farm Profit = 15,850 - 12,000 = 3,850
  assert.strictEqual(resB.estimatedNetFarmProfit, 3850);
  assert.ok(resB.disclaimer.includes('Estimated Net Farm Profit accounts for stated pre-harvest cultivation costs'));
});

test('8. Fixed-point percentage and monetary rounding regressions', () => {
  assert.strictEqual(safePercent(10, 5), 0.5);
  assert.strictEqual(safePercent(129500, 6), 7770);
  assert.strictEqual(safeMultiply(19.99, 100), 1999);
  assert.strictEqual(roundTo2Decimals(1.005), 1.01);
  assert.strictEqual(roundTo2Decimals(-1.005), -1.01);
});

test('9. Per-kg costs and commission use the documented bases', () => {
  const result = calculateNetProceeds({
    quantity: 10,
    quantityUnit: 'quintal',
    pricePerUnit: 2500,
    priceUnit: 'quintal',
    expectedLossPercent: 10,
    transportCost: 1.25,
    transportCostMode: 'per_base_kg',
    handlingCost: 0.5,
    handlingCostMode: 'per_base_kg',
    commissionPercent: 2.5,
    storageCost: 10,
    packagingCost: 20,
    otherFees: 5,
  });

  // 1,000 kg less 10% is 900 kg. Revenue is 900 * ₹25 = ₹22,500.
  assert.strictEqual(result.grossRevenue, 22500);
  assert.strictEqual(result.costs.find((cost) => cost.id === 'transport')?.amount, 1250);
  assert.strictEqual(result.costs.find((cost) => cost.id === 'handling')?.amount, 500);
  assert.strictEqual(result.costs.find((cost) => cost.id === 'commission')?.amount, 562.5);
  assert.strictEqual(result.totalPostHarvestDeductions, 2347.5);
  assert.strictEqual(result.estimatedNetProceeds, 20152.5);
});

test('10. Validation rejects non-finite, unsupported-mode, and unrealistic inputs', () => {
  const base: CalculationInput = {
    quantity: 100,
    quantityUnit: 'kg',
    pricePerUnit: 20,
    priceUnit: 'kg',
    expectedLossPercent: 5,
    transportCost: 100,
    handlingCost: 50,
    commissionPercent: 5,
    storageCost: 0,
    packagingCost: 50,
    otherFees: 10,
  };

  for (const input of [
    { ...base, quantity: Number.NaN },
    { ...base, pricePerUnit: Number.POSITIVE_INFINITY },
    { ...base, transportCost: Number.NaN },
    { ...base, quantity: 1e308 },
    { ...base, pricePerUnit: 1e308 },
    { ...base, transportCostMode: 'unknown' as unknown as 'flat' },
    { ...base, handlingCostMode: 'per_tonne' as unknown as 'flat' },
  ]) {
    assert.throws(() => calculateNetProceeds(input));
  }
  assert.throws(() => calculateNetProceeds({ ...base, commissionPercent: 100.01 }), /cannot exceed 100%/);
});

test('11. Unit-equivalent inputs preserve rounded financial results', () => {
  const common = {
    expectedLossPercent: 3.33,
    transportCost: 111.11,
    handlingCost: 22.22,
    commissionPercent: 4.75,
    storageCost: 55.55,
    packagingCost: 33.33,
    otherFees: 4.44,
  };
  const kilogram = calculateNetProceeds({ ...common, quantity: 1234.56, quantityUnit: 'kg', pricePerUnit: 19.99, priceUnit: 'kg' });
  const quintal = calculateNetProceeds({ ...common, quantity: 12.3456, quantityUnit: 'quintal', pricePerUnit: 1999, priceUnit: 'quintal' });
  assert.deepStrictEqual(
    [quintal.originalQuantityKg, quintal.sellableQuantityKg, quintal.grossRevenue, quintal.totalPostHarvestDeductions, quintal.estimatedNetProceeds],
    [kilogram.originalQuantityKg, kilogram.sellableQuantityKg, kilogram.grossRevenue, kilogram.totalPostHarvestDeductions, kilogram.estimatedNetProceeds]
  );
});
