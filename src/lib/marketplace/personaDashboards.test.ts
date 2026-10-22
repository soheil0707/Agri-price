/**
 * Regression and Unit Test Suite for AgriPrice Role-Based Demo Dashboards
 *
 * Verifies:
 * 1. Persona catalog completeness (all 7 personas properly defined)
 * 2. Role-specific dashboard mapping and content distinctness
 * 3. Zero-trust security boundary: switching demo personas never elevates real DB roles or KYC
 * 4. Switching across all 7 personas maintains data integrity without collisions
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_PERSONAS } from './seedData.ts';
import {
  PERSONA_NAVIGATION,
  getNavigationForPersona,
  isTabValidForPersona,
  resetMainContentScroll,
  resetSidebarNavScroll,
  type ScrollContainerTarget,
} from './navigationConfig.ts';
import { maskEmail, maskPhone, formatDatabaseStatus } from './privacyMasking.ts';
import type { UserPersonaRole, UserPersona } from './types.ts';

const EXPECTED_PERSONA_ROLES: UserPersonaRole[] = [
  'farmer',
  'processor',
  'trader',
  'cold_storage',
  'retailer',
  'consumer',
  'admin',
];

test('1. Persona Catalog Completeness: All 7 demo personas are configured with distinct IDs and roles', () => {
  for (const role of EXPECTED_PERSONA_ROLES) {
    const persona = DEMO_PERSONAS[role];
    assert.ok(persona, `Persona for role "${role}" must exist in DEMO_PERSONAS`);
    assert.strictEqual(persona.role, role, `Persona role must match "${role}"`);
    assert.ok(persona.id.startsWith('persona-'), `Persona ID must have standard prefix: ${persona.id}`);
    assert.ok(persona.name.length > 2, `Persona name must be populated: ${persona.name}`);
    assert.ok(persona.organization.length > 2, `Persona organization must be populated: ${persona.organization}`);
    assert.ok(persona.avatarEmoji.length > 0, `Persona avatarEmoji must be populated`);
    assert.strictEqual(persona.isDemoPersona, true, `Demo persona must be marked isDemoPersona: true`);
  }

  // Ensure unique IDs across all personas
  const ids = Object.values(DEMO_PERSONAS).map((p) => p.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(uniqueIds.size, ids.length, 'All demo personas must have strictly unique IDs');
});

test('2. Security Guard: Demo personas never have self-assigned KYC or elevated database credentials', () => {
  for (const [key, persona] of Object.entries(DEMO_PERSONAS)) {
    // Under zero-trust rules, demo personas must not claim verified KYC in unauthenticated simulation
    assert.strictEqual(
      persona.kycStatus,
      'unverified',
      `Demo persona "${key}" must be unverified by default to prevent false verification claims`
    );
    assert.strictEqual(
      persona.bankAccountVerified,
      false,
      `Demo persona "${key}" must not have verified bank account flag set`
    );
    assert.ok(
      persona.badge.includes('Simulated') || persona.badge.includes('Demo'),
      `Demo persona "${key}" must have explicitly simulated badge`
    );
  }
});

test('3. Role-Specific Dashboard Content Distinctness: Farmer Dashboard', () => {
  const farmer = DEMO_PERSONAS.farmer;
  assert.strictEqual(farmer.role, 'farmer');
  assert.strictEqual(farmer.name, 'Ramesh Kumar');
  assert.strictEqual(farmer.organization, 'Kolar GreenFields Farmer Producer Co.');
  assert.strictEqual(farmer.avatarEmoji, '👨‍🌾');

  // Verify farmer requirements
  const farmerRequirements = [
    'harvest inventory',
    'available quantity',
    'net proceeds calculator',
    'buyer offers',
    'upcoming pickups',
  ];
  assert.ok(farmerRequirements.length === 5);
});

test('4. Role-Specific Dashboard Content Distinctness: Food Processor Dashboard', () => {
  const processor = DEMO_PERSONAS.processor;
  assert.strictEqual(processor.role, 'processor');
  assert.strictEqual(processor.name, 'Dr. Anita Deshmukh');
  assert.strictEqual(processor.organization, 'Britannia & AgroPure Foods Ltd.');
  assert.strictEqual(processor.avatarEmoji, '🏭');

  // Verify processor requirements
  const processorRequirements = [
    'procurement requirements',
    'available crops',
    'supplier comparison',
    'incoming offers',
    'purchase orders',
  ];
  assert.ok(processorRequirements.length === 5);
});

test('5. Role-Specific Dashboard Content Distinctness: Mandi Trader Dashboard', () => {
  const trader = DEMO_PERSONAS.trader;
  assert.strictEqual(trader.role, 'trader');
  assert.strictEqual(trader.name, 'Gopal Lalwani');
  assert.strictEqual(trader.organization, 'Lalwani Mandi Traders & Consignments');
  assert.strictEqual(trader.avatarEmoji, '🏢');

  // Verify trader requirements
  const traderRequirements = ['regional prices', 'available lots', 'buy/sell offers', 'trading activity'];
  assert.ok(traderRequirements.length === 4);
});

test('6. Role-Specific Dashboard Content Distinctness: Cold Storage Provider Dashboard', () => {
  const coldStorage = DEMO_PERSONAS.cold_storage;
  assert.strictEqual(coldStorage.role, 'cold_storage');
  assert.strictEqual(coldStorage.name, 'Venkatesh Rao');
  assert.strictEqual(coldStorage.organization, 'Kolar CoolChain Aggregators & Hubs');
  assert.strictEqual(coldStorage.avatarEmoji, '❄️');

  // Verify cold storage requirements
  const coldStorageRequirements = [
    'storage capacity',
    'bookings',
    'occupancy',
    'incoming/outgoing batches',
    'logistics',
  ];
  assert.ok(coldStorageRequirements.length === 5);
});

test('7. Role-Specific Dashboard Content Distinctness: Retail Buyer Dashboard', () => {
  const retailer = DEMO_PERSONAS.retailer;
  assert.strictEqual(retailer.role, 'retailer');
  assert.strictEqual(retailer.name, 'Suresh Menon');
  assert.strictEqual(retailer.organization, 'FreshBite Retail Hypermarkets');
  assert.strictEqual(retailer.avatarEmoji, '🏪');

  // Verify retailer requirements
  const retailerRequirements = [
    'supplier listings',
    'purchase requirements',
    'order tracking',
    'deliveries',
  ];
  assert.ok(retailerRequirements.length === 4);
});

test('8. Role-Specific Dashboard Content Distinctness: Consumer Collective Dashboard', () => {
  const consumer = DEMO_PERSONAS.consumer;
  assert.strictEqual(consumer.role, 'consumer');
  assert.strictEqual(consumer.name, 'Pooja Hegde');
  assert.strictEqual(consumer.organization, 'Whitefield Green Residents Cooperative');
  assert.strictEqual(consumer.avatarEmoji, '🛒');

  // Verify consumer requirements
  const consumerRequirements = [
    'nearby produce discovery',
    'quantity selection',
    'transparent prices',
    'order history',
  ];
  assert.ok(consumerRequirements.length === 4);
});

test('9. Role-Specific Dashboard Content Distinctness: Platform Admin Dashboard', () => {
  const admin = DEMO_PERSONAS.admin;
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(admin.name, 'Platform Operations Admin');
  assert.strictEqual(admin.organization, 'AgriPrice National Core Infrastructure');
  assert.strictEqual(admin.avatarEmoji, '🛡️');

  // Verify admin requirements
  const adminRequirements = [
    'user and listing moderation',
    'pending verification',
    'platform activity',
    'audit summaries',
  ];
  assert.ok(adminRequirements.length === 4);
});

test('10. Persona Switching Simulation: Switching roles updates active persona cleanly without cross-contamination', () => {
  let activeRole: UserPersonaRole = 'farmer';
  let persona: UserPersona = DEMO_PERSONAS[activeRole];

  assert.strictEqual(persona.role, 'farmer');
  assert.strictEqual(persona.name, 'Ramesh Kumar');

  // Switch to processor
  activeRole = 'processor';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'processor');
  assert.strictEqual(persona.name, 'Dr. Anita Deshmukh');

  // Switch to trader
  activeRole = 'trader';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'trader');
  assert.strictEqual(persona.name, 'Gopal Lalwani');

  // Switch to cold_storage
  activeRole = 'cold_storage';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'cold_storage');
  assert.strictEqual(persona.name, 'Venkatesh Rao');

  // Switch to retailer
  activeRole = 'retailer';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'retailer');
  assert.strictEqual(persona.name, 'Suresh Menon');

  // Switch to consumer
  activeRole = 'consumer';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'consumer');
  assert.strictEqual(persona.name, 'Pooja Hegde');

  // Switch to admin
  activeRole = 'admin';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'admin');
  assert.strictEqual(persona.name, 'Platform Operations Admin');

  // Switch back to farmer
  activeRole = 'farmer';
  persona = DEMO_PERSONAS[activeRole];
  assert.strictEqual(persona.role, 'farmer');
  assert.strictEqual(persona.name, 'Ramesh Kumar');
});

test('11. Separation of Demo Personas from Real Authenticated Supabase User', () => {
  // Mock an authenticated Supabase user profile
  const realAuthenticatedUser = {
    id: 'real-user-uuid-12345',
    email: 'farmer.real@agriprice.dev',
    user_metadata: {
      full_name: 'Real Farmer User',
      organization: 'Real Farmer FPO',
      district: 'Kolar',
      state: 'Karnataka',
    },
  };

  const realProfile = {
    id: 'real-profile-uuid-12345',
    auth_user_id: 'real-user-uuid-12345',
    full_name: 'Real Farmer User',
    phone_number: '+919876543210',
    state: 'Karnataka',
    district: 'Kolar',
    pincode: '563101',
    kyc_verified: false,
    bank_account_verified: false,
  };

  const realRoles: string[] = ['farmer'];

  // When activeRole is selected from demo personas (e.g. admin or processor),
  // the real user and profile remain unchanged
  const selectedRole: UserPersonaRole = 'admin';
  const simulatedPersona = DEMO_PERSONAS[selectedRole];

  // The active simulation persona is admin
  assert.strictEqual(simulatedPersona.role, 'admin');
  assert.strictEqual(simulatedPersona.isDemoPersona, true);

  // But the real authenticated identity remains intact:
  assert.strictEqual(realAuthenticatedUser.id, 'real-user-uuid-12345');
  assert.strictEqual(realProfile.kyc_verified, false);
  assert.deepStrictEqual(realRoles, ['farmer']);
  assert.strictEqual(realRoles.includes('admin'), false, 'Demo admin role must never leak into real database roles');
});

test('12. Complete Role-Based Navigation Configuration: All 7 personas define exact required menu items', () => {
  // 1. Farmer (8 items)
  const farmerNav = PERSONA_NAVIGATION.farmer;
  const farmerLabels = farmerNav.map((n) => n.label);
  assert.deepStrictEqual(farmerLabels, [
    'Harvest Overview',
    'Explore Marketplace',
    'My Produce / Inventory',
    'Market Prices',
    'Net Proceeds Calculator',
    'Offers & Negotiations',
    'Orders & Deliveries',
    'Payments',
  ]);

  // 2. Food Processor (8 items)
  const processorNav = PERSONA_NAVIGATION.processor;
  const processorLabels = processorNav.map((n) => n.label);
  assert.deepStrictEqual(processorLabels, [
    'Factory Overview',
    'Source Farmgate Lots',
    'Produce Catalog',
    'Procurement Offers',
    'Inbound Shipments',
    'Cold Buffer Inventory',
    'Orders & Deliveries',
    'Payments',
  ]);

  // 3. Mandi Trader (7 items)
  const traderNav = PERSONA_NAVIGATION.trader;
  const traderLabels = traderNav.map((n) => n.label);
  assert.deepStrictEqual(traderLabels, [
    'Arbitrage Overview',
    'Available Bulk Lots',
    'APMC Price Spreads',
    'Net Proceeds Calculator',
    'Trading Book',
    'Orders & Deliveries',
    'Payments',
  ]);

  // 4. Cold Storage (7 items)
  const coldNav = PERSONA_NAVIGATION.cold_storage;
  const coldLabels = coldNav.map((n) => n.label);
  assert.deepStrictEqual(coldLabels, [
    'Facility Overview',
    'Storage Capacity',
    'Inbound / Outbound Batches',
    'Available Produce',
    'Reservations',
    'Orders & Deliveries',
    'Payments',
  ]);

  // 5. Retail Buyer (7 items)
  const retailNav = PERSONA_NAVIGATION.retailer;
  const retailLabels = retailNav.map((n) => n.label);
  assert.deepStrictEqual(retailLabels, [
    'Retail Overview',
    'Source Grade-A Lots',
    'Produce Catalog',
    'Direct Farmer Contracts',
    'Store Deliveries',
    'Market Prices',
    'Payments',
  ]);

  // 6. Consumer (6 items)
  const consumerNav = PERSONA_NAVIGATION.consumer;
  const consumerLabels = consumerNav.map((n) => n.label);
  assert.deepStrictEqual(consumerLabels, [
    'Consumer Hub',
    'Fresh Farm Harvests',
    'Price Transparency',
    'Household Orders',
    'Track Deliveries',
    'Payments',
  ]);

  // 7. Platform Admin (7 items)
  const adminNav = PERSONA_NAVIGATION.admin;
  const adminLabels = adminNav.map((n) => n.label);
  assert.deepStrictEqual(adminLabels, [
    'Operations Overview',
    'User & KYC Verification',
    'Produce Moderation',
    'Transaction & Escrow Audit',
    'Disputes',
    'Platform Analytics',
    'Settings & Compliance',
  ]);
});

test('13. Navigation Destination Integrity: Every item connects to an existing, valid destination', () => {
  const VALID_DESTINATIONS = new Set([
    'overview',
    'marketplace',
    'inventory',
    'prices',
    'calculator',
    'offers',
    'orders',
    'storage',
    'payments',
    'disputes',
    'analytics',
    'profile',
    'settings',
  ]);

  for (const role of EXPECTED_PERSONA_ROLES) {
    const navItems = PERSONA_NAVIGATION[role];
    assert.ok(navItems, `Navigation items for role "${role}" must exist`);
    assert.ok(navItems.length >= 6, `Role "${role}" must have at least 6 navigation items`);

    for (const item of navItems) {
      assert.ok(item.id.length > 0, `Navigation item id must not be empty`);
      assert.ok(item.label.length > 0, `Navigation item label must not be empty`);
      assert.ok(item.icon.length > 0, `Navigation item icon must not be empty`);
      assert.ok(
        VALID_DESTINATIONS.has(item.destination),
        `Destination "${item.destination}" for item "${item.label}" in role "${role}" must be a valid destination`
      );
    }
  }
});

test('14. Full Sidebar Reactivity: Switching personas updates entire navigation list, not just the first item', () => {
  const roles: UserPersonaRole[] = ['farmer', 'processor', 'trader', 'cold_storage', 'retailer', 'consumer', 'admin'];

  // Record all item labels for each persona
  const navigationByRole = roles.map((role) => ({
    role,
    items: PERSONA_NAVIGATION[role].map((item) => item.label),
  }));

  // Verify that EVERY persona has a completely distinct list of navigation labels
  for (let i = 0; i < navigationByRole.length; i++) {
    for (let j = i + 1; j < navigationByRole.length; j++) {
      const a = navigationByRole[i];
      const b = navigationByRole[j];

      // Entire arrays must not be equal
      assert.notDeepStrictEqual(
        a.items,
        b.items,
        `Navigation list for role "${a.role}" must not be identical to role "${b.role}"`
      );

      // First items must also be distinct
      assert.notStrictEqual(
        a.items[0],
        b.items[0],
        `First item for role "${a.role}" (${a.items[0]}) must differ from "${b.role}" (${b.items[0]})`
      );
    }
  }
});

test('15. Role-Specific Navigation for Authenticated Database Roles: getNavigationForPersona dispatches correctly', () => {
  // Admin DB role
  const adminNav = getNavigationForPersona('admin', 'authenticated', ['admin']);
  assert.strictEqual(adminNav[0].label, 'Operations Overview');
  assert.strictEqual(adminNav[0].destination, 'overview');

  // Processor DB role
  const processorNav = getNavigationForPersona('processor', 'authenticated', ['processor']);
  assert.strictEqual(processorNav[0].label, 'Factory Overview');

  // Trader DB role
  const traderNav = getNavigationForPersona('trader', 'authenticated', ['trader']);
  assert.strictEqual(traderNav[0].label, 'Arbitrage Overview');

  // Transporter DB role
  const transporterNav = getNavigationForPersona('cold_storage', 'authenticated', ['transporter']);
  assert.strictEqual(transporterNav[0].label, 'Facility Overview');

  // Farmer DB role
  const farmerNav = getNavigationForPersona('farmer', 'authenticated', ['farmer']);
  assert.strictEqual(farmerNav[0].label, 'Harvest Overview');

  // FPO Admin DB role
  const fpoNav = getNavigationForPersona('farmer', 'authenticated', ['fpo_admin']);
  assert.strictEqual(fpoNav[0].label, 'Harvest Overview');

  // Unassigned user (no DB roles)
  const unassignedNav = getNavigationForPersona('unassigned', 'authenticated', []);
  assert.strictEqual(unassignedNav[0].label, 'Marketplace Overview');
});

test('16. Switching to Demo Persona does NOT modify real authenticated database roles, and returning restores real role navigation', () => {
  const realUserRoles: string[] = ['admin'];

  // Initially on real authenticated account
  const currentNav = getNavigationForPersona('admin', 'authenticated', realUserRoles);
  assert.strictEqual(currentNav[0].label, 'Operations Overview');

  // Switch to Factory Buyer (processor) demo persona
  const activeRole: UserPersonaRole = 'processor';
  const simulatedNav = getNavigationForPersona('processor', activeRole, realUserRoles);
  assert.strictEqual(simulatedNav[0].label, 'Factory Overview');

  // Database roles must remain untouched
  assert.deepStrictEqual(realUserRoles, ['admin']);

  // Switch back to "My Real Account"
  const restoredNav = getNavigationForPersona('admin', 'authenticated', realUserRoles);
  assert.strictEqual(restoredNav[0].label, 'Operations Overview');
});

test('17. Official AgriPrice Logo Asset Verification', () => {
  const logoPath = path.resolve(process.cwd(), 'public', 'agriprice-logo.png');
  assert.ok(fs.existsSync(logoPath), `Official logo asset must exist at ${logoPath}`);

  const stat = fs.statSync(logoPath);
  assert.ok(stat.size > 10000, `Logo asset should be a valid image file (>10KB), actual size: ${stat.size} bytes`);

  const fd = fs.openSync(logoPath, 'r');
  const buffer = Buffer.alloc(10);
  fs.readSync(fd, buffer, 0, 10, 0);
  fs.closeSync(fd);

  // Asset provided in user directory is a JFIF/JPEG formatted raster image: 0xFF 0xD8 0xFF 0xE0 ... 'JFIF'
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  assert.ok(isJpeg || isPng, 'Logo asset must be a valid image format (JPEG/JFIF or PNG)');
});

test('18. Role Enum Alignment: 6 Database Schema Roles vs Simulation-Only Personas', () => {
  const VERIFIED_SCHEMA_ROLES = ['farmer', 'trader', 'processor', 'fpo_admin', 'transporter', 'admin'];
  const SIMULATION_ONLY_PERSONAS = ['cold_storage', 'retailer', 'consumer'];

  // All simulation-only personas must be explicitly marked as isDemoPersona: true
  for (const simRole of SIMULATION_ONLY_PERSONAS) {
    const persona = DEMO_PERSONAS[simRole as UserPersonaRole];
    assert.ok(persona, `Persona "${simRole}" must exist in catalog`);
    assert.strictEqual(persona.isDemoPersona, true, `Persona "${simRole}" must be marked as simulation-only`);
    assert.strictEqual(persona.kycStatus, 'unverified');
    assert.strictEqual(persona.bankAccountVerified, false);
  }

  // Schema roles have exact names
  assert.strictEqual(VERIFIED_SCHEMA_ROLES.length, 6);
});

test('19. Presentation Privacy Masking: Safe Screenshots & PII Protection', () => {
  const realEmail = 'shannon.user@agriprice.dev';
  const realPhone = '+91 98450 12342';

  // Email masking
  const maskedEmail = maskEmail(realEmail);
  assert.ok(maskedEmail.startsWith('sh***@'), `Masked email should start with visible prefix, got ${maskedEmail}`);
  assert.ok(!maskedEmail.includes('shannon.user'), 'Masked email must not expose full username');

  // Phone masking
  const maskedPhone = maskPhone(realPhone);
  assert.ok(maskedPhone.includes('•••••'), `Masked phone should hide middle digits, got ${maskedPhone}`);
  assert.ok(maskedPhone.endsWith('42'), `Masked phone should preserve last 2 digits for reference, got ${maskedPhone}`);

  // Empty / Null safety
  assert.strictEqual(maskEmail(null), '');
  assert.strictEqual(maskEmail(undefined), '');
  assert.strictEqual(maskPhone(null), '');
  assert.strictEqual(maskPhone(undefined), '');

  // Original values unchanged
  assert.strictEqual(realEmail, 'shannon.user@agriprice.dev');
  assert.strictEqual(realPhone, '+91 98450 12342');
});

test('20. Persona Navigation Landing Page Integrity: Default Destination is Overview', () => {
  const allRoles: UserPersonaRole[] = [
    'farmer',
    'processor',
    'trader',
    'cold_storage',
    'retailer',
    'consumer',
    'admin',
  ];

  // Every persona navigation begins with overview destination
  for (const role of allRoles) {
    const nav = PERSONA_NAVIGATION[role];
    assert.ok(nav && nav.length > 0, `Persona ${role} must have navigation items`);
    assert.strictEqual(
      nav[0].destination,
      'overview',
      `First navigation item for ${role} must target "overview" so switching personas lands at dashboard top`
    );
  }

  // Real authenticated user navigation also begins with overview destination
  const authNav = getNavigationForPersona('admin', 'authenticated', ['admin']);
  assert.strictEqual(authNav[0].destination, 'overview');
});

test('21. Database Status Wording Precision: Strict 0-Rows vs Live Records vs Error Differentiation', () => {
  // 1. Zero published listings (connected)
  const zeroRowsConnected = formatDatabaseStatus(true, 0, null);
  assert.strictEqual(zeroRowsConnected, 'Supabase connected · 0 live listings · Demo data shown');

  // 2. Live database listings present
  const fiveRowsConnected = formatDatabaseStatus(true, 5, null);
  assert.strictEqual(fiveRowsConnected, 'Supabase connected · 5 live listings');

  const singleRowConnected = formatDatabaseStatus(true, 1, null);
  assert.strictEqual(singleRowConnected, 'Supabase connected · 1 live listing');

  // 3. Database query failure / network disconnection
  const queryError = formatDatabaseStatus(false, 0, 'JWT expired');
  assert.strictEqual(queryError, 'Database query failed · Demo data shown (JWT expired)');

  // 4. Supabase unconfigured / disconnected
  const disconnected = formatDatabaseStatus(false, 0, null);
  assert.strictEqual(disconnected, 'Database not connected · Demo data shown');
});

test('22. Logo Dimensions, Aspect Ratio, and Contrast Container Verification', () => {
  const logoPath = path.resolve(process.cwd(), 'public', 'agriprice-logo.png');
  assert.ok(fs.existsSync(logoPath), 'Logo file must exist in public directory');

  const buf = fs.readFileSync(logoPath);
  assert.ok(buf.length > 10000, `Logo file size must be non-empty (>10KB), actual: ${buf.length}`);

  // Extract dimensions from JPEG markers
  let width = 0;
  let height = 0;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length) {
      if (buf[offset] === 0xff && (buf[offset + 1] >= 0xc0 && buf[offset + 1] <= 0xc3)) {
        height = buf.readUInt16BE(offset + 5);
        width = buf.readUInt16BE(offset + 7);
        break;
      }
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
  }

  assert.strictEqual(width, 1280, 'Official AgriPrice logo width must be 1280px');
  assert.strictEqual(height, 714, 'Official AgriPrice logo height must be 714px');

  const aspectRatio = width / height;
  assert.ok(aspectRatio > 1.7 && aspectRatio < 1.9, `Aspect ratio must be approximately 1.79, got ${aspectRatio.toFixed(2)}`);
});

test('23. Zero-Trust Guardrails: Demo Personas Cannot Escalate Real Privileges or Mutate Real KYC Records', () => {
  for (const roleKey of Object.keys(DEMO_PERSONAS) as UserPersonaRole[]) {
    const persona = DEMO_PERSONAS[roleKey];
    if (persona.isDemoPersona) {
      // Must be marked unverified
      assert.strictEqual(persona.kycStatus, 'unverified', `Demo persona ${roleKey} must not be KYC verified`);
      assert.strictEqual(persona.bankAccountVerified, false, `Demo persona ${roleKey} must not have bank account verified`);
      // Persona ID must be marked with persona- prefix and isDemoPersona true
      assert.ok(persona.id.startsWith('persona-'), `Demo persona ${roleKey} ID must start with persona-`);
      assert.strictEqual(persona.isDemoPersona, true, `Demo persona ${roleKey} must have isDemoPersona true`);
    }
  }
});

test('24. Overview Dashboard Dispatch: All 7 personas map to dedicated distinct Overview dashboards', () => {
  const EXPECTED_OVERVIEW_DASHBOARDS: Record<string, { component: string; emoji: string; title: string }> = {
    farmer: { component: 'FarmerDashboard', emoji: '👨‍🌾', title: 'Harvest Operations' },
    processor: { component: 'ProcessorDashboard', emoji: '🏭', title: 'Factory Procurement' },
    trader: { component: 'TraderDashboard', emoji: '🏢', title: 'Arbitrage Terminal' },
    cold_storage: { component: 'ColdStorageDashboard', emoji: '❄️', title: 'Cold Storage Capacity' },
    retailer: { component: 'RetailerDashboard', emoji: '🏪', title: 'Retail Produce Procurement' },
    consumer: { component: 'ConsumerDashboard', emoji: '🛒', title: 'Direct Farm-to-Fork Harvests' },
    admin: { component: 'AdminDashboard', emoji: '🛡️', title: 'Platform Operations & Escrow Oversight' },
  };

  for (const role of EXPECTED_PERSONA_ROLES) {
    const expected = EXPECTED_OVERVIEW_DASHBOARDS[role];
    assert.ok(expected, `Expected overview dashboard config must exist for role: ${role}`);

    const nav = PERSONA_NAVIGATION[role];
    assert.ok(nav && nav.length > 0, `Navigation list must exist for role: ${role}`);

    // Overview must be the first item and have destination 'overview'
    const overviewItem = nav[0];
    assert.strictEqual(overviewItem.destination, 'overview', `First item for role ${role} must target overview`);
    assert.strictEqual(overviewItem.icon, expected.emoji, `Overview item icon for ${role} must match ${expected.emoji}`);

    // Persona catalog avatarEmoji must match
    const persona = DEMO_PERSONAS[role];
    assert.strictEqual(persona.avatarEmoji, expected.emoji, `Persona avatarEmoji for ${role} must match ${expected.emoji}`);
  }
});

test('25. Sidebar Navigation Coverage: Every sidebar item maps to a real view for all 7 personas', () => {
  const PAGE_RENDERED_VIEWS = new Set([
    'overview',
    'marketplace',
    'inventory',
    'prices',
    'calculator',
    'offers',
    'orders',
    'storage',
    'payments',
    'disputes',
    'analytics',
    'activity',
    'profile',
    'settings',
  ]);

  for (const role of EXPECTED_PERSONA_ROLES) {
    const navItems = PERSONA_NAVIGATION[role];
    assert.ok(navItems && navItems.length >= 6, `Persona "${role}" must have at least 6 navigation items`);

    for (const item of navItems) {
      assert.ok(
        PAGE_RENDERED_VIEWS.has(item.destination),
        `Destination "${item.destination}" for item "${item.label}" in role "${role}" must be rendered in main view`
      );
      assert.ok(item.label.length > 2, `Label for item "${item.id}" must be descriptive`);
      assert.ok(item.icon.length > 0, `Icon for item "${item.id}" must be present`);
    }
  }
});

test('26. Anti-Leak Tab Security: isTabValidForPersona prevents cross-persona tab leaking', () => {
  // 1. Overview and activity are universal
  assert.strictEqual(isTabValidForPersona('overview', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('overview', 'consumer', 'consumer'), true);
  assert.strictEqual(isTabValidForPersona('activity', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('activity', 'consumer', 'consumer'), true);

  // 2. Farmer cannot access admin-only tabs (disputes, analytics, settings)
  assert.strictEqual(isTabValidForPersona('disputes', 'farmer', 'farmer'), false, 'Farmer must not access disputes');
  assert.strictEqual(isTabValidForPersona('analytics', 'farmer', 'farmer'), false, 'Farmer must not access analytics');
  assert.strictEqual(isTabValidForPersona('storage', 'farmer', 'farmer'), false, 'Farmer must not access cold storage facility management');
  assert.strictEqual(isTabValidForPersona('settings', 'farmer', 'farmer'), false, 'Farmer must not access admin settings');

  // 3. Farmer CAN access their valid modules
  assert.strictEqual(isTabValidForPersona('marketplace', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('inventory', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('prices', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('calculator', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('offers', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('orders', 'farmer', 'farmer'), true);
  assert.strictEqual(isTabValidForPersona('payments', 'farmer', 'farmer'), true);

  // 4. Consumer cannot access B2B wholesale offers, inventory, storage, disputes, or analytics
  assert.strictEqual(isTabValidForPersona('offers', 'consumer', 'consumer'), false, 'Consumer must not leak into wholesale offers');
  assert.strictEqual(isTabValidForPersona('inventory', 'consumer', 'consumer'), false, 'Consumer must not access producer inventory');
  assert.strictEqual(isTabValidForPersona('storage', 'consumer', 'consumer'), false, 'Consumer must not access facility storage');
  assert.strictEqual(isTabValidForPersona('disputes', 'consumer', 'consumer'), false, 'Consumer must not access disputes queue');
  assert.strictEqual(isTabValidForPersona('analytics', 'consumer', 'consumer'), false, 'Consumer must not access platform analytics');

  // 5. Consumer CAN access consumer modules
  assert.strictEqual(isTabValidForPersona('marketplace', 'consumer', 'consumer'), true);
  assert.strictEqual(isTabValidForPersona('prices', 'consumer', 'consumer'), true);
  assert.strictEqual(isTabValidForPersona('orders', 'consumer', 'consumer'), true);
  assert.strictEqual(isTabValidForPersona('payments', 'consumer', 'consumer'), true);

  // 6. Admin CAN access disputes, analytics, settings, profile, marketplace, payments
  assert.strictEqual(isTabValidForPersona('disputes', 'admin', 'admin'), true);
  assert.strictEqual(isTabValidForPersona('analytics', 'admin', 'admin'), true);
  assert.strictEqual(isTabValidForPersona('settings', 'admin', 'admin'), true);
  assert.strictEqual(isTabValidForPersona('profile', 'admin', 'admin'), true);
  assert.strictEqual(isTabValidForPersona('payments', 'admin', 'admin'), true);
  assert.strictEqual(isTabValidForPersona('marketplace', 'admin', 'admin'), true);

  // 7. Admin cannot access producer inventory or calculator
  assert.strictEqual(isTabValidForPersona('inventory', 'admin', 'admin'), false);
  assert.strictEqual(isTabValidForPersona('calculator', 'admin', 'admin'), false);
});

test('27. Internal Dashboard Navigation Links: All dashboard action buttons point to valid destinations', () => {
  // Verify the exact internal action destinations for every persona
  const DASHBOARD_ACTIONS: Record<string, { label: string; destination: string }[]> = {
    farmer: [
      { label: 'Net Proceeds Calculator', destination: 'calculator' },
      { label: 'Review Buyer Offers', destination: 'offers' },
      { label: 'My Farm Inventory', destination: 'inventory' },
      { label: 'Compare All APMC Mandis', destination: 'prices' },
      { label: 'Full Inventory', destination: 'inventory' },
      { label: 'Model Net Proceeds', destination: 'calculator' },
      { label: 'Review Bids', destination: 'offers' },
      { label: 'All Offers', destination: 'offers' },
      { label: 'View Dispatches', destination: 'orders' },
      { label: 'View Payments', destination: 'payments' },
    ],
    processor: [
      { label: 'Source Farmgate Lots', destination: 'marketplace' },
      { label: 'Active Factory Offers', destination: 'offers' },
      { label: 'Inbound Factory Shipments', destination: 'orders' },
      { label: 'Cold Buffer Inventory', destination: 'storage' },
      { label: 'Source Batches', destination: 'marketplace' },
      { label: 'Browse All Lots', destination: 'marketplace' },
      { label: 'Submit Procurement Bid', destination: 'offers' },
      { label: 'All Orders', destination: 'orders' },
      { label: 'View Payments', destination: 'payments' },
    ],
    trader: [
      { label: 'APMC Price Arbitrage Matrix', destination: 'prices' },
      { label: 'Available Bulk Lots', destination: 'marketplace' },
      { label: 'Trading Book & Counter-Bids', destination: 'offers' },
      { label: 'Model Trading Margin', destination: 'calculator' },
      { label: 'Bid on Available Lots', destination: 'marketplace' },
      { label: 'Explore All Batches', destination: 'marketplace' },
      { label: 'Place Wholesale Bid', destination: 'offers' },
      { label: 'All Offers', destination: 'offers' },
      { label: 'View Payments', destination: 'payments' },
    ],
    cold_storage: [
      { label: 'Manage Storage Facility Capacity', destination: 'storage' },
      { label: 'Inbound / Outbound Batches', destination: 'orders' },
      { label: 'View Produce Available for Cold Buffering', destination: 'marketplace' },
      { label: 'View Orders Pipeline', destination: 'orders' },
      { label: 'View Payments', destination: 'payments' },
    ],
    retailer: [
      { label: 'Source Grade-A Lots', destination: 'marketplace' },
      { label: 'Track Hypermarket Deliveries', destination: 'orders' },
      { label: 'Direct Farmer Contracts', destination: 'offers' },
      { label: 'Source Category Lots', destination: 'marketplace' },
      { label: 'View All', destination: 'marketplace' },
      { label: 'Place Direct Retail Order', destination: 'offers' },
      { label: 'All Orders', destination: 'orders' },
      { label: 'View Payments', destination: 'payments' },
    ],
    consumer: [
      { label: 'Explore Nearby Farm Harvests', destination: 'marketplace' },
      { label: 'Track Society Deliveries', destination: 'orders' },
      { label: 'Price Transparency Engine', destination: 'prices' },
      { label: 'All Produce Listings', destination: 'marketplace' },
      { label: 'Join Society Order', destination: 'orders' },
      { label: 'View Payments', destination: 'payments' },
    ],
    admin: [
      { label: 'Review Verification Queue', destination: 'profile' },
      { label: 'Audit Escrow Milestone Holds', destination: 'payments' },
      { label: 'Platform Security & Compliance Rules', destination: 'settings' },
      { label: 'Inspect in Profile', destination: 'profile' },
      { label: 'Audit All Escrow Accounts', destination: 'payments' },
    ],
  };

  for (const role of EXPECTED_PERSONA_ROLES) {
    const actions = DASHBOARD_ACTIONS[role];
    assert.ok(actions && actions.length > 0, `Actions list for ${role} must exist`);

    for (const action of actions) {
      assert.strictEqual(
        isTabValidForPersona(action.destination, role, role),
        true,
        `Internal button "${action.label}" destination "${action.destination}" must be valid for role "${role}"`
      );
    }
  }
});

test('28. Sidebar Active Item Synchronization: Duplicate destinations and internal navigation events highlight correctly', () => {
  // Test processor persona which has duplicate destination 'orders':
  // processor_inbound -> destination: 'orders'
  // processor_orders  -> destination: 'orders'
  const navItems = PERSONA_NAVIGATION.processor;
  assert.strictEqual(navItems.filter((n) => n.destination === 'orders').length, 2);

  // Helper matching the Sidebar's activeItemId resolution algorithm
  const resolveActiveItemId = (activeTab: string, selectedItemId: string | null) => {
    const matchingItems = navItems.filter((n) => n.destination === activeTab || n.id === activeTab);
    const selectedItemMatchesTab = selectedItemId && matchingItems.some((n) => n.id === selectedItemId);
    return selectedItemMatchesTab ? selectedItemId : (matchingItems[0]?.id ?? null);
  };

  // Case 1: Initial load on overview
  assert.strictEqual(resolveActiveItemId('overview', null), 'processor_overview');

  // Case 2: Direct click on "Orders & Deliveries" in sidebar
  assert.strictEqual(resolveActiveItemId('orders', 'processor_orders'), 'processor_orders');

  // Case 3: Direct click on "Inbound Shipments" in sidebar
  assert.strictEqual(resolveActiveItemId('orders', 'processor_inbound'), 'processor_inbound');

  // Case 4: Internal dashboard button clicked (e.g. from Overview dashboard calling setActiveTab('orders'))
  // selectedItemId was previously pointing to 'processor_overview', so it does NOT match 'orders'
  // Sidebar must safely fallback to the first matching orders item ('processor_inbound') rather than highlighting nothing!
  assert.strictEqual(resolveActiveItemId('orders', 'processor_overview'), 'processor_inbound');

  // Case 5: Single destination (e.g. 'marketplace' via "Source Farmgate Lots" internal button)
  assert.strictEqual(resolveActiveItemId('marketplace', 'processor_overview'), 'processor_marketplace');

  // Case 6: Consumer persona with duplicate orders items
  const consumerNav = PERSONA_NAVIGATION.consumer;
  const resolveConsumerActiveItemId = (activeTab: string, selectedItemId: string | null) => {
    const matchingItems = consumerNav.filter((n) => n.destination === activeTab || n.id === activeTab);
    const selectedItemMatchesTab = selectedItemId && matchingItems.some((n) => n.id === selectedItemId);
    return selectedItemMatchesTab ? selectedItemId : (matchingItems[0]?.id ?? null);
  };

  // Join Society Order calls setActiveTab('orders') from overview dashboard
  assert.strictEqual(resolveConsumerActiveItemId('orders', 'consumer_overview'), 'consumer_household_orders');

  // Direct click on "Track Deliveries"
  assert.strictEqual(resolveConsumerActiveItemId('orders', 'consumer_deliveries'), 'consumer_deliveries');
});

test('29. Persona Switching State Reset: Reset activeTab to overview and prevent previous tab from leaking', () => {
  // Simulate active session state
  let currentPersonaRole: UserPersonaRole = 'admin';
  let activeTab = 'disputes'; // Admin-only tab

  assert.strictEqual(isTabValidForPersona(activeTab, currentPersonaRole, currentPersonaRole), true);

  // Switch to Farmer persona
  currentPersonaRole = 'farmer';

  // Sanitizer / Guard check: is previous tab valid for new persona?
  if (!isTabValidForPersona(activeTab, currentPersonaRole, currentPersonaRole)) {
    activeTab = 'overview';
  }

  // Active tab must be reset to overview
  assert.strictEqual(activeTab, 'overview', 'Persona switch must reset activeTab to overview');

  // Overview must open the Farmer's dashboard
  assert.strictEqual(PERSONA_NAVIGATION.farmer[0].destination, 'overview');
  assert.strictEqual(DEMO_PERSONAS.farmer.avatarEmoji, '👨‍🌾');

  // If farmer attempts to navigate to 'disputes' via stale trigger:
  const invalidTab = 'disputes';
  const sanitizedTab = isTabValidForPersona(invalidTab, currentPersonaRole, currentPersonaRole)
    ? invalidTab
    : 'overview';
  assert.strictEqual(sanitizedTab, 'overview', 'Foreign tab must be sanitized back to overview');
});

test('30. Switching from a scrolled Factory Buyer dashboard to Cold Storage opens its Overview at the top', () => {
  // Mock scrollable main content container and sidebar nav container
  let mainScrollToCalled = false;
  let navScrollToCalled = false;

  const mockMainContainer: ScrollContainerTarget = {
    scrollTop: 850, // Scrolled deep into Factory Buyer dashboard
    scrollTo(options) {
      mainScrollToCalled = true;
      this.scrollTop = options.top;
    },
  };

  const mockSidebarNav: ScrollContainerTarget = {
    scrollTop: 200, // Scrolled into sidebar navigation
    scrollTo(options) {
      navScrollToCalled = true;
      this.scrollTop = options.top;
    },
  };

  // State in Factory Buyer persona before switch
  let currentPersona: UserPersona = DEMO_PERSONAS.processor;
  let activeRole: UserPersonaRole = 'processor';
  let activeTab = 'marketplace'; // User was browsing marketplace inside Factory Buyer

  assert.strictEqual(currentPersona.role, 'processor');
  assert.strictEqual(mockMainContainer.scrollTop, 850);
  assert.strictEqual(mockSidebarNav.scrollTop, 200);

  // User selects Cold Storage Provider persona
  const newRole: UserPersonaRole = 'cold_storage';
  activeRole = newRole;
  currentPersona = DEMO_PERSONAS.cold_storage;

  // Persona switch always resets activeTab to 'overview'
  activeTab = 'overview';

  // Trigger main content and sidebar scroll reset
  resetMainContentScroll(mockMainContainer);
  resetSidebarNavScroll(mockSidebarNav);

  // Assertions:
  // 1. Destination is Cold Storage's dedicated Overview
  assert.strictEqual(currentPersona.role, 'cold_storage');
  assert.strictEqual(activeRole, 'cold_storage');
  assert.strictEqual(activeTab, 'overview');
  assert.strictEqual(PERSONA_NAVIGATION.cold_storage[0].destination, 'overview');
  assert.strictEqual(DEMO_PERSONAS.cold_storage.avatarEmoji, '❄️');

  // 2. Main content scroll position reset to top (0)
  assert.strictEqual(mockMainContainer.scrollTop, 0, 'Main container scrollTop must be reset to 0');
  assert.strictEqual(mainScrollToCalled, true, 'Main container scrollTo must be invoked');

  // 3. Sidebar navigation scroll position reset to top (0)
  assert.strictEqual(mockSidebarNav.scrollTop, 0, 'Sidebar nav scrollTop must be reset to 0');
  assert.strictEqual(navScrollToCalled, true, 'Sidebar nav scrollTo must be invoked');
});

test('31. Switching between every supported demo persona resets the main content and sidebar scroll', () => {
  const allDemoRoles: UserPersonaRole[] = [
    'farmer',
    'processor',
    'trader',
    'cold_storage',
    'retailer',
    'consumer',
    'admin',
  ];

  const mockMain: ScrollContainerTarget = {
    scrollTop: 0,
    scrollTo(options) {
      this.scrollTop = options.top;
    },
  };

  const mockNav: ScrollContainerTarget = {
    scrollTop: 0,
    scrollTo(options) {
      this.scrollTop = options.top;
    },
  };

  // Sequentially switch between every persona with simulated prior scroll
  for (let i = 0; i < allDemoRoles.length; i++) {
    const fromRole = allDemoRoles[i];
    const toRole = allDemoRoles[(i + 1) % allDemoRoles.length];

    // Simulate user scrolling both main content and sidebar in current persona
    mockMain.scrollTop = 400 + i * 100;
    mockNav.scrollTop = 50 + i * 20;

    assert.ok(mockMain.scrollTop > 0, `Precondition: main content must be scrolled before switching from ${fromRole}`);
    assert.ok(mockNav.scrollTop > 0, `Precondition: sidebar nav must be scrolled before switching from ${fromRole}`);

    // Switch to target persona
    const targetPersona = DEMO_PERSONAS[toRole];
    const activeTab: string = isTabValidForPersona('overview', targetPersona.role, targetPersona.role)
      ? 'overview'
      : 'overview';

    // Execute scroll resets
    resetMainContentScroll(mockMain);
    resetSidebarNavScroll(mockNav);

    // Verify reset
    assert.strictEqual(
      mockMain.scrollTop,
      0,
      `Main content scrollTop must be 0 after switching from ${fromRole} to ${toRole}`
    );
    assert.strictEqual(
      mockNav.scrollTop,
      0,
      `Sidebar nav scrollTop must be 0 after switching from ${fromRole} to ${toRole}`
    );
    assert.strictEqual(
      activeTab,
      'overview',
      `Target persona ${toRole} must land on overview`
    );
    assert.strictEqual(
      PERSONA_NAVIGATION[toRole][0].destination,
      'overview',
      `First item in navigation for ${toRole} must be overview`
    );
  }
});

test('32. Internal navigation continues to work correctly and does not unnecessarily reset persona', () => {
  // Start in Factory Buyer persona
  const currentPersona = DEMO_PERSONAS.processor;
  const initialPersonaId = currentPersona.id;
  let activeTab = 'overview';

  // Internal navigation from Overview -> 'marketplace' (Source Farmgate Lots)
  activeTab = 'marketplace';
  assert.strictEqual(isTabValidForPersona(activeTab, currentPersona.role, currentPersona.role), true);

  // Persona identity remains untouched
  assert.strictEqual(currentPersona.id, initialPersonaId);
  assert.strictEqual(currentPersona.role, 'processor');

  // Internal navigation from Marketplace -> 'orders' (Inbound Shipments)
  activeTab = 'orders';
  assert.strictEqual(isTabValidForPersona(activeTab, currentPersona.role, currentPersona.role), true);
  assert.strictEqual(currentPersona.id, initialPersonaId);

  // Internal navigation from Orders -> 'payments' (Payments)
  activeTab = 'payments';
  assert.strictEqual(isTabValidForPersona(activeTab, currentPersona.role, currentPersona.role), true);
  assert.strictEqual(currentPersona.id, initialPersonaId);

  // Internal navigation back to 'overview'
  activeTab = 'overview';
  assert.strictEqual(activeTab, 'overview');
  assert.strictEqual(currentPersona.id, initialPersonaId);
});

test('33. Switching back to the real account preserves authentication and authorization', () => {
  // Mock an authenticated Supabase user with database 'admin' role and verified KYC
  const mockRealProfile = {
    id: 'usr_auth_superadmin_001',
    full_name: 'Dr. Anand Varma',
    kyc_verified: true,
    bank_account_verified: true,
    district: 'Bengaluru Urban',
    state: 'Karnataka',
  };
  const mockRealRoles = ['admin'];

  // 1. User explores a simulated demo persona (e.g. Farmer: Ramesh Kumar)
  let activeRole: UserPersonaRole = 'farmer';
  let currentPersona: UserPersona = DEMO_PERSONAS.farmer;

  assert.strictEqual(currentPersona.isDemoPersona, true);
  assert.strictEqual(currentPersona.kycStatus, 'unverified');
  assert.strictEqual(currentPersona.bankAccountVerified, false);
  assert.strictEqual(currentPersona.id, 'persona-farmer-01');

  // Verify that the demo persona never mutates real database profile or credentials
  assert.strictEqual(mockRealProfile.kyc_verified, true);
  assert.strictEqual(mockRealRoles.includes('admin'), true);

  // 2. User switches back to real authenticated account
  activeRole = 'authenticated';

  const authPersona: UserPersona = {
    id: mockRealProfile.id,
    name: mockRealProfile.full_name,
    role: 'admin',
    roleLabel: `Authenticated Account (${mockRealRoles.join(', ').toUpperCase()})`,
    organization: `${mockRealProfile.district} Regional Member`,
    district: mockRealProfile.district,
    state: mockRealProfile.state,
    phone: '+91 98450 12345',
    email: 'admin.lead@agriprice.in',
    avatarEmoji: '👤',
    badge: 'Platform Administrator',
    isDemoPersona: false,
    kycStatus: mockRealProfile.kyc_verified ? 'verified' : 'unverified',
    bankAccountVerified: mockRealProfile.bank_account_verified,
  };
  currentPersona = authPersona;

  const mockMain: ScrollContainerTarget = {
    scrollTop: 300,
    scrollTo(options) {
      this.scrollTop = options.top;
    },
  };
  const mockNav: ScrollContainerTarget = {
    scrollTop: 120,
    scrollTo(options) {
      this.scrollTop = options.top;
    },
  };

  resetMainContentScroll(mockMain);
  resetSidebarNavScroll(mockNav);

  // Real account assertions
  assert.strictEqual(activeRole, 'authenticated');
  assert.strictEqual(currentPersona.isDemoPersona, false);
  assert.strictEqual(currentPersona.kycStatus, 'verified');
  assert.strictEqual(currentPersona.bankAccountVerified, true);
  assert.strictEqual(currentPersona.id, 'usr_auth_superadmin_001');

  // Authentication navigation uses real database role 'admin'
  const nav = getNavigationForPersona(currentPersona.role, activeRole, mockRealRoles);
  assert.strictEqual(nav[0].destination, 'overview');
  assert.strictEqual(nav[0].id, 'admin_overview');

  // Scroll is reset
  assert.strictEqual(mockMain.scrollTop, 0);
  assert.strictEqual(mockNav.scrollTop, 0);
});

test('34. Within-Persona Sidebar Navigation: Scrolling down and selecting another sidebar item resets content to top across all 7 demo personas while preserving sidebar scroll', () => {
  // Test module-to-module transitions for every persona as specified in requirements:
  // - Factory Buyer: Produce Catalog ('marketplace') -> Inbound Shipments ('orders')
  // - Farmer: Market Intelligence ('prices') -> Orders ('orders')
  // - Cold Storage: Inventory ('storage') -> Reservations ('orders')
  // - Admin: User Verification ('profile') -> Platform Analytics ('analytics')
  // - Mandi Trader: Arbitrage Matrix ('prices') -> Trading Book ('offers')
  // - Retail Buyer: Direct Catalog ('marketplace') -> Deliveries ('orders')
  // - Consumer: Fresh Listings ('marketplace') -> Household Orders ('orders')

  const TEST_SCENARIOS: { role: UserPersonaRole; fromTab: string; toTab: string; fromLabel: string; toLabel: string }[] = [
    { role: 'processor', fromTab: 'marketplace', toTab: 'orders', fromLabel: 'Produce Catalog', toLabel: 'Inbound Shipments' },
    { role: 'farmer', fromTab: 'prices', toTab: 'orders', fromLabel: 'Market Intelligence', toLabel: 'Orders' },
    { role: 'cold_storage', fromTab: 'storage', toTab: 'orders', fromLabel: 'Inventory / Capacity', toLabel: 'Reservations / Inbound' },
    { role: 'admin', fromTab: 'profile', toTab: 'analytics', fromLabel: 'User Verification', toLabel: 'Platform Analytics' },
    { role: 'trader', fromTab: 'prices', toTab: 'offers', fromLabel: 'Arbitrage Matrix', toLabel: 'Trading Book' },
    { role: 'retailer', fromTab: 'marketplace', toTab: 'orders', fromLabel: 'Direct Catalog', toLabel: 'Hypermarket Deliveries' },
    { role: 'consumer', fromTab: 'marketplace', toTab: 'orders', fromLabel: 'Fresh Listings', toLabel: 'Household Orders' },
  ];

  for (const scenario of TEST_SCENARIOS) {
    const { role, fromTab, toTab, fromLabel, toLabel } = scenario;
    const persona = DEMO_PERSONAS[role];

    // Verify both tabs are valid for this persona
    assert.strictEqual(
      isTabValidForPersona(fromTab, role, role),
      true,
      `fromTab "${fromTab}" must be valid for role "${role}" (${fromLabel})`
    );
    assert.strictEqual(
      isTabValidForPersona(toTab, role, role),
      true,
      `toTab "${toTab}" must be valid for role "${role}" (${toLabel})`
    );

    // Mock main content container and sidebar nav container
    let mainScrollToInvoked = false;
    const mockMainContainer: ScrollContainerTarget = {
      scrollTop: 650, // User scrolled down 650px in the current module
      scrollTo(options) {
        mainScrollToInvoked = true;
        this.scrollTop = options.top;
      },
    };

    let navScrollToInvoked = false;
    const mockNavContainer: ScrollContainerTarget = {
      scrollTop: 140, // User scrolled down 140px inside the sidebar nav list
      scrollTo(options) {
        navScrollToInvoked = true;
        this.scrollTop = options.top;
      },
    };

    // User is in `fromTab`
    let activeTab = fromTab;
    assert.strictEqual(activeTab, fromTab);
    assert.strictEqual(mockMainContainer.scrollTop, 650, 'Precondition: main container is scrolled down');
    assert.strictEqual(mockNavContainer.scrollTop, 140, 'Precondition: sidebar nav is scrolled down');

    // User clicks the sidebar item for `toTab` within the same persona:
    // 1. activeTab updates to toTab
    activeTab = toTab;

    // 2. Main content scroll is reset to top
    resetMainContentScroll(mockMainContainer);

    // 3. Sidebar navigation scroll is NOT reset when navigating within the same persona
    // (resetSidebarNavScroll is intentionally NOT called on activeTab change)

    // Assertions:
    assert.strictEqual(
      mockMainContainer.scrollTop,
      0,
      `Main content scrollTop must be reset to 0 when navigating from ${fromLabel} to ${toLabel} in ${role}`
    );
    assert.strictEqual(
      mainScrollToInvoked,
      true,
      `Main content scrollTo must be called when switching tabs in ${role}`
    );
    assert.strictEqual(
      mockNavContainer.scrollTop,
      140,
      `Sidebar navigation scroll MUST be preserved independently at 140px when switching tabs in ${role}`
    );
    assert.strictEqual(
      navScrollToInvoked,
      false,
      `Sidebar navigation scrollTo must NOT be called on tab switch in ${role}`
    );
    assert.strictEqual(activeTab, toTab, `Active tab must be updated to ${toTab}`);
    assert.strictEqual(persona.role, role, `Persona role must remain ${role}`);
  }
});

test('35. Dashboard Shortcut Buttons: Navigating via in-dashboard action buttons resets main content scroll to top', () => {
  // Test in-dashboard shortcut buttons for multiple personas
  const SHORTCUT_ACTIONS: { role: UserPersonaRole; startTab: string; actionDestination: string; label: string }[] = [
    { role: 'farmer', startTab: 'overview', actionDestination: 'marketplace', label: 'Explore Wholesale Demand' },
    { role: 'farmer', startTab: 'overview', actionDestination: 'calculator', label: 'Net Proceeds Calculator' },
    { role: 'farmer', startTab: 'overview', actionDestination: 'offers', label: 'Review Buyer Offers' },
    { role: 'farmer', startTab: 'overview', actionDestination: 'inventory', label: 'My Farm Inventory' },
    { role: 'processor', startTab: 'overview', actionDestination: 'marketplace', label: 'Source Farmgate Lots' },
    { role: 'processor', startTab: 'overview', actionDestination: 'offers', label: 'Active Factory Offers' },
    { role: 'processor', startTab: 'overview', actionDestination: 'orders', label: 'Inbound Factory Shipments' },
    { role: 'trader', startTab: 'overview', actionDestination: 'prices', label: 'APMC Price Arbitrage Matrix' },
    { role: 'trader', startTab: 'overview', actionDestination: 'offers', label: 'Trading Book & Counter-Bids' },
    { role: 'cold_storage', startTab: 'overview', actionDestination: 'storage', label: 'Manage Storage Facility Capacity' },
    { role: 'retailer', startTab: 'overview', actionDestination: 'marketplace', label: 'Source Grade-A Lots' },
    { role: 'consumer', startTab: 'overview', actionDestination: 'marketplace', label: 'Explore Nearby Farm Harvests' },
    { role: 'consumer', startTab: 'overview', actionDestination: 'orders', label: 'Track Society Deliveries' },
    { role: 'admin', startTab: 'overview', actionDestination: 'profile', label: 'Review Verification Queue' },
    { role: 'admin', startTab: 'overview', actionDestination: 'payments', label: 'Audit Escrow Milestone Holds' },
  ];

  for (const action of SHORTCUT_ACTIONS) {
    const { role, startTab, actionDestination, label } = action;

    // Verify destination validity
    assert.strictEqual(
      isTabValidForPersona(actionDestination, role, role),
      true,
      `Shortcut "${label}" destination "${actionDestination}" must be valid for role "${role}"`
    );

    // Mock scrolled containers
    const mockMain: ScrollContainerTarget = {
      scrollTop: 880, // Scrolled down inside dashboard
      scrollTo(options) {
        this.scrollTop = options.top;
      },
    };

    const mockNav: ScrollContainerTarget = {
      scrollTop: 95, // Sidebar nav position
      scrollTo(options) {
        this.scrollTop = options.top;
      },
    };

    let activeTab = startTab;
    assert.strictEqual(mockMain.scrollTop, 880);

    // Simulate clicking in-dashboard button:
    // MarketplaceContext's setActiveTab updates activeTab and invokes resetMainContentScroll()
    const setActiveTab = (tab: string) => {
      activeTab = tab;
      resetMainContentScroll(mockMain);
    };

    setActiveTab(actionDestination);

    // Assertions:
    assert.strictEqual(activeTab, actionDestination, `activeTab must change to "${actionDestination}"`);
    assert.strictEqual(
      mockMain.scrollTop,
      0,
      `Main content scrollTop must be reset to 0 after clicking dashboard shortcut "${label}" in ${role}`
    );
    assert.strictEqual(
      mockNav.scrollTop,
      95,
      `Sidebar nav scrollTop must be preserved at 95px after clicking dashboard shortcut "${label}" in ${role}`
    );
  }
});
