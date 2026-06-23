import { ensureSchema, getPool } from "../src/server/db.js";

const pool = getPool();

if (!pool) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

try {
  await ensureSchema(pool);
  console.log("Database migrations applied");
} finally {
  await pool.end();
}
