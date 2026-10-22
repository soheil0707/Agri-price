/**
 * AgriPrice Database Schema Types
 * Derived from docs/database-schema-proposal-v5.sql
 * For use with @supabase/supabase-js and @supabase/ssr clients.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRoleType =
  | 'farmer'
  | 'trader'
  | 'processor'
  | 'fpo_admin'
  | 'transporter'
  | 'cold_storage'
  | 'retailer'
  | 'consumer'
  | 'admin';

export type WeightUnitType = 'kg' | 'quintal' | 'tonne';

export type ListingStatusType =
  | 'draft'
  | 'active'
  | 'reserved'
  | 'fulfilled'
  | 'cancelled'
  | 'expired';

export type OfferStatusType =
  | 'pending'
  | 'countered'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type OrderStatusType =
  | 'awaiting_escrow'
  | 'escrow_funded'
  | 'in_transit'
  | 'delivered_inspected'
  | 'settled'
  | 'disputed'
  | 'cancelled';

export type PaymentEventType =
  | 'escrow_hold_authorized'
  | 'dispatch_advance_released'
  | 'quality_acceptance_confirmed'
  | 'farmer_proceeds_settled'
  | 'commission_fee_settled'
  | 'transporter_fee_settled'
  | 'refund_issued';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          full_name: string;
          phone_number: string;
          email: string | null;
          state: string;
          district: string;
          pincode: string;
          kyc_verified: boolean;
          bank_account_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          full_name: string;
          phone_number: string;
          email?: string | null;
          state: string;
          district: string;
          pincode: string;
          kyc_verified?: boolean;
          bank_account_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          full_name?: string;
          phone_number?: string;
          email?: string | null;
          state?: string;
          district?: string;
          pincode?: string;
          kyc_verified?: boolean;
          bank_account_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          profile_id: string;
          role: UserRoleType;
          assigned_at: string;
          assigned_by: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role: UserRoleType;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          role?: UserRoleType;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Relationships: [];
      };
      produce_listings: {
        Row: {
          id: string;
          seller_profile_id: string;
          title: string;
          commodity: string;
          variety: string;
          grade: string;
          harvest_quantity: number;
          quantity_unit: WeightUnitType;
          quantity_in_kg: number;
          reserved_quantity_kg: number;
          harvest_date: string;
          expected_shelf_life_days: number;
          farm_district: string;
          farm_state: string;
          farm_location_address: string;
          farm_pincode: string;
          latitude: number | null;
          longitude: number | null;
          target_price_per_kg: number | null;
          status: ListingStatusType;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_profile_id: string;
          title: string;
          commodity: string;
          variety: string;
          grade: string;
          harvest_quantity: number;
          quantity_unit?: WeightUnitType;
          quantity_in_kg?: number;
          reserved_quantity_kg?: number;
          harvest_date: string;
          expected_shelf_life_days: number;
          farm_district: string;
          farm_state: string;
          farm_location_address: string;
          farm_pincode: string;
          latitude?: number | null;
          longitude?: number | null;
          target_price_per_kg?: number | null;
          status?: ListingStatusType;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_profile_id?: string;
          title?: string;
          commodity?: string;
          variety?: string;
          grade?: string;
          harvest_quantity?: number;
          quantity_unit?: WeightUnitType;
          quantity_in_kg?: number;
          reserved_quantity_kg?: number;
          harvest_date?: string;
          expected_shelf_life_days?: number;
          farm_district?: string;
          farm_state?: string;
          farm_location_address?: string;
          farm_pincode?: string;
          latitude?: number | null;
          longitude?: number | null;
          target_price_per_kg?: number | null;
          status?: ListingStatusType;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      market_price_benchmarks: {
        Row: {
          id: string;
          mandi_name: string;
          market_center_district: string;
          market_center_state: string;
          commodity: string;
          variety: string;
          grade: string;
          min_price_per_kg: number;
          modal_price_per_kg: number;
          max_price_per_kg: number;
          source_attribution: string;
          recorded_at: string;
          is_live_feed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          mandi_name: string;
          market_center_district: string;
          market_center_state: string;
          commodity: string;
          variety: string;
          grade?: string;
          min_price_per_kg: number;
          modal_price_per_kg: number;
          max_price_per_kg: number;
          source_attribution?: string;
          recorded_at: string;
          is_live_feed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          mandi_name?: string;
          market_center_district?: string;
          market_center_state?: string;
          commodity?: string;
          variety?: string;
          grade?: string;
          min_price_per_kg?: number;
          modal_price_per_kg?: number;
          max_price_per_kg?: number;
          source_attribution?: string;
          recorded_at?: string;
          is_live_feed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      calculation_snapshots: {
        Row: {
          id: string;
          created_by_profile_id: string;
          listing_id: string | null;
          engine_version: string;
          input_payload: Json;
          output_payload: Json;
          original_quantity_kg: number;
          sellable_quantity_kg: number;
          expected_loss_percent: number;
          gross_revenue: number;
          total_deductions: number;
          estimated_net_proceeds: number;
          cultivation_cost_included: boolean;
          cultivation_cost_amount: number;
          estimated_net_farm_profit: number | null;
          assumptions_summary: Json;
          disclaimer_text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_by_profile_id: string;
          listing_id?: string | null;
          engine_version: string;
          input_payload: Json;
          output_payload: Json;
          original_quantity_kg: number;
          sellable_quantity_kg: number;
          expected_loss_percent: number;
          gross_revenue: number;
          total_deductions: number;
          estimated_net_proceeds: number;
          cultivation_cost_included?: boolean;
          cultivation_cost_amount?: number;
          estimated_net_farm_profit?: number | null;
          assumptions_summary: Json;
          disclaimer_text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_by_profile_id?: string;
          listing_id?: string | null;
          engine_version?: string;
          input_payload?: Json;
          output_payload?: Json;
          original_quantity_kg?: number;
          sellable_quantity_kg?: number;
          expected_loss_percent?: number;
          gross_revenue?: number;
          total_deductions?: number;
          estimated_net_proceeds?: number;
          cultivation_cost_included?: boolean;
          cultivation_cost_amount?: number;
          estimated_net_farm_profit?: number | null;
          assumptions_summary?: Json;
          disclaimer_text?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      offers_negotiations: {
        Row: {
          id: string;
          listing_id: string;
          buyer_profile_id: string;
          calculation_snapshot_id: string | null;
          offered_price_per_kg: number;
          offered_quantity_kg: number;
          delivery_terms: string;
          transport_borne_by: 'buyer' | 'seller' | 'shared';
          status: OfferStatusType;
          notes: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_profile_id: string;
          calculation_snapshot_id?: string | null;
          offered_price_per_kg: number;
          offered_quantity_kg: number;
          delivery_terms: string;
          transport_borne_by: 'buyer' | 'seller' | 'shared';
          status?: OfferStatusType;
          notes?: string | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          buyer_profile_id?: string;
          calculation_snapshot_id?: string | null;
          offered_price_per_kg?: number;
          offered_quantity_kg?: number;
          delivery_terms?: string;
          transport_borne_by?: 'buyer' | 'seller' | 'shared';
          status?: OfferStatusType;
          notes?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reservations_orders: {
        Row: {
          id: string;
          listing_id: string;
          accepted_offer_id: string;
          seller_profile_id: string;
          buyer_profile_id: string;
          assigned_transporter_id: string | null;
          locked_quantity_kg: number;
          agreed_price_per_kg: number;
          total_agreed_amount: number;
          escrow_status: OrderStatusType;
          pickup_scheduled_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          accepted_offer_id: string;
          seller_profile_id: string;
          buyer_profile_id: string;
          assigned_transporter_id?: string | null;
          locked_quantity_kg: number;
          agreed_price_per_kg: number;
          total_agreed_amount: number;
          escrow_status?: OrderStatusType;
          pickup_scheduled_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          accepted_offer_id?: string;
          seller_profile_id?: string;
          buyer_profile_id?: string;
          assigned_transporter_id?: string | null;
          locked_quantity_kg?: number;
          agreed_price_per_kg?: number;
          total_agreed_amount?: number;
          escrow_status?: OrderStatusType;
          pickup_scheduled_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      simulated_payment_events: {
        Row: {
          id: string;
          order_id: string;
          event_type: PaymentEventType;
          amount: number;
          currency: string;
          idempotency_key: string;
          payload_hash: string;
          source_account_ref: string | null;
          destination_account_ref: string | null;
          ledger_state: string;
          payload_audit: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_type: PaymentEventType;
          amount: number;
          currency?: string;
          idempotency_key: string;
          payload_hash: string;
          source_account_ref?: string | null;
          destination_account_ref?: string | null;
          ledger_state?: string;
          payload_audit: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          event_type?: PaymentEventType;
          amount?: number;
          currency?: string;
          idempotency_key?: string;
          payload_hash?: string;
          source_account_ref?: string | null;
          destination_account_ref?: string | null;
          ledger_state?: string;
          payload_audit?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          id: string;
          full_name: string;
          district: string;
          state: string;
          kyc_verified: boolean;
          created_at: string;
        };
        Relationships: [];
      };
      public_produce_listings: {
        Row: {
          id: string;
          seller_profile_id: string;
          title: string;
          commodity: string;
          variety: string;
          grade: string;
          harvest_quantity: number;
          quantity_unit: WeightUnitType;
          quantity_in_kg: number;
          reserved_quantity_kg: number;
          available_quantity_kg: number;
          harvest_date: string;
          expected_shelf_life_days: number;
          farm_district: string;
          farm_state: string;
          target_price_per_kg: number | null;
          status: ListingStatusType;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_current_profile_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      has_role: {
        Args: {
          p_profile_id: string;
          p_role: UserRoleType;
        };
        Returns: boolean;
      };
      assign_user_role: {
        Args: {
          p_target_profile_id: string;
          p_role: UserRoleType;
        };
        Returns: {
          success: boolean;
          already_assigned?: boolean;
          role_id: string;
          profile_id: string;
          role: string;
          assigned_by: string;
          assigned_at?: string;
        };
      };
      get_authorized_farm_location: {
        Args: {
          p_listing_id: string;
        };
        Returns: {
          listing_id: string;
          farm_location_address: string;
          farm_pincode: string;
          latitude: number | null;
          longitude: number | null;
        }[];
      };
      accept_offer_and_create_reservation: {
        Args: {
          p_offer_id: string;
        };
        Returns: string;
      };
      cancel_reservation_and_release_inventory: {
        Args: {
          p_order_id: string;
          p_cancellation_reason: string;
        };
        Returns: boolean;
      };
      record_simulated_payment_event: {
        Args: {
          p_order_id: string;
          p_event_type: PaymentEventType;
          p_amount: number;
          p_idempotency_key: string;
          p_payload_hash: string;
          p_audit: Json;
        };
        Returns: string;
      };
      dispatch_order_advance: {
        Args: {
          p_order_id: string;
          p_transporter_id: string;
          p_advance_amount: number;
          p_idempotency_key: string;
          p_payload_hash: string;
          p_audit: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type PublicProduceListing = Database['public']['Views']['public_produce_listings']['Row'];
export type PublicProfile = Database['public']['Views']['public_profiles']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProduceListing = Database['public']['Tables']['produce_listings']['Row'];
export type MarketPriceBenchmark = Database['public']['Tables']['market_price_benchmarks']['Row'];
export type CalculationSnapshot = Database['public']['Tables']['calculation_snapshots']['Row'];
export type OfferNegotiation = Database['public']['Tables']['offers_negotiations']['Row'];
export type ReservationOrder = Database['public']['Tables']['reservations_orders']['Row'];
export type SimulatedPaymentEvent = Database['public']['Tables']['simulated_payment_events']['Row'];
