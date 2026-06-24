import { initAppRouter } from "./appRouter.js";
import { initAuthPanel } from "./authPanel.js";
import { createGameShell } from "./game/createGameShell.js";

let router = null;

const shell = createGameShell({
  canvas: document.querySelector("#game-canvas"),
  screenSize: document.querySelector("#screen-size"),
  loopState: document.querySelector("#loop-state"),
  pauseToggle: document.querySelector("#pause-toggle"),
  pauseBanner: document.querySelector("#pause-banner"),
  weaponStatus: document.querySelector("#weapon-status"),
  levelStatus: document.querySelector("#level-status"),
  waveStatus: document.querySelector("#wave-status"),
  healthStatus: document.querySelector("#health-status"),
  livesStatus: document.querySelector("#lives-status"),
  combatStatus: document.querySelector("#combat-status"),
  resultScreen: document.querySelector("#result-screen"),
  resultLabel: document.querySelector("#result-label"),
  resultTitle: document.querySelector("#result-title"),
  resultSummary: document.querySelector("#result-summary"),
  lootReveal: document.querySelector("#loot-reveal"),
  lootCard: document.querySelector("#loot-card"),
  lootRarity: document.querySelector("#loot-rarity"),
  lootName: document.querySelector("#loot-name"),
  lootType: document.querySelector("#loot-type"),
  lootStats: document.querySelector("#loot-stats"),
  resultPrimary: document.querySelector("#result-primary"),
  resultMenu: document.querySelector("#result-menu"),
  onProgressSaved: (player) => router?.updatePlayer(player),
});

shell.start();

router = initAppRouter({
  shell: document.querySelector(".app-shell"),
  menuScreen: document.querySelector("#menu-screen"),
  gameScreen: document.querySelector("#game-screen"),
  collectionScreen: document.querySelector("#collection-screen"),
  menuHeading: document.querySelector("#menu-heading"),
  menuSubtitle: document.querySelector("#menu-subtitle"),
  playButton: document.querySelector("#play-button"),
  collectionButton: document.querySelector("#collection-button"),
  collectionOwner: document.querySelector("#collection-owner"),
  collectionStatus: document.querySelector("#collection-status"),
  collectionGroups: document.querySelector("#collection-groups"),
  collectionRefresh: document.querySelector("#collection-refresh"),
  backButtons: document.querySelectorAll("[data-nav-route]"),
  gamePilot: document.querySelector("#game-pilot"),
  onLoadoutChange: (equippedLoadout) => shell.setEquippedLoadout(equippedLoadout),
});

initAuthPanel({
  panel: document.querySelector("#auth-panel"),
  status: document.querySelector("#auth-status"),
  details: document.querySelector("#auth-details"),
  action: document.querySelector("#auth-action"),
  avatar: document.querySelector("#auth-avatar"),
  onSessionChange: (session) => {
    router.updateSession(session);
    shell.setPlayerProgress(session.player);
    if (!session.player) {
      shell.setEquippedLoadout({});
    }
  },
});
