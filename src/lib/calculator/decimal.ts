/**
 * Decimal and financial precision utilities.
 *
 * Values are represented internally as fixed-point integers with four decimal
 * places. Currency outputs are rounded half away from zero to two decimals.
 */

import type { WeightUnit } from './types.ts';

const SCALE = BigInt(10_000);
const SCALE_NUMBER = 10_000;
const HUNDRED = BigInt(100);

function divideAndRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) throw new RangeError('Cannot divide by zero.');

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteRemainder = remainder < BigInt(0) ? -remainder : remainder;
  const absoluteDenominator = denominator < BigInt(0) ? -denominator : denominator;

  if (absoluteRemainder * BigInt(2) < absoluteDenominator) return quotient;
  return (numerator < BigInt(0)) === (denominator < BigInt(0)) ? quotient + BigInt(1) : quotient - BigInt(1);
}

/** Converts a finite JS number to a four-decimal fixed-point integer. */
export function toScaledBigInt(val: number): bigint {
  if (!Number.isFinite(val)) {
    throw new TypeError(`Cannot convert non-finite value to scaled BigInt: ${val}`);
  }

  const scaled = Math.round(val * SCALE_NUMBER);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError(`Value is outside the supported four-decimal range: ${val}`);
  }
  return BigInt(scaled);
}

/** Converts a fixed-point integer back to a JS number. */
export function fromScaledBigInt(val: bigint): number {
  const result = Number(val) / SCALE_NUMBER;
  if (!Number.isFinite(result) || !Number.isSafeInteger(Number(val))) {
    throw new RangeError('Fixed-point value is outside the supported numeric range.');
  }
  return result;
}

/** Rounds a finite number half away from zero to two decimal places. */
export function roundTo2Decimals(num: number): number {
  const scaled = toScaledBigInt(num);
  return fromScaledBigInt(divideAndRoundHalfAwayFromZero(scaled, HUNDRED) * HUNDRED);
}

/** Rounds a finite number to four decimal places. */
export function roundTo4Decimals(num: number): number {
  return fromScaledBigInt(toScaledBigInt(num));
}

/** Multiplies two fixed-point values and rounds the result to four decimals. */
export function safeMultiply(amount: number, multiplier: number): number {
  const a = toScaledBigInt(amount);
  const m = toScaledBigInt(multiplier);
  return fromScaledBigInt(divideAndRoundHalfAwayFromZero(a * m, SCALE));
}

/** Calculates `(amount * percent) / 100`, rounded to four decimal places. */
export function safePercent(amount: number, percent: number): number {
  const a = toScaledBigInt(amount);
  const p = toScaledBigInt(percent);
  return fromScaledBigInt(divideAndRoundHalfAwayFromZero(a * p, HUNDRED * SCALE));
}

/** Divides two fixed-point values and rounds the result to four decimals. */
export function safeDivide(dividend: number, divisor: number): number {
  if (divisor === 0) throw new RangeError('Cannot divide by zero.');
  const a = toScaledBigInt(dividend);
  const b = toScaledBigInt(divisor);
  return fromScaledBigInt(divideAndRoundHalfAwayFromZero(a * SCALE, b));
}

/** Adds fixed-point values and rounds the result to four decimals. */
export function safeAdd(...values: number[]): number {
  return fromScaledBigInt(values.reduce((total, value) => total + toScaledBigInt(value), BigInt(0)));
}

/** Unit conversion factors to base kilograms. */
export const WEIGHT_TO_KG_FACTORS: Record<WeightUnit, number> = {
  kg: 1,
  quintal: 100,
  tonne: 1000,
};

export function convertToKg(quantity: number, unit: WeightUnit): number {
  if (quantity <= 0) return 0;
  return safeMultiply(quantity, WEIGHT_TO_KG_FACTORS[unit]);
}

export function convertFromKg(kgQuantity: number, targetUnit: WeightUnit): number {
  if (kgQuantity <= 0) return 0;
  return safeDivide(kgQuantity, WEIGHT_TO_KG_FACTORS[targetUnit]);
}

export function normalizePriceToPerKg(pricePerUnit: number, priceUnit: WeightUnit): number {
  if (pricePerUnit <= 0) return 0;
  return safeDivide(pricePerUnit, WEIGHT_TO_KG_FACTORS[priceUnit]);
}

export function formatINR(val: number): string {
  const rounded = roundTo2Decimals(val);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function formatWeight(val: number, unit: WeightUnit): string {
  const rounded = roundTo2Decimals(val);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(rounded)} ${unit}`;
}
