/**
 * AgriPrice Demo & Benchmark Dataset
 * 
 * Simulated agricultural produce listing and distribution channels.
 * Note: Clearly identified as simulated benchmark data for model demonstration.
 * No external live data connection is active.
 */

import type { CalculationInput, SellingChannelOption } from './types.ts';

export interface ProduceListing {
  id: string;
  title: string;
  commodity: string;
  variety: string;
  grade: 'Grade-A (Export / Premium)' | 'Grade-B (Commercial)' | 'Grade-C (Processing)';
  quantity: number;
  unit: 'kg' | 'quintal' | 'tonne';
  harvestLocation: string;
  harvestDate: string;
  expectedShelfLifeDays: number;
  description: string;
  tags: string[];
  simulatedBenchmarkPrice: {
    min: number;
    modal: number;
    max: number;
    unit: 'kg';
    source: string;
  };
  defaultCalculationInput: CalculationInput;
}

/**
 * Illustrative 5,000 kg Tomato Listing
 */
export const DEMO_TOMATO_LISTING: ProduceListing = {
  id: 'LIST-TOM-5000-DEMO',
  title: 'Fresh Field Harvested Tomatoes — 5,000 kg',
  commodity: 'Tomato',
  variety: 'Hybrid Roma / Shivam',
  grade: 'Grade-A (Export / Premium)',
  quantity: 5000,
  unit: 'kg',
  harvestLocation: 'Kolar Agro Cluster, Karnataka',
  harvestDate: '2026-10-16',
  expectedShelfLifeDays: 5,
  description:
    'Demonstration harvest batch of 5,000 kg firm, red ripe Grade-A tomatoes. Graded at harvest. Suitable for direct mandi auction, agro-processing, or supermarket distribution.',
  tags: ['Perishable', 'High-Moisture', 'Cold-Chain Advised', 'Simulated Demo'],
  simulatedBenchmarkPrice: {
    min: 22.0,
    modal: 28.0,
    max: 32.5,
    unit: 'kg',
    source: 'Simulated APMC Regional Benchmark (Illustrative Only — Not Live Feed)',
  },
  defaultCalculationInput: {
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
    cultivationCost: 42000, // Optional demo baseline to show profit difference
  },
};

/**
 * Three distinct selling channel scenarios for comparison
 */
export const DEMO_SELLING_CHANNELS: SellingChannelOption[] = [
  {
    id: 'channel-mandi',
    channelName: 'APMC District Mandi Auction',
    badge: 'Traditional Channel',
    buyerType: 'APMC Mandi Trader',
    description:
      'Farmer transports produce to district wholesale yard. Sold through commission agents (arthiya) via open outcry or e-auction.',
    quotedPricePerKg: 28.0,
    lossPercent: 8.0, // Higher handling points and travel distance
    transportCostMode: 'flat',
    transportCostRate: 4500,
    handlingCostRate: 1800,
    commissionPercent: 6.0, // Standard mandi agent commission
    packagingCost: 2200,
    storageCost: 0,
    otherFees: 850, // Mandi cess & weighbridge
    paymentTerms: 'Immediate to 2 business days settlement',
  },
  {
    id: 'channel-processor',
    channelName: 'Direct-to-Food Processor (Farmgate Pickup)',
    badge: 'Zero Commission',
    buyerType: 'Food Processing Firm',
    description:
      'Contracted ketchup / paste processing plant collects directly at farmgate. Buyer bears long-haul transportation.',
    quotedPricePerKg: 25.5, // Slightly lower base price, but zero freight and zero commission
    lossPercent: 3.0, // Minimal transit damage due to on-farm containerized loading
    transportCostMode: 'flat',
    transportCostRate: 0, // Farmgate collection by buyer fleet
    handlingCostRate: 900, // On-farm loading labor only
    commissionPercent: 0.0, // Disintermediated
    packagingCost: 1200, // Buyer supplies returnable plastic crates
    storageCost: 0,
    otherFees: 0,
    paymentTerms: 'Bank transfer within 7 days against quality check',
  },
  {
    id: 'channel-fpo',
    channelName: 'FPO Collective Cold-Chain Aggregation',
    badge: 'Cooperative Model',
    buyerType: 'Farmer Producer Org (FPO)',
    description:
      'Member-owned FPO aggregates produce in local pre-cooling center and supplies modern urban retail chains in bulk.',
    quotedPricePerKg: 27.2,
    lossPercent: 4.5,
    transportCostMode: 'flat',
    transportCostRate: 2200, // Shared freight optimization
    handlingCostRate: 1100,
    commissionPercent: 1.5, // Nominal FPO operations & revolving fund levy
    packagingCost: 1600,
    storageCost: 500, // Pre-cooling & short-term holding
    otherFees: 350,
    paymentTerms: 'Advance 50% + balance post delivery to retail buyer',
  },
];
