/** AgriPrice deterministic net-proceeds calculation engine. */

import type {
  CalculationInput,
  CalculationResult,
  CostItem,
  CalculationAssumption,
  ValidationResult,
  ValidationViolation,
  WeightUnit,
} from './types.ts';
import {
  convertToKg,
  convertFromKg,
  normalizePriceToPerKg,
  roundTo2Decimals,
  safeAdd,
  safeDivide,
  safeMultiply,
  safePercent,
} from './decimal.ts';

export const ENGINE_VERSION = 'v1.0.0-deterministic';

const VALID_UNITS: readonly WeightUnit[] = ['kg', 'quintal', 'tonne'];
const VALID_COST_MODES = ['flat', 'per_base_kg'] as const;
const MAX_QUANTITY_KG = 1_000_000;
const MAX_PRICE_PER_KG = 1_000_000;
const MAX_FLAT_COST = 1_000_000_000;
const MAX_PER_KG_COST = 100_000;

function hasValidCostMode(mode: unknown): mode is 'flat' | 'per_base_kg' | undefined {
  return mode === undefined || VALID_COST_MODES.includes(mode as 'flat' | 'per_base_kg');
}

function isSupportedUnit(unit: unknown): unit is WeightUnit {
  return VALID_UNITS.includes(unit as WeightUnit);
}

/** Validates calculation inputs against domain and arithmetic bounds. */
export function validateCalculationInput(input: CalculationInput): ValidationResult {
  const errors: ValidationViolation[] = [];

  if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Produce quantity must be a strictly positive number greater than 0 and finite.' });
  }
  if (!isSupportedUnit(input.quantityUnit)) {
    errors.push({ field: 'quantityUnit', message: `Invalid quantity unit "${input.quantityUnit}". Must be 'kg', 'quintal', or 'tonne'.` });
  }
  if (isSupportedUnit(input.quantityUnit) && typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity > MAX_QUANTITY_KG / ({ kg: 1, quintal: 100, tonne: 1000 }[input.quantityUnit])) {
    errors.push({ field: 'quantity', message: `Produce quantity cannot exceed ${MAX_QUANTITY_KG.toLocaleString('en-IN')} kg.` });
  }

  if (typeof input.pricePerUnit !== 'number' || !Number.isFinite(input.pricePerUnit) || input.pricePerUnit < 0) {
    errors.push({ field: 'pricePerUnit', message: 'Market price per unit must be a non-negative number and finite.' });
  }
  if (!isSupportedUnit(input.priceUnit)) {
    errors.push({ field: 'priceUnit', message: `Invalid price unit "${input.priceUnit}". Must be 'kg', 'quintal', or 'tonne'.` });
  }
  if (isSupportedUnit(input.priceUnit) && typeof input.pricePerUnit === 'number' && Number.isFinite(input.pricePerUnit) && input.pricePerUnit > MAX_PRICE_PER_KG * ({ kg: 1, quintal: 100, tonne: 1000 }[input.priceUnit])) {
    errors.push({ field: 'pricePerUnit', message: `Market price cannot exceed ₹${MAX_PRICE_PER_KG.toLocaleString('en-IN')} per kg.` });
  }

  if (typeof input.expectedLossPercent !== 'number' || !Number.isFinite(input.expectedLossPercent) || input.expectedLossPercent < 0 || input.expectedLossPercent > 100) {
    errors.push({ field: 'expectedLossPercent', message: 'Expected post-harvest loss must be between 0% and 100%.' });
  }

  const costFields: Array<'transportCost' | 'handlingCost' | 'storageCost' | 'packagingCost' | 'otherFees'> = [
    'transportCost', 'handlingCost', 'storageCost', 'packagingCost', 'otherFees',
  ];
  for (const field of costFields) {
    const value = input[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push({ field, message: `${field} must be a non-negative number and finite.` });
    }
  }

  if (typeof input.commissionPercent !== 'number' || !Number.isFinite(input.commissionPercent) || input.commissionPercent < 0) {
    errors.push({ field: 'commissionPercent', message: 'commissionPercent must be a non-negative number and finite.' });
  } else if (input.commissionPercent > 100) {
    errors.push({ field: 'commissionPercent', message: 'Commission fee cannot exceed 100% of gross revenue.' });
  }

  if (!hasValidCostMode(input.transportCostMode)) {
    errors.push({ field: 'transportCostMode', message: "transportCostMode must be 'flat' or 'per_base_kg'." });
  }
  if (!hasValidCostMode(input.handlingCostMode)) {
    errors.push({ field: 'handlingCostMode', message: "handlingCostMode must be 'flat' or 'per_base_kg'." });
  }
  if (input.transportCostMode === 'per_base_kg' && input.transportCost > MAX_PER_KG_COST) {
    errors.push({ field: 'transportCost', message: `transportCost cannot exceed ₹${MAX_PER_KG_COST.toLocaleString('en-IN')} per kg.` });
  } else if (input.transportCostMode !== 'per_base_kg' && input.transportCost > MAX_FLAT_COST) {
    errors.push({ field: 'transportCost', message: `transportCost cannot exceed ₹${MAX_FLAT_COST.toLocaleString('en-IN')}.` });
  }
  if (input.handlingCostMode === 'per_base_kg' && input.handlingCost > MAX_PER_KG_COST) {
    errors.push({ field: 'handlingCost', message: `handlingCost cannot exceed ₹${MAX_PER_KG_COST.toLocaleString('en-IN')} per kg.` });
  } else if (input.handlingCostMode !== 'per_base_kg' && input.handlingCost > MAX_FLAT_COST) {
    errors.push({ field: 'handlingCost', message: `handlingCost cannot exceed ₹${MAX_FLAT_COST.toLocaleString('en-IN')}.` });
  }
  for (const field of ['storageCost', 'packagingCost', 'otherFees'] as const) {
    if (input[field] > MAX_FLAT_COST) errors.push({ field, message: `${field} cannot exceed ₹${MAX_FLAT_COST.toLocaleString('en-IN')}.` });
  }

  if (input.cultivationCost !== undefined && (typeof input.cultivationCost !== 'number' || !Number.isFinite(input.cultivationCost) || input.cultivationCost < 0 || input.cultivationCost > MAX_FLAT_COST)) {
    errors.push({ field: 'cultivationCost', message: `Cultivation cost must be a non-negative number if provided, finite, and no greater than ₹${MAX_FLAT_COST.toLocaleString('en-IN')}.` });
  }

  return { valid: errors.length === 0, errors };
}

