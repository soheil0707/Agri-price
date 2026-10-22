'use client';

import React from 'react';
import { useMarketplace } from '../../lib/marketplace/MarketplaceContext';
import { useAuth } from '../AuthContext';
import {
  FarmerDashboard,
  ProcessorDashboard,
  TraderDashboard,
  ColdStorageDashboard,
  RetailerDashboard,
  ConsumerDashboard,
  AdminDashboard,
} from './dashboards';

interface OverviewViewProps {
  onOpenNewListingModal: () => void;
}

export function OverviewView({ onOpenNewListingModal }: OverviewViewProps) {
  const { currentPersona, activeRole } = useMarketplace();
  const { roles } = useAuth();

  // If viewing real authenticated account, dispatch based on authoritative database roles
  if (activeRole === 'authenticated') {
    const roleStrings = roles.map(String);
    if (roleStrings.includes('admin')) {
      return <AdminDashboard />;
    }
    if (roleStrings.includes('processor')) {
      return <ProcessorDashboard />;
    }
    if (roleStrings.includes('trader')) {
      return <TraderDashboard />;
    }
    if (roleStrings.includes('transporter')) {
      return <ColdStorageDashboard />;
    }
    if (roleStrings.includes('farmer') || roleStrings.includes('fpo_admin')) {
      return <FarmerDashboard onOpenNewListingModal={onOpenNewListingModal} />;
    }
  }

  // Role-Specific Dynamic Dashboard Dispatcher for Simulated Personas and Fallbacks
  switch (currentPersona.role) {
    case 'processor':
      return <ProcessorDashboard />;
    case 'trader':
      return <TraderDashboard />;
    case 'cold_storage':
      return <ColdStorageDashboard />;
    case 'retailer':
      return <RetailerDashboard />;
    case 'consumer':
      return <ConsumerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'farmer':
    case 'unassigned':
    case 'authenticated':
    default:
      return <FarmerDashboard onOpenNewListingModal={onOpenNewListingModal} />;
  }
}
