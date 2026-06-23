import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const files = [
  "server.js",
  "scripts/build.js",
  "scripts/migrate.js",
  "src/server/auth.js",
  "src/server/db.js",
  "src/client/appRouter.js",
  "src/client/authPanel.js",
  "src/client/main.js",
  "src/client/game/GameLoop.js",
  "src/client/game/InputController.js",
  "src/client/game/Renderer.js",
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

if (!html.includes('<canvas id="game-canvas"')) {
  throw new Error("Game canvas is missing from index.html");
}

if (!html.includes('id="auth-panel"')) {
  throw new Error("Player account panel is missing from index.html");
}

if (!html.includes('id="menu-screen"') || !html.includes('id="play-button"')) {
  throw new Error("Main menu and Play flow controls are missing from index.html");
}

if (!html.includes('id="collection-screen"')) {
  throw new Error("Collection entry screen is missing from index.html");
}

if (!css.includes("width: 100vw") || !css.includes("height: 100vh")) {
  throw new Error("The app shell must cover the full browser viewport");
}

console.log("Game shell verification passed");