/** Calculates deterministic net proceeds from validated produce parameters. */
export function calculateNetProceeds(input: CalculationInput, calculatedAt?: string): CalculationResult {
  const validation = validateCalculationInput(input);
  if (!validation.valid) {
    throw new Error(`Invalid calculation input: ${validation.errors.map((error) => `${error.field}: ${error.message}`).join('; ')}`);
  }

  const originalQuantityKg = convertToKg(input.quantity, input.quantityUnit);
  const expectedLossKg = safePercent(originalQuantityKg, input.expectedLossPercent);
  const sellableQuantityKg = safeAdd(originalQuantityKg, -expectedLossKg);
  const sellableDisplayQuantity = convertFromKg(sellableQuantityKg, input.quantityUnit);
  const pricePerKg = normalizePriceToPerKg(input.pricePerUnit, input.priceUnit);
  const grossRevenue = roundTo2Decimals(safeMultiply(sellableQuantityKg, pricePerKg));

  const transportTotal = roundTo2Decimals(input.transportCostMode === 'per_base_kg'
    ? safeMultiply(originalQuantityKg, input.transportCost)
    : input.transportCost);
  const handlingTotal = roundTo2Decimals(input.handlingCostMode === 'per_base_kg'
    ? safeMultiply(originalQuantityKg, input.handlingCost)
    : input.handlingCost);
  const commissionTotal = roundTo2Decimals(safePercent(grossRevenue, input.commissionPercent));
  const storageTotal = roundTo2Decimals(input.storageCost);
  const packagingTotal = roundTo2Decimals(input.packagingCost);
  const otherTotal = roundTo2Decimals(input.otherFees);
  const totalPostHarvestDeductions = roundTo2Decimals(safeAdd(transportTotal, handlingTotal, commissionTotal, storageTotal, packagingTotal, otherTotal));

  const calcPercentOfGross = (costAmount: number): number => grossRevenue <= 0
    ? 0
    : roundTo2Decimals(safeDivide(safeMultiply(costAmount, 100), grossRevenue));

  const costs: CostItem[] = [
    { id: 'transport', label: 'Transportation & Haulage', category: 'transport', amount: transportTotal, percentOfGross: calcPercentOfGross(transportTotal), description: input.transportCostMode === 'per_base_kg' ? `₹${input.transportCost}/kg for ${originalQuantityKg} kg loaded` : 'Fixed vehicle hire / freight charges to market' },
    { id: 'handling', label: 'Handling & Loading Labor', category: 'handling', amount: handlingTotal, percentOfGross: calcPercentOfGross(handlingTotal), description: input.handlingCostMode === 'per_base_kg' ? `₹${input.handlingCost}/kg for loading and unloading labor` : 'Palledar / mandi loading and unloading wages' },
    { id: 'commission', label: `Commission Agent Fee (${input.commissionPercent}%)`, category: 'commission', amount: commissionTotal, percentOfGross: calcPercentOfGross(commissionTotal), description: `Mandi commission agent or intermediary deduction (${input.commissionPercent}% of gross realization)` },
    { id: 'storage', label: 'Warehousing & Cold Storage', category: 'storage', amount: storageTotal, percentOfGross: calcPercentOfGross(storageTotal), description: 'Pre-sale holding, cold room, or warehouse charges' },
    { id: 'packaging', label: 'Packaging & Containers', category: 'packaging', amount: packagingTotal, percentOfGross: calcPercentOfGross(packagingTotal), description: 'Plastic crates, gunny bags, strapping, or carton costs' },
    { id: 'statutory', label: 'Market Cess & Statutory Levies', category: 'statutory', amount: otherTotal, percentOfGross: calcPercentOfGross(otherTotal), description: 'APMC market yard cess, weighbridge slip fees, and rural development tolls' },
  ];

  const estimatedNetProceeds = roundTo2Decimals(safeAdd(grossRevenue, -totalPostHarvestDeductions));
  const netProceedsPerKg = sellableQuantityKg > 0 ? roundTo2Decimals(safeDivide(estimatedNetProceeds, sellableQuantityKg)) : 0;
  const cultivationCostAmount = input.cultivationCost === undefined ? 0 : roundTo2Decimals(input.cultivationCost);
  const cultivationCostIncluded = cultivationCostAmount > 0;
  const estimatedNetFarmProfit = cultivationCostIncluded ? roundTo2Decimals(safeAdd(estimatedNetProceeds, -cultivationCostAmount)) : null;

  const assumptions: CalculationAssumption[] = [
    { code: 'LOSS_DEDUCTION_TIMING', label: 'Transit/Grading Loss Timing', value: `${input.expectedLossPercent}% shrinkage/sorting loss`, note: 'Loss is deducted prior to sale gate; buyer pays only for delivered sellable quantity.' },
    { code: 'COMMISSION_BASIS', label: 'Commission Basis', value: `${input.commissionPercent}% of Gross Revenue`, note: 'Commission is levied on actual sold produce value at the mandi yard.' },
    { code: 'SELLER_EXPENSE_LIABILITY', label: 'Freight & Labor Liability', value: 'Borne by Producer/Seller', note: 'Transport, loading labor, and packaging are deducted from final payout.' },
    { code: 'PROFIT_TERMINOLOGY_DISCLAIMER', label: 'Net Proceeds vs Farm Profit', value: cultivationCostIncluded ? 'Cultivation expenses included' : 'Post-harvest deductions only', note: cultivationCostIncluded ? 'Field cultivation cost entered; estimated net farm profit displayed alongside proceeds.' : 'Crucial: In-field cultivation expenses (seed, fertilizer, diesel, labor) are omitted. This figure is Net Proceeds, not Net Farm Profit.' },
  ];
  const disclaimer = cultivationCostIncluded
    ? 'Calculated Net Proceeds equals Gross Revenue minus post-harvest trade costs. Estimated Net Farm Profit accounts for stated pre-harvest cultivation costs.'
    : 'Notice: Estimated Net Proceeds reflects market revenue minus intermediary trade deductions (transport, labor, commission, storage, fees). Cultivation and agronomic production expenses are excluded. Do not treat Net Proceeds as Net Profit.';

  return {
    version: ENGINE_VERSION,
    calculatedAt: calculatedAt || '2026-10-17T09:00:00.000Z',
    originalQuantityKg, expectedLossPercent: input.expectedLossPercent, expectedLossKg, sellableQuantityKg,
    displayQuantity: input.quantity, displayUnit: input.quantityUnit, sellableDisplayQuantity,
    pricePerKg, grossRevenue, costs, totalPostHarvestDeductions,
    estimatedNetProceeds, netProceedsPerKg,
    cultivationCostIncluded, cultivationCostAmount, estimatedNetFarmProfit,
    assumptions, disclaimer,
  };
}
