import { PGlite } from '@electric-sql/pglite';

async function testCurrentDate() {
  const db = new PGlite();
  try {
    await db.query("SELECT pg_catalog.CURRENT_DATE;");
    console.log("pg_catalog.CURRENT_DATE passed!");
  } catch (err) {
    console.log("pg_catalog.CURRENT_DATE error:", err.message);
  }

  try {
    await db.query("SELECT CURRENT_DATE;");
    console.log("CURRENT_DATE passed!");
  } catch (err) {
    console.log("CURRENT_DATE error:", err.message);
  }
}

testCurrentDate();
