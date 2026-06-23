import { randomInt } from "node:crypto";
import pg from "pg";
import { GEAR_DEFINITIONS, RARITY_DROP_WEIGHTS } from "../shared/gearCatalog.js";

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
      highest_cleared_level INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS highest_cleared_level INTEGER NOT NULL DEFAULT 0
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS gear_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      weapon_type TEXT NOT NULL CHECK (weapon_type IN ('projectile', 'missile', 'laser')),
      rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
      rarity_label TEXT NOT NULL,
      rarity_color_name TEXT NOT NULL,
      rarity_color TEXT NOT NULL,
      rarity_rank INTEGER NOT NULL CHECK (rarity_rank BETWEEN 1 AND 5),
      stats JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_gear (
      id BIGSERIAL PRIMARY KEY,
      player_sub TEXT NOT NULL REFERENCES players(sub) ON DELETE CASCADE,
      gear_definition_id TEXT NOT NULL REFERENCES gear_definitions(id),
      item_level INTEGER NOT NULL DEFAULT 1 CHECK (item_level >= 1),
      equipped BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL DEFAULT 'loot_box',
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE player_gear
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'loot_box'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_level_rewards (
      player_sub TEXT NOT NULL REFERENCES players(sub) ON DELETE CASCADE,
      cleared_level INTEGER NOT NULL CHECK (cleared_level >= 1),
      owned_gear_id BIGINT NOT NULL REFERENCES player_gear(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (player_sub, cleared_level)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS player_gear_player_sub_idx
    ON player_gear (player_sub)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS player_gear_definition_idx
    ON player_gear (gear_definition_id)
  `);

  await seedGearDefinitions(db);
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
        highest_cleared_level AS "highestClearedLevel",
        created_at AS "createdAt",
        last_seen_at AS "lastSeenAt",
        (xmax = 0) AS "isNew"
    `,
    [claims.sub, claims.email, claims.name || null, claims.picture || null],
  );

  return result.rows[0];
}

export async function saveClearedLevelForClaims(claims, clearedLevel, db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!Number.isInteger(clearedLevel) || clearedLevel < 1) {
    throw new Error("Cleared level must be a positive integer");
  }

  const player = await upsertPlayerFromClaims(claims, db);
  const result = await db.query(
    `
      UPDATE players
      SET
        highest_cleared_level = GREATEST(highest_cleared_level, $2),
        last_seen_at = NOW()
      WHERE sub = $1
      RETURNING
        sub,
        email,
        name,
        picture_url AS "pictureUrl",
        highest_cleared_level AS "highestClearedLevel",
        created_at AS "createdAt",
        last_seen_at AS "lastSeenAt"
    `,
    [player.sub, clearedLevel],
  );

  return result.rows[0];
}

