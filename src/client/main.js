import { initAuthPanel } from "./authPanel.js";
import { createGameShell } from "./game/createGameShell.js";

const shell = createGameShell({
  canvas: document.querySelector("#game-canvas"),
  screenSize: document.querySelector("#screen-size"),
  loopState: document.querySelector("#loop-state"),
  pauseToggle: document.querySelector("#pause-toggle"),
  pauseBanner: document.querySelector("#pause-banner"),
});

shell.start();

initAuthPanel({
  panel: document.querySelector("#auth-panel"),
  status: document.querySelector("#auth-status"),
  details: document.querySelector("#auth-details"),
  action: document.querySelector("#auth-action"),
  avatar: document.querySelector("#auth-avatar"),
});
