import fs from 'fs';
import { PGlite } from '@electric-sql/pglite';

async function run() {
  const db = new PGlite();
  console.log('1. Connected to isolated PostgreSQL staging engine.');

  let v5Sql = fs.readFileSync('docs/database-schema-proposal-v5.sql', 'utf8');
  v5Sql = v5Sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '-- uuid-ossp not needed; gen_random_uuid is native')
               .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto not needed');

  console.log('2. Applying Schema v5 baseline...');
  await db.exec(v5Sql);
  console.log('✔ Schema v5 baseline installed successfully.');

  console.log('3. Reading remediated migration candidate...');
  const p6Sql = fs.readFileSync('docs/migration-phase6-unified-audit.sql', 'utf8');

  console.log('4. Executing docs/migration-phase6-unified-audit.sql directly without modifications...');
  await db.exec(p6Sql);
  console.log('✔ Remediated Migration Phase 6 applied successfully with ZERO errors!');
}

run().catch(err => {
  console.error('❌ MIGRATION ERROR:', err.message);
  process.exit(1);
});