export async function recordLevelClearAndGrantDrop(claims, clearedLevel, db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!Number.isInteger(clearedLevel) || clearedLevel < 1) {
    throw new Error("Cleared level must be a positive integer");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const player = await upsertPlayerFromClaims(claims, client);

    const lockedPlayer = await client.query(
      `
        SELECT highest_cleared_level
        FROM players
        WHERE sub = $1
        FOR UPDATE
      `,
      [player.sub],
    );

    if (lockedPlayer.rowCount !== 1) {
      throw new Error("Player row could not be locked for reward grant");
    }

    const existingReward = await getLevelReward(client, player.sub, clearedLevel);
    const updatedPlayer = await client.query(
      `
        UPDATE players
        SET
          highest_cleared_level = GREATEST(highest_cleared_level, $2),
          last_seen_at = NOW()
        WHERE sub = $1
        RETURNING
          sub,
          email,
          name,
          picture_url AS "pictureUrl",
          highest_cleared_level AS "highestClearedLevel",
          created_at AS "createdAt",
          last_seen_at AS "lastSeenAt"
      `,
      [player.sub, clearedLevel],
    );

    if (existingReward) {
      await client.query("COMMIT");
      return {
        player: updatedPlayer.rows[0],
        drop: existingReward,
        alreadyGranted: true,
      };
    }

    const rarity = rollRarity();
    const definition = await pickGearDefinition(client, rarity);
    const granted = await client.query(
      `
        INSERT INTO player_gear (player_sub, gear_definition_id, source)
        VALUES ($1, $2, 'loot_box')
        RETURNING id
      `,
      [player.sub, definition.id],
    );
    const ownedGearId = granted.rows[0].id;

    await client.query(
      `
        INSERT INTO player_level_rewards (player_sub, cleared_level, owned_gear_id)
        VALUES ($1, $2, $3)
      `,
      [player.sub, clearedLevel, ownedGearId],
    );

    const drop = await getOwnedGearById(client, ownedGearId);
    await client.query("COMMIT");

    return {
      player: updatedPlayer.rows[0],
      drop,
      alreadyGranted: false,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function seedGearDefinitions(db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  for (const gear of GEAR_DEFINITIONS) {
    await db.query(
      `
        INSERT INTO gear_definitions (
          id,
          name,
          weapon_type,
          rarity,
          rarity_label,
          rarity_color_name,
          rarity_color,
          rarity_rank,
          stats
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          weapon_type = EXCLUDED.weapon_type,
          rarity = EXCLUDED.rarity,
          rarity_label = EXCLUDED.rarity_label,
          rarity_color_name = EXCLUDED.rarity_color_name,
          rarity_color = EXCLUDED.rarity_color,
          rarity_rank = EXCLUDED.rarity_rank,
          stats = EXCLUDED.stats,
          updated_at = NOW()
      `,
      [
        gear.id,
        gear.name,
        gear.weaponType,
        gear.rarity,
        gear.rarityLabel,
        gear.rarityColorName,
        gear.rarityColor,
        gear.rarityRank,
        JSON.stringify(gear.stats),
      ],
    );
  }
}

export async function listGearForPlayer(claims, db = getPool()) {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  const player = await upsertPlayerFromClaims(claims, db);
  const definitions = await db.query(
    `
      SELECT
        id,
        name,
        weapon_type AS "weaponType",
        rarity,
        rarity_label AS "rarityLabel",
        rarity_color_name AS "rarityColorName",
        rarity_color AS "rarityColor",
        rarity_rank AS "rarityRank",
        stats
      FROM gear_definitions
      ORDER BY rarity_rank, weapon_type, id
    `,
  );
  const ownedGear = await db.query(
    `
      SELECT
        pg.id,
        pg.player_sub AS "playerSub",
        pg.gear_definition_id AS "gearDefinitionId",
        pg.item_level AS "itemLevel",
        pg.equipped,
        pg.source,
        pg.acquired_at AS "acquiredAt",
        gd.name,
        gd.weapon_type AS "weaponType",
        gd.rarity,
        gd.rarity_label AS "rarityLabel",
        gd.rarity_color_name AS "rarityColorName",
        gd.rarity_color AS "rarityColor",
        gd.rarity_rank AS "rarityRank",
        gd.stats
      FROM player_gear pg
      JOIN gear_definitions gd ON gd.id = pg.gear_definition_id
      WHERE pg.player_sub = $1
      ORDER BY pg.acquired_at DESC, pg.id DESC
    `,
    [player.sub],
  );

  return {
    definitions: definitions.rows,
    ownedGear: ownedGear.rows,
  };
}

function rollRarity() {
  const entries = Object.entries(RARITY_DROP_WEIGHTS);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let ticket = randomInt(totalWeight);

  for (const [rarity, weight] of entries) {
    if (ticket < weight) {
      return rarity;
    }
    ticket -= weight;
  }

  return entries[0][0];
}

async function pickGearDefinition(db, rarity) {
  const result = await db.query(
    `
      SELECT id
      FROM gear_definitions
      WHERE rarity = $1
      ORDER BY id
    `,
    [rarity],
  );

  if (result.rows.length === 0) {
    throw new Error(`No gear definitions available for rarity ${rarity}`);
  }

  return result.rows[randomInt(result.rows.length)];
}

async function getLevelReward(db, playerSub, clearedLevel) {
  const result = await db.query(
    `
      SELECT
        pg.id,
        pg.player_sub AS "playerSub",
        pg.gear_definition_id AS "gearDefinitionId",
        pg.item_level AS "itemLevel",
        pg.equipped,
        pg.source,
        pg.acquired_at AS "acquiredAt",
        gd.name,
        gd.weapon_type AS "weaponType",
        gd.rarity,
        gd.rarity_label AS "rarityLabel",
        gd.rarity_color_name AS "rarityColorName",
        gd.rarity_color AS "rarityColor",
        gd.rarity_rank AS "rarityRank",
        gd.stats
      FROM player_level_rewards plr
      JOIN player_gear pg ON pg.id = plr.owned_gear_id
      JOIN gear_definitions gd ON gd.id = pg.gear_definition_id
      WHERE plr.player_sub = $1 AND plr.cleared_level = $2
    `,
    [playerSub, clearedLevel],
  );

  return result.rows[0] || null;
}

async function getOwnedGearById(db, ownedGearId) {
  const result = await db.query(
    `
      SELECT
        pg.id,
        pg.player_sub AS "playerSub",
        pg.gear_definition_id AS "gearDefinitionId",
        pg.item_level AS "itemLevel",
        pg.equipped,
        pg.source,
        pg.acquired_at AS "acquiredAt",
        gd.name,
        gd.weapon_type AS "weaponType",
        gd.rarity,
        gd.rarity_label AS "rarityLabel",
        gd.rarity_color_name AS "rarityColorName",
        gd.rarity_color AS "rarityColor",
        gd.rarity_rank AS "rarityRank",
        gd.stats
      FROM player_gear pg
      JOIN gear_definitions gd ON gd.id = pg.gear_definition_id
      WHERE pg.id = $1
    `,
    [ownedGearId],
  );

  if (result.rowCount !== 1) {
    throw new Error("Granted gear could not be loaded");
  }

  return result.rows[0];
}
