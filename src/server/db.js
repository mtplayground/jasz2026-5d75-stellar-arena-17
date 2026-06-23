import pg from "pg";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.parseInt(process.env.PG_MAX_CONNECTIONS || "5", 10),
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

export async function ensureSchema(db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS players (
      sub TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      picture_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function upsertPlayerFromClaims(claims, db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!claims?.sub || !claims?.email) {
    throw new Error("Authenticated session is missing required player claims");
  }

  const result = await db.query(
    `
      INSERT INTO players (sub, email, name, picture_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sub) DO UPDATE
      SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture_url = EXCLUDED.picture_url,
        last_seen_at = NOW()
      RETURNING
        sub,
        email,
        name,
        picture_url AS "pictureUrl",
        created_at AS "createdAt",
        last_seen_at AS "lastSeenAt",
        (xmax = 0) AS "isNew"
    `,
    [claims.sub, claims.email, claims.name || null, claims.picture || null],
  );

  return result.rows[0];
}
