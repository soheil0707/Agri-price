/**
 * AgriPrice Calculation Engine Types
 * Deterministic net-proceeds calculation data contracts.
 * 
 * Version: v1.0.0-deterministic
 */

export type WeightUnit = 'kg' | 'quintal' | 'tonne';

export interface CalculationInput {
  /** Total physical quantity available or harvested */
  quantity: number;
  /** Unit for the input quantity */
  quantityUnit: WeightUnit;

  /** Quoted market benchmark or buyer offering price */
  pricePerUnit: number;
  /** Unit corresponding to the quoted price (e.g. ₹ per quintal or ₹ per kg) */
  priceUnit: WeightUnit;

  /** Anticipated post-harvest, transit, sorting, or spoilage loss percentage (0 - 100) */
  expectedLossPercent: number;

  /** Transportation logistics cost (₹) */
  transportCost: number;
  transportCostMode?: 'flat' | 'per_base_kg';

  /** Loading, unloading, and mandi labor handling cost (₹) */
  handlingCost: number;
  handlingCostMode?: 'flat' | 'per_base_kg';

  /** Mandi commission or market agent charge (% of gross revenue) */
  commissionPercent: number;

  /** Warehouse / cold storage rent (₹) */
  storageCost: number;

  /** Bagging, wooden crates, plastic crates, or packaging material cost (₹) */
  packagingCost: number;

  /** Statutory market cess, APMC developmental cess, weighbridge fees (₹) */
  otherFees: number;

  /** 
   * Optional field cultivation & pre-harvest expenses (seeds, pesticides, irrigation, labor).
   * RULE: If omitted or 0, calculation MUST only declare "Estimated Net Proceeds"
   * and never claim to be "Net Profit".
   */
  cultivationCost?: number;
}

export type CostCategory =
  | 'transport'
  | 'handling'
  | 'commission'
  | 'storage'
  | 'packaging'
  | 'statutory'
  | 'cultivation';

export interface CostItem {
  id: string;
  label: string;
  category: CostCategory;
  /** Monetary deduction in ₹ (two decimals) */
  amount: number;
  /** Share of Gross Revenue (%) */
  percentOfGross: number;
  description: string;
}

export interface CalculationAssumption {
  code: string;
  label: string;
  value: string;
  note: string;
}

export interface CalculationResult {
  /** Engine version stamp for auditability */
  version: string;
  /** Calculation timestamp (ISO format) */
  calculatedAt: string;

  // Weight & Volume Metrics
  originalQuantityKg: number;
  expectedLossPercent: number;
  expectedLossKg: number;
  sellableQuantityKg: number;

  displayQuantity: number;
  displayUnit: WeightUnit;
  sellableDisplayQuantity: number;

  // Pricing & Revenue
  pricePerKg: number;
  grossRevenue: number;

  // Cost Itemization
  costs: CostItem[];
  totalPostHarvestDeductions: number;

  // Proceeds
  /**
   * Estimated Net Proceeds = Gross Revenue - Total Post-Harvest Deductions
   * NOTE: Does not account for seed/fertilizer/in-field cultivation costs unless explicitly added.
   */
  estimatedNetProceeds: number;
  netProceedsPerKg: number;

  // Profitability (strictly guarded)
  cultivationCostIncluded: boolean;
  cultivationCostAmount: number;
  estimatedNetFarmProfit: number | null;

  // Transparency & Audit
  assumptions: CalculationAssumption[];
  disclaimer: string;
}

export interface ValidationViolation {
  field: keyof CalculationInput | 'general';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationViolation[];
}

export interface SellingChannelOption {
  id: string;
  channelName: string;
  badge: string;
  description: string;
  buyerType: 'APMC Mandi Trader' | 'Food Processing Firm' | 'Farmer Producer Org (FPO)' | 'Retail / Local Haat';
  quotedPricePerKg: number;
  lossPercent: number;
  transportCostMode: 'flat' | 'per_base_kg';
  transportCostRate: number;
  handlingCostRate: number;
  commissionPercent: number;
  packagingCost: number;
  storageCost: number;
  otherFees: number;
  paymentTerms: string;
}
