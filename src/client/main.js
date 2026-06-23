import { initAppRouter } from "./appRouter.js";
import { initAuthPanel } from "./authPanel.js";
import { createGameShell } from "./game/createGameShell.js";

const shell = createGameShell({
  canvas: document.querySelector("#game-canvas"),
  screenSize: document.querySelector("#screen-size"),
  loopState: document.querySelector("#loop-state"),
  pauseToggle: document.querySelector("#pause-toggle"),
  pauseBanner: document.querySelector("#pause-banner"),
  weaponStatus: document.querySelector("#weapon-status"),
});

shell.start();

const router = initAppRouter({
  shell: document.querySelector(".app-shell"),
  menuScreen: document.querySelector("#menu-screen"),
  gameScreen: document.querySelector("#game-screen"),
  collectionScreen: document.querySelector("#collection-screen"),
  menuHeading: document.querySelector("#menu-heading"),
  menuSubtitle: document.querySelector("#menu-subtitle"),
  playButton: document.querySelector("#play-button"),
  collectionButton: document.querySelector("#collection-button"),
  collectionOwner: document.querySelector("#collection-owner"),
  backButtons: document.querySelectorAll("[data-nav-route]"),
  gamePilot: document.querySelector("#game-pilot"),
});

initAuthPanel({
  panel: document.querySelector("#auth-panel"),
  status: document.querySelector("#auth-status"),
  details: document.querySelector("#auth-details"),
  action: document.querySelector("#auth-action"),
  avatar: document.querySelector("#auth-avatar"),
  onSessionChange: (session) => router.updateSession(session),
});
