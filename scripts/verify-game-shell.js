import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const files = [
  "server.js",
  "scripts/build.js",
  "scripts/migrate.js",
  "src/shared/gearCatalog.js",
  "src/server/auth.js",
  "src/server/db.js",
  "src/client/appRouter.js",
  "src/client/authPanel.js",
  "src/client/main.js",
  "src/client/game/GameLoop.js",
  "src/client/game/data/enemyDefinitions.js",
  "src/client/game/data/levelDefinitions.js",
  "src/client/game/data/weaponDefinitions.js",
  "src/client/game/entities/EnemyShip.js",
  "src/client/game/entities/PlayerJet.js",
  "src/client/game/InputController.js",
  "src/client/game/Renderer.js",
  "src/client/game/systems/CombatSystem.js",
  "src/client/game/systems/EnemySystem.js",
  "src/client/game/systems/LevelSystem.js",
  "src/client/game/systems/WeaponSystem.js",
  "src/client/game/Viewport.js",
  "src/client/game/createGameShell.js",
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", resolve(projectRoot, file)], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const html = await readFile(resolve(projectRoot, "src/client/index.html"), "utf8");
const css = await readFile(resolve(projectRoot, "src/client/styles.css"), "utf8");
const gearCatalog = await readFile(resolve(projectRoot, "src/shared/gearCatalog.js"), "utf8");

if (!html.includes('<canvas id="game-canvas"')) {
  throw new Error("Game canvas is missing from index.html");
}

if (!html.includes('id="auth-panel"')) {
  throw new Error("Player account panel is missing from index.html");
}

if (!html.includes('id="menu-screen"') || !html.includes('id="play-button"')) {
  throw new Error("Main menu and Play flow controls are missing from index.html");
}

if (
  !html.includes('id="collection-screen"') ||
  !html.includes('id="collection-groups"') ||
  !html.includes('id="collection-refresh"')
) {
  throw new Error("Collection entry screen is missing from index.html");
}

if (!html.includes('id="weapon-status"')) {
  throw new Error("Weapon status readout is missing from index.html");
}

if (!html.includes('id="level-status"') || !html.includes('id="wave-status"')) {
  throw new Error("Level and wave status readouts are missing from index.html");
}

if (
  !html.includes('id="result-screen"') ||
  !html.includes('id="result-primary"') ||
  !html.includes('id="result-menu"') ||
  !html.includes('id="loot-reveal"') ||
  !html.includes('id="loot-stats"')
) {
  throw new Error("Level result and loot reveal controls are missing from index.html");
}

if (
  !html.includes('id="health-status"') ||
  !html.includes('id="lives-status"') ||
  !html.includes('id="combat-status"')
) {
  throw new Error("Combat health, lives, and state readouts are missing from index.html");
}

if (!css.includes("width: 100vw") || !css.includes("height: 100vh")) {
  throw new Error("The app shell must cover the full browser viewport");
}

if (
  !css.includes("@keyframes loot-card-pop") ||
  !css.includes('data-rarity="legendary"') ||
  !css.includes(".loot-stats")
) {
  throw new Error("Loot box reveal animation and rarity styling are missing from styles.css");
}

if (
  !css.includes(".inventory-rarity-group") ||
  !css.includes(".inventory-card") ||
  !css.includes(".inventory-stats")
) {
  throw new Error("Inventory grouping and gear card styles are missing from styles.css");
}

for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) {
  if (!gearCatalog.includes(`id: "${rarity}"`)) {
    throw new Error(`Gear rarity ${rarity} is missing from gearCatalog.js`);
  }
  if (!gearCatalog.includes(`${rarity}:`)) {
    throw new Error(`Gear drop weight ${rarity} is missing from gearCatalog.js`);
  }
}

for (const weaponType of ["projectile", "missile", "laser"]) {
  if (!gearCatalog.includes(`${weaponType}: "${weaponType}"`)) {
    throw new Error(`Gear weapon type ${weaponType} is missing from gearCatalog.js`);
  }
}

console.log("Game shell verification passed");
