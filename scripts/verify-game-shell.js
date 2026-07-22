import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const files = [
  "server.js",
  "scripts/build.js",
  "scripts/e2e-playthrough.js",
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
  "src/client/game/systems/SoundSystem.js",
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
const server = await readFile(resolve(projectRoot, "server.js"), "utf8");
const appRouter = await readFile(resolve(projectRoot, "src/client/appRouter.js"), "utf8");
const inputController = await readFile(resolve(projectRoot, "src/client/game/InputController.js"), "utf8");
const renderer = await readFile(resolve(projectRoot, "src/client/game/Renderer.js"), "utf8");
const weaponDefinitions = await readFile(
  resolve(projectRoot, "src/client/game/data/weaponDefinitions.js"),
  "utf8",
);
const weaponSystem = await readFile(
  resolve(projectRoot, "src/client/game/systems/WeaponSystem.js"),
  "utf8",
);
const combatSystem = await readFile(
  resolve(projectRoot, "src/client/game/systems/CombatSystem.js"),
  "utf8",
);
const soundSystem = await readFile(
  resolve(projectRoot, "src/client/game/systems/SoundSystem.js"),
  "utf8",
);
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
  !html.includes('id="health-meter"') ||
  !html.includes('id="weapon-detail"') ||
  !html.includes('id="level-progress"') ||
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
  !css.includes("@keyframes hud-damage-pulse") ||
  !css.includes("@keyframes victory-result-pop") ||
  !css.includes("@keyframes loot-rare-glow") ||
  !css.includes("prefers-reduced-motion") ||
  !css.includes('data-rarity="legendary"') ||
  !css.includes(".loot-stats")
) {
  throw new Error("Loot, HUD pulse, result pulse, reduced-motion, or rarity styling is missing from styles.css");
}

if (
  !css.includes(".inventory-rarity-group") ||
  !css.includes(".inventory-card") ||
  !css.includes(".inventory-stats") ||
  !css.includes(".inventory-equip-button")
) {
  throw new Error("Inventory grouping and gear card styles are missing from styles.css");
}


if (
  !weaponDefinitions.includes('shotgun: "shotgun"') ||
  !weaponDefinitions.includes("WEAPON_TYPES.shotgun") ||
  !weaponDefinitions.includes("pelletCount") ||
  !weaponDefinitions.includes("spreadAngle") ||
  !weaponSystem.includes("fireShotgun") ||
  !weaponSystem.includes('this.addEvent("shoot-shotgun"') ||
  !inputController.includes('Digit4: "shotgun"') ||
  !renderer.includes("pelletCount > 1") ||
  !renderer.includes('`${status.pelletCount} x ${status.damage} dmg`')
) {
  throw new Error("Shotgun weapon definition, firing, Digit4 switching, or HUD indicator wiring is missing");
}

if (
  !server.includes('pathname === "/api/gear/equip"') ||
  !appRouter.includes('fetch("/api/gear/equip"') ||
  !weaponSystem.includes("setEquippedLoadout")
) {
  throw new Error("Equipped gear API, UI action, or weapon-system loadout wiring is missing");
}

if (
  !soundSystem.includes("AudioContext") ||
  !weaponSystem.includes("consumeEvents") ||
  !combatSystem.includes("consumeEvents") ||
  !css.includes(".hud-meter")
) {
  throw new Error("Sound effects, feedback events, or HUD meter polish is missing");
}

if (
  weaponSystem.includes("laserCharge") ||
  weaponSystem.includes("drawLaserCharge") ||
  weaponSystem.includes("fireReleased &&") ||
  weaponDefinitions.includes("chargeTime")
) {
  throw new Error("Laser must fire instantly without charge accumulation, release trigger, or charge visuals");
}

if (
  !weaponSystem.includes("updateLaser(selected, input") ||
  !weaponSystem.includes("!input.fireHeld") ||
  !weaponSystem.includes('this.addEvent("shoot-laser"') ||
  !weaponSystem.includes("this.cooldowns[definition.type] = 1 / definition.fireRate")
) {
  throw new Error("Instant laser fire-held cooldown behavior is missing from WeaponSystem.js");
}

if (
  !weaponDefinitions.includes("proximityRadius") ||
  !weaponDefinitions.includes("proximityRadius: 56") ||
  !weaponDefinitions.includes("blastRadius") ||
  !weaponSystem.includes("proximityRadius: definition.proximityRadius * pixelRatio") ||
  !weaponSystem.includes("blastRadius: definition.blastRadius * pixelRatio") ||
  !combatSystem.includes("findMissileProximityTrigger") ||
  !combatSystem.includes("detonateMissile") ||
  !combatSystem.includes('this.addEvent("explosion", missile.x, missile.y)')
) {
  throw new Error("Missile proximity/blast detonation wiring is missing");
}

if (
  gearCatalog.includes("chargeTime") ||
  !gearCatalog.includes("proximityRadius") ||
  !gearCatalog.includes("proximityRadius: 56") ||
  !gearCatalog.includes("blastRadius") ||
  !appRouter.includes("shouldDisplayStat") ||
  !appRouter.includes('"proximityRadius"') ||
  !renderer.includes("shouldDisplayStat") ||
  !renderer.includes('"blastRadius"')
) {
  throw new Error("Gear stat catalog or stat display formatting is not aligned with instant laser and blast missiles");
}

if (
  !combatSystem.includes("this.particles") ||
  !combatSystem.includes("spawnImpactParticles") ||
  !combatSystem.includes("drawImpact") ||
  !combatSystem.includes("drawParticle") ||
  !combatSystem.includes("MAX_PARTICLES") ||
  !combatSystem.includes("shockwaveRadius") ||
  !combatSystem.includes("innerRadius")
) {
  throw new Error("Combat particle, layered impact, or bounded visual effect wiring is missing");
}

if (
  !renderer.includes("screenFlash") ||
  !renderer.includes("drawScreenFlash") ||
  !renderer.includes("triggerHudDamagePulse") ||
  !renderer.includes("this.screenShake = Math.max(this.screenShake, 14)") ||
  !renderer.includes("this.screenShake = Math.max(this.screenShake, 10)") ||
  !renderer.includes("starWarp")
) {
  throw new Error("Screen flash, stronger shake, HUD pulse, or star warp wiring is missing from Renderer.js");
}

if (
  !weaponSystem.includes("drawMissileTrail") ||
  !weaponSystem.includes("colorWithAlpha") ||
  !weaponSystem.includes('globalCompositeOperation = "lighter"') ||
  !weaponSystem.includes("createRadialGradient") ||
  !weaponSystem.includes("beam.width * 3.4") ||
  !weaponSystem.includes("burst: true")
) {
  throw new Error("Weapon glow, missile trail, layered laser, or shotgun burst visual wiring is missing");
}

for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) {
  if (!gearCatalog.includes(`id: "${rarity}"`)) {
    throw new Error(`Gear rarity ${rarity} is missing from gearCatalog.js`);
  }
  if (!gearCatalog.includes(`${rarity}:`)) {
    throw new Error(`Gear drop weight ${rarity} is missing from gearCatalog.js`);
  }
}

for (const weaponType of ["projectile", "missile", "laser", "shotgun"]) {
  if (!gearCatalog.includes(`${weaponType}: "${weaponType}"`)) {
    throw new Error(`Gear weapon type ${weaponType} is missing from gearCatalog.js`);
  }
}

console.log("Game shell verification passed");
