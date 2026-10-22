/**
 * AgriPrice Marketplace Data Types & Contracts
 * Supporting Farmer, Factory Buyer, Trader, Cold-Storage, and Consumer personas.
 */

import type { WeightUnit } from '../calculator/types';

export type UserPersonaRole =
  | 'authenticated'
  | 'farmer'
  | 'processor'
  | 'trader'
  | 'cold_storage'
  | 'retailer'
  | 'consumer'
  | 'admin'
  | 'unassigned';

export interface UserPersona {
  id: string;
  name: string;
  role: UserPersonaRole;
  roleLabel: string;
  organization: string;
  district: string;
  state: string;
  phone: string;
  email: string;
  kycStatus: 'verified' | 'pending' | 'unverified';
  bankAccountVerified: boolean;
  avatarEmoji: string;
  badge: string;
  isDemoPersona: boolean;
}

export interface MarketplaceProduceItem {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerDistrict: string;
  sellerState: string;
  sellerKycVerified: boolean;
  title: string;
  commodity: string;
  variety: string;
  grade: 'Grade-A (Export / Premium)' | 'Grade-B (Commercial)' | 'Grade-C (Processing)';
  totalQuantityKg: number;
  reservedQuantityKg: number;
  availableQuantityKg: number;
  quantityUnit: WeightUnit;
  targetPricePerKg: number;
  harvestDate: string;
  expectedShelfLifeDays: number;
  status: 'active' | 'reserved' | 'sold';
  isLiveDatabaseListing: boolean;
  tags: string[];
  emoji: string;
  createdAt: string;
}

export interface ProduceOffer {
  id: string;
  listingId: string;
  listingTitle: string;
  commodity: string;
  buyerId: string;
  buyerName: string;
  buyerOrganization: string;
  buyerRole: UserPersonaRole;
  sellerId: string;
  sellerName: string;
  offeredPricePerKg: number;
  offeredQuantityKg: number;
  deliveryTerms: 'Ex-Farmgate (Buyer Arranges Transport)' | 'Delivered to Factory (Seller Arranges Transport)' | 'Warehouse Drop-off' | string;
  transportBorneBy: 'buyer' | 'seller' | 'shared';
  status: 'pending' | 'accepted' | 'countered' | 'rejected' | 'withdrawn' | 'cancelled' | 'expired';
  notes?: string;
  counterPricePerKg?: number;
  expiresAt: string;
  createdAt: string;
  isLiveDatabaseOffer?: boolean;
}

export type OrderProgressState =
  | 'awaiting_escrow'
  | 'escrow_funded'
  | 'in_transit'
  | 'delivered_inspected'
  | 'settled'
  | 'cancelled'
  | 'disputed';

export interface MarketplaceOrder {
  id: string;
  orderNumber: string;
  listingId: string;
  offerId: string;
  commodity: string;
  variety: string;
  grade: string;
  sellerId: string;
  sellerName: string;
  sellerDistrict: string;
  buyerId: string;
  buyerName: string;
  buyerOrganization: string;
  lockedQuantityKg: number;
  agreedPricePerKg: number;
  totalAgreedAmount: number;
  escrowStatus: OrderProgressState;
  storageProvider?: string;
  transporterName?: string;
  pickupScheduledAt?: string;
  deliveredAt?: string;
  simulatedPaymentEventId?: string;
  createdAt: string;
  isLiveDatabaseOrder?: boolean;
}

export interface ColdStorageUnit {
  id: string;
  facilityName: string;
  operatorName: string;
  district: string;
  state: string;
  totalCapacityMt: number;
  availableCapacityMt: number;
  temperatureRange: string;
  suitableCommodities: string[];
  dailyRatePerQuintal: number;
  chamberCount: number;
  rating: number;
  certifications: string[];
  isLiveDatabaseRecord?: boolean;
}

export interface SimulatedPaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  eventType:
    | 'escrow_hold_authorized'
    | 'dispatch_advance_released'
    | 'quality_acceptance_confirmed'
    | 'farmer_proceeds_settled'
    | 'commission_fee_settled'
    | 'transporter_fee_settled'
    | 'refund_issued';
  eventTitle: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  payloadHash: string;
  sourceAccount: string;
  destinationAccount: string;
  ledgerState: 'COMMITTED' | 'PENDING';
  recordedAt: string;
  isLiveDatabasePayment?: boolean;
}

export interface ActivityNotification {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  category: 'listing' | 'offer' | 'order' | 'payment' | 'storage' | 'dispute' | 'system';
  severity?: 'info' | 'success' | 'warning' | 'critical';
  actionUrlTab?: string;
  read: boolean;
  readAt?: string | null;
  recipientProfileId?: string;
  createdAt?: string;
  isLiveDatabaseRecord?: boolean;
}

export interface MarketplaceDispute {
  id: string;
  orderNumber: string;
  orderId?: string;
  claimant: string;
  claimantRole: string;
  claimantProfileId?: string;
  respondent: string;
  respondentProfileId?: string;
  commodity: string;
  quantityKg: number;
  escrowLockedAmount: number;
  disputeReason: string;
  evidenceSummary: string;
  filedAt: string;
  status: 'under_review' | 'resolved_seller_paid' | 'resolved_buyer_refunded' | 'resolved_mutual_split' | 'dismissed';
  resolutionNotes?: string;
  createdAt?: string;
  resolvedAt?: string | null;
  isLiveDatabaseRecord?: boolean;
}

export interface RegionalMarketPrice {
  id?: string;
  commodity: string;
  variety: string;
  grade?: string;
  marketCenter: string;
  district: string;
  state: string;
  modalPricePerKg: number;
  minPricePerKg: number;
  maxPricePerKg: number;
  dayChangePercent: number;
  trend: 'up' | 'down' | 'steady';
  updatedAt: string;
  sourceAttribution?: string;
  isLiveFeed?: boolean;
  isLiveDatabaseRecord?: boolean;
}
