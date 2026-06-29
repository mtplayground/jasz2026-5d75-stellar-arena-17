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
import { PlayerJet } from "../src/client/game/entities/PlayerJet.js";

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
    forcedWeaponType: null,
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
        .filter(
          (definition) =>
            definition.rarity === rarity &&
            (!state.forcedWeaponType || definition.weaponType === state.forcedWeaponType),
        )
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


async function assertShotgunDropAndEquipFlow(db, claims) {
  const shotgunDefinitions = [...db.state.gearDefinitions.values()].filter(
    (definition) => definition.weaponType === "shotgun",
  );
  assert.equal(shotgunDefinitions.length, 5, "shotgun gear should exist across all five rarity tiers");
  for (const definition of shotgunDefinitions) {
    assert.equal(typeof definition.stats.damage, "number", "shotgun gear should scale damage");
    assert.equal(typeof definition.stats.pelletCount, "number", "shotgun gear should include pellet count");
    assert.equal(typeof definition.stats.spreadAngle, "number", "shotgun gear should include spread angle");
    assert.equal(typeof definition.stats.fireRate, "number", "shotgun gear should include fire rate");
    assert.equal(typeof definition.stats.speed, "number", "shotgun gear should include projectile speed");
  }

  db.state.forcedWeaponType = "shotgun";
  const shotgunClear = await recordLevelClearAndGrantDrop(claims, 2, db);
  db.state.forcedWeaponType = null;

  assert.equal(shotgunClear.alreadyGranted, false, "forced second clear should grant a new shotgun drop");
  assert.equal(shotgunClear.drop.weaponType, "shotgun", "server-authoritative drop should be shotgun gear");
  assert.ok(shotgunClear.drop.stats.pelletCount >= 6, "shotgun drop should carry pellet-count stats");
  assert.ok(shotgunClear.drop.stats.spreadAngle > 0, "shotgun drop should carry spread-angle stats");

  const equipped = await equipGearForPlayer(claims, shotgunClear.drop.id, db);
  const equippedShotgun = equipped.ownedGear.find((gear) => gear.id === shotgunClear.drop.id);
  assert.equal(equippedShotgun?.equipped, true, "shotgun gear should persist as equipped");
  assert.equal(
    equipped.equippedLoadout.shotgun?.id,
    shotgunClear.drop.id,
    "saved loadout should expose equipped shotgun gear by weapon type",
  );

  const weaponSystem = new WeaponSystem();
  weaponSystem.setEquippedLoadout(equipped.equippedLoadout);
  assertLoadoutUsesGear(weaponSystem, equippedShotgun);
  assert.equal(
    weaponSystem.loadout.shotgun.pelletCount,
    equippedShotgun.stats.pelletCount,
    "equipped shotgun pellet count should feed into gameplay loadout",
  );
  assert.equal(
    weaponSystem.loadout.shotgun.spreadAngle,
    equippedShotgun.stats.spreadAngle,
    "equipped shotgun spread angle should feed into gameplay loadout",
  );
}

function assertWasdMovementIsDecoupledFromPointerAim() {
  const player = new PlayerJet();
  const size = { width: 1000, height: 800, pixelRatio: 1 };

  player.update(1 / 60, { moveX: 0, moveY: 0, pointer: null }, size);
  const start = { x: player.position.x, y: player.position.y, angle: player.angle };

  player.update(0.25, { moveX: 0, moveY: 0, pointer: { x: 100, y: 100 } }, size);
  assert.equal(player.position.x, start.x, "mouse pointer alone should not move the player horizontally");
  assert.equal(player.position.y, start.y, "mouse pointer alone should not move the player vertically");
  assert.equal(player.velocity.x, 0, "mouse pointer alone should not create horizontal velocity");
  assert.equal(player.velocity.y, 0, "mouse pointer alone should not create vertical velocity");
  assert.equal(player.angle, start.angle, "mouse pointer alone should not steer or face the player jet");

  player.update(0.1, { moveX: 1, moveY: 0, pointer: { x: 0, y: start.y } }, size);
  assert.ok(player.position.x > start.x, "D/right WASD input should move the player right");
  assert.ok(player.velocity.x > 0, "D/right WASD input should create rightward velocity");
  assert.ok(player.angle > start.angle, "player facing should follow WASD movement, not the opposite mouse pointer");

  const weaponSystem = new WeaponSystem();
  const aimDirection = weaponSystem.getAimDirection(player, { x: 0, y: player.position.y }, size.pixelRatio);
  assert.ok(aimDirection.x < -0.9, "weapon aim should still point toward the mouse pointer");
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

  await assertShotgunDropAndEquipFlow(db, claims);
  assertWasdMovementIsDecoupledFromPointerAim();
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
