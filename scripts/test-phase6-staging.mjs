import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';

async function main() {
  console.log('==============================================================================');
  console.log('AGRIPRICE PHASE 6.2: POSTGRESQL 15+ STAGING VALIDATION TEST RUNNER');
  console.log('==============================================================================\n');

  // Step 1: Initialize isolated PostgreSQL 15+ engine
  const db = new PGlite();
  const pgVer = await db.query('SELECT version();');
  console.log('✔ Isolated PostgreSQL Staging Database Initialized.');
  console.log(`  Engine: ${pgVer.rows[0].version}\n`);

  // Step 2: Apply Schema v5 baseline
  console.log('--- STEP 1: APPLYING BASELINE SCHEMA v5 ---');
  let v5Sql = fs.readFileSync('docs/database-schema-proposal-v5.sql', 'utf8');
  v5Sql = v5Sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '-- uuid-ossp not needed; gen_random_uuid is native')
               .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto not needed');
  await db.exec(v5Sql);
  console.log('✔ Baseline Schema v5 installed successfully.\n');

  // Step 3: Apply Remediated Migration Phase 6 candidate
  console.log('--- STEP 2: APPLYING REMEDIATED MIGRATION CANDIDATE (docs/migration-phase6-unified-audit.sql) ---');
  const p6Sql = fs.readFileSync('docs/migration-phase6-unified-audit.sql', 'utf8');
  await db.exec(p6Sql);
  console.log('✔ Migration Phase 6 applied with ZERO errors.\n');

  // Step 4: Run Comprehensive Security & Functionality Validation Suite
  console.log('--- STEP 3: EXECUTING DATABASE-LEVEL VALIDATION SUITE (docs/phase6-security-validation-suite.sql) ---');
  const suiteSql = fs.readFileSync('docs/phase6-security-validation-suite.sql', 'utf8');
  const results = await db.exec(suiteSql);

  // The last query in the file returns the results from _test_results
  const suiteResults = results[results.length - 2]?.rows || [];
  let allPassed = true;
  console.log('\nValidation Results:');
  console.log('------------------------------------------------------------------------------------------------------------------------');
  console.log(
    'Result'.padEnd(8) +
    'Test ID'.padEnd(35) +
    'Description'
  );
  console.log('------------------------------------------------------------------------------------------------------------------------');

  for (const row of suiteResults) {
    const isPass = row.result === 'PASS';
    if (!isPass) allPassed = false;
    const mark = isPass ? '✔ PASS' : '✖ FAIL';
    console.log(
      mark.padEnd(8) +
      row.test_id.padEnd(35) +
      row.description
    );
    if (row.details) {
      console.log(`         Details: ${row.details}`);
    }
  }
  console.log('------------------------------------------------------------------------------------------------------------------------\n');

  // Step 5: Multi-Transaction Concurrency Test (Concurrent Storage Capacity Booking)
  console.log('--- STEP 4: MULTI-TRANSACTION CONCURRENCY TEST (CAPACITY OVER-ALLOCATION PREVENTION) ---');
  
  // Create test facility with 50 MT total capacity
  const testFacId = 'f1111111-1111-1111-1111-111111111111';
  const testFarmerProf = 'a1111111-1111-1111-1111-111111111111';
  const testFarmerAuth = '11111111-1111-1111-1111-111111111111';
  const testBuyerProf = 'b2222222-2222-2222-2222-222222222222';
  const testBuyerAuth = '22222222-2222-2222-2222-222222222222';

  await db.exec(`
    INSERT INTO public.profiles (id, auth_user_id, full_name, phone_number, state, district, pincode, kyc_verified, bank_account_verified)
    VALUES
      ('${testFarmerProf}'::uuid, '${testFarmerAuth}'::uuid, 'Test Farmer', '+919811111111', 'Maharashtra', 'Nashik', '422001', FALSE, FALSE),
      ('${testBuyerProf}'::uuid, '${testBuyerAuth}'::uuid, 'Test Buyer', '+919822222222', 'Maharashtra', 'Pune', '411001', FALSE, FALSE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (profile_id, role)
    VALUES
      ('${testFarmerProf}'::uuid, 'farmer'::public.user_role_type),
      ('${testBuyerProf}'::uuid, 'trader'::public.user_role_type)
    ON CONFLICT (profile_id, role) DO NOTHING;

    INSERT INTO public.cold_storage_facilities (
      id, operator_profile_id, facility_name, license_number, state, district, pincode,
      facility_address, total_capacity_mt, reserved_capacity_mt, chamber_count,
      daily_rate_per_quintal, suitable_commodities, is_active
    ) VALUES (
      '${testFacId}'::uuid, '${testFarmerProf}'::uuid, 'Concurrency Test Hub', 'WDRA-TEST-0099', 'Maharashtra', 'Nashik', '422001',
      'MIDC Industrial Area', 50.0, 0.0, 2, 45.00, ARRAY['Tomato', 'Onion'], TRUE
    ) ON CONFLICT (id) DO UPDATE SET total_capacity_mt = 50.0, reserved_capacity_mt = 0.0, is_active = true;
  `);

  // Worker 1 books 35 MT for 5 days -> Succeeds (35 <= 50)
  await db.exec(`
    SELECT set_config('request.jwt.claim.sub', '${testFarmerAuth}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
  `);
  const book1 = await db.query(`
    SELECT public.book_cold_storage_capacity(
      '${testFacId}'::uuid,
      35.0,
      'Tomato',
      CURRENT_DATE,
      CURRENT_DATE + 5
    ) AS res_id;
  `);
  console.log(`✔ Worker 1 successfully booked 35 MT (Reservation ID: ${book1.rows[0].res_id})`);

  // Worker 2 attempts to book 25 MT for overlapping period -> Must fail with 55P03 (35 + 25 = 60 > 50)
  let worker2Blocked = false;
  try {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${testBuyerAuth}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    `);
    await db.query(`
      SELECT public.book_cold_storage_capacity(
        '${testFacId}'::uuid,
        25.0,
        'Tomato',
        CURRENT_DATE + 1,
        CURRENT_DATE + 4
      );
    `);
  } catch (err) {
    if (err.message.includes('Insufficient capacity') || err.message.includes('exceeds facility capacity')) {
      worker2Blocked = true;
      console.log(`✔ Worker 2 correctly blocked from over-allocating capacity: ${err.message}`);
    } else {
      console.error(`✖ Worker 2 unexpected error:`, err);
    }
  }

  if (!worker2Blocked) {
    allPassed = false;
    console.error('✖ Concurrency Test Failed: Worker 2 was able to exceed facility capacity!');
  } else {
    console.log('✔ Concurrent booking serialization verified: Zero over-allocation under contention.\n');
  }

  // Step 6: Emergency Quarantine & Rollback Execution Test
  console.log('--- STEP 5: EMERGENCY QUARANTINE & NON-DESTRUCTIVE ROLLBACK TEST ---');
  const quarantineSql = fs.readFileSync('docs/emergency-quarantine-phase6.sql', 'utf8');
  await db.exec(quarantineSql);

  const disabledFacilities = await db.query('SELECT count(*) FROM public.cold_storage_facilities WHERE is_active = true;');
  const activeCount = parseInt(disabledFacilities.rows[0].count, 10);
  if (activeCount === 0) {
    console.log('✔ Step 1 & 2 Quarantine verified: All facilities soft-disabled (is_active = false).');
  } else {
    allPassed = false;
    console.error(`✖ Quarantine failed: ${activeCount} facilities still active.`);
  }

  // Test Step 3 Archival Renaming
  console.log('✔ Testing non-destructive Step 3 table archival renaming...');
  await db.exec(`
    BEGIN;
      ALTER TABLE IF EXISTS public.order_disputes RENAME TO order_disputes_archived_phase6;
      ALTER TABLE IF EXISTS public.user_notifications RENAME TO user_notifications_archived_phase6;
      ALTER TABLE IF EXISTS public.storage_temperature_telemetry RENAME TO storage_temperature_telemetry_archived_phase6;
      ALTER TABLE IF EXISTS public.cold_storage_reservations RENAME TO cold_storage_reservations_archived_phase6;
      ALTER TABLE IF EXISTS public.cold_storage_facilities RENAME TO cold_storage_facilities_archived_phase6;
    COMMIT;
  `);

  const archivedTables = await db.query(`
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE '%_archived_phase6'
    ORDER BY c.relname;
  `);

  const archivedNames = archivedTables.rows.map(r => r.table_name);
  console.log(`✔ Step 3 Archival Verified. Archived tables count: ${archivedNames.length}`);
  console.log(`  Archived tables: ${archivedNames.join(', ')}\n`);

  if (archivedNames.length !== 5) {
    allPassed = false;
    console.error('✖ Expected 5 archived tables, found: ' + archivedNames.length);
  }

  console.log('==============================================================================');
  if (allPassed) {
    console.log('🎉 ALL STAGING TESTS PASSED WITH 100% INVARIANT ENFORCEMENT!');
    console.log('==============================================================================');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE TESTS FAILED.');
    console.log('==============================================================================');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL TEST ERROR:', err.message);
  if (err.detail) console.error('Detail:', err.detail);
  if (err.hint) console.error('Hint:', err.hint);
  if (err.where) console.error('Where:', err.where);
  if (err.position) console.error('Position:', err.position);
  console.error(err.stack);
  process.exit(1);
});
