import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ensureSchema,
  equipGearForPlayer,
  listGearForPlayer,
  recordLevelClearAndGrantDrop,
  upsertPlayerFromClaims,
} from "../src/server/db.js";
import { WeaponSystem } from "../src/client/game/systems/WeaponSystem.js";

const projectRoot = resolve(import.meta.dirname, "..");

function now() {
  return new Date().toISOString();
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function createResult(rows = []) {
  return { rows, rowCount: rows.length };
}

function compareDefinitions(left, right) {
  return (
    Number(left.rarityRank) - Number(right.rarityRank) ||
    left.weaponType.localeCompare(right.weaponType) ||
    left.id.localeCompare(right.id)
  );
}

function createFakePostgres() {
  const state = {
    players: new Map(),
    gearDefinitions: new Map(),
    playerGear: [],
    playerLevelRewards: new Map(),
    nextOwnedGearId: 1,
  };

  const query = async (sql, params = []) => {
    const text = normalizeSql(sql);

    if (
      text === "begin" ||
      text === "commit" ||
      text === "rollback" ||
      text.startsWith("create table") ||
      text.startsWith("alter table") ||
      text.startsWith("create index")
    ) {
      return createResult();
    }

    if (text.startsWith("insert into gear_definitions")) {
      const [
        id,
        name,
        weaponType,
        rarity,
        rarityLabel,
        rarityColorName,
        rarityColor,
        rarityRank,
        statsJson,
      ] = params;
      state.gearDefinitions.set(id, {
        id,
        name,
        weaponType,
        rarity,
        rarityLabel,
        rarityColorName,
        rarityColor,
        rarityRank,
        stats: JSON.parse(statsJson),
      });
      return createResult();
    }

    if (text.startsWith("insert into players")) {
      const [sub, email, name, pictureUrl] = params;
      const existing = state.players.get(sub);
      const timestamp = now();
      const player = {
        sub,
        email,
        name,
        pictureUrl,
        highestClearedLevel: existing?.highestClearedLevel || 0,
        createdAt: existing?.createdAt || timestamp,
        lastSeenAt: timestamp,
        isNew: !existing,
      };
      state.players.set(sub, player);
      return createResult([player]);
    }

    if (text.startsWith("select highest_cleared_level from players")) {
      const player = state.players.get(params[0]);
      return createResult(player ? [{ highest_cleared_level: player.highestClearedLevel }] : []);
    }

    if (text.startsWith("update players set highest_cleared_level")) {
      const [sub, clearedLevel] = params;
      const player = state.players.get(sub);
      if (!player) {
        return createResult();
      }
      player.highestClearedLevel = Math.max(player.highestClearedLevel, clearedLevel);
      player.lastSeenAt = now();
      return createResult([{ ...player, isNew: false }]);
    }

    if (text.startsWith("select id from gear_definitions where rarity = $1")) {
      const rarity = params[0];
      const rows = [...state.gearDefinitions.values()]
        .filter((definition) => definition.rarity === rarity)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((definition) => ({ id: definition.id }));
      return createResult(rows);
    }

    if (text.startsWith("insert into player_gear")) {
      const [playerSub, gearDefinitionId] = params;
      const ownedGear = {
        id: state.nextOwnedGearId++,
        playerSub,
        gearDefinitionId,
        itemLevel: 1,
        equipped: false,
        source: "loot_box",
        acquiredAt: now(),
      };
      state.playerGear.push(ownedGear);
      return createResult([{ id: ownedGear.id }]);
    }

    if (text.startsWith("insert into player_level_rewards")) {
      const [playerSub, clearedLevel, ownedGearId] = params;
      state.playerLevelRewards.set(`${playerSub}:${clearedLevel}`, {
        playerSub,
        clearedLevel,
        ownedGearId,
        createdAt: now(),
      });
      return createResult();
    }

    if (text.includes("from player_level_rewards plr")) {
      const [playerSub, clearedLevel] = params;
      const reward = state.playerLevelRewards.get(`${playerSub}:${clearedLevel}`);
      const ownedGear = reward
        ? state.playerGear.find((gear) => gear.id === Number(reward.ownedGearId))
        : null;
      return createResult(ownedGear ? [createOwnedGearRow(state, ownedGear)] : []);
    }

    if (
      text.includes("from player_gear pg join gear_definitions gd") &&
      text.includes("where pg.id = $1 and pg.player_sub = $2")
    ) {
      const [ownedGearId, playerSub] = params;
      const ownedGear = state.playerGear.find(
        (gear) => gear.id === Number(ownedGearId) && gear.playerSub === playerSub,
      );
      return createResult(
        ownedGear
          ? [
              {
                id: ownedGear.id,
                weaponType: state.gearDefinitions.get(ownedGear.gearDefinitionId).weaponType,
              },
            ]
          : [],
      );
    }

    if (text.startsWith("update player_gear pg set equipped = false")) {
      const [playerSub, weaponType, exceptOwnedGearId] = params;
      for (const ownedGear of state.playerGear) {
        const definition = state.gearDefinitions.get(ownedGear.gearDefinitionId);
        if (
          ownedGear.playerSub === playerSub &&
          definition?.weaponType === weaponType &&
          ownedGear.id !== Number(exceptOwnedGearId)
        ) {
          ownedGear.equipped = false;
        }
      }
      return createResult();
    }

    if (text.startsWith("update player_gear set equipped = true")) {
      const [ownedGearId, playerSub] = params;
      const ownedGear = state.playerGear.find(
        (gear) => gear.id === Number(ownedGearId) && gear.playerSub === playerSub,
      );
      if (ownedGear) {
        ownedGear.equipped = true;
      }
      return createResult();
    }

    if (
      text.includes("from player_gear pg join gear_definitions gd") &&
      text.includes("where pg.id = $1")
    ) {
      const ownedGear = state.playerGear.find((gear) => gear.id === Number(params[0]));
      return createResult(ownedGear ? [createOwnedGearRow(state, ownedGear)] : []);
    }

    if (text.startsWith("select id, name, weapon_type as")) {
      const rows = [...state.gearDefinitions.values()].sort(compareDefinitions);
      return createResult(rows);
    }

    if (
      text.includes("from player_gear pg join gear_definitions gd") &&
      text.includes("where pg.player_sub = $1")
    ) {
      const rows = state.playerGear
        .filter((gear) => gear.playerSub === params[0])
        .sort((left, right) => {
          const acquired = right.acquiredAt.localeCompare(left.acquiredAt);
          return acquired || right.id - left.id;
        })
        .map((gear) => createOwnedGearRow(state, gear));
      return createResult(rows);
    }

    throw new Error(`Fake Postgres query is not implemented: ${text}`);
  };

  return {
    state,
    query,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
}

function createOwnedGearRow(state, ownedGear) {
  const definition = state.gearDefinitions.get(ownedGear.gearDefinitionId);
  return {
    id: ownedGear.id,
    playerSub: ownedGear.playerSub,
    gearDefinitionId: ownedGear.gearDefinitionId,
    itemLevel: ownedGear.itemLevel,
    equipped: ownedGear.equipped,
    source: ownedGear.source,
    acquiredAt: ownedGear.acquiredAt,
    name: definition.name,
    weaponType: definition.weaponType,
    rarity: definition.rarity,
    rarityLabel: definition.rarityLabel,
    rarityColorName: definition.rarityColorName,
    rarityColor: definition.rarityColor,
    rarityRank: definition.rarityRank,
    stats: { ...definition.stats },
  };
}

function assertLoadoutUsesGear(weaponSystem, gear) {
  const actual = weaponSystem.loadout[gear.weaponType];
  assert.equal(actual.equippedGearId, gear.id, "equipped gear id should feed into gameplay loadout");
  assert.equal(actual.label, gear.name, "equipped gear name should become the weapon label");
  assert.equal(actual.color, gear.rarityColor, "equipped gear rarity color should become weapon feedback color");

  for (const [statName, statValue] of Object.entries(gear.stats)) {
    assert.equal(
      actual[statName],
      statValue,
      `equipped ${gear.weaponType} ${statName} should come from saved gear stats`,
    );
  }
}

async function assertClientFlowWiring() {
  const [appRouter, renderer, indexHtml] = await Promise.all([
    readFile(resolve(projectRoot, "src/client/appRouter.js"), "utf8"),
    readFile(resolve(projectRoot, "src/client/game/Renderer.js"), "utf8"),
    readFile(resolve(projectRoot, "src/client/index.html"), "utf8"),
  ]);

  assert.match(appRouter, /fetch\("\/api\/gear"/, "collection must load saved inventory");
  assert.match(appRouter, /fetch\("\/api\/gear\/equip"/, "collection must equip owned gear through the API");
  assert.match(renderer, /fetch\("\/api\/player\/progress"/, "level clear must persist progress server-side");
  assert.match(renderer, /showLootReveal/, "level clear must reveal the loot drop");
  assert.match(indexHtml, /id="collection-screen"/, "collection screen must be present");
  assert.match(indexHtml, /id="loot-reveal"/, "loot reveal screen must be present");
}

async function run() {
  const db = createFakePostgres();
  const claims = {
    sub: "acct_e2e_playthrough",
    email: "pilot@example.test",
    name: "E2E Pilot",
    picture: "https://example.test/pilot.png",
  };

  await ensureSchema(db);

  const signedInPlayer = await upsertPlayerFromClaims(claims, db);
  assert.equal(signedInPlayer.sub, claims.sub, "verified session claims should create the player account");
  assert.equal(signedInPlayer.highestClearedLevel, 0, "new player should start before any level clears");

  const firstClear = await recordLevelClearAndGrantDrop(claims, 1, db);
  assert.equal(firstClear.alreadyGranted, false, "first level clear should grant a new loot drop");
  assert.equal(firstClear.player.highestClearedLevel, 1, "level clear should advance saved progress");
  assert.ok(firstClear.drop?.id, "level clear should return the granted gear");
  assert.ok(firstClear.drop?.weaponType, "drop should include weapon type for gameplay use");
  assert.ok(firstClear.drop?.rarity, "drop should include rarity for reveal and collection grouping");
  assert.ok(Object.keys(firstClear.drop.stats || {}).length > 0, "drop should include stat data");

  const duplicateClear = await recordLevelClearAndGrantDrop(claims, 1, db);
  assert.equal(duplicateClear.alreadyGranted, true, "re-clearing the same level should not mint a second reward");
  assert.equal(duplicateClear.drop.id, firstClear.drop.id, "duplicate clear should return the original reward");

  const inventory = await listGearForPlayer(claims, db);
  assert.ok(
    inventory.ownedGear.some((gear) => gear.id === firstClear.drop.id),
    "collection should load the rewarded gear from saved inventory",
  );
  assert.deepEqual(inventory.equippedLoadout, {}, "new loot should not auto-equip before the player chooses it");

  const equipped = await equipGearForPlayer(claims, firstClear.drop.id, db);
  const equippedDrop = equipped.ownedGear.find((gear) => gear.id === firstClear.drop.id);
  assert.equal(equippedDrop?.equipped, true, "equip action should persist the selected owned gear");
  assert.equal(
    equipped.equippedLoadout[firstClear.drop.weaponType]?.id,
    firstClear.drop.id,
    "saved loadout should expose the equipped gear by weapon type",
  );

  const weaponSystem = new WeaponSystem();
  weaponSystem.setEquippedLoadout(equipped.equippedLoadout);
  assertLoadoutUsesGear(weaponSystem, equippedDrop);

  await assertClientFlowWiring();

  console.log("End-to-end playthrough verification passed");
}

run().catch((err) => {
  console.error("End-to-end playthrough verification failed", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
